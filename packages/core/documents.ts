import {readFileSync,realpathSync} from 'node:fs';
import {extname} from 'node:path';
import Markdoc from '@markdoc/markdoc';
import type {Graph,DocumentEntity} from './types.ts';
import {projectPath,requireFile} from './paths.ts';
import {EngDocError,failure} from './errors.ts';
const attributes=(defs:Record<string,any>)=>defs;
export const tags:Record<string,any>={
 section:{render:'section',attributes:attributes({id:{type:String,required:true},title:{type:String},collapsed:{type:Boolean}})},
 columns:{render:'div',attributes:{ratio:{type:String,matches:['1:1','2:1','1:2','1:1:1'],default:'1:1'}}},
 panel:{render:'div',attributes:{title:{type:String}}},tabs:{render:'div'},tab:{render:'div',attributes:{name:{type:String,required:true}}},
 diagram:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 interface:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true},mode:{type:String,matches:['overview','detailed'],default:'detailed'}}},
 table:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 waveform:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 reference:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true}}},
 include:{selfClosing:true,attributes:{file:{type:String,required:true}}},
};
export function documentAST(graph:Graph){
 const locations=new WeakMap<object,{file:string;line:number}>();
 function parse(file:string,chain:string[]):any{
  const absolute=projectPath(graph.projectRoot,graph.projectRoot,file),identity=realpathSync(absolute);
  requireFile(absolute);
  if(chain.includes(identity))failure('DOCUMENT_INCLUDE_CYCLE',file,'','正文 include 构成循环');
  if(chain.length>=32)failure('DOCUMENT_INCLUDE_DEPTH',file,'','正文 include 嵌套最多 32 层');
  const ast=Markdoc.parse(readFileSync(absolute,'utf8'));
  const errors=Markdoc.validate(ast,{tags});
  if(errors.length)throw new EngDocError(errors.map(e=>({code:'DOCUMENT_TAG',file,path:`#L${(e.lines?.[0]??0)+1}`,message:e.error.message})));
  for(const node of ast.walk())locations.set(node,{file,line:(node.location?.start.line??0)+1});
  const expand=(node:any)=>{
   node.children=node.children.flatMap((child:any)=>{
    if(child.type==='tag'&&child.tag==='include'){
     const target=child.attributes.file;
     if(!['.md','.mdoc'].includes(extname(target)))failure('DOCUMENT_INCLUDE',file,`#L${locations.get(child)!.line}`,'include 只读取项目范围内的 .md / .mdoc 正文');
     return parse(target,[...chain,identity]).children;
    }
    expand(child);return [child];
   });
  };
  expand(ast);return ast;
 }
 return graph.manifest.entryDocuments.map(file=>({file,ast:parse(file,[]),locations}));
}
export function registerDocuments(graph:Graph){
 for(const {file,ast,locations} of documentAST(graph))for(const node of ast.walk())if(node.type==='tag'&&node.tag==='section'){
  const id=node.attributes.id;if(typeof id!=='string'||!id.trim())continue;
  const location=locations.get(node)!;
  if(graph.index.has(id))failure('DUPLICATE_ID',location.file,`#L${location.line}`,`章节 ID 已定义：${id}`);
  const entity:DocumentEntity={id,kind:'document',label:node.attributes.title??id,source:{...location,selector:id}};
  graph.index.set(id,{id,type:'document',entity,location:{file:location.file,path:`#L${entity.source.line}`}});
 }
}
export function validateDocuments(graph:Graph){
 const errors:any[]=[];
 const types:Record<string,string[]>= {diagram:['view'],interface:['view','node','group','interface'],table:['table'],waveform:['waveform']};
 for(const {file:entryFile,ast,locations} of documentAST(graph)){
  const file=entryFile;
  const containers=(node:any,parent?:any)=>{if(node.type==='tag'&&node.tag==='tab'&&parent?.tag!=='tabs')errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tab 必须直接位于 tabs 中'});if(node.type==='tag'&&node.tag==='tabs'){const tabs=node.children.filter((c:any)=>c.type==='tag'&&c.tag==='tab');if(!tabs.length||node.children.some((c:any)=>c.type!=='tag'||c.tag!=='tab')||new Set(tabs.map((c:any)=>c.attributes.name)).size!==tabs.length)errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tabs 必须包含名称唯一的 tab'});}for(const child of node.children??[])containers(child,node);};containers(ast);
  for(const error of Markdoc.validate(ast,{tags})) errors.push({code:'DOCUMENT_TAG',file,path:`#L${(error.lines?.[0]??0)+1}`,message:error.error.message});
  for(const node of ast.walk()){
   const file=locations.get(node)?.file??entryFile;
   if(node.type==='tag'){
    for(const key of Object.keys(node.attributes))if(!Object.hasOwn(tags[node.tag??'']?.attributes??{},key))errors.push({code:'DOCUMENT_ATTRIBUTE',file,path:'',message:`标签 ${node.tag} 不支持属性 ${key}`});
    const id=node.attributes.id;
    if((node.tag==='reference'||types[node.tag??''])&&typeof id==='string'){
     const entity=graph.index.get(id);
     if(!entity||(types[node.tag??'']&&!types[node.tag!].includes(entity.type)))errors.push({code:'DOCUMENT_REFERENCE',file,path:'',id,message:`标签 ${node.tag} 引用缺失或类型不符`});
    }
   }
   if(node.type==='link'||node.type==='image'){
    const value=node.attributes.href??node.attributes.src??'';
    if(node.type==='link'&&!/^(#|https?:|mailto:)/i.test(value))errors.push({code:'DOCUMENT_LINK',file,path:'',message:'文档链接只允许内部锚点、https/http、mailto'});
    if(node.type==='image') {try{projectPath(graph.projectRoot,graph.projectRoot,value);}catch(e:any){errors.push({code:'DOCUMENT_IMAGE',file,path:'',message:e.message});}}
   }
  }
 }
 if(errors.length)throw new EngDocError(errors);
}
