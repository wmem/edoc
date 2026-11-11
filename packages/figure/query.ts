import type {Graph,RecordEntry} from '../core/types.ts';
import type {Sequence, BinaryLayout, PlotView,RegisterBlock,AddressSpace} from '../core/types.ts';
import {sequenceElements} from '../extensions/sequence/types.ts';
import {sequenceProjection,sequenceReferences} from '../extensions/sequence/model.ts';
import {binaryElements} from '../extensions/binary-layout/types.ts';
import {binaryProjection,binaryModel} from '../extensions/binary-layout/model.ts';
import {plotProjection} from '../extensions/plot/model.ts';
import {registerMapProjection,registerInstance} from '../extensions/register-map/model.ts';
import {figureFail} from './errors.ts';
export function engineeringLinks(_graph:Graph,entry:RecordEntry):string[]|undefined{
 const m=entry.entity;if(entry.type==='sequence')return sequenceReferences(m as Sequence);if(entry.type==='binary-layout')return binaryElements(m as BinaryLayout).flatMap(e=>'model'in e.element?[String(e.element.model)]:[]);if(entry.type==='register-block')return (m as RegisterBlock).entries.map(e=>e.register??e.block!);if(entry.type==='address-space')return (m as AddressSpace).mappings.map(e=>e.block);if(entry.type==='view'&&'kind'in m&&m.kind==='plot')return [(m as PlotView).data];
}
export function engineeringProjection(graph:Graph,entry:RecordEntry){if(entry.type==='sequence')return {sequence:sequenceProjection(entry.entity as Sequence)};if(entry.type==='binary-layout')return {binaryLayout:binaryProjection(graph,entry.id)};if(entry.type==='register-block'||entry.type==='address-space')return {registerMap:registerMapProjection(graph,entry.id)};if(entry.type==='view'&&('kind'in entry.entity?entry.entity.kind:'')==='plot')return {plot:plotProjection(graph,entry.entity as PlotView)};return {};}
type EngineeringResult={irVersion:string;projectId:string;modelId:string;target:{id:string;label?:string;location:{file:string;path:string};[key:string]:unknown};incoming:never[];outgoing:never[];[key:string]:unknown};
export function engineeringElement(graph:Graph,id:string,elementId:string):EngineeringResult|undefined{const entry=graph.index.get(id)!;
 if(entry.type==='register-block'||entry.type==='address-space')return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,...registerInstance(graph,id,elementId),target:{...registerInstance(graph,id,elementId).entity,location:entry.location},incoming:[],outgoing:[]};
 if(entry.type!=='sequence'&&entry.type!=='binary-layout')return undefined;
 if(entry.type==='sequence'){
  const m=entry.entity as Sequence,found=sequenceElements(m).some(e=>e.element.id===elementId);
  if(!found){const ref=sequenceElements(m).map(e=>e.element as any).filter(e=>e.kind==='ref'&&elementId.startsWith(e.id+'/')).sort((a,b)=>b.id.length-a.id.length)[0];if(ref){const child=engineeringElement(graph,ref.model,elementId.slice(ref.id.length+1));if(!child)figureFail('QUERY_NOT_FOUND',id,'子交互元素不存在');return {...child,modelId:id,elementId,originModelId:ref.model,participantMapping:ref.participants};}}
 }
 if(entry.type==='binary-layout'&&elementId.startsWith('[')){
  const row=binaryProjection(graph,id).rows.find(r=>JSON.stringify(r.path)===elementId);if(!row)figureFail('QUERY_NOT_FOUND',id,'展开字段路径不存在：'+elementId);const origin=graph.index.get(row.modelId)!,found=binaryElements(binaryModel(graph,row.modelId)).find(e=>e.element.id===row.id)!;
  return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,elementId,originModelId:row.modelId,incoming:[],outgoing:[],target:{...found.element,location:{file:origin.location.file,path:origin.location.path+found.path},source:found.element.source??origin.entity.source},layout:[row]};
 }
 const model=entry.entity as Sequence|BinaryLayout,found=(entry.type==='sequence'?sequenceElements(model as Sequence):binaryElements(model as BinaryLayout)).find(e=>e.element.id===elementId);if(!found)figureFail('QUERY_NOT_FOUND',id,'局部元素不存在：'+elementId);
 return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,elementId,incoming:[],outgoing:[],target:{...found.element,location:{file:entry.location.file,path:entry.location.path+found.path},source:found.element.source??model.source},...(entry.type==='binary-layout'?{layout:binaryProjection(graph,id).rows.filter(r=>r.id===elementId)}:{events:sequenceProjection(model as Sequence).events.filter(e=>e.message===elementId)})};
}
