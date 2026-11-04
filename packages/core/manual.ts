import {isAbsolute,relative} from 'node:path';
import type {Book,Navigation,OutlineOptions} from './book.ts';
import {bookNavigation,selectOutline} from './book.ts';
import type {Graph,Manifest,RecordEntry} from './types.ts';
import {readDocument} from './read.ts';
import type {ReadOptions} from './read.ts';
import {readRange} from './read-range.ts';
import {query} from './query.ts';
import {failure} from './errors.ts';

type Reading=Omit<ReturnType<typeof readDocument>,'range'>;
type Project={manifest:Manifest;records:RecordEntry[];adjacency:[string,string[]][];interfaces:[string,string][];readings:Record<string,{self:Reading;subtree:Reading}>};
export type Manual={version:1;title:string;rootProject:string;navigation:Navigation[];projects:Record<string,Project>};

// 只在发布构建中从同一 Book 生成；运行时不加载配置、不解析手册 HTML。
export function compileManual(book:Book):Manual{
 const manual:Manual={version:1,title:book.root.config.title,rootProject:book.root.config.projectId,navigation:bookNavigation(book),projects:Object.create(null)};
 for(const node of book.projects.values()){
  const local=(file:string)=>isAbsolute(file)?relative(node.config.root,file).split('\\').join('/'):file;
  const records=[...node.graph.index.values()].map(record=>({...record,location:{...record.location,file:local(record.location.file)}}));
  const project:Project={manifest:{...node.graph.manifest,resources:node.graph.manifest.resources.map(r=>({...r,path:local(r.path)}))},records,adjacency:[...node.graph.adjacency].map(([id,links])=>[id,[...links]]),interfaces:[...(node.graph.interfaceByPort??[])],readings:Object.create(null)};
  for(const record of records)if(record.type==='document'){
   const values={} as Project['readings'][string];
   for(const scope of ['self','subtree'] as const){
    let result=readDocument(node.graph,record.id,{scope,maxChars:100000}),content=result.content;
    while(result.range.truncated){result=readDocument(node.graph,record.id,{scope,maxChars:100000,offset:result.range.nextOffset!});content+=result.content;}
    const {range,...reading}=result;
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
export function manualOutline(manual:Manual,options:OutlineOptions={}){return selectOutline(manual.navigation,manual.rootProject,Object.keys(manual.projects),options);}
export function manualRead(manual:Manual,id:string,options:ReadOptions&{project?:string}={}){
 const selected=project(manual,options.project),scope=options.scope??'self';
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 if(!Object.hasOwn(selected.readings,id)){
  if(selected.records.some(r=>r.id===id))failure('READ_TYPE','<read>','/id','read 只读取有稳定 ID 的 section；工程对象使用 query');
  failure('QUERY_NOT_FOUND','<read>','/id','工具手册中没有此章节：'+id);
 }
 const reading=selected.readings[id][scope];return {...reading,...readRange(reading.content,options.offset,options.maxChars)};
}
export function manualQuery(manual:Manual,id:string,options:{project?:string;depth?:number;maxItems?:number}={}){
 const selected=project(manual,options.project),index=new Map(selected.records.map(r=>[r.id,r]));
 const graph:Graph={manifest:selected.manifest,projectRoot:'<manual>',irDirectory:'<manual>',index,connections:new Map(selected.records.filter(r=>r.type==='connection').map(r=>[r.id,r.entity as import('./types.ts').Connection])),adjacency:new Map(selected.adjacency.map(([id,links])=>[id,new Set(links)])),interfaceByPort:new Map(selected.interfaces)};
 return query(graph,id,options);
}
