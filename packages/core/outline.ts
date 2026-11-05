import {documentAST} from './documents.ts';
import {anchor} from './identity.ts';
import type {Graph} from './types.ts';

export type OutlineEntry={
 id:string;label:string;kind:'section'|'heading';level:number;depth:number;parentId?:string;
 number?:string;local?:boolean;collapsed?:boolean;sectionId?:string;source:{file:string;line:number};children:OutlineEntry[];
};

// section 表达显式包含关系；其内部 Markdown 的最浅标题从下一级开始。
// 排版容器透明，多个入口分别开始；不根据标题文本或工程领域猜测层级。
export function prepareOutline(graph:Graph){
 const documents=documentAST(graph),roots:OutlineEntry[]=[],flat:OutlineEntry[]=[];
 const entries=new WeakMap<object,OutlineEntry>();
 const usedHeadings=new Map<string,number>();
 const nodes=(node:any):any[]=>[...Object.values(node.slots??{}),...node.children];
 const plain=(v:any):string=>typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(plain).join(''):'';
 const text=(node:any):string=>node.type==='text'?plain(node.attributes.content):
  node.type==='code'?node.attributes.content??nodes(node).map(text).join(''):
  nodes(node).map(text).join('');
 const minimum=(node:any):number=>{
  const levels:number[]=[];
  const visit=(n:any)=>{if(n.type==='tag'&&['section','specification'].includes(n.tag))return;if(n.type==='heading')levels.push(n.attributes.level);nodes(n).forEach(visit);};
  nodes(node).forEach(visit);return levels.length?Math.min(...levels):1;
 };
 for(const {file,ast,locations} of documents){
  type Scope={section?:OutlineEntry;rawBase:number;headings:OutlineEntry[];specification?:boolean};
  const add=(node:any,label:string,id:string,kind:OutlineEntry['kind'],level:number,parent?:OutlineEntry)=>{
   const namespace=node.attributes.__edocNamespace??'';id=namespace+id;
   const entry:OutlineEntry={id,label,kind,level,depth:parent?parent.depth+1:0,
    ...(parent?{parentId:parent.id}:{}),source:locations.get(node)??{file,line:1},children:[]};
   (parent?parent.children:roots).push(entry);flat.push(entry);entries.set(node,entry);
   // Markdoc.resolve 会克隆 AST；仅在本次解析的内存节点上携带内部关联键。
   node.attributes.__edocOutlineId=id;return entry;
  };
  const walk=(node:any,scope:Scope)=>{
   if(node.type==='tag'&&['section','specification'].includes(node.tag)){
    const spec=node.tag==='specification'||!!node.attributes.__edocSpecification;
    const parent=spec?scope.headings.at(-1)??scope.section:scope.section;
    const entry=add(node,node.attributes.title??node.attributes.id,anchor(node.attributes.id),'section',(parent?.level??0)+1,parent);
    if(scope.specification||spec&&node.attributes.__edocNamespace)entry.local=true;
    entry.sectionId=node.attributes.id;
    entry.collapsed=node.attributes.collapsed===true;
    const child:Scope={section:entry,rawBase:minimum(node),headings:[],specification:scope.specification||spec};
    nodes(node).forEach((n:any)=>walk(n,child));return;
   }
   if(node.type==='heading'){
    const level=scope.section?scope.section.level+1+node.attributes.level-scope.rawBase:node.attributes.level;
    while(scope.headings.length&&scope.headings.at(-1)!.level>=level)scope.headings.pop();
    const parent=scope.headings.at(-1)??scope.section;
    const entry=add(node,text(node).trim(),(()=>{if(typeof node.attributes.id==='string')return node.attributes.id;const base='heading-'+text(node).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'');const key=(node.attributes.__edocNamespace??'')+base;const n=(usedHeadings.get(key)??0)+1;usedHeadings.set(key,n);return base+(n>1?'-'+n:'');})(),'heading',level,parent);if(scope.specification)entry.local=true;scope.headings.push(entry);
   }
   nodes(node).forEach((n:any)=>walk(n,scope));
  };
  walk(ast,{rawBase:1,headings:[]});
 }
 // 局部标题仍有锚点与渲染条目，但不加入公开阅读目录。
 for(const entry of flat)if(!entry.local)entry.children=entry.children.filter(child=>!child.local);
 return {documents,roots:roots.filter(e=>!e.local),flat:flat.filter(e=>!e.local),all:flat,entries};
}

export function outline(graph:Graph){
 const plan=prepareOutline(graph);
 return {projectId:graph.manifest.projectId,irVersion:graph.manifest.irVersion,entries:plan.flat.length,chapters:plan.roots};
}
