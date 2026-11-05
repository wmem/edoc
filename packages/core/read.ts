import {documentAST} from './documents.ts';
import {formatContent} from './content.ts';
import {composeSpecifications,selectedApplications} from '../extensions/specification/reading.ts';
import {failure} from './errors.ts';
import type {Graph} from './types.ts';
import {readRange,validateReadRange} from './read-range.ts';

export type ReadOptions={scope?:'self'|'subtree';offset?:number;maxChars?:number;withSpecs?:boolean};

// 使用已验证的正文 AST，不读取生成的 HTML，也不执行图表渲染或外部项目链接。
export function readDocument(graph:Graph,id:string,options:ReadOptions={}){
 let scope=options.scope??'self';const offset=options.offset??0,maxChars=options.maxChars??12000;
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 validateReadRange(offset,maxChars);
 const entry=graph.index.get(id);
 if(!entry)failure('QUERY_NOT_FOUND','<read>','/id','ID 不存在：'+id);
 if(entry.type==='specification')scope='subtree';
 if(entry.type!=='document'&&entry.type!=='specification')failure('READ_TYPE','<read>','/id','read 读取 section 或 specification；其他工程对象使用 query');
 for(const document of documentAST(graph))for(const section of document.ast.walk())if(section.type==='tag'&&['section','specification'].includes(section.tag)&&section.attributes.id===id){
  const children:{id:string;title:string;source:{file:string;line:number}}[]=[],sources:{file:string;line:number}[]=[],seen=new Set<string>();
  const source=(node:any)=>document.locations.get(node)??{file:document.file,line:1};
  const remember=(node:any)=>{const location=source(node);if(!seen.has(location.file)){seen.add(location.file);sources.push(location);}};
  const childSections=(node:any)=>{for(const child of [...Object.values(node.slots??{}),...node.children??[]])if(child.type==='tag'&&child.tag==='section')children.push({id:child.attributes.id,title:child.attributes.title??child.attributes.id,source:source(child)});else childSections(child);};
  childSections(section);remember(section);
  const specFor:string[]=graph.specifications?.applications.has(id)?[id]:[];
  const content=formatContent(section.children,(node:any)=>{
   if(scope==='self'&&node.type==='tag'&&node.tag==='section')return false;
   remember(node);if(node.type==='tag'&&node.tag==='spec-list')specFor.push(node.attributes.for);return true;
  });
  const base={projectId:graph.manifest.projectId,id,title:section.attributes.title??id,source:source(section),scope,format:'markdown' as const,children,sources,specifications:[] as ReturnType<typeof composeSpecifications>['specifications'],specFor:[...new Set(specFor)],applications:selectedApplications(specFor,[...graph.specifications?.applications.values()??[]])};
  if(!options.withSpecs)return {...base,...readRange(content,offset,maxChars)};
  const expanded=composeSpecifications(content,selectedApplications(specFor,[...graph.specifications?.applications.values()??[]]),specId=>{
   const result=readDocument(graph,specId,{scope:'subtree',maxChars:100000});let body=result.content,next=result.range.nextOffset;
   while(next!==null){const part=readDocument(graph,specId,{scope:'subtree',maxChars:100000,offset:next});body+=part.content;next=part.range.nextOffset;}
   return {...result,content:body};
  });
  return {...base,sources:[...sources,...expanded.sources.filter(s=>!seen.has(s.file))],specifications:expanded.specifications,applications:expanded.applications,...readRange(expanded.content,offset,maxChars)};
 }
 failure('QUERY_NOT_FOUND','<read>','/id','正文中没有此章节：'+id);
}
