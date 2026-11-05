import {posix} from 'node:path';
import type {DocumentPlan} from './documents.ts';
import {failure} from './errors.ts';

export type DirectoryOrders=Map<string,readonly string[]>;
const indexFile=(file:string)=>/^index\.(md|mdoc)$/i.test(posix.basename(file));

// 只检查本次已发现的文章，不读取文件或扩大正文扫描范围。
export function directoryOrders(plan:DocumentPlan):DirectoryOrders{
 const candidates=new Map<string,Set<string>>();
 const add=(directory:string,item:string)=>{if(!candidates.has(directory))candidates.set(directory,new Set());candidates.get(directory)!.add(item);};
 for(const {file}of plan.documents.filter(d=>!d.hidden)){
  let directory=posix.dirname(file);
  if(!indexFile(file))add(directory,posix.basename(file));
  while(directory!=='.'){
   const parent=posix.dirname(directory);add(parent,posix.basename(directory)+'/');directory=parent;
  }
 }
 const active=plan.documents.flatMap(document=>[...document.ast.walk()].filter(node=>node.type==='tag'&&node.tag==='directory-order').map(node=>({node,...(document.locations.get(node)??{file:document.file,line:1}),documentFile:document.file,direct:true})));
 const declarations=plan.checks??active;
 for(const declaration of declarations){
  const {node,file,line}=declaration;if(node.type!=='tag'||node.tag!=='directory-order')continue;
  const fail=(message:string,item?:number)=>failure('DIRECTORY_ORDER',file,`#L${line}`+(item===undefined?'':`/items/${item}`),message);
  if(!indexFile(file)||declaration.documentFile!==file||declaration.direct===false)fail('directory-order 必须直接写在本目录的 index.md 或 index.mdoc 中，不能由 include/partial 引入');
  const items=node.attributes.items;
  if(!Array.isArray(items))fail('items 必须是本层文章或目录的路径数组');
  const seen=new Set<string>();
  for(const [index,item]of items.entries()){
   if(typeof item!=='string'||!item.trim()||!/^(?:[^/\\\0]+\.m(?:d|doc)|[^/\\\0]+\/)$/i.test(item)||item==='./'||item==='../'||!item.endsWith('/')&&indexFile(item))fail('只接受本层文章名或以 / 结尾的子目录名，不接受 index 自身、锚点或越层路径',index);
   if(seen.has(item))fail('排序项重复：'+item,index);seen.add(item);
   if(!candidates.get(posix.dirname(file))?.has(item))fail('当前发布文档中没有这个本层文章或目录：'+item,index);
  }
 }
 const result:DirectoryOrders=new Map();
 for(const {node,file,line}of active){
  const directory=posix.dirname(file);
  if(result.has(directory))failure('DIRECTORY_ORDER',file,`#L${line}`,'同一目录只能有一个生效的 directory-order：'+directory);
  result.set(directory,node.attributes.items);
 }
 return result;
}

// 只重排可导航的直接子项；页内章节、首页和显式接入的子工程保持原来的位置。
export function orderDirectory<T>(nodes:T[],items:readonly string[],key:(node:T)=>string|undefined):void{
 const rank=new Map(items.map((item,index)=>[item,index]));
 const sorted=nodes.filter(node=>key(node)!==undefined).map((node,index)=>({node,index})).sort((a,b)=>(rank.get(key(a.node)!)??items.length)-(rank.get(key(b.node)!)??items.length)||a.index-b.index).map(item=>item.node);
 let cursor=0;for(let index=0;index<nodes.length;index++)if(key(nodes[index])!==undefined)nodes[index]=sorted[cursor++];
}
