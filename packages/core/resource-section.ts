import {prepareOutline} from './outline.ts';
import Markdoc from '@markdoc/markdoc';
import type {Graph} from './types.ts';
import {documentAST} from './documents.ts';
import {failure} from './errors.ts';

// 只创建展示 AST，不经过 graphFromResources，不登记第二份实体/声明。
export function resourceSectionGraph(graph:Graph,sectionId:string):Graph{
 for(const document of documentAST(graph))for(const node of document.ast.walk())if(node.type==='tag'&&node.tag==='section'&&node.attributes.id===sectionId){
  const original=prepareOutline({...graph,documentPlan:{...graph.documentPlan!,documents:[document]}});
  const renderScopes=new Map<string,any>(),locations=new WeakMap<object,{file:string;line:number}>(),scopes=new WeakMap<object,any>();let counter=0;
  const copy=(node:any):any=>{
   if(node.type==='tag'&&['resource-directory','resource-content'].includes(node.tag))return undefined;
   const clone=Object.assign(new Markdoc.Ast.Node(),node,{attributes:{...node.attributes},children:[],slots:{}}),variables=document.scopes?.get(node);
   if(variables!==undefined){const key='resource-scope-'+(++counter);renderScopes.set(key,variables);scopes.set(clone,variables);clone.attributes.__edocScopeKey=key;}
   if(node.type==='heading'&&original.entries.has(node))clone.attributes.id=original.entries.get(node)!.id;
   locations.set(clone,document.locations.get(node)??{file:document.file,line:1});
   clone.children=(node.children??[]).map(copy).filter(Boolean);clone.slots=Object.fromEntries(Object.entries(node.slots??{}).map(([key,value])=>[key,copy(value)]).filter(([,value])=>value));return clone;
  };
  const ast=new Markdoc.Ast.Node('document',{},[copy(node)]);
  return {...graph,documentPlan:{...graph.documentPlan!,documents:[{...document,ast,locations,scopes}],renderScopes}};
 }
 return failure('RESOURCE_CONTENT','<resource>','','绑定 Section 不存在：'+sectionId);
}
