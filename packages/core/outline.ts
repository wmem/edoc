import {documentAST} from './documents.ts';
import {anchor} from './identity.ts';
import type {Graph} from './types.ts';

export type OutlineEntry={
 id:string;label:string;kind:'section'|'heading';level:number;depth:number;parentId?:string;
 collapsed?:boolean;sectionId?:string;source:{file:string;line:number};children:OutlineEntry[];
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
  const visit=(n:any)=>{if(n.type==='tag'&&n.tag==='section')return;if(n.type==='heading')levels.push(n.attributes.level);nodes(n).forEach(visit);};
  nodes(node).forEach(visit);return levels.length?Math.min(...levels):1;
 };
 for(const {file,ast,locations} of documents){
  type Scope={section?:OutlineEntry;rawBase:number;headings:OutlineEntry[]};
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
    const entry=add(node,node.attributes.title??node.attributes.id,anchor(node.attributes.id),'section',(scope.section?.level??0)+1,scope.section);
    entry.sectionId=node.attributes.id;
    entry.collapsed=node.attributes.collapsed===true;
    const child:Scope={section:entry,rawBase:minimum(node),headings:[]};
    nodes(node).forEach((n:any)=>walk(n,child));return;
   }
   if(node.type==='heading'){
    const level=scope.section?scope.section.level+1+node.attributes.level-scope.rawBase:node.attributes.level;
    while(scope.headings.length&&scope.headings.at(-1)!.level>=level)scope.headings.pop();
    const parent=scope.headings.at(-1)??scope.section;
    scope.headings.push(add(node,text(node).trim(),(()=>{if(typeof node.attributes.id==='string')return node.attributes.id;const base='heading-'+text(node).toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'');const key=(node.attributes.__edocNamespace??'')+base;const n=(usedHeadings.get(key)??0)+1;usedHeadings.set(key,n);return base+(n>1?'-'+n:'');})(),'heading',level,parent));
   }
   nodes(node).forEach((n:any)=>walk(n,scope));
  };
  walk(ast,{rawBase:1,headings:[]});
 }
 return {documents,roots,flat,entries};
}

export function outline(graph:Graph){
 const plan=prepareOutline(graph);
 return {projectId:graph.manifest.projectId,irVersion:graph.manifest.irVersion,entries:plan.flat.length,chapters:plan.roots};
}
