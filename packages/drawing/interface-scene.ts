import {interfaceScene, initialInterfaceState} from '../render-graph/interfaces.ts';
import type {InterfaceModel, InterfaceState} from '../render-graph/interfaces.ts';
import type {Graph, Node as FactNode, RelationView} from '../core/types.ts';
import type {Scene, SceneHints} from '../render-graph/scene.ts';
import {scene as engineeringScene} from '../render-graph/scene.ts';
import {prepareInterfaceModel} from '../render-graph/interfaces.ts';
import {widthRange, portAnnotation, unconnectedNote} from '../render-graph/ports.ts';
import {solveDrawingModel} from './solver.ts';
import {splitPath, same} from '../render-graph/geometry.ts';
import {styles} from '../render-graph/styles.ts';
import {DrawingError} from './types.ts';
import type {Drawing, Constraint, Point} from './types.ts';

// 仅桥接显示投影。工程 Interface/Port/Connection 的事实及聚合规则仍由既有模块维护。
export function drawingFromProjection(graph: Graph, view: RelationView, hints: SceneHints): Drawing {
  const nodes = [...graph.index.values()].filter(e => e.type === 'node' && view.include.objects.includes(e.id)).map(e => e.entity as FactNode);
  const owner = (id: string) => graph.index.get(id)?.ownerId ?? id;
  const constraints: Constraint[] = [];
  const drawing: Drawing = {schemaVersion: '1.0', id: view.id, nodes: nodes.map(n => ({id: n.id, label: n.label, parentId: n.parentId, originIds: [n.id], ports: (n.ports ?? []).map(p => {
    const meta = hints.portMeta?.[p.id], isHeader = !!meta?.interfaceHeader;
    const isSlot = !!meta?.slot;
    const appearance = isSlot ? 'slot' : isHeader ? 'header' : 'normal';
    const group = hints.sideGroups?.[p.id] ?? [p.id];
    const occurrence = view.include.relations.map(id => graph.connections.get(id)!).find(r => r.endpoints.some(id => group.includes(id)));
    const endpoint = occurrence?.endpoints.find(id => group.includes(id));
    // 工程接口的公开侧边仍为left/right；TB/BT改变模块阅读方向，不把接口文字旋转到上下边。
    const side = hints.sides?.[p.id] ?? ((view.layout?.direction === 'TB' || view.layout?.direction === 'BT') ? endpoint !== undefined && occurrence?.endpoints.indexOf(endpoint) === 0 ? 'right' : 'left' : undefined);
    if (side) constraints.push({id: JSON.stringify(['side', n.id, p.id]), type: 'port', node: n.id, port: p.id, side});
    return {id: p.id, label: p.label + (!isHeader && !isSlot && widthRange(p) ? ' ' + widthRange(p) : ''), annotation: isSlot ? undefined : (hints.annotations?.[p.id] ?? portAnnotation(p, p.clockDomainId ? graph.index.get(p.clockDomainId)?.entity.label : '', view.display?.portAttributes)) + (meta?.noConnection ? unconnectedNote : ''), appearance, originIds: meta?.members ?? [p.id]};
  }), portGroups: [...new Map((n.ports ?? []).filter(p => hints.sideGroups?.[p.id]).map(p => {const ids = hints.sideGroups![p.id]; return [JSON.stringify(ids), {id: ids[0], header: ids[0], ports: ids}];})).values()]})), connections: view.include.relations.map(id => {
    const r = graph.connections.get(id)!;
    const label = r.label ?? r.id;
    return {id, originIds: [id], style: Object.hasOwn(styles, r.class) ? r.class : 'other', labels: label ? [{id: 'name', text: label}] : [], ends: r.endpoints.map((p, i) => ({id: String(i), node: owner(p), ...graph.index.get(p)?.type === 'port' ? {port: p} : {}, marker: r.direction?.targets.includes(p) ? 'arrow' as const : 'none' as const}))};
  }), layout: {direction: view.layout?.direction ?? 'LR', routing: view.layout?.routing ?? 'orthogonal', spacing: {node: 64, layer: 80, edge: 20, port: 38}, constraints}};
  for (const [i, p] of (view.layout?.positions ?? []).entries()) {
    if (nodes.find(n => n.id === p.objectId)?.parentId) throw new DrawingError('DRAWING_CAPABILITY', 'projection', [p.objectId], '工程接口投影尚未接入嵌套 positions');
    constraints.push({id: 'view-position:' + i, type: 'place', node: p.objectId, x: p.x, y: p.y});
  }
  for (const [i, r] of (view.layout?.constraints ?? []).entries()) constraints.push(r.type === 'order' ? {id: 'view-constraint:' + i, ...r} : {id: 'view-constraint:' + i, type: 'align', axis: r.axis, targets: r.nodes.map(node => ({node}))});
  const main: string[] = [], channels: {connection: string; side: 'left'|'right'|'top'|'bottom'}[] = [];
  for (const [id, hint] of Object.entries(view.layout?.relationHints ?? {})) {
    if (hint.priority === 'main') main.push(id);
    if (hint.channel) channels.push({connection: id, side: hint.channel});
    const c = drawing.connections.find(c => c.id === id)!;
    if (Object.keys(hint.endpointSides ?? {}).length) throw new DrawingError('DRAWING_CAPABILITY', 'projection', [id], '工程接口投影尚未接入 Node 端点的 endpointSides');
    if (hint.backbone) {
      const original = graph.connections.get(id)!; const indices = hint.backbone.map(p => original.endpoints.indexOf(p));
      const pair = indices.map(i => c.ends[i]); c.ends = [...pair, ...c.ends.filter(e => !pair.includes(e))];
    }
  }
  drawing.layout!.hints = {main, channels};
  return drawing;
}

function branchToHub(start: Point, hub: Point, paths: {points: Point[]}[]): Point[] {
  const pending: Point[][] = [[start]], seen = new Set<string>();
  while (pending.length) {
    const route = pending.shift()!, end = route.at(-1)!; if (same(end, hub)) return route;
    const key = JSON.stringify([end.x, end.y]); if (seen.has(key)) continue; seen.add(key);
    for (const p of paths) {
      if (same(p.points[0], end)) pending.push([...route, ...p.points.slice(1)]);
      else if (same(p.points.at(-1)!, end)) pending.push([...route, ...p.points.slice().reverse().slice(1)]);
    }
  }
  throw new DrawingError('DRAWING_TOPOLOGY', 'projection', [], '求解树无法追踪到实际汇合点');
}

async function drawingLayoutScene(graph: Graph, id: string, hints: SceneHints = {}, execute = solveDrawingModel): Promise<Scene> {
  const view = graph.index.get(id)!.entity as RelationView, drawing = drawingFromProjection(graph, view, hints), geometry = await execute(drawing);
  const shift = {x: -geometry.viewBox.x + 20, y: -geometry.viewBox.y + 30}, move = (p: {x: number; y: number}) => ({x: p.x + shift.x, y: p.y + shift.y});
  const result: Scene = {id, label: view.label ?? id, kind: view.kind, layoutEngine: 'drawing', drawing: geometry, width: geometry.width + 40, height: geometry.height + 70, display: {showPortAttributes: view.display?.showPortAttributes ?? false, showRelationLabels: view.display?.showRelationLabels ?? true, showInterfaceDetails: view.display?.showInterfaceDetails ?? true}, collapsedGroups: [], groups: [], nodes: geometry.nodes.map(n => {
    const source = graph.index.get(n.id)!.entity as FactNode;
    return {id: n.id, label: source.label, parentId: n.parentId, ...move(n), width: n.width, height: n.height, titleSize: 17, titleLines: n.title.lines, headerHeight: n.title.height + 18, source: source.source, ports: n.ports.map(p => {
      const original = source.ports!.find(o => o.id === p.id)!;
      if (p.side !== 'left' && p.side !== 'right') throw new Error('现有接口渲染器暂不承载上下侧端口');
      return {id: p.id, label: original.label, displayLabel: p.label, annotation: (drawing.nodes.find(node => node.id === n.id)!.ports!.find(port => port.id === p.id)!.annotation ?? '').replace(hints.portMeta?.[p.id]?.noConnection ? unconnectedNote : /$^/, ''), ...move(p), side: p.side, direction: original.direction, source: original.source};
    })};
  }), nets: geometry.connections.map((c, index) => {
    const original = graph.connections.get(c.id)!, paths = c.paths.map(p => ({points: p.points.map(move), arrow: c.ends.some(e => same(e, p.points[0]) && e.marker === 'arrow'), endArrow: c.ends.some(e => same(e, p.points.at(-1)!) && e.marker === 'arrow')}));
    const midpoint = splitPath(paths[0].points), labelBox = c.labels[0] ? {...c.labels[0], ...move(c.labels[0])} : {x: midpoint.hub.x, y: midpoint.hub.y, width: 0, height: 0, lines: []};
    const hub = c.junctions[0] ? move(c.junctions[0]) : midpoint.hub;
    return {layoutWarnings: geometry.diagnostics.filter(d => d.id === c.id || !d.id && index === 0).map(d => ({code: d.code, message: d.message})), id: c.id, label: original.label ?? original.id, class: original.class, endpoints: original.endpoints, source: original.source, paths, hub, junction: !!c.junctions.length, junctions: c.junctions.map(move), labelBox, branches: c.ends.map(e => ({endpoint: original.endpoints[Number(e.id)], points: c.junctions.length ? branchToHub(move(e), hub, paths) : same(move(e), paths[0].points[0]) ? midpoint.first : midpoint.last, arrow: e.marker === 'arrow'}))};
  })};
  return result;
}
export async function drawingInterfaceScene(model: InterfaceModel, state: InterfaceState = initialInterfaceState(model), execute = solveDrawingModel) { return interfaceScene(model, state, (graph, id, hints) => drawingLayoutScene(graph, id, hints, execute)); }
export const drawingRelationScene: typeof engineeringScene = async (graph, id, options = {}) => {
  const model = prepareInterfaceModel(graph, id); if (!model) return engineeringScene(graph, id, options);
  const state = options.interfaces === 'expanded' ? {...initialInterfaceState(model), modes: Object.fromEntries(model.nodes.flatMap(n => (n.interfaces ?? []).map(i => [i.id, 'expanded' as const]))), classes: null} : undefined;
  return drawingInterfaceScene(model, state);
};
