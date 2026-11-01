import type { Graph, RecordEntry, Connection, Node, Port, Group, View } from './types.ts';
import { failure } from './errors.ts';

function item(entry: RecordEntry) {
  return { id: entry.id, type: entry.type, entity: entry.entity, location: entry.location,
    ...(entry.ownerId ? { ownerId: entry.ownerId } : {}) };
}

function links(graph: Graph, entry: RecordEntry): string[] {
  const adjacent = [...(graph.adjacency.get(entry.id) ?? [])];
  if (entry.type === 'node') {
    const node = entry.entity as Node;
    return [...adjacent, ...(node.ports ?? []).map(p => p.id), ...(node.parentId ? [node.parentId] : [])];
  }
  if (entry.type === 'port') {
    const port = entry.entity as Port;
    return [...adjacent, entry.ownerId!, ...[port.groupId, port.clockDomainId].filter(Boolean) as string[]];
  }
  if (entry.type === 'connection') return (entry.entity as Connection).endpoints;
  if (entry.type === 'group') return (entry.entity as Group).members;
  const view = entry.entity as View;
  return [...view.include.objects, ...view.include.relations];
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
    for (const next of links(graph, graph.index.get(current.id)!)) {
      if (seen.has(next)) continue;
      if (expanded.length >= maxItems) { truncated = true; continue; }
      seen.add(next);
      expanded.push(item(graph.index.get(next)!));
      queue.push({ id: next, level: current.level + 1 });
    }
  }
  return {
    irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    target: item(target), directRelations,
    expansion: { depth, maxItems, truncated, items: expanded },
  };
}

export function summary(graph: Graph) {
  const counts: Record<string, number> = {};
  for (const entry of graph.index.values()) counts[entry.type] = (counts[entry.type] ?? 0) + 1;
  return { valid: true, irVersion: graph.manifest.irVersion, projectId: graph.manifest.projectId,
    resources: graph.manifest.resources.length, counts, entryDocuments: graph.manifest.entryDocuments };
}
