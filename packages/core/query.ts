import {assertResourceContext} from './resource-context.ts';
import {createAddressResolver} from '../extensions/register-map/resolver.ts';
import type {AddressSpace} from './types.ts';
import {FigureError} from '../figure/errors.ts';
import {engineeringProjection,engineeringElement} from '../figure/query.ts';
import {controlElement} from '../extensions/control-diagram/query.ts';
import {registerProjection,resetText,resetState} from '../extensions/register/model.ts';
import {entitySource,resolveLinkTarget} from './link-target.ts';
import type {Register,RegisterField,Row} from './types.ts';
import {anchor} from './identity.ts';
import type { Graph, RecordEntry } from './types.ts';
import {dataLinkResolvers} from './extension-links.ts';
import { EdocError, failure } from './errors.ts';

const complete=assertResourceContext;

function item(entry: RecordEntry) {
  return { id: entry.id, type: entry.type, entity: entry.entity, location: entry.location,
    ...(entry.ownerId ? { ownerId: entry.ownerId } : {}),...(entry.semanticKind?{semanticKind:entry.semanticKind}:{}) };
}

function links(graph:Graph,entry:RecordEntry):string[]{
 if(entry.type==='reference'){const e=entry.entity as import('./types.ts').Reference;return [e.fromId,e.targetId];}
 if(entry.semanticKind)return [entry.ownerId,...[...graph.index.values()].filter(child=>child.ownerId===entry.id&&child.semanticKind).map(child=>child.id)].filter((id):id is string=>!!id);
 for(const resolve of dataLinkResolvers){const links=resolve(graph,entry);if(links!==undefined)return links;}
 return [];
}

export function query(graph: Graph, id: string, options: { depth?: number; maxItems?: number } = {}) {
  complete(graph);
  const depth = options.depth ?? 0;
  const maxItems = options.maxItems ?? 1000;
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) failure('QUERY_DEPTH', '<query>', '/depth', 'depth 必须为 0–10 的整数');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10000) failure('QUERY_LIMIT', '<query>', '/maxItems', 'maxItems 必须为 1–10000 的整数');
  const target = graph.index.get(id);
  if (!target) failure('QUERY_NOT_FOUND', '<query>', '/id', `ID 不存在：${id}`);
  const directRelations = [...(graph.adjacency.get(id) ?? [])].map(relationId => graph.connections.get(relationId)!);
  const resolver=createAddressResolver(graph),key=(project:string,id:string)=>JSON.stringify([project,id]);
  const seen = new Set([key(graph.manifest.projectId,id)]);
  const queue = [{ id, graph, level: 0 }];
  const expanded: (ReturnType<typeof item> & {projectId:string})[] = [];
  let truncated = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.level >= depth) continue;
    const local=current.graph,entry=local.index.get(current.id)!;
    const nextLinks=entry.type==='address-space'?(entry.entity as AddressSpace).regions.flatMap(region=>region.kind==='reserved'?[]:[{project:region.target.project??local.manifest.projectId,id:region.target.id}]):links(local,entry).map(id=>({project:local.manifest.projectId,id}));
    const reverse=[...local.index.values()].filter(e=>e.type==='reference'&&((e.entity as any).fromId===current.id||(e.entity as any).targetId===current.id)).map(e=>e.id);
    for (const next of [...nextLinks,...reverse.map(id=>({project:local.manifest.projectId,id}))]) {
      const qualified=key(next.project,next.id);
      if (seen.has(qualified)) continue;
      if (expanded.length >= maxItems) { truncated = true; continue; }
      seen.add(qualified);
      const located=resolver.find(next.project,next.id);
      expanded.push({...item(located.entry),projectId:next.project});
      queue.push({ id: next.id, graph:located.graph, level: current.level + 1 });
    }
  }
  return {
    ...engineeringProjection(graph,target),
    irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    target: {...item(target),anchor:anchor(id)}, directRelations,
    ...(target.semanticKind==='capability'||target.semanticKind==='behavior'?{children:[...graph.index.values()].filter(entry=>entry.ownerId===id&&entry.semanticKind).map(item)}:{}),
    ...(target.type==='row'&&(target.entity as Row).links?{cellLinks:Object.fromEntries(Object.entries((target.entity as Row).links!).map(([field,link])=>[field,resolveLinkTarget(graph,link)]))}:{}),
    ...(target.type==='register'?{register:registerProjection(target.entity as Register)}:{}),
    ...(target.type==='register-field'?{registerField:{width:(target.entity as RegisterField).msb-(target.entity as RegisterField).lsb+1,resetState:resetState((target.entity as RegisterField).reset),resetText:resetText((target.entity as RegisterField).reset),...entitySource(graph,id)}}:{}),
    references:[...graph.index.values()].filter(e=>e.type==='reference'&&((e.entity as any).fromId===id||(e.entity as any).targetId===id)).map(item),
    expansion: { depth, maxItems, truncated, items: expanded },
  };
}

export function queryElement(graph:Graph,id:string,elementId:string){complete(graph);if(!graph.index.has(id))failure('QUERY_NOT_FOUND','<query>','/id','ID 不存在：'+id);try{return engineeringElement(graph,id,elementId)??controlElement(graph,id,elementId);}catch(error){if(error instanceof FigureError){const entry=graph.index.get(id)!;throw new EdocError([{code:error.code,id:error.id,file:entry.location.file,path:entry.location.path+error.path,message:error.message,...(error.details?{details:error.details}:{})}]);}throw error;}}
export function summary(graph: Graph) {
  complete(graph);
  const counts: Record<string, number> = {};
  for (const entry of graph.index.values()) counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  return { valid: true, irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    resources: graph.manifest.resources.length, counts,...(graph.controlDiagnostics?.length?{modelDiagnostics:graph.controlDiagnostics}:{}), ...(graph.documentPlan?.warnings?.length?{warnings:graph.documentPlan.warnings}:{}), entryDocuments: graph.manifest.entryDocuments };
}
