import type {Node, Side, DrawingPort} from './types.ts';
import {measureText} from '../render-graph/text.ts';

export const portSize = (p: DrawingPort) => p.appearance === 'slot' ? 0 : p.appearance ? 14 : 13;
export const portHeight = (p: DrawingPort) => p.appearance === 'slot' ? 0 : p.annotation ? 44 : 24;
export const portWidth = (p: DrawingPort) => p.appearance === 'slot' ? 0 : Math.max(measureText(p.label ?? p.id, portSize(p)), measureText(p.annotation ?? '', 11)) + (p.appearance === 'header' ? 44 : 24);

// 每组整体同侧；折叠槽位共享标题区，但保留各自的独立锚点。
export function groupedRows(node: Node, sides: Map<string, Side>, pitch: number, ranks = new Map<string, number>()) {
  const rows = new Map<string, number>(), extents = new Map<Side, number>();
  if (!node.portGroups?.length) return {rows, height: 0, width: 0, extents};
  for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
    let cursor = 12;
    const owned = (node.ports ?? []).filter(p => sides.get(p.id) === side), done = new Set<string>();
    const horizontal = side === 'top' || side === 'bottom';
    const extent = (p: DrawingPort) => horizontal ? portWidth(p) : portHeight(p);
    const groups = node.portGroups.slice().sort((a, b) => Math.min(...a.ports.map(id => ranks.get(id) ?? 10000)) - Math.min(...b.ports.map(id => ranks.get(id) ?? 10000)));
    for (const group of groups) {
      const ports = group.ports.map(id => owned.find(p => p.id === id)).filter((p): p is DrawingPort => !!p);
      if (!ports.length) continue;
      const slots = ports.filter(p => p.appearance === 'slot'), header = ports.find(p => p.id === group.header);
      if (slots.length && header) {
        const slotPitch = Math.max(pitch, 44), height = Math.max(extent(header), slots.length * slotPitch);
        rows.set(header.id, cursor + height / 2);
        slots.forEach((p, i) => rows.set(p.id, cursor + height / 2 + (i - (slots.length - 1) / 2) * slotPitch));
        cursor += height + 16;
      } else for (const p of ports) { const height = Math.max(pitch, extent(p)); rows.set(p.id, cursor + height / 2); cursor += height; }
      ports.forEach(p => done.add(p.id)); cursor += 12;
    }
    for (const p of owned.filter(p => !done.has(p.id))) { const height = Math.max(pitch, extent(p)); rows.set(p.id, cursor + height / 2); cursor += height; }
    extents.set(side, cursor + 12);
  }
  return {rows, height: Math.max(extents.get('left') ?? 0, extents.get('right') ?? 0), width: Math.max(extents.get('top') ?? 0, extents.get('bottom') ?? 0), extents};
}
