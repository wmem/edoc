import {figureFail} from '../../figure/errors.ts';
import type {Graph, RecordEntry, AddressSpace, RegisterBlock} from '../../core/types.ts';
import type {EngineeringResult} from '../../figure/query-result.ts';
import {registerInstance, registerMapProjection} from './model.ts';
import {createAddressResolver} from './resolver.ts';
import {addressLeaves} from './leaves.ts';
import {parseInstancePath} from './model.ts';
export function registerMapLinks(graph: Graph, entry: RecordEntry): string[] | undefined {
  if (entry.type === 'register-block') return (entry.entity as RegisterBlock).entries.map(e => e.register ?? e.block!);
  if (entry.type === 'address-space') return (entry.entity as AddressSpace).regions.flatMap(e => e.kind !== 'reserved' && (!e.target.project || e.target.project === graph.manifest.projectId) ? [e.target.id] : []);
  if (entry.type === 'memory') return [];
}
export function registerMapQuery(graph: Graph, entry: RecordEntry) {
  if (entry.type === 'register-block') {
    const resolver = createAddressResolver(graph), layout = resolver.block(graph.manifest.projectId, entry.id);
    return {registerMap: registerMapProjection(graph, entry.id), nativeSizeBits: layout.sizeBits.toString(), effectiveAccessPolicy: resolver.policy(graph.manifest.projectId, layout.block)};
  }
  return entry.type === 'address-space' ? {registerMap: registerMapProjection(graph, entry.id)} : {};
}
export function registerMapElement(graph: Graph, id: string, elementId: string): EngineeringResult | undefined {
  if (!['register-block', 'address-space', 'memory'].includes(graph.index.get(id)!.type)) return;
  if(elementId.trim().startsWith('{')) {
    let selector:any;try{selector=JSON.parse(elementId);}catch{figureFail('ADDRESS_PATH',id,'元素查询不是合法 JSON');}
    if(selector?.kind==='leaves'){
      if(Object.keys(selector).some(k=>!['kind','path','limit','cursor'].includes(k))||selector.cursor!==undefined&&typeof selector.cursor!=='string')figureFail('ADDRESS_PATH',id,'叶查询需要 {kind:"leaves",path?:Step[],limit?:1..100,cursor?:位坐标字符串}');
      const record=graph.index.get(id)!;
      const leaves=addressLeaves(createAddressResolver(graph),graph.manifest.projectId,id,parseInstancePath(JSON.stringify(selector.path??[])),{limit:selector.limit,cursor:selector.cursor});
      return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,leaves,target:{...record.entity,location:record.location},incoming:[],outgoing:[]};
    }
    if(selector?.kind==='summary'&&typeof selector.id==='string'&&Object.keys(selector).every(k=>['kind','id'].includes(k))){
      const projection=registerMapProjection(graph,id),range=projection.intervals.find(r=>r.id===selector.id),entry=graph.index.get(id)!;
      if(!range)figureFail('ADDRESS_PATH',id,'汇总条目不存在：'+selector.id);
      return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,summary:range,target:{id:range.id,label:range.label,location:entry.location},incoming:[],outgoing:[]};
    }
    if(selector?.kind!=='address'||typeof selector.address!=='string'||Object.keys(selector).some(k=>!['kind','address'].includes(k)))figureFail('ADDRESS_PATH',id,'地址点查询需要 {kind:"address",address:"整数地址"}');
    const addressPoint=createAddressResolver(graph).resolveAddress(graph.manifest.projectId,id,selector.address),entry=graph.index.get(id)!;
    return {irVersion:graph.manifest.irVersion,projectId:graph.manifest.projectId,modelId:id,addressPoint,target:{...entry.entity,location:entry.location},incoming:[],outgoing:[]};
  }
  const instance = registerInstance(graph, id, elementId);
  return {irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId, ...instance, target: {...instance.entity, location: instance.location}, incoming: [], outgoing: []};
}
