import {shapePath,shapeFill} from '../drawing/shapes.ts';
import {Graph} from '@antv/x6';
import type {Scene} from '../render-graph/scene.ts';
import type {TextBox} from '../drawing/types.ts';
import {drawingID} from '../drawing/reader-scene.ts';
import {styles} from '../render-graph/styles.ts';
import {pathD} from '../drawing/bezier.ts';

Graph.registerConnector('edoc-geometry',(_source,_target,_route,options:any)=>{
  if(typeof options.path!=='string')throw new Error('缺少已经求解的曲线路径');
  return options.path;
},true);

// 只绘制已求解的几何；平移、缩放、筛选和工具栏继续由普通图阅读器统一控制。
export function drawDrawing(graph: Graph, scene: Scene, cellID: (id: string) => string, labelCells: Set<string>): Map<string, string[]> {
  const drawing = scene.drawing!, cells = new Map<string, string[]>();
  const move = (p: {x: number; y: number}) => ({x: p.x - drawing.viewBox.x, y: p.y - drawing.viewBox.y});
  for (const n of drawing.nodes) {
    const id = drawingID(scene.id, 'node', n.id), markup: any[] = [{tagName: shapePath(n.shape,n.width,n.height)?'path':'rect', selector: 'body'}], attrs: Record<string, any> = {body: {d:shapePath(n.shape,n.width,n.height),fill: drawing.nodes.some(child => child.parentId === n.id) ? 'none' : shapeFill(n.shape), stroke: '#93a9bd', strokeWidth: 1.3,strokeDasharray:n.shape==='region'?'6 4':undefined, rx: n.shape==='rounded'?14:6, ry: n.shape==='rounded'?14:6}};
    if(n.shape==='final'){markup.push({tagName:'ellipse',selector:'inner'});attrs.inner={cx:n.width/2,cy:n.height/2,rx:n.width/2-5,ry:n.height/2-5,fill:'#234e68'};}
    const addText = (t: TextBox, key: string, extra: Record<string, unknown> = {}) => {
      if (!t.lines.length) return;
      markup.push({tagName: 'g', selector: key, children: t.lines.map((_, row) => ({tagName: 'text', selector: key + '/' + row}))});attrs[key] = extra;
      t.lines.forEach((line, row) => {attrs[key + '/' + row] = {refX: 0, refY: 0, x: t.x - n.x, y: t.y - n.y + t.size + row * (t.size + 7), text: line, textAnchor: 'start', fontSize: t.size, fontFamily: 'Noto Sans SC', fill: '#17324d'};});
    };
    addText(n.title, 'title', {fontWeight: 700});n.contents.forEach((t, i) => addText(t, 'content' + i, {'data-drawing-content': t.id}));
    n.ports.forEach((p, i) => {const port = drawingID(scene.id, 'port', n.id, p.id);addText(p.text, 'p' + i, {'data-source-port': port, cursor: 'pointer'});if (p.annotation) addText(p.annotation, 'a' + i, {'data-port-annotation': port, display: scene.display.showPortAttributes ? '' : 'none'});});
    graph.addNode({id, zIndex: drawing.nodes.some(child => child.parentId === n.id) ? -1 : 1, ...move(n), width: n.width, height: n.height, markup, attrs, ports: {groups: {absolute: {position: {name: 'absolute'}, attrs: {circle: {r: 3.5, magnet: false, fill: 'white', stroke: '#527d97'}}}}, items: n.ports.map(p => ({id: drawingID(scene.id, 'port', n.id, p.id), group: 'absolute', args: {x: p.x - n.x, y: p.y - n.y}, ...(p.appearance === 'slot' ? {attrs: {circle: {r: 0}}} : {})}))}, data: {entityId: id}});
  }
  for (const n of drawing.nodes) if (n.parentId) graph.getCellById(drawingID(scene.id, 'node', n.parentId)).addChild(graph.getCellById(drawingID(scene.id, 'node', n.id)));
  for (const c of drawing.connections) {
    const id = drawingID(scene.id, 'connection', c.id), net = scene.nets.find(net => net.id === id)!, style = styles[net.class] ?? styles.other, owned: string[] = [];
    for (const [i, path] of net.paths!.entries()) owned.push(graph.addEdge({id: cellID('branch:' + id + ':' + i), zIndex: 0, source: path.points[0], target: path.points.at(-1), vertices: path.points.slice(1, -1),...(path.curves?{connector:{name:'edoc-geometry',args:{path:pathD({id:String(i),points:path.points,curves:path.curves})}}}:{}), attrs: {line: {stroke: style.color, strokeWidth: 1.7, strokeDasharray: style.dash, sourceMarker: path.arrow ? {name: 'block', width: 7, height: 5} : null, targetMarker: path.endArrow ? {name: 'block', width: 7, height: 5} : null}}, data: {entityId: id}}).id);
    for (const [i, p] of (net.junctions ?? []).entries()) owned.push(graph.addNode({id: cellID('hub:' + id + ':' + i), shape: 'circle', zIndex: 2, x: p.x - 3, y: p.y - 3, width: 6, height: 6, attrs: {body: {fill: style.color, stroke: 'none'}}, data: {entityId: id}}).id);
    for (const e of c.ends.filter(e => e.marker === 'circle')) {const p = move(e);owned.push(graph.addNode({id: cellID('marker:' + id + ':' + e.id), shape: 'circle', zIndex: 2, x: p.x - 4, y: p.y - 4, width: 8, height: 8, attrs: {body: {fill: 'white', stroke: style.color}}, data: {entityId: id}}).id);}
    for (const [i, label] of c.labels.entries()) {
      const markup: any[] = [{tagName: 'rect', selector: 'body'}], attrs: Record<string, any> = {body: {fill: '#f8fafc', stroke: 'none', rx: 3, ry: 3}};
      label.lines.forEach((text, row) => {const key = 'line' + row;markup.push({tagName: 'text', selector: key});attrs[key] = {refX: 0, refY: 0, text, x: 8, y: 3 + label.size + row * (label.size + 7), fontSize: label.size, textAnchor: 'start', fontFamily: 'Noto Sans SC', fill: style.color};});
      const cell = graph.addNode({id: cellID('label:' + id + ':' + i), zIndex: 2, ...move(label), width: label.width, height: label.height, markup, attrs, data: {entityId: id, role: 'relation-label'}});owned.push(cell.id);labelCells.add(cell.id);
    }
    cells.set(id, owned);
  }
  return cells;
}
