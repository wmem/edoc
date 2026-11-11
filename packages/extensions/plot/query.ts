import type { Graph, RecordEntry } from '../../core/types.ts';
import { plotProjection } from './model.ts';
import type { PlotView } from './types.ts';
const isPlot = (entry: RecordEntry) => entry.type === 'view' && 'kind' in entry.entity && entry.entity.kind === 'plot';
export function plotLinks(_graph: Graph, entry: RecordEntry): string[] | undefined {
  if (isPlot(entry)) return [(entry.entity as PlotView).data];
}
export function plotQuery(graph: Graph, entry: RecordEntry) {
  return isPlot(entry) ? {
    plot: plotProjection(graph, entry.entity as PlotView)
  } : {};
}
