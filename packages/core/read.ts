import {assertResourceContext} from './resource-context.ts';
import {sequenceElements} from '../extensions/sequence/types.ts';
import {binaryElements} from '../extensions/binary-layout/types.ts';
import type {Sequence,BinaryLayout,RegisterBlock,AddressSpace} from './types.ts';
import {isControl,elements} from '../extensions/control-diagram/types.ts';
import {documentAST} from './documents.ts';
import {formatContent} from './content.ts';
import {composeClauses,selectedApplications} from '../extensions/clause/reading.ts';
import {failure} from './errors.ts';
import type {Graph} from './types.ts';
import {readRange,validateReadRange} from './read-range.ts';

export type ReadOptions={scope?:'self'|'subtree';offset?:number;maxChars?:number;withClauses?:boolean};
export type ClauseReading={id:string;title:string;source:{file:string;line?:number};origin:'local'|'reference';ownerId?:string};

export function validateReadOptions(options:ReadOptions){
 if(Object.hasOwn(options,'withSpecs'))failure('READ_OPTION','<read>','/withSpecs','withSpecs 已移除；请使用 withClauses');
}

// 本地条款保留正文位置；侧字段只给身份与来源，不复制完整内容或绕过分页。
export function clauseReadings(graph:Graph,localIds:string[],clauseFor:string[]):ClauseReading[]{
 const references=selectedApplications(clauseFor,[...graph.clauses?.applications.values()??[]]).flatMap(set=>set.ids);
 return [...new Set([...localIds,...references])].map(id=>{const entry=graph.index.get(id)!,definition=graph.clauses!.definitions.get(id)!;return {id,title:definition.entity.label,source:definition.entity.source,origin:localIds.includes(id)?'local':'reference',...(entry.ownerId?{ownerId:entry.ownerId}:{})};});
}

// 使用已验证的正文 AST，不读取生成的 HTML，也不执行图表渲染或外部项目链接。
export function readDocument(graph:Graph,id:string,options:ReadOptions={}){
 assertResourceContext(graph);
 validateReadOptions(options);
 let scope=options.scope??'self';const offset=options.offset??0,maxChars=options.maxChars??12000;
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 validateReadRange(offset,maxChars);
 const entry=graph.index.get(id);
 if(!entry)failure('QUERY_NOT_FOUND','<read>','/id','ID 不存在：'+id);
 if(isControl(entry.entity)||['sequence','binary-layout','register-block','address-space'].includes(entry.type)||entry.type==='view'&&['sequence','binary-layout','plot'].includes(('kind'in entry.entity?entry.entity.kind??'':''))){const m=entry.entity,source={...m.source,file:m.source?.file??entry.location.file,line:m.source?.line??1};return {projectId:graph.manifest.projectId,id,title:m.label??id,source,scope,format:'markdown' as const,children:[],sources:[source,...(isControl(m)?elements(m):entry.type==='sequence'?sequenceElements(m as Sequence):entry.type==='binary-layout'?binaryElements(m as BinaryLayout):entry.type==='register-block'?(m as RegisterBlock).entries.map(element=>({element})):entry.type==='address-space'?(m as AddressSpace).regions.map(element=>({element})):[]).flatMap(e=>e.element.source?[{...e.element.source,line:e.element.source.line??1}]:[])],semanticKind:undefined as string|undefined,clauseFor:[] as string[],clauses:[] as ClauseReading[],applications:[] as ReturnType<typeof selectedApplications>,...readRange('```json\n'+JSON.stringify(m,null,2)+'\n```\n',offset,maxChars)};}
 if(entry.semanticKind==='behavior'&&options.scope===undefined)scope='subtree';
 if(entry.type==='clause')scope='subtree';
 if(entry.type!=='document'&&entry.type!=='clause')failure('READ_TYPE','<read>','/id','read 读取章节、能力、行为或条款；其他工程对象使用 query');
 for(const document of documentAST(graph))for(const section of document.ast.walk())if(section.type==='tag'&&['section','clause'].includes(section.tag)&&section.attributes.id===id){
  const children:{id:string;title:string;source:{file:string;line:number}}[]=[],sources:{file:string;line:number}[]=[],seen=new Set<string>();
  const source=(node:any)=>document.locations.get(node)??{file:document.file,line:1};
  const remember=(node:any)=>{const location=source(node);if(!seen.has(location.file)){seen.add(location.file);sources.push(location);}};
  const childSections=(node:any)=>{for(const child of [...Object.values(node.slots??{}),...node.children??[]])if(child.type==='tag'&&child.tag==='section')children.push({id:child.attributes.id,title:child.attributes.title??child.attributes.id,source:source(child)});else childSections(child);};
  childSections(section);remember(section);
  const clauseFor:string[]=graph.clauses?.applications.has(id)?[id]:[],localClauses:string[]=entry.type==='clause'?[id]:[];
  const content=formatContent(section.children,(node:any)=>{
   if(scope==='self'&&node.type==='tag'&&node.tag==='section')return false;
   remember(node);if(node.type==='tag'&&node.tag==='clause-list')clauseFor.push(node.attributes.for);
   if(node.type==='tag'&&node.tag==='clause')localClauses.push(node.attributes.id);return true;
  });
  const base={projectId:graph.manifest.projectId,id,title:section.attributes.title??id,source:source(section),scope,format:'markdown' as const,children,sources,clauseFor:[...new Set(clauseFor)],applications:selectedApplications(clauseFor,[...graph.clauses?.applications.values()??[]])};
  const semanticKind=entry.semanticKind,withClauses=options.withClauses??semanticKind==='behavior';
  const metadata={...(semanticKind?{semanticKind}:{}),clauses:clauseReadings(graph,localClauses,clauseFor)};
  if(!withClauses)return {...base,...metadata,...readRange(content,offset,maxChars)};
  const expanded=composeClauses(content,selectedApplications(clauseFor,[...graph.clauses?.applications.values()??[]]),specId=>{
   const result=readDocument(graph,specId,{scope:'subtree',maxChars:100000});let body=result.content,next=result.range.nextOffset;
   while(next!==null){const part=readDocument(graph,specId,{scope:'subtree',maxChars:100000,offset:next});body+=part.content;next=part.range.nextOffset;}
   return {...result,content:body};
  },{inlineIds:localClauses});
  return {...base,...metadata,sources:[...sources,...expanded.sources.filter(s=>!seen.has(s.file))],applications:expanded.applications,...readRange(expanded.content,offset,maxChars)};
 }
 failure('QUERY_NOT_FOUND','<read>','/id','正文中没有此章节：'+id);
}
