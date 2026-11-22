import {readResource,queryResource} from './resource-reading.ts';
import {outlineResource} from './resource-navigation.ts';
import type {ResourceRoute} from './routes.ts';
import {emptyResourceCatalog} from './resource-pages.ts';
import {isAbsolute,relative} from 'node:path';
import type {Book,Navigation,OutlineOptions} from './book.ts';
import {bookNavigation,selectOutline} from './book.ts';
import type {Manifest,RecordEntry} from './types.ts';
import {readDocument,validateReadOptions} from './read.ts';
import type {ReadOptions} from './read.ts';
import {composeClauses,selectedApplications} from '../extensions/clause/reading.ts';
import type {Application} from '../extensions/clause/prepare.ts';
import {readRange} from './read-range.ts';
import {hydrateProjectGraphs,assertResourceContext} from './resource-context.ts';
import {query,queryElement} from './query.ts';
import {failure,EdocError} from './errors.ts';

type Reading=Omit<ReturnType<typeof readDocument>,'range'|'applications'>;
type Project={manifest:Manifest;records:RecordEntry[];adjacency:[string,string[]][];interfaces:[string,string][];applications:Application[];readings:Record<string,{self?:Reading;subtree:Reading}>};
export type Manual={resourceCatalog?:import('./resource-types.ts').ResourceCatalog;version:2;title:string;rootProject:string;navigation:Navigation[];projects:Record<string,Project>};

// 只在发布构建中从同一 Book 生成；运行时不加载配置、不解析手册 HTML。
export function compileManual(book:Book):Manual{
 for(const node of book.projects.values())assertResourceContext(node.graph);
 const manual:Manual={resourceCatalog:book.resourceCatalog,version:2,title:book.root.config.title,rootProject:book.root.config.projectId,navigation:bookNavigation(book),projects:Object.create(null)};
 for(const node of book.projects.values()){
  const local=(file:string)=>isAbsolute(file)?relative(node.config.root,file).split('\\').join('/'):file;
  const records=[...node.graph.index.values()].map(record=>({...record,location:{...record.location,file:local(record.location.file)}}));
  const project:Project={manifest:{...node.graph.manifest,resources:node.graph.manifest.resources.map(r=>({...r,path:local(r.path)}))},records,adjacency:[...node.graph.adjacency].map(([id,links])=>[id,[...links]]),interfaces:[...(node.graph.interfaceByPort??[])],applications:[...node.graph.clauses?.applications.values()??[]].map(set=>({...set,source:{...set.source,file:local(set.source.file)}})),readings:Object.create(null)};
  for(const record of records)if(record.type==='document'||record.type==='clause'||record.type==='state-machine'||record.type==='flowchart'||['sequence','binary-layout','register-block','address-space'].includes(record.type)||record.type==='view'&&['sequence','binary-layout','plot'].includes(('kind'in record.entity?record.entity.kind??'':''))){
   const values={} as Project['readings'][string];
   for(const scope of (record.type==='clause'?['subtree']:['self','subtree']) as ('self'|'subtree')[]){
    let result=readDocument(node.graph,record.id,{scope,withClauses:false,maxChars:100000}),content=result.content;
    while(result.range.truncated){result=readDocument(node.graph,record.id,{scope,withClauses:false,maxChars:100000,offset:result.range.nextOffset!});content+=result.content;}
    const {range,applications,...reading}=result;
    values[scope]={...reading,content,source:{...reading.source,file:local(reading.source.file)},sources:reading.sources.map(s=>({...s,file:local(s.file)})),children:reading.children.map(c=>({...c,source:{...c.source,file:local(c.source.file)}}))};
   }
   project.readings[record.id]=values;
  }
  manual.projects[node.config.projectId]=project;
 }
 return manual;
}
function project(manual:Manual,id=manual.rootProject){
 if(!Object.hasOwn(manual.projects,id))failure('QUERY_NOT_FOUND','<manual>','/project','工具手册中没有此工程：'+id);
 return manual.projects[id];
}
function navigationHint(manual:Manual,id:string,projectId?:string){
 const walk=(nodes:Navigation[]):Navigation[]=>nodes.flatMap(node=>[node,...walk(node.children)]);
 const matches=walk(manual.navigation).filter(n=>(!projectId||n.project===projectId)&&n.sectionId&&(n.id===id||n.anchor===id));
 return matches.length?'。该值是导航 id/anchor，请使用 sectionId：'+[...new Set(matches.map(n=>`${n.sectionId}（--project ${n.project}）`))].join('、'):'';
}
export function manualOutline(manual:Manual,options:OutlineOptions={}){
 try{return selectOutline(manual.navigation,manual.rootProject,Object.keys(manual.projects),options);}
 catch(error){
  const hint=options.id?navigationHint(manual,options.id,options.project):'';
  if(hint&&error instanceof EdocError&&error.diagnostics.some(d=>d.code==='QUERY_NOT_FOUND'&&d.path==='/id'))failure('QUERY_NOT_FOUND','<outline>','/id','当前目录中没有此章节：'+options.id+hint);
  throw error;
 }
}
export function manualRead(manual:Manual,id:string,options:ReadOptions&{project?:string}={}){
 validateReadOptions(options);
 const selected=project(manual,options.project),semanticKind=selected.readings[id]?.subtree.semanticKind,scope=options.scope??(semanticKind==='behavior'?'subtree':'self');
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 if(!Object.hasOwn(selected.readings,id)){
  if(selected.records.some(r=>r.id===id))failure('READ_TYPE','<read>','/id','read 读取 section 或 clause；其他工程对象使用 query');
  failure('QUERY_NOT_FOUND','<read>','/id','工具手册中没有此章节：'+id+navigationHint(manual,id,options.project??manual.rootProject));
 }
 const stored=selected.readings[id][scope]??selected.readings[id].subtree;
 const reading=stored;
 if(!(options.withClauses??semanticKind==='behavior'))return {...reading,applications:selectedApplications(reading.clauseFor??[],selected.applications??[]),...readRange(reading.content,options.offset,options.maxChars)};
 const expanded=composeClauses(reading.content,selectedApplications(reading.clauseFor??[],selected.applications??[]),specId=>selected.readings[specId].subtree,{inlineIds:reading.clauses?.filter(item=>item.origin==='local').map(item=>item.id)});
 return {...reading,sources:[...reading.sources,...expanded.sources.filter(s=>!reading.sources.some(source=>source.file===s.file))],applications:expanded.applications,...readRange(expanded.content,options.offset,options.maxChars)};
}
export function manualQuery(manual:Manual,id:string,options?:{project?:string;depth?:number;maxItems?:number;element?:undefined}):ReturnType<typeof query>;
export function manualQuery(manual:Manual,id:string,options:{project?:string;depth?:number;maxItems?:number;element?:string}):ReturnType<typeof query>|ReturnType<typeof queryElement>;
export function manualQuery(manual:Manual,id:string,options:{project?:string;depth?:number;maxItems?:number;element?:string}={}){
 project(manual,options.project);
 const graph=hydrateProjectGraphs(Object.values(manual.projects)).get(options.project??manual.rootProject)!;
 return options.element?queryElement(graph,id,options.element):query(graph,id,options);
}

export function manualResource(manual:Manual,route:ResourceRoute,command:'query'|'read'|'outline',options:{depth?:number;maxItems?:number;offset?:number;maxChars?:number;scope?:'self'|'subtree'}={}){
 const context={projects:hydrateProjectGraphs(Object.values(manual.projects)),catalog:manual.resourceCatalog??emptyResourceCatalog()};
 if(command==='outline')return outlineResource(context,route,options.depth??2);
 if(command==='query')return queryResource(context,route,Math.min(options.maxItems??50,100));
 return readResource(context,route,(project,id,scope,offset)=>manualRead(manual,id,{project,scope,offset,maxChars:100000}),options);
}
