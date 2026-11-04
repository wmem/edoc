import Markdoc from '@markdoc/markdoc';
import {documentAST} from './documents.ts';
import {failure} from './errors.ts';
import type {Graph} from './types.ts';
import {readRange,validateReadRange} from './read-range.ts';

export type ReadOptions={scope?:'self'|'subtree';offset?:number;maxChars?:number};

// 使用已验证的正文 AST，不读取生成的 HTML，也不执行图表渲染或外部项目链接。
// 原生 HTML 对 JSON 文本值的显示：字符串/数值、数组和 Tag 子内容，其余为空。
const proseValue=(value:any):string=>typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(proseValue).join(''):Markdoc.Tag.isTag(value)?proseValue(value.children):'';

export function readDocument(graph:Graph,id:string,options:ReadOptions={}){
 const scope=options.scope??'self',offset=options.offset??0,maxChars=options.maxChars??12000;
 if(!['self','subtree'].includes(scope))failure('READ_SCOPE','<read>','/scope','scope 只接受 self/subtree');
 validateReadRange(offset,maxChars);
 const entry=graph.index.get(id);
 if(!entry)failure('QUERY_NOT_FOUND','<read>','/id','ID 不存在：'+id);
 if(entry.type!=='document')failure('READ_TYPE','<read>','/id','read 只读取有稳定 ID 的 section；工程对象使用 query');
 for(const document of documentAST(graph))for(const section of document.ast.walk())if(section.type==='tag'&&section.tag==='section'&&section.attributes.id===id){
  const children:{id:string;title:string;source:{file:string;line:number}}[]=[],sources:{file:string;line:number}[]=[],seen=new Set<string>();
  const source=(node:any)=>document.locations.get(node)??{file:document.file,line:1};
  const remember=(node:any)=>{const location=source(node);if(!seen.has(location.file)){seen.add(location.file);sources.push(location);}};
  const childSections=(node:any)=>{for(const child of [...Object.values(node.slots??{}),...node.children??[]])if(child.type==='tag'&&child.tag==='section')children.push({id:child.attributes.id,title:child.attributes.title??child.attributes.id,source:source(child)});else childSections(child);};
  childSections(section);remember(section);
  const copy=(node:any):any=>{
   if(scope==='self'&&node.type==='tag'&&node.tag==='section')return;
   remember(node);
   const result=new Markdoc.Ast.Node(node.type,Object.fromEntries(Object.entries(node.attributes).filter(([key])=>!key.startsWith('__edoc'))),[...Object.values(node.slots??{}),...node.children??[]].map(copy).filter(Boolean),node.tag);
   if(result.type==='text'&&typeof result.attributes.content!=='string')result.attributes.content=proseValue(result.attributes.content);
   result.inline=node.inline;result.annotations=node.annotations.filter((a:any)=>!a.name?.startsWith('__edoc'));
   if(result.type==='fence'&&result.attributes.process===false){result.annotations=result.annotations.filter((a:any)=>a.name!=='process');result.annotations.push({type:'attribute',name:'process',value:false});}
   return result;
  };
  const content=Markdoc.format(section.children.map(copy).filter(Boolean)).trim();
  return {projectId:graph.manifest.projectId,id,title:section.attributes.title??id,source:source(section),scope,format:'markdown' as const,children,sources,...readRange(content,offset,maxChars)};
 }
 failure('QUERY_NOT_FOUND','<read>','/id','正文中没有此章节：'+id);
}
