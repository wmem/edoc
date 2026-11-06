import {registerProjection,resetText,resetState} from '../extensions/register/model.ts';
import {entitySource,resolveLinkTarget} from './link-target.ts';
import type {Register,RegisterField,Row} from './types.ts';
import {anchor} from './identity.ts';
import type { Graph, RecordEntry } from './types.ts';
import {dataLinkResolvers} from './extension-links.ts';
import { failure } from './errors.ts';

function item(entry: RecordEntry) {
  return { id: entry.id, type: entry.type, entity: entry.entity, location: entry.location,
    ...(entry.ownerId ? { ownerId: entry.ownerId } : {}) };
}

function links(graph:Graph,entry:RecordEntry):string[]{
 if(entry.type==='reference'){const e=entry.entity as import('./types.ts').Reference;return [e.fromId,e.targetId];}
 for(const resolve of dataLinkResolvers){const links=resolve(graph,entry);if(links!==undefined)return links;}
 return [];
}

export function query(graph: Graph, id: string, options: { depth?: number; maxItems?: number } = {}) {
  const depth = options.depth ?? 0;
  const maxItems = options.maxItems ?? 1000;
  if (!Number.isInteger(depth) || depth < 0 || depth > 10) failure('QUERY_DEPTH', '<query>', '/depth', 'depth 必须为 0–10 的整数');
  if (!Number.isInteger(maxItems) || maxItems < 1 || maxItems > 10000) failure('QUERY_LIMIT', '<query>', '/maxItems', 'maxItems 必须为 1–10000 的整数');
  const target = graph.index.get(id);
  if (!target) failure('QUERY_NOT_FOUND', '<query>', '/id', `ID 不存在：${id}`);
  const directRelations = [...(graph.adjacency.get(id) ?? [])].map(relationId => graph.connections.get(relationId)!);
  const seen = new Set([id]);
  const queue = [{ id, level: 0 }];
  const expanded: ReturnType<typeof item>[] = [];
  let truncated = false;
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor];
    if (current.level >= depth) continue;
    const reverse=[...graph.index.values()].filter(e=>e.type==='reference'&&((e.entity as any).fromId===current.id||(e.entity as any).targetId===current.id)).map(e=>e.id);
    for (const next of [...links(graph, graph.index.get(current.id)!),...reverse]) {
      if (seen.has(next)) continue;
      if (expanded.length >= maxItems) { truncated = true; continue; }
      seen.add(next);
      expanded.push(item(graph.index.get(next)!));
      queue.push({ id: next, level: current.level + 1 });
    }
  }
  return {
    irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    target: {...item(target),anchor:anchor(id)}, directRelations,
    ...(target.type==='row'&&(target.entity as Row).links?{cellLinks:Object.fromEntries(Object.entries((target.entity as Row).links!).map(([field,link])=>[field,resolveLinkTarget(graph,link)]))}:{}),
    ...(target.type==='register'?{register:registerProjection(target.entity as Register)}:{}),
    ...(target.type==='register-field'?{registerField:{width:(target.entity as RegisterField).msb-(target.entity as RegisterField).lsb+1,resetState:resetState((target.entity as RegisterField).reset),resetText:resetText((target.entity as RegisterField).reset),...entitySource(graph,id)}}:{}),
    references:[...graph.index.values()].filter(e=>e.type==='reference'&&((e.entity as any).fromId===id||(e.entity as any).targetId===id)).map(item),
    expansion: { depth, maxItems, truncated, items: expanded },
  };
}

export function summary(graph: Graph) {
  const counts: Record<string, number> = {};
  for (const entry of graph.index.values()) counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  return { valid: true, irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    resources: graph.manifest.resources.length, counts, ...(graph.documentPlan?.warnings?.length?{warnings:graph.documentPlan.warnings}:{}), entryDocuments: graph.manifest.entryDocuments };
}
