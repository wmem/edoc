import {isControl,elements} from './types.ts';
import type {Graph,RecordEntry} from '../../core/types.ts';
import {failure} from '../../core/errors.ts';
export function controlLinks(_graph:Graph,entry:RecordEntry):string[]|undefined{
 const m=entry.entity;
 if('model'in m)return [m.model];
 if(!isControl(m))return;
 return [...new Set((m.kind==='state-machine'?m.states:m.nodes).flatMap(n=>'call'in n&&n.call?[n.call.model]:[]))];
}
export function controlElement(graph:Graph,id:string,elementId:string){
 const entry=graph.index.get(id),m=entry?.entity;
 if(!isControl(m))failure('QUERY_TYPE','<query>','/id','--element 的 --id 必须指向状态机或流程模型');
 const found=elements(m).find(e=>e.element.id===elementId);
 if(!found)failure('QUERY_NOT_FOUND','<query>','/element','局部元素不存在：'+elementId);
 const edges=m.kind==='state-machine'?m.transitions:m.edges;
 return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,elementId,target:{...found.element,location:{file:entry!.location.file,path:entry!.location.path+found.path},source:found.element.source??m.source},incoming:edges.filter(e=>e.to===elementId),outgoing:edges.filter(e=>e.from===elementId)};
}
