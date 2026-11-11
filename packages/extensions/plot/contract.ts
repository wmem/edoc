import type { Graph, RecordEntry } from '../../core/types.ts';
export const plotTags: Record<string, any> = Object.fromEntries(['plot'].map(name => [name, {
  render: 'div',
  selfClosing: true,
  attributes: {
    id: {
      type: String,
      required: true
    }
  }
}]));
export const plotTargets = {
  'plot': ['view']
} as const;
export const plotResources = {} as const;
export const plotTargetError = (_graph: Graph, entry: RecordEntry) => ('kind' in entry.entity ? entry.entity.kind : '') === 'plot' ? undefined : 'plot 必须引用 kind=plot 的视图';
