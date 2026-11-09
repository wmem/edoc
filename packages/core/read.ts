import {documentAST} from './documents.ts';
import {formatContent} from './content.ts';
import {composeSpecifications,selectedApplications} from '../extensions/specification/reading.ts';
import {failure} from './errors.ts';
import type {Graph} from './types.ts';
import {readRange,validateReadRange} from './read-range.ts';

export type ReadOptions={scope?:'self'|'subtree';offset?:number;maxChars?:number;withSpecs?:boolean;withClauses?:boolean};
export type ClauseReading={id:string;title:string;source:{file:string;line?:number};origin:'local'|'reference';ownerId?:string};

// 本地条款保留正文位置；侧字段只给身份与来源，不复制完整内容或绕过分页。
export function clauseReadings(graph:Graph,localIds:string[],specFor:string[]):ClauseReading[]{
 const references=selectedApplications(specFor,[...graph.specifications?.applications.values()??[]]).flatMap(set=>[...set.common,...set.specific]);
 return [...new Set([...localIds,...references])].map(id=>{const entry=graph.index.get(id)!,definition=graph.specifications!.definitions.get(id)!;return {id,title:definition.entity.label,source:definition.entity.source,origin:localIds.includes(id)?'local':'reference',...(entry.ownerId?{ownerId:entry.ownerId}:{})};});
}

// 使用已验证的正文 AST，不读取生成的 HTML，也不执行图表渲染或外部项目链接。
export function readDocument(graph:Graph,id:string,options:ReadOptions={}){
 let scope=options.scope??'self';const offset=options.offset??0,maxChars=options.maxChars??12000;
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 validateReadRange(offset,maxChars);
 const entry=graph.index.get(id);
 if(!entry)failure('QUERY_NOT_FOUND','<read>','/id','ID 不存在：'+id);
 if(entry.semanticKind==='behavior'&&options.scope===undefined)scope='subtree';
 if(entry.type==='specification')scope='subtree';
 if(entry.type!=='document'&&entry.type!=='specification')failure('READ_TYPE','<read>','/id','read 读取章节、能力、行为或条款（兼容 specification）；其他工程对象使用 query');
 for(const document of documentAST(graph))for(const section of document.ast.walk())if(section.type==='tag'&&['section','specification'].includes(section.tag)&&section.attributes.id===id){
  const children:{id:string;title:string;source:{file:string;line:number}}[]=[],sources:{file:string;line:number}[]=[],seen=new Set<string>();
  const source=(node:any)=>document.locations.get(node)??{file:document.file,line:1};
  const remember=(node:any)=>{const location=source(node);if(!seen.has(location.file)){seen.add(location.file);sources.push(location);}};
  const childSections=(node:any)=>{for(const child of [...Object.values(node.slots??{}),...node.children??[]])if(child.type==='tag'&&child.tag==='section')children.push({id:child.attributes.id,title:child.attributes.title??child.attributes.id,source:source(child)});else childSections(child);};
  childSections(section);remember(section);
  const specFor:string[]=graph.specifications?.applications.has(id)?[id]:[],localClauses:string[]=[];
  const content=formatContent(section.children,(node:any)=>{
   if(scope==='self'&&node.type==='tag'&&node.tag==='section')return false;
   remember(node);if(node.type==='tag'&&node.tag==='spec-list')specFor.push(node.attributes.for);
   if(node.type==='tag'&&node.tag==='specification')localClauses.push(node.attributes.id);return true;
  });
  const base={projectId:graph.manifest.projectId,id,title:section.attributes.title??id,source:source(section),scope,format:'markdown' as const,children,sources,specifications:[] as ReturnType<typeof composeSpecifications>['specifications'],specFor:[...new Set(specFor)],applications:selectedApplications(specFor,[...graph.specifications?.applications.values()??[]])};
  const semanticKind=entry.semanticKind,withClauses=options.withClauses??options.withSpecs??semanticKind==='behavior';
  const metadata={...(semanticKind?{semanticKind}:{}),...(semanticKind||options.withClauses!==undefined?{clauses:clauseReadings(graph,localClauses,specFor)}:{})};
  if(!withClauses)return {...base,...metadata,...readRange(content,offset,maxChars)};
  const expanded=composeSpecifications(content,selectedApplications(specFor,[...graph.specifications?.applications.values()??[]]),specId=>{
   const result=readDocument(graph,specId,{scope:'subtree',maxChars:100000});let body=result.content,next=result.range.nextOffset;
   while(next!==null){const part=readDocument(graph,specId,{scope:'subtree',maxChars:100000,offset:next});body+=part.content;next=part.range.nextOffset;}
   return {...result,content:body};
  },{clauses:!!semanticKind||options.withClauses,inlineIds:localClauses});
  return {...base,...metadata,sources:[...sources,...expanded.sources.filter(s=>!seen.has(s.file))],specifications:expanded.specifications,applications:expanded.applications,...readRange(expanded.content,offset,maxChars)};
 }
 failure('QUERY_NOT_FOUND','<read>','/id','正文中没有此章节：'+id);
}
