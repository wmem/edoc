import {controlSelection} from '../extensions/control-diagram/project.ts';
import type {Scene} from '../render-graph/scene.ts';
import type {Drawing, DrawingScene, Point} from './types.ts';
import {same, splitPath} from '../render-graph/geometry.ts';
import {samples} from './bezier.ts';

// 显示身份按视图隔离，不注册为工程电气事实，也不靠内容 hash 跟踪。
export const drawingID = (view: string, kind: 'node'|'port'|'connection', ...parts: string[]) => JSON.stringify(['drawing', view, kind, ...parts]);
export function drawingReaderScene(input: Drawing, geometry: DrawingScene, view: string, label: string, display: Partial<Scene['display']> = {}): Scene {
  const move = (p: Point) => ({x: p.x - geometry.viewBox.x, y: p.y - geometry.viewBox.y});
  const endpoint = (e: Drawing['connections'][number]['ends'][number]) => e.port ? drawingID(view, 'port', e.node, e.port) : drawingID(view, 'node', e.node);
  return {id: view, label, kind: 'architecture', drawing: geometry, drawingInput: input, width: geometry.width, height: geometry.height, display: {showRelationLabels: true, showPortAttributes: false, showInterfaceDetails: true, ...display}, collapsedGroups: [], groups: [], nodes: geometry.nodes.map(n => ({id: drawingID(view, 'node', n.id), label: input.nodes.find(source => source.id === n.id)!.label, parentId: n.parentId ? drawingID(view, 'node', n.parentId) : undefined, ...move(n), width: n.width, height: n.height, titleSize: n.title.size, titleLines: n.title.lines, ports: n.ports.map(p => ({id: drawingID(view, 'port', n.id, p.id), label: p.label, annotation: p.annotation?.lines.join('\n') ?? '', ...move(p), side: p.side, slot: p.appearance === 'slot'}))})), nets: geometry.connections.map(c => {
    const source = input.connections.find(source => source.id === c.id)!, paths = c.paths.map(p => ({points: p.points.map(move),curves:p.curves?.map(c=>({c1:move(c.c1),c2:move(c.c2)})), arrow: c.ends.some(e => (p.from?e.id===p.from:same(e, p.points[0])) && e.marker === 'arrow'), endArrow: c.ends.some(e => (p.to?e.id===p.to:same(e, p.points.at(-1)!)) && e.marker === 'arrow')}));
    const mid = splitPath(c.paths[0].curves?samples(c.paths[0]).map(s=>move(s.point)):paths[0].points), hub = c.junctions[0] ? move(c.junctions[0]) : mid.hub;
    const trace = (start: Point,endID:string) => {
      if (!c.junctions.length) return (c.paths[0].from?c.paths[0].from===endID:same(start, paths[0].points[0])) ? mid.first : mid.last;
      const pending: Point[][] = [[start]], seen = new Set<string>();
      while (pending.length) { const route = pending.shift()!, end = route.at(-1)!; if (same(end, hub)) return route; const key = JSON.stringify(end); if (seen.has(key)) continue; seen.add(key); for (const p of paths) {if (same(p.points[0], end)) pending.push([...route, ...p.points.slice(1)]); else if (same(p.points.at(-1)!, end)) pending.push([...route, ...p.points.slice().reverse().slice(1)]);} }
      throw new Error('Drawing 路线无法追踪到汇合点：' + c.id);
    };
    return {id: drawingID(view, 'connection', c.id), label: source.labels?.map(l => l.text).join('\n') ?? '', class: source.style ?? 'data', endpoints: c.ends.map(endpoint), hub, junction: !!c.junctions.length, junctions: c.junctions.map(move), paths, branches: c.ends.map(e => ({endpoint: endpoint(e), points: trace(move(e),e.id), arrow: e.marker === 'arrow'})), labelBox: c.labels[0] ? {...c.labels[0], ...move(c.labels[0])} : {...hub, width: 0, height: 0, lines: []}};
  })};
}
export function drawingSelection(scene: Scene, id: string): unknown {
  if (!scene.drawingInput || !scene.drawing) return;
  const input = scene.drawingInput, solved = scene.drawing;
  for (const n of input.nodes) {
    if (drawingID(scene.id, 'node', n.id) === id && scene.control) return controlSelection(scene.control,n.originIds??[]);
    if (drawingID(scene.id, 'node', n.id) === id) return {type: '绘图模块', drawing: input.id, input: n, geometry: solved.nodes.find(node => node.id === n.id)};
    for (const p of n.ports ?? []) if (drawingID(scene.id, 'port', n.id, p.id) === id) return {type: '绘图端口锚点', drawing: input.id, node: n.id, input: p, geometry: solved.nodes.find(node => node.id === n.id)!.ports.find(port => port.id === p.id)};
  }
  for (const c of input.connections) if (drawingID(scene.id, 'connection', c.id) === id) return scene.control?controlSelection(scene.control,c.originIds??[]): {type: '绘图连接', drawing: input.id, input: c, geometry: solved.connections.find(connection => connection.id === c.id)};
}
