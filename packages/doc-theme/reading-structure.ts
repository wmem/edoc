import Markdoc from '@markdoc/markdoc';
import type {OutlineEntry} from '../core/outline.ts';

// 编号属于本篇阅读视图；保留源标题、锚点和工程身份。
export function readingOutline(roots:OutlineEntry[],title:string,specifications:Set<string>){
 const first=roots[0],titleId=first?.label===title&&!specifications.has(first.id)?first.id:undefined;
 const numbers=new Map<string,string>();
 const walk=(nodes:OutlineEntry[],prefix:number[]=[],counter={value:0}):OutlineEntry[]=>nodes.map(node=>{
  if(specifications.has(node.id))return {...node,children:[]};
  if(node.id===titleId)return {...node,children:walk(node.children,prefix,counter)};
  const path=[...prefix,++counter.value],number=path.join('.')+(path.length===1?'.':'');numbers.set(node.id,number);
  return {...node,number,children:walk(node.children,path)};
 });
 return {roots:walk(roots),numbers,titleId};
}

// 只在同一排版容器的连续子节点内分组，不跨越分栏、Tab 或显式 section。
export function headingGroups(nodes:any[],titleId?:string){
 const result:any[]=[],stack:{id:string;children:any[]}[]=[];
 const append=(node:any)=>(stack.at(-1)?.children??result).push(node);
 for(const node of nodes.flat(Infinity)){
  const heading=Markdoc.Tag.isTag(node)&&node.name==='ed-heading'&&!node.attributes.local;
  const section=Markdoc.Tag.isTag(node)&&node.name==='ed-section'&&!node.attributes.local&&!node.attributes.specification;
  if(heading||section){
   const parent=node.attributes.outlineParentId;
   while(stack.length&&stack.at(-1)!.id!==parent)stack.pop();
  }
  if(heading&&node.attributes.id!==titleId){
   const group=new Markdoc.Tag('ed-heading-group',{...node.attributes},[node]);append(group);stack.push({id:node.attributes.id,children:group.children});
  }else append(node);
 }
 return result;
}
