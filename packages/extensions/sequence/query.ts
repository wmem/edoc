import type { Graph, RecordEntry } from '../../core/types.ts';
import { figureFail } from '../../figure/errors.ts';
import type { EngineeringResult } from '../../figure/query-result.ts';
import { sequenceProjection, sequenceReferences } from './model.ts';
import type { Sequence } from './types.ts';
import { sequenceElements } from './types.ts';
export function sequenceLinks(_graph: Graph, entry: RecordEntry): string[] | undefined {
  if (entry.type === 'sequence') return sequenceReferences(entry.entity as Sequence);
}
export function sequenceQuery(_graph: Graph, entry: RecordEntry) {
  return entry.type === 'sequence' ? {
    sequence: sequenceProjection(entry.entity as Sequence)
  } : {};
}
export function sequenceElement(graph: Graph, id: string, elementId: string): EngineeringResult | undefined {
  const entry = graph.index.get(id)!;
  if (entry.type !== 'sequence') return undefined;
  const model = entry.entity as Sequence,
    elements = sequenceElements(model),
    found = elements.find(e => e.element.id === elementId);
  if (!found) {
    const ref = elements.map(e => e.element as any).filter(e => e.kind === 'ref' && elementId.startsWith(e.id + '/')).sort((a, b) => b.id.length - a.id.length)[0];
    if (ref) {
      const child = sequenceElement(graph, ref.model, elementId.slice(ref.id.length + 1));
      if (!child) figureFail('QUERY_NOT_FOUND', id, '子交互元素不存在');
      return {
        ...child,
        modelId: id,
        elementId,
        originModelId: ref.model,
        participantMapping: ref.participants
      };
    }
    figureFail('QUERY_NOT_FOUND', id, '局部元素不存在：' + elementId);
  }
  return {
    irVersion: graph.manifest.irVersion,
    projectId: graph.manifest.projectId,
    modelId: id,
    elementId,
    incoming: [],
    outgoing: [],
    target: {
      ...found.element,
      location: {
        file: entry.location.file,
        path: entry.location.path + found.path
      },
      source: found.element.source ?? model.source
    },
    events: sequenceProjection(model).events.filter(e => e.message === elementId)
  };
}
