import ELK from 'elkjs/lib/elk.bundled.js';
import type {ElkNode, ElkExtendedEdge} from 'elkjs/lib/elk-api';
import type {Drawing, DrawingScene, NodeGeometry, Point, TextBox} from './types.ts';
import {shapeAnchor} from './shapes.ts';
import {DrawingError} from './types.ts';
import {layoutDrawing} from './layout.ts';
import {measureText, wrapText} from '../render-graph/text.ts';
import {verifyDrawingScene} from './verify.ts';
import {placeLabel} from '../render-graph/geometry.ts';

// ELK 0.12.1 的层级图使用 GREEDY_MODEL_ORDER 会崩溃；仅平面语义图用模型顺序打破环的平局。
// 稠密的二端图交由同一个 compound 后端联合布局和布线，避免丢弃其通道结果再逐线搜索。
async function compoundAttempt(input: Drawing, extraSpace: number): Promise<DrawingScene> {
  const started = performance.now(), measured = await layoutDrawing(input), geometry = new Map(measured.map(n => [n.id, n]));
  const rules = input.layout?.constraints ?? [], pid = (node: string, port: string) => JSON.stringify([node, port]);
  const loopPort=(connection:string,end:number)=>JSON.stringify(['loop',connection,end]);
  const loops=(id:string)=>input.connections.filter(c=>c.ends.every(e=>e.node===id&&!e.port));
  const direction = (id?: string) => ({LR: 'RIGHT', RL: 'LEFT', TB: 'DOWN', BT: 'UP'}[(id && input.layout?.containers?.[id]?.direction) || input.layout?.direction || 'LR']);
  const spacing = (id?: string) => ({node: 64, layer: 100, edge: 20, padding: 40, ...input.layout?.spacing, ...id ? input.layout?.containers?.[id]?.spacing : {}});
  function node(n: NodeGeometry): ElkNode {
    const children = measured.filter(c => c.parentId === n.id), s = spacing(n.id);
    const header = n.contentBox.y - n.y, left=n.contentBox.x-n.x, right=n.width-left-n.contentBox.width, bottom=n.height-header-n.contentBox.height;
    return {id: n.id, width: n.width, height: n.height,
      layoutOptions: {'elk.direction': direction(n.id),'elk.layered.cycleBreaking.strategy':input.nodes.some(n=>n.shape)&&!input.nodes.some(n=>n.parentId)?'GREEDY_MODEL_ORDER':'GREEDY', 'elk.portConstraints': n.ports.length||loops(n.id).length ? 'FIXED_POS' : 'FREE','elk.spacing.nodeSelfLoop':String(Math.max(80,...loops(n.id).flatMap(c=>(c.labels??[]).map(l=>measureText(l.text.split('\n').sort((a,b)=>b.length-a.length)[0],14)/2+30)))), 'elk.padding': `[top=${header},left=${left},bottom=${bottom},right=${right}]`, 'elk.spacing.nodeNode': String(s.node), 'elk.spacing.edgeNode': String(s.edge * extraSpace), 'elk.layered.spacing.edgeNodeBetweenLayers': String(s.edge * extraSpace), 'elk.spacing.edgeEdge': String(s.edge * extraSpace), 'elk.layered.spacing.edgeEdgeBetweenLayers': String(s.edge * extraSpace), 'elk.layered.spacing.nodeNodeBetweenLayers': String(s.layer)},
      ports: [...n.ports.map(p => ({id: pid(n.id, p.id), x: p.x - n.x, y: p.y - n.y, width: 0, height: 0, layoutOptions: {'elk.port.side': p.side.toUpperCase()}})),...loops(n.id).flatMap((c,j,all)=>[0,1].map(i=>({id:loopPort(c.id,i),x:n.width,y:n.height*(i?.8-j*.05:.2+j*.05),width:0,height:0,layoutOptions:{'elk.port.side':'EAST'}})))],
      ...children.length ? {children: children.map(node)} : {}};
  }
  const labelBoxes = (c: Drawing['connections'][number]) => (c.labels ?? []).map(l => { const lines = wrapText(l.text, 14, 200); return {id: l.id, width: Math.max(...lines.map(line => measureText(line, 14))) + 16, height: lines.length * 21 + 8, lines}; });
  const edges: ElkExtendedEdge[] = input.connections.map(c => {
    const boxes = labelBoxes(c);
    return {id: c.id, sources: [loops(c.ends[0].node).includes(c)?loopPort(c.id,0):c.ends[0].port ? pid(c.ends[0].node, c.ends[0].port) : c.ends[0].node], targets: [loops(c.ends[1].node).includes(c)?loopPort(c.id,1):c.ends[1].port ? pid(c.ends[1].node, c.ends[1].port) : c.ends[1].node], labels: boxes.length ? [{id: 'label-stack', text: c.labels!.map(l => l.text).join('\n'), width: Math.max(...boxes.map(b => b.width)), height: boxes.reduce((sum, b) => sum + b.height, 0) + (boxes.length - 1) * 6}] : []};
  });
  const result = await new ELK().layout({id: 'root', children: measured.filter(n => !n.parentId).map(node), edges, layoutOptions: {'elk.algorithm': 'layered','elk.layered.cycleBreaking.strategy':input.nodes.some(n=>n.shape)&&!input.nodes.some(n=>n.parentId)?'GREEDY_MODEL_ORDER':'GREEDY','elk.spacing.nodeSelfLoop':'100', 'elk.hierarchyHandling': 'INCLUDE_CHILDREN', 'elk.direction': direction(), 'elk.edgeRouting': 'ORTHOGONAL', 'elk.spacing.nodeNode': String(spacing().node), 'elk.spacing.edgeEdge': String(spacing().edge * extraSpace), 'elk.layered.spacing.edgeEdgeBetweenLayers': String(spacing().edge * extraSpace), 'elk.layered.spacing.nodeNodeBetweenLayers': String(spacing().layer), 'elk.layered.mergeEdges': 'false', 'elk.layered.mergeHierarchyEdges': 'false'}});
  const nodes: NodeGeometry[] = [], locatedEdges: {edge: ElkExtendedEdge; base: Point}[] = [];
  const translateText = (t: TextBox, dx: number, dy: number) => ({...t, x: t.x + dx, y: t.y + dy});
  function visit(graph: ElkNode, base: Point) {
    for (const edge of graph.edges ?? []) locatedEdges.push({edge, base});
    for (const child of graph.children ?? []) {
      const old = geometry.get(child.id)!, x = base.x + (child.x ?? 0), y = base.y + (child.y ?? 0), dx = x - old.x, dy = y - old.y, width = child.width!, height = child.height!;
      const n: NodeGeometry = {...old, x, y, width, height, title: translateText(old.title, dx, dy), contents: old.contents.map(t => translateText(t, dx, dy)), contentBox: {...old.contentBox, x: old.contentBox.x + dx, y: old.contentBox.y + dy, width: old.contentBox.width + width - old.width, height: old.contentBox.height + height - old.height}, ports: old.ports.map(p => {const solved=child.ports?.find(q=>q.id===pid(old.id,p.id));const px=x+(solved?.x??p.x-old.x),py=y+(solved?.y??p.y-old.y),tx=px-p.x,ty=py-p.y;return {...p,x:px,y:py,text:translateText(p.text,tx,ty),annotation:p.annotation?translateText(p.annotation,tx,ty):undefined};})};
      nodes.push(n); visit(child, {x, y});
    }
  }
  visit(result, {x: 0, y: 0});
  const map = new Map(nodes.map(n => [n.id, n]));
  const connections = input.connections.map(c => {
    const located = locatedEdges.find(e => e.edge.id === c.id); if (!located?.edge.sections?.length) throw new DrawingError('DRAWING_ROUTE', 'compound', [c.id], '后端未返回完整路线');
    const {edge} = located, owner = map.get((edge as ElkExtendedEdge & {container?: string}).container ?? 'root'), base = owner ? {x: owner.x, y: owner.y} : located.base, move = (p: Point) => ({x: p.x + base.x, y: p.y + base.y});
    const paths = edge.sections!.map((s, i) => ({id: 'section-' + i, points: [s.startPoint, ...(s.bendPoints ?? []), s.endPoint].map(move)}));
    for(const [index,end] of c.ends.entries()){const n=map.get(end.node)!;if(!n.shape||end.port)continue;const path=index?paths.at(-1)!:paths[0],at=index?path.points.length-1:0,neighbor=path.points[index?at-1:1];path.points[at]=shapeAnchor(n,path.points[at],neighbor);}
    return {id: c.id, originIds: c.originIds ?? [], ends: c.ends.map((e, i) => { const n = map.get(e.node)!, p = e.port ? n.ports.find(p => p.id === e.port)! : undefined; const end = i ? paths.at(-1)!.points.at(-1)! : paths[0].points[0]; return {...e, x: p?.x ?? end.x, y: p?.y ?? end.y, side: p?.side ?? (()=>{const path=i?paths.at(-1)!.points:paths[0].points,near=i?path.at(-2)!:path[1];return Math.abs(near.y-end.y)<.01?(near.x<end.x?'left' as const:'right' as const):(near.y<end.y?'top' as const:'bottom' as const);})()}; }), paths, junctions: [], labels: labelBoxes(c).map((l, i, all) => ({...l, x: (edge.labels?.[0]?.x ?? 0) + base.x, y: (edge.labels?.[0]?.y ?? 0) + base.y + all.slice(0, i).reduce((sum, b) => sum + b.height + 6, 0), size: 14}))};
  });
  // ELK为标题预留通道，但返回的标题可能在线旁；最终标题必须落在所属真实路径上。
  const obstacles=nodes.flatMap(n=>nodes.some(child=>child.parentId===n.id)?[n.title,{x:n.x-2,y:n.y,width:4,height:n.height},{x:n.x+n.width-2,y:n.y,width:4,height:n.height},{x:n.x,y:n.y+n.height-2,width:n.width,height:4}]:[n]);
  const placed:TextBox[]=[];
  for(const c of connections)for(const label of c.labels){
    try{Object.assign(label,placeLabel(label,c.paths.map(p=>p.points),obstacles,placed,connections.filter(other=>other!==c).flatMap(other=>other.paths.map(p=>p.points))));}
    catch{throw new DrawingError('DRAWING_LABEL','compound',[c.id,label.id],'没有位于所属路径上的标题空间：'+JSON.stringify({label,paths:c.paths}));}
    placed.push(label);
  }
  const points = [...nodes.flatMap(n => [{x: n.x, y: n.y}, {x: n.x + n.width, y: n.y + n.height}]), ...connections.flatMap(c => [...c.paths.flatMap(p => p.points), ...c.labels.flatMap(l => [{x:l.x,y:l.y},{x:l.x+l.width,y:l.y+l.height}])])], x = Math.min(...points.map(p => p.x)) - 24, y = Math.min(...points.map(p => p.y)) - 60;
  const width = Math.max(...points.map(p => p.x)) - x + 24, height = Math.max(...points.map(p => p.y)) - y + 24;
  const scene: DrawingScene = {id: input.id, nodes, connections, width, height, viewBox: {x, y, width, height}, effectiveLayout: input.layout, satisfiedConstraints: [], diagnostics: [{code: 'DRAWING_COMPOUND', message: '使用层级联合布局与正交布线；全部几何经过独立结果检查'}], durationMs: performance.now() - started};
  scene.satisfiedConstraints = verifyDrawingScene(input, scene);
  return scene;
}

export async function solveCompound(input: Drawing): Promise<DrawingScene> {
  const start = performance.now();
  for (const space of [1, 2, 4]) {
    try { const result = await compoundAttempt(input, space); result.durationMs = performance.now() - start; if (space > 1) result.diagnostics.push({code: 'DRAWING_CHANNEL_SPACE', message: `联合路由增加通道空白至 ${space} 倍，保留原最小间距检查`}); return result; }
    catch (error) { if (!(error instanceof DrawingError) || !['DRAWING_PATH_CLEARANCE', 'DRAWING_PATH_CONTACT', 'DRAWING_LABEL'].includes(error.code) || space === 4) throw error; }
  }
  throw new Error('不可达的联合求解状态');
}
