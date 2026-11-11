import type { Graph, RecordEntry } from '../core/types.ts';
import { binaryLayoutElement, binaryLayoutQuery } from '../extensions/binary-layout/query.ts';
import { plotQuery } from '../extensions/plot/query.ts';
import { registerMapElement, registerMapQuery } from '../extensions/register-map/query.ts';
import { sequenceElement, sequenceQuery } from '../extensions/sequence/query.ts';

// 领域扩展维护事实和追溯；此入口只分派共用查询。
export function engineeringProjection(graph: Graph, entry: RecordEntry) {
  return {
    ...sequenceQuery(graph, entry),
    ...binaryLayoutQuery(graph, entry),
    ...registerMapQuery(graph, entry),
    ...plotQuery(graph, entry)
  };
}
export function engineeringElement(graph: Graph, id: string, elementId: string) {
  return sequenceElement(graph, id, elementId) ?? binaryLayoutElement(graph, id, elementId) ?? registerMapElement(graph, id, elementId);
}
