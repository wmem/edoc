import {readFileSync} from 'node:fs';
import Markdoc from '@markdoc/markdoc';
import type {Graph,DocumentEntity} from './types.ts';
import {projectPath} from './paths.ts';
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
};
export function documentAST(graph:Graph){return graph.manifest.entryDocuments.map(file=>({file,ast:Markdoc.parse(readFileSync(projectPath(graph.projectRoot,graph.projectRoot,file),'utf8'))}));}
export function registerDocuments(graph:Graph){
 for(const {file,ast} of documentAST(graph))for(const node of ast.walk())if(node.type==='tag'&&node.tag==='section'){
  const id=node.attributes.id;if(typeof id!=='string'||!id.trim())continue;
  if(graph.index.has(id))failure('DUPLICATE_ID',file,`#L${(node.location?.start.line??0)+1}`,`章节 ID 已定义：${id}`);
  const entity:DocumentEntity={id,kind:'document',label:node.attributes.title??id,source:{file,line:(node.location?.start.line??0)+1,selector:id}};
  graph.index.set(id,{id,type:'document',entity,location:{file,path:`#L${entity.source.line}`}});
 }
}
export function validateDocuments(graph:Graph){
 const errors:any[]=[];
 const types:Record<string,string[]>= {diagram:['view'],interface:['view','node','group'],table:['table'],waveform:['waveform']};
 for(const {file,ast} of documentAST(graph)){
  for(const error of Markdoc.validate(ast,{tags})) errors.push({code:'DOCUMENT_TAG',file,path:`#L${(error.lines?.[0]??0)+1}`,message:error.error.message});
  for(const node of ast.walk()){
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
