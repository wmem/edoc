import type { Graph, RecordEntry } from '../../core/types.ts';
import { figureFail } from '../../figure/errors.ts';
import type { EngineeringResult } from '../../figure/query-result.ts';
import { binaryModel, binaryProjection } from './model.ts';
import type { BinaryLayout } from './types.ts';
import { binaryElements } from './types.ts';
export function binaryLayoutLinks(_graph: Graph, entry: RecordEntry): string[] | undefined {
  if (entry.type === 'binary-layout') return binaryElements(entry.entity as BinaryLayout).flatMap(e => 'model' in e.element ? [String(e.element.model)] : []);
}
export function binaryLayoutQuery(graph: Graph, entry: RecordEntry) {
  return entry.type === 'binary-layout' ? {
    binaryLayout: binaryProjection(graph, entry.id)
  } : {};
}
export function binaryLayoutElement(graph: Graph, id: string, elementId: string): EngineeringResult | undefined {
  const entry = graph.index.get(id)!;
  if (entry.type !== 'binary-layout') return undefined;
  const model = entry.entity as BinaryLayout,
    projection = binaryProjection(graph, id);
  if (elementId.startsWith('[')) {
    const row = projection.rows.find(r => JSON.stringify(r.path) === elementId);
    if (!row) figureFail('QUERY_NOT_FOUND', id, '展开字段路径不存在：' + elementId);
    const origin = graph.index.get(row.modelId)!,
      found = binaryElements(binaryModel(graph, row.modelId)).find(e => e.element.id === row.id)!;
    return {
      irVersion: graph.manifest.irVersion,
      projectId: graph.manifest.projectId,
      modelId: id,
      elementId,
      originModelId: row.modelId,
      incoming: [],
      outgoing: [],
      target: {
        ...found.element,
        location: {
          file: origin.location.file,
          path: origin.location.path + found.path
        },
        source: found.element.source ?? origin.entity.source
      },
      layout: [row]
    };
  }
  const found = binaryElements(model).find(e => e.element.id === elementId);
  if (!found) figureFail('QUERY_NOT_FOUND', id, '局部元素不存在：' + elementId);
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
    layout: projection.rows.filter(r => r.id === elementId)
  };
}
