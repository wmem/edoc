import type { Graph, RecordEntry } from '../../core/types.ts';
import type { EngineeringResult } from '../../figure/query-result.ts';
import { registerInstance, registerMapProjection } from './model.ts';
import type { AddressSpace, RegisterBlock } from './types.ts';
export function registerMapLinks(_graph: Graph, entry: RecordEntry): string[] | undefined {
  if (entry.type === 'register-block') return (entry.entity as RegisterBlock).entries.map(e => e.register ?? e.block!);
  if (entry.type === 'address-space') return (entry.entity as AddressSpace).mappings.map(e => e.block);
}
export function registerMapQuery(graph: Graph, entry: RecordEntry) {
  return entry.type === 'register-block' || entry.type === 'address-space' ? {
    registerMap: registerMapProjection(graph, entry.id)
  } : {};
}
export function registerMapElement(graph: Graph, id: string, elementId: string): EngineeringResult | undefined {
  const entry = graph.index.get(id)!;
  if (entry.type !== 'register-block' && entry.type !== 'address-space') return undefined;
  const instance = registerInstance(graph, id, elementId);
  return {
    irVersion: graph.manifest.irVersion,
    projectId: graph.manifest.projectId,
    ...instance,
    target: {
      ...instance.entity,
      location: entry.location
    },
    incoming: [],
    outgoing: []
  };
}
