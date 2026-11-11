import ELK from 'elkjs/lib/elk.bundled.js';
import {measureText, wrapText} from '../render-graph/text.ts';
import {groupedRows, portHeight, portWidth, portSize} from './port-layout.ts';
import {intersects} from '../render-graph/geometry.ts';
import {DrawingError} from './types.ts';
import type {Drawing, Node, Content, Constraint, Direction, Side, NodeGeometry, TextBox, Target, Point} from './types.ts';

type Work = {compact: boolean; source: Node; x: number; y: number; width: number; height: number; minimumWidth: number; minimumHeight: number; header: number; top: number; bottom: number; left: number; right: number; content: Measure; children: Work[]; sides: Map<string, Side>; padding: number; rows: Map<string, number>; extents: Map<Side, number>};
type Measure = {width: number; height: number; texts: TextBox[]};
const forward: Record<Direction, Side> = {LR: 'right', RL: 'left', TB: 'bottom', BT: 'top'};
const opposite: Record<Side, Side> = {left: 'right', right: 'left', top: 'bottom', bottom: 'top'};
const directions = {LR: 'RIGHT', RL: 'LEFT', TB: 'DOWN', BT: 'UP'};
const text = (id: string, value: string, size: number, width = 240): TextBox => { const lines = wrapText(value, size, width); return {id, x: 0, y: 0, width: Math.max(1, ...lines.map(l => measureText(l, size))), height: lines.length * (size + 7), lines, size}; };

function measureContent(contents: Content[], axis: 'x' | 'y' = 'y'): Measure {
  let width = 0, height = 0; const texts: TextBox[] = [];
  for (const c of contents) {
    const child: Measure = c.kind === 'text' ? (() => { const box = text(c.id, c.text, c.role === 'note' ? 12 : 14); return {width: box.width, height: box.height, texts: [box]}; })() : measureContent(c.children, c.axis);
    child.texts.forEach(t => texts.push({...t, x: t.x + (axis === 'x' ? width : 0), y: t.y + (axis === 'y' ? height : 0)}));
    if (axis === 'x') { width += child.width + 10; height = Math.max(height, child.height); } else { width = Math.max(width, child.width); height += child.height + 6; }
  }
  return {width: Math.max(0, width - (axis === 'x' ? 10 : 0)), height: Math.max(0, height - (axis === 'y' ? 6 : 0)), texts};
}

export async function layoutDrawing(drawing: Drawing): Promise<NodeGeometry[]> {
  const rules = drawing.layout?.constraints ?? [], byId = new Map<string, Work>();
  const direction = (parent?: string) => (parent ? drawing.layout?.containers?.[parent]?.direction : undefined) ?? drawing.layout?.direction ?? 'LR';
  const spacing = (parent?: string) => ({node: 64, layer: 100, edge: 20, port: 28, padding: 40, ...drawing.layout?.spacing, ...parent ? drawing.layout?.containers?.[parent]?.spacing : {}});
  const fail = (ids: string[], message: string) => { throw new DrawingError('DRAWING_CONSTRAINT', 'layout', ids, message); };
  for (const source of drawing.nodes) {
    const sides = new Map<string, Side>();
    for (const port of source.ports ?? []) {
      const explicit = rules.filter((r): r is Extract<Constraint, {type: 'port'}> => r.type === 'port' && r.node === source.id && r.port === port.id);
      if (new Set(explicit.flatMap(r => r.side ? [r.side] : [])).size > 1) fail(explicit.map(r => r.id), '同一端口的侧边要求冲突');
      const occurrence = drawing.connections.flatMap(c => c.ends.map((e, i) => ({e, i}))).find(v => v.e.node === source.id && v.e.port === port.id);
      sides.set(port.id, explicit.find(r => r.side)?.side ?? (occurrence?.i ? opposite[forward[direction(source.parentId)]] : forward[direction(source.parentId)]));
    }
    for (const group of source.portGroups ?? []) {
      const explicit = rules.filter((r): r is Extract<Constraint, {type: 'port'}> => r.type === 'port' && r.node === source.id && group.ports.includes(r.port) && !!r.side);
      if (new Set(explicit.map(r => r.side)).size > 1) fail([source.id, group.id], '同一端口分组的侧边要求冲突');
      const candidates = group.ports.filter(id => id !== group.header && drawing.connections.some(c => c.ends.some(e => e.node === source.id && e.port === id)));
      const side = explicit[0]?.side ?? sides.get(candidates[0] ?? group.header ?? group.ports[0])!;
      group.ports.forEach(id => sides.set(id, side));
    }
    const compact = !!source.ports?.length && source.ports.every(p => p.appearance === 'slot' && !p.annotation) && !source.portGroups?.length && !source.content?.length && !drawing.nodes.some(n => n.parentId === source.id);
    const ports = source.ports ?? [], count = (side: Side) => ports.filter(p => sides.get(p.id) === side);
    const sideWidth = (side: Side) => Math.max(0, ...count(side).map(p => portWidth(p)));
    const sideRow = (side: Side) => Math.max(0, count(side).length - 1) * Math.max(spacing(source.parentId).port, ...count(side).map(p => portWidth(p) + 8)) + Math.max(0, ...count(side).map(portWidth)) + 24;
    const header = Math.max(42, wrapText(source.label, 17, 220).length * 22 + 18), content = measureContent(source.content ?? []);
    const top = !compact && count('top').length ? Math.max(30, ...count('top').map(p => p.annotation ? 54 : 30)) : 0, bottom = !compact && count('bottom').length ? Math.max(30, ...count('bottom').map(p => p.annotation ? 54 : 30)) : 0;
    const left = sideWidth('left'), right = sideWidth('right');
    const ranks = new Map(rules.filter((r): r is Extract<Constraint, {type: 'port'}> => r.type === 'port' && r.node === source.id && r.order !== undefined).map(r => [r.port, r.order!]));
    const groupLayout = groupedRows(source, sides, Math.max(28, spacing(source.parentId).port), ranks);
    const slotSpan = (side: Side) => Math.max(0, count(side).length - 1) * spacing(source.parentId).port + 24;
    const titleHeight = text('title', source.label, 17, 220).height;
    const minimumWidth = compact ? Math.max(160, ...wrapText(source.label, 17, 220).map(l => measureText(l, 17) + 40), slotSpan('top'), slotSpan('bottom')) : Math.max(160, ...wrapText(source.label, 17, 220).map(l => measureText(l, 17) + 40), left + right + content.width + 44, sideRow('top') + 24, sideRow('bottom') + 24, groupLayout.width + 24);
    const minimumHeight = compact ? Math.max(48, titleHeight + 24, slotSpan('left'), slotSpan('right')) : top + header + Math.max(content.height, groupLayout.height, Math.max(count('left').length, count('right').length) * Math.max(spacing(source.parentId).port, ...ports.map(portHeight)), 20) + 26 + bottom;
    const sizes = rules.filter((r): r is Extract<Constraint, {type: 'size'}> => r.type === 'size' && r.node === source.id);
    for (const axis of ['width', 'height'] as const) if (new Set(sizes.flatMap(s => s[axis] === undefined ? [] : [s[axis]])).size > 1) fail(sizes.map(s => s.id), '固定尺寸要求冲突');
    const width = sizes.find(s => s.width !== undefined)?.width ?? minimumWidth, height = sizes.find(s => s.height !== undefined)?.height ?? minimumHeight;
    if (width + .01 < minimumWidth || height + .01 < minimumHeight) fail([source.id, ...sizes.map(s => s.id)], `固定尺寸不足：至少需要 ${Math.ceil(minimumWidth)} × ${Math.ceil(minimumHeight)}`);
    byId.set(source.id, {compact, source, x: 0, y: 0, width, height, minimumWidth, minimumHeight, header, top, bottom, left, right, content, children: [], sides, padding: spacing(source.id).padding, rows: groupLayout.rows, extents: groupLayout.extents});
  }
  const roots: Work[] = [];
  for (const w of byId.values()) { if (w.source.parentId) byId.get(w.source.parentId)!.children.push(w); else roots.push(w); }
  const elk = new ELK();
  const initial = new Map<string, Point>();
  const dimension = (w: Work, axis: 'x' | 'y') => axis === 'x' ? w.width : w.height;
  function axes(siblings: Work[], axis: 'x' | 'y', extra: {a: string; b: string; gap: number; id: string}[]) {
    if (!siblings.length) return;
    const set = new Set(siblings.map(w => w.source.id)), origin = '__origin__', values = new Map<string, number>([[origin, 0], ...siblings.map(w => [w.source.id, w[axis]] as [string, number])]);
    const edges: {a: string; b: string; gap: number; id: string}[] = [...extra];
    const equal = (a: string, b: string, gap: number, id: string) => edges.push({a, b, gap, id}, {a: b, b: a, gap: -gap, id});
    for (const w of siblings) if (w.source.parentId) edges.push({a: origin, b: w.source.id, gap: 0, id: w.source.id + ':containment'});
    for (const r of rules) {
      if (r.type === 'place' && set.has(r.node)) equal(origin, r.node, r[axis], r.id);
      if (r.type === 'order' && r.axis === axis && r.nodes.every(id => set.has(id))) for (let i = 1; i < r.nodes.length; i++) {
        const adjacent = drawing.connections.filter(c => c.ends.some(e => e.node === r.nodes[i - 1]) && c.ends.some(e => e.node === r.nodes[i]));
        const labelGap = Math.max(0, ...adjacent.flatMap(c => (c.labels ?? []).map(l => (axis === 'x' ? measureText(l.text, 14) : 28) + 80)));
        edges.push({a: r.nodes[i - 1], b: r.nodes[i], gap: dimension(byId.get(r.nodes[i - 1])!, axis) + Math.max(r.gap ?? 0, spacing(siblings[0].source.parentId).node, labelGap), id: r.id});
      }
      if (r.type === 'align' && r.axis === axis && r.targets.every(t => !t.port && set.has(t.node))) {
        const offset = (t: Target) => dimension(byId.get(t.node)!, axis) * (t.edge === 'start' ? 0 : t.edge === 'end' ? 1 : .5);
        for (const t of r.targets.slice(1)) equal(r.targets[0].node, t.node, offset(r.targets[0]) - offset(t), r.id);
      }
    }
    for (let pass = 0; pass <= values.size; pass++) {
      let changed = false;
      for (const e of edges) { const value = values.get(e.a)! + e.gap; if (values.get(e.b)! < value - .001) { values.set(e.b, value); changed = true; } }
      if (!changed) break;
      if (pass === values.size) fail([...new Set(edges.map(e => e.id))], '位置、顺序、对齐或包含要求互相矛盾');
    }
    for (const w of siblings) {
      const locked = rules.find((r): r is Extract<Constraint, {type: 'place'}> => r.type === 'place' && r.node === w.source.id);
      // 差分求解的浮点抵消不能把固定整数坐标变成近似值，破坏正交端点。
      w[axis] = locked ? locked[axis] : values.get(w.source.id)! - values.get(origin)!;
    }
  }
  function fit(siblings: Work[], parent?: Work) {
    const extra: {a: string; b: string; gap: number; id: string; axis: 'x' | 'y'}[] = [];
    const axis = ['LR', 'RL'].includes(direction(parent?.source.id)) ? 'x' : 'y', other = axis === 'x' ? 'y' : 'x';
    for (const c of drawing.connections) {
      const pair = [...new Set(c.ends.map(e => e.node))].map(id => siblings.find(w => w.source.id === id));
      if (pair.length !== 2 || pair.some(w => !w) || !pair.every(w => initial.has(w!.source.id))) continue;
      const [a, b] = pair as Work[];
      if (rules.some(r => r.type === 'order' && r.axis === axis && r.nodes.includes(a.source.id) && r.nodes.includes(b.source.id))) continue;
      if (rules.some(r => r.type === 'align' && r.axis === axis && r.targets.some(t => t.node === a.source.id) && r.targets.some(t => t.node === b.source.id))) continue;
      if ([a, b].every(w => rules.some(r => r.type === 'place' && r.node === w.source.id))) continue;
      if (a[other] >= b[other] + dimension(b, other) + 16 || b[other] >= a[other] + dimension(a, other) + 16) continue;
      const sorted = [a, b].sort((a, b) => initial.get(a.source.id)![axis] - initial.get(b.source.id)![axis]);
      extra.push({a: sorted[0].source.id, b: sorted[1].source.id, gap: dimension(sorted[0], axis) + spacing(parent?.source.id).node, axis, id: 'layout-order:' + c.id});
    }
    for (let pass = 0; pass <= siblings.length ** 2; pass++) {
      axes(siblings, 'x', extra.filter(e => e.axis === 'x')); axes(siblings, 'y', extra.filter(e => e.axis === 'y'));
      const pair = siblings.flatMap((a, i) => siblings.slice(i + 1).filter(b => intersects(a, b, 16)).map(b => [a, b])).at(0);
      if (!pair) break;
      if(pair.every(w=>rules.some(r=>r.type==='place'&&r.node===w.source.id)))fail(pair.map(w=>w.source.id),'固定位置不足以容纳当前文字与端口，兄弟框发生重叠');
      if (pass === siblings.length ** 2) fail(pair.map(w => w.source.id), '没有合法的不重叠布局');
      const separate = rules.some(r => r.type === 'align' && r.axis === axis && pair.every(w => r.targets.some(t => t.node === w.source.id))) ? other : axis;
      pair.sort((a, b) => a[separate] - b[separate] || a.source.id.localeCompare(b.source.id));
      extra.push({a: pair[0].source.id, b: pair[1].source.id, gap: dimension(pair[0], separate) + spacing(parent?.source.id).node, axis: separate, id: 'avoid:' + pair.map(w => w.source.id).join('/')});
    }
    if (parent) {
      const width = Math.max(parent.minimumWidth, Math.max(160, ...siblings.map(w => w.x + w.width)) + parent.padding * 2 + parent.left + parent.right);
      const height = Math.max(parent.minimumHeight, Math.max(20, ...siblings.map(w => w.y + w.height)) + parent.padding * 2 + parent.header + parent.top + parent.bottom + (parent.source.content?.length ? parent.content.height + 12 : 0));
      const locked = rules.filter((r): r is Extract<Constraint, {type: 'size'}> => r.type === 'size' && r.node === parent.source.id);
      if (locked.some(r => r.width !== undefined && r.width < width || r.height !== undefined && r.height < height)) fail([parent.source.id, ...locked.map(r => r.id)], '固定容器尺寸无法包含子图');
      parent.width = locked.find(r => r.width !== undefined)?.width ?? width;
      parent.height = locked.find(r => r.height !== undefined)?.height ?? height;
    }
  }
  function childOf(id: string, parent?: Work): string | undefined {
    let w = byId.get(id);
    while (w && w.source.parentId !== parent?.source.id) w = w.source.parentId ? byId.get(w.source.parentId) : undefined;
    return w?.source.id;
  }
  // 布局和最终 Scene 使用同一套端口位置；不能让 ELK 只看到框中心。
  function localPort(w: Work, id: string): Point {
    const side = w.sides.get(id)!, ports = (w.source.ports ?? []).filter(p => w.sides.get(p.id) === side);
    const rule = (port: string) => rules.filter((r): r is Extract<Constraint, {type: 'port'}> => r.type === 'port' && r.node === w.source.id && r.port === port);
    ports.sort((a, b) => (rule(a.id).find(r => r.order !== undefined)?.order ?? 10000 + w.source.ports!.indexOf(a)) - (rule(b.id).find(r => r.order !== undefined)?.order ?? 10000 + w.source.ports!.indexOf(b)));
    const index = ports.findIndex(p => p.id === id), offset = rule(id).find(r => r.offset !== undefined)?.offset;
    if (w.compact) {
      const horizontal = side === 'top' || side === 'bottom', size = horizontal ? w.width : w.height;
      const at = offset === undefined ? size / 2 + (index - (ports.length - 1) / 2) * spacing(w.source.parentId).port : size * offset;
      return horizontal ? {x: at, y: side === 'top' ? 0 : w.height} : {x: side === 'left' ? 0 : w.width, y: at};
    }
    const bodyY = w.header + w.top + 12, bodyHeight = w.height - w.header - w.top - w.bottom - 24;
    return side === 'left' || side === 'right'
      ? {x: side === 'left' ? 0 : w.width, y: offset === undefined ? w.rows.has(id) ? bodyY + w.rows.get(id)! : bodyY + bodyHeight / 2 + (index - (ports.length - 1) / 2) * Math.max(spacing(w.source.parentId).port, ...ports.map(portHeight)) : w.height * offset}
      : {x: offset === undefined ? w.rows.has(id) ? (w.width - w.extents.get(side)!) / 2 + w.rows.get(id)! : w.width / 2 + (index - (ports.length - 1) / 2) * Math.max(spacing(w.source.parentId).port, ...ports.map(p => portWidth(p) + 8)) : w.width * offset, y: side === 'top' ? 0 : w.height};
  }
  async function arrange(siblings: Work[], parent?: Work) {
    for (const w of siblings) if (w.children.length) await arrange(w.children, w);
    if (siblings.length) {
      const portId = (node: string, port: string) => JSON.stringify(['port', node, port]);
      const boundaryId = (connection: string, end: string) => JSON.stringify(['boundary', connection, end]);
      // 已明确指定跨层端口对齐时，由约束阶段求解，初始粗布局不再施加另一套边界偏好。
      const controlled = new Set(drawing.connections.filter(c => c.ends.length === 2 && rules.some(r => r.type === 'align' && c.ends.every(e => r.targets.some(t => t.node === e.node && t.port === e.port)))).map(c => c.id));
      const endId = (e: Drawing['connections'][number]['ends'][number], connection: string) => { const child = childOf(e.node, parent); return e.port && child ? child === e.node ? portId(child, e.port) : controlled.has(connection) ? child : boundaryId(connection, e.id) : child; };
      const boundaryPorts = (w: Work) => drawing.connections.filter(c => !controlled.has(c.id)).flatMap(c => c.ends.filter(e => e.port && e.node !== w.source.id && childOf(e.node, parent) === w.source.id && c.ends.some(other => childOf(other.node, parent) && childOf(other.node, parent) !== w.source.id)).map(e => {
        let child = byId.get(e.node)!, pos = localPort(child, e.port!); const side = child.sides.get(e.port!)!;
        while (child !== w) { const ancestor = byId.get(child.source.parentId!)!; pos = {x: pos.x + child.x + ancestor.padding, y: pos.y + child.y + ancestor.header + ancestor.padding}; child = ancestor; }
        return {id: boundaryId(c.id, e.id), x: side === 'left' ? 0 : side === 'right' ? w.width : pos.x, y: side === 'top' ? 0 : side === 'bottom' ? w.height : pos.y, width: 0, height: 0, layoutOptions: {'elk.port.side': side.toUpperCase()}};
      }));
      const edges = drawing.connections.flatMap(c => c.ends.slice(1).map((e, i) => ({id: c.id + '/' + i, sources: [endId(c.ends[0], c.id)!], targets: [endId(e, c.id)!], labels: (c.labels ?? []).map(l => ({text: l.text, width: Math.max(...wrapText(l.text, 14, 200).map(line => measureText(line, 14))) + 24, height: wrapText(l.text, 14, 200).length * 21 + 8})), owners: [childOf(c.ends[0].node, parent), childOf(e.node, parent)]}))).filter(e => e.owners[0] && e.owners[1] && e.owners[0] !== e.owners[1]).map(({owners, ...edge}) => edge);
      const s = spacing(parent?.source.id), result = await elk.layout({id: '__frame__', layoutOptions: {'elk.algorithm': 'layered', 'elk.direction': directions[direction(parent?.source.id)], 'elk.padding': '[top=0,left=0,bottom=0,right=0]', 'elk.spacing.nodeNode': String(s.node), 'elk.layered.spacing.nodeNodeBetweenLayers': String(s.layer)}, children: siblings.map(w => ({id: w.source.id, width: w.width, height: w.height, layoutOptions: {'elk.portConstraints': 'FIXED_POS'}, ports: [...(w.source.ports ?? []).map(p => ({id: portId(w.source.id, p.id), ...localPort(w, p.id), width: 0, height: 0, layoutOptions: {'elk.port.side': w.sides.get(p.id)!.toUpperCase()}})), ...boundaryPorts(w)]})), edges});
      for (const p of result.children ?? []) { const w = byId.get(p.id)!; w.x = p.x ?? 0; w.y = p.y ?? 0; initial.set(w.source.id, {x: w.x, y: w.y}); }
    }
    fit(siblings, parent);
  }
  await arrange(roots);
  function flatten(): NodeGeometry[] {
    const result: NodeGeometry[] = [];
    function visit(w: Work, base: Point) {
      const x = base.x + w.x, y = base.y + w.y;
      const isContainer = !!w.children.length, title = text('title', w.source.label, 17, 220);
      title.x = x + (w.compact ? (w.width - title.width) / 2 : 16); title.y = y + (w.compact ? (w.height - title.height) / 2 : w.top + 12);
      const contentBox = w.compact ? {x: x + 20, y: y + w.height - 12, width: w.width - 40, height: 0} : {x: x + (isContainer ? w.padding + w.left : w.left + 20), y: y + (isContainer ? w.header + w.top + w.padding + (w.source.content?.length ? w.content.height + 12 : 0) : w.header + w.top + 12), width: w.width - (isContainer ? w.padding * 2 + w.left + w.right : w.left + w.right + 40), height: w.height - (isContainer ? w.header + w.top + w.bottom + w.padding * 2 + (w.source.content?.length ? w.content.height + 12 : 0) : w.header + w.top + w.bottom + 24)};
      const ports: NodeGeometry['ports'] = [];
      for (const side of ['top', 'right', 'bottom', 'left'] as Side[]) {
        const sidePorts = (w.source.ports ?? []).filter(p => w.sides.get(p.id) === side).slice();
        const ruleFor = (id: string) => rules.filter((r): r is Extract<Constraint, {type: 'port'}> => r.type === 'port' && r.node === w.source.id && r.port === id);
        const ranks = sidePorts.flatMap(p => ruleFor(p.id).filter(r => r.order !== undefined).map(r => r.order));
        if (new Set(ranks).size !== ranks.length) fail([w.source.id], '同侧端口次序重复');
        sidePorts.sort((a, b) => (ruleFor(a.id).find(r => r.order !== undefined)?.order ?? 10000 + (w.source.ports ?? []).indexOf(a)) - (ruleFor(b.id).find(r => r.order !== undefined)?.order ?? 10000 + (w.source.ports ?? []).indexOf(b)));
        for (const [i, p] of sidePorts.entries()) {
          const portRules = ruleFor(p.id), offsets = portRules.flatMap(r => r.offset !== undefined ? [r.offset] : []);
          if (new Set(offsets).size > 1) fail(portRules.map(r => r.id), '端口偏移冲突');
          if (new Set(portRules.flatMap(r => r.order === undefined ? [] : [r.order])).size > 1) fail(portRules.map(r => r.id), '同一端口次序要求冲突');
          const fraction = (i + 1) / (sidePorts.length + 1), horizontal = side === 'top' || side === 'bottom';
          const local = localPort(w, p.id), pos = {x: x + local.x, y: y + local.y};
          const box = p.appearance === 'slot' ? {id: 'port/' + p.id, x: 0, y: 0, width: 0, height: 0, lines: [], size: 0} : text('port/' + p.id, p.label ?? p.id, portSize(p), 10000);
          if (p.appearance && p.appearance !== 'slot') box.height = box.size + 5;
          box.x = side === 'left' ? x + (p.appearance === 'header' ? 34 : 12) : side === 'right' ? x + w.width - (p.appearance === 'header' ? 34 : 12) - box.width : pos.x - box.width / 2;
          box.y = side === 'top' ? y + 7 : side === 'bottom' ? y + w.height - w.bottom + 5 : pos.y - (p.annotation || p.appearance === 'header' ? 18 : box.height / 2);
          if (box.width && (box.x < x + 3 || box.x + box.width > x + w.width - 3 || box.y < y + 3 || box.y + box.height > y + w.height - 3)) fail([w.source.id, p.id], '端口标签超出框');
          const annotation = p.annotation ? {...text('annotation/' + p.id, p.annotation, 11, 10000), x: horizontal ? pos.x - measureText(p.annotation, 11) / 2 : side === 'left' ? x + 12 : x + w.width - 12 - measureText(p.annotation, 11), y: horizontal ? box.y + box.height + 2 : pos.y + 3} : undefined;
          ports.push({annotation, appearance: p.appearance, ...pos, id: p.id, label: p.label ?? p.id, side, text: box, originIds: p.originIds ?? []});
        }
      }
      result.push({id: w.source.id, parentId: w.source.parentId, x, y, width: w.width, height: w.height, contentBox, title, contents: w.content.texts.map(t => ({...t, x: t.x + contentBox.x, y: t.y + (isContainer ? y + w.header + w.top + 12 : contentBox.y)})), ports, originIds: w.source.originIds ?? []});
      w.children.forEach(c => visit(c, contentBox));
    }
    roots.forEach(w => visit(w, {x: 0, y: 0})); return result;
  }
  // 跨容器对齐在根坐标中检查；只移动未锁定的目标，再重新检查容器与兄弟关系。
  for (let pass = 0; pass < 16; pass++) {
    const scene = flatten(), sceneMap = new Map(scene.map(n => [n.id, n])); let changed = false;
    const at = (t: Target, axis: 'x' | 'y') => { const n = sceneMap.get(t.node)!; if (t.port) return n.ports.find(p => p.id === t.port)![axis]; return n[axis] + (axis === 'x' ? n.width : n.height) * (t.edge === 'start' ? 0 : t.edge === 'end' ? 1 : .5); };
    for (const r of rules) if (r.type === 'align') {
      const values = r.targets.map(t => at(t, r.axis)); if (Math.max(...values) - Math.min(...values) < .01) continue;
      const locked = r.targets.filter(t => rules.some(p => p.type === 'place' && p.node === t.node));
      const goal = locked.length ? at(locked[0], r.axis) : Math.max(...values);
      for (const t of r.targets) { const delta = goal - at(t, r.axis); if (Math.abs(delta) < .01) continue; if (locked.includes(t)) fail([r.id, t.node], '对齐与固定位置冲突'); byId.get(t.node)![r.axis] += delta; changed = true; }
    }
    if (!changed) return scene;
    function refresh(siblings: Work[], parent?: Work) { siblings.forEach(w => { if (w.children.length) refresh(w.children, w); }); fit(siblings, parent); }
    refresh(roots);
  }
  fail(rules.filter(r => r.type === 'align').map(r => r.id), '跨容器对齐未收敛；原型不会放宽硬约束');
  return [];
}
