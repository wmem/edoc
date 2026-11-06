import type {Graph,Manifest,ResourceType,Entity,RecordEntry,Connection,Diagnostic,Interface} from './types.ts';
import {validateSchema} from './schema.ts';
import {resourceSchemas} from './extension-contracts.ts';
import {registerDocuments,validateDocuments} from './documents.ts';
import type {DocumentPlan} from './documents.ts';
import {validateResources} from './resource-validation.ts';
import {prepareMachineSpecifications,registerSpecifications} from '../extensions/specification/prepare.ts';
import {EdocError} from './errors.ts';

export type ResourcePart={type:ResourceType;data:any;file:string;prefix?:string};
export {resourceSchemas} from './extension-contracts.ts';

// 文件发现与工程索引解耦：调用方可以来自文件扫描或 JS 配置，不需要 manifest 文件。
export function graphFromResources(parts:ResourcePart[],metadata:Manifest,options:{root:string;directory?:string;documents?:DocumentPlan;strict?:boolean;attachments?:Graph['attachments']}):Graph{
 const index=new Map<string,RecordEntry>(),connections=new Map<string,Connection>(),diagnostics:Diagnostic[]=[];
 const add=(entity:Entity,type:RecordEntry['type'],file:string,path:string,ownerId?:string)=>{
  if(index.has(entity.id)){diagnostics.push({code:'DUPLICATE_ID',file,path:path+'/id',id:entity.id,message:`稳定 ID 已在 ${index.get(entity.id)!.location.file}${index.get(entity.id)!.location.path} 定义`});return;}
  index.set(entity.id,{id:entity.id,entity,type,location:{file,path},...(ownerId?{ownerId}:{})});if(type==='connection')connections.set(entity.id,entity as Connection);
 };
 for(const part of parts){
  const errors=validateSchema(resourceSchemas[part.type],part.data,part.file,!options.strict&&Number(metadata.irVersion.split('.')[1])>0);
  if(errors.length){diagnostics.push(...errors.map(d=>({...d,path:(part.prefix??'')+d.path})));continue;}
  for(const [i,entity]of part.data[part.type].entries()){
   const path=`${part.prefix??''}/${part.type}/${i}`;
   add(entity,part.type==='views'?'view':entity.kind,part.file,path);
   if(entity.kind==='table')entity.rows.forEach((row:Entity,p:number)=>add(row,'row',part.file,`${path}/rows/${p}`,entity.id));
   if(entity.kind==='register')entity.fields.forEach((field:Entity,p:number)=>add(field,'register-field',part.file,`${path}/fields/${p}`,entity.id));
   if(entity.kind==='node'){
    entity.ports?.forEach((port:Entity,p:number)=>add(port,'port',part.file,`${path}/ports/${p}`,entity.id));
    entity.interfaces?.forEach((item:Entity,p:number)=>add(item,'interface',part.file,`${path}/interfaces/${p}`,entity.id));
   }
  }
 }
 if(diagnostics.length)throw new EdocError(diagnostics);
 const graph:Graph={attachments:options.attachments,manifest:metadata,projectRoot:options.root,irDirectory:options.directory??options.root,index,connections,adjacency:new Map(),...(options.documents?{documentPlan:options.documents}:{})};
 prepareMachineSpecifications(graph);registerDocuments(graph);registerSpecifications(graph);validateResources(graph);validateDocuments(graph);
 graph.interfaceByPort=new Map();for(const entry of index.values())if(entry.type==='interface')for(const id of (entry.entity as Interface).members)graph.interfaceByPort.set(id,entry.id);
 for(const connection of connections.values())for(const id of connection.endpoints){
  const ids=[id,index.get(id)!.ownerId,graph.interfaceByPort.get(id)].filter(Boolean) as string[];
  for(const target of ids){if(!graph.adjacency.has(target))graph.adjacency.set(target,new Set());graph.adjacency.get(target)!.add(connection.id);}
 }
 return graph;
}
