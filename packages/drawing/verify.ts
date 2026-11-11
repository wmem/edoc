import {DrawingError} from './types.ts';
import type {Drawing, DrawingScene, Point, Rect, Target, ConnectionGeometry} from './types.ts';
import {same, crosses, intersects} from '../render-graph/geometry.ts';
import {checkPaths} from './check-paths.ts';

const epsilon = .02;
const contains = (a: Rect, b: Rect) => b.x >= a.x - epsilon && b.y >= a.y - epsilon && b.x + b.width <= a.x + a.width + epsilon && b.y + b.height <= a.y + a.height + epsilon;
const on = (p: Point, a: Point, b: Point) => Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) < epsilon && p.x >= Math.min(a.x, b.x) - epsilon && p.x <= Math.max(a.x, b.x) + epsilon && p.y >= Math.min(a.y, b.y) - epsilon && p.y <= Math.max(a.y, b.y) + epsilon;
const equal = (a: number, b: number) => Math.abs(a - b) < epsilon;

// 检查器只消费输入与结果，不读取布局算法的中间状态，也不信任 satisfiedConstraints。
export function verifyDrawingScene(input: Drawing, scene: DrawingScene): string[] {
  function fail(ids: string[], message: string, path = '', code = 'DRAWING_VERIFY'): never { throw new DrawingError(code, 'verify', [input.id, ...ids], message, path); }
  const nodes = new Map(scene.nodes.map(n => [n.id, n])), connections = new Map(scene.connections.map(c => [c.id, c]));
  if (scene.id !== input.id || nodes.size !== input.nodes.length || scene.nodes.length !== nodes.size || connections.size !== input.connections.length || scene.connections.length !== connections.size) fail([], '结果身份或对象数量与输入不符');
  const parent = (ancestor: string, id: string): boolean => { const n = nodes.get(id); return id === ancestor || !!n?.parentId && parent(ancestor, n.parentId); };
  const container = (id: string) => scene.nodes.some(n => n.parentId === id);
  const texts = scene.nodes.flatMap(n => [n.title, ...n.contents, ...n.ports.flatMap(p => [p.text, ...p.annotation ? [p.annotation] : []])]).filter(t => t.width && t.height);
  const frame = (id = 'root'): Point => id === 'root' ? {x: 0, y: 0} : nodes.get(id)!.contentBox;
  const offset = (p: Point, f: Point): Point => ({x: p.x + f.x, y: p.y + f.y});
  const target = (t: Target, axis: 'x' | 'y') => { const n = nodes.get(t.node)!; return t.port ? n.ports.find(p => p.id === t.port)![axis] : n[axis] + n[axis === 'x' ? 'width' : 'height'] * (t.edge === 'start' ? 0 : t.edge === 'end' ? 1 : .5); };
  for (const source of input.nodes) {
    const n = nodes.get(source.id); if (!n || n.parentId !== source.parentId || JSON.stringify(n.originIds) !== JSON.stringify(source.originIds ?? [])) fail([source.id], '模块身份、包含关系或来源丢失');
    if (n.parentId && !contains(nodes.get(n.parentId)!.contentBox, n)) fail([n.id, n.parentId], '子框超出父内容区');
    for (const value of [n.x, n.y, n.width, n.height]) if (!Number.isFinite(value)) fail([n.id], '存在非有限几何值');
    if (n.ports.length !== (source.ports ?? []).length) fail([n.id], '端口数量与输入不一致');
    for (const p of source.ports ?? []) {
      const g = n.ports.find(g => g.id === p.id); if (!g || JSON.stringify(g.originIds) !== JSON.stringify(p.originIds ?? [])) fail([n.id, p.id], '端口身份或来源丢失');
      if (!on(g, g.side === 'left' || g.side === 'right' ? {x: n.x + (g.side === 'right' ? n.width : 0), y: n.y} : {x: n.x, y: n.y + (g.side === 'bottom' ? n.height : 0)}, g.side === 'left' || g.side === 'right' ? {x: n.x + (g.side === 'right' ? n.width : 0), y: n.y + n.height} : {x: n.x + n.width, y: n.y + (g.side === 'bottom' ? n.height : 0)})) fail([n.id, p.id], '端口不在声明侧边');
    }
    const own = [n.title, ...n.contents, ...n.ports.flatMap(p => [p.text, ...p.annotation ? [p.annotation] : []])].filter(t => t.width && t.height);
    for (const t of own) if (!contains(n, t)) fail([n.id, t.id], '文字超出模块边界');
    for (let i = 0; i < own.length; i++) for (const b of own.slice(i + 1)) if (intersects(own[i], b, 1)) fail([n.id, own[i].id, b.id], '模块文字重叠');
    for (const group of source.portGroups ?? []) {
      const ports = group.ports.map(id => n.ports.find(p => p.id === id)!);
      if (new Set(ports.map(p => p.side)).size !== 1) fail([n.id, group.id], '分组端口分布在不同侧边');
      const axis = ['left', 'right'].includes(ports[0].side) ? 'y' : 'x';
      const ordered = n.ports.filter(p => p.side === ports[0].side).sort((a, b) => a[axis] - b[axis]);
      // 标题可与折叠槽位共享区间；各槽位仍须具有不同锚点。
      const members = ports.filter(p => p.appearance !== 'header'), indices = members.map(p => ordered.indexOf(p));
      const low = Math.min(...indices), high = Math.max(...indices);
      if (ordered.slice(low, high + 1).some(p => !group.ports.includes(p.id))) fail([n.id, group.id], '分组成员被其他端口插入');
      for (let i = 1; i < members.length; i++) if (members[i][axis] <= members[i - 1][axis]) fail([n.id, group.id], '分组成员顺序错误或锚点重合');
    }
  }
  for (let i = 0; i < scene.nodes.length; i++) for (const b of scene.nodes.slice(i + 1)) { const a = scene.nodes[i]; if (a.parentId === b.parentId && intersects(a, b)) fail([a.id, b.id], '同级模块重叠'); }
  for (const source of input.connections) {
    const c = connections.get(source.id); if (!c || JSON.stringify(c.originIds) !== JSON.stringify(source.originIds ?? []) || c.ends.length !== source.ends.length) fail([source.id], '连接身份、来源或端点数量丢失');
    for (const end of source.ends) {
      const e = c.ends.find(e => e.id === end.id); if (!e || e.node !== end.node || e.port !== end.port || e.marker !== end.marker) fail([c.id, end.id], '连接端身份或标记改变');
      const n = nodes.get(e.node)!; const p = e.port ? n.ports.find(p => p.id === e.port)! : undefined;
      if (p && (!same(p, e) || p.side !== e.side)) fail([c.id, e.id], '端点未挂接到指定端口');
      if (!c.paths.some(p => same(p.points[0], e) || same(p.points.at(-1)!, e))) fail([c.id, e.id], `声明端点未接入路线：锚点 (${e.x},${e.y})，路线 ${JSON.stringify(c.paths.map(p => [p.points[0], p.points.at(-1)]))}`);
      const sideCoordinate = e.side === 'left' ? n.x : e.side === 'right' ? n.x+n.width : e.side === 'top' ? n.y : n.y+n.height;
      if (!equal(e[['left','right'].includes(e.side)?'x':'y'],sideCoordinate)) fail([c.id,e.id], '框边端点或侧边错误');
      for (const path of c.paths) {
        const points=same(path.points[0],e)?path.points:same(path.points.at(-1)!,e)?path.points.slice().reverse():undefined;
        if (!points) continue;
        const d=points[1], outward=e.side==='left'?e.x-d.x:e.side==='right'?d.x-e.x:e.side==='top'?e.y-d.y:d.y-e.y;
        if (!(container(n.id)&&c.ends.every(other=>parent(n.id,other.node))) && outward<=0) fail([c.id,e.id], '端点未沿侧边法向向外接入');
      }
    }
    const connected = new Set<number>([0]);
    for (let pass = 0; pass < c.paths.length; pass++) c.paths.forEach((p, i) => { if (c.paths.some((q, j) => connected.has(j) && [p.points[0], p.points.at(-1)!].some(a => [q.points[0], q.points.at(-1)!].some(b => same(a, b))))) connected.add(i); });
    if (connected.size !== c.paths.length) fail([c.id], '路线不是连通结构');
    for (const path of c.paths) {
      if (path.points.length < 2) fail([c.id, path.id], '路线没有线段');
      for (let i = 1; i < path.points.length; i++) {
        const a = path.points[i - 1], b = path.points[i];
        if (!equal(a.x, b.x) && !equal(a.y, b.y)) fail([c.id, path.id], '正交路线存在斜线');
        for (const n of scene.nodes) { const related = container(n.id) && c.ends.some(e => parent(n.id, e.node)); if (crosses(a, b, related ? n.title : n)) fail([c.id, n.id], '路径穿过模块或容器标题'); }
        for (const t of texts) if (crosses(a, b, t)) fail([c.id, t.id], '路径穿过框内文字');
      }
    }
    for (const n of scene.nodes.filter(n => container(n.id) && c.ends.every(e => e.node !== n.id && parent(n.id, e.node)))) for (const p of c.paths.flatMap(p => p.points)) if (!contains(n.contentBox, {...p, width: 0, height: 0})) fail([c.id, n.id], '内部路线超出父内容区');
    if (c.labels.length !== (source.labels ?? []).length) fail([c.id], '线上标题缺失');
    for (const l of source.labels ?? []) if (!c.labels.some(g => g.id === l.id && g.lines.join('') === l.text.replace(/\n/g, ''))) fail([c.id, l.id], '线上标题身份或文本改变');
  }
  checkPaths(scene.connections, input.layout?.spacing?.edge ?? 20);
  const labels = scene.connections.flatMap(c => c.labels.map(l => ({c, l})));
  if (!equal(scene.width,scene.viewBox.width)||!equal(scene.height,scene.viewBox.height)) fail([], '画布与输出范围不一致');
  for (const n of scene.nodes) if (!contains(scene.viewBox,n)) fail([n.id], '输出范围裁切模块');
  for (const c of scene.connections) {
    for (const p of c.paths.flatMap(p=>p.points)) if (!contains(scene.viewBox,{...p,width:0,height:0})) fail([c.id], '输出范围裁切路线');
    for (const l of c.labels) if (!contains(scene.viewBox,l)) fail([c.id,l.id], '输出范围裁切标题');
  }
  for (const [i, {c, l}] of labels.entries()) {
    const center={x:l.x+l.width/2,y:l.y+l.height/2};
    if(!c.paths.some(p=>p.points.slice(1).some((end,i)=>on(center,p.points[i],end))))fail([c.id,l.id],'线上标题中心未落在所属路径');
    for (const n of scene.nodes) if (intersects(l, container(n.id) ? n.title : n, 1)) fail([c.id, l.id, n.id], '线上标题遮挡模块');
    for (const {c: other, l: b} of labels.slice(i + 1)) if (intersects(l, b, 1)) fail([c.id, l.id, other.id, b.id], '线上标题互相重叠');
    for (const other of scene.connections.filter(o => o !== c)) for (const p of other.paths) for (let j = 1; j < p.points.length; j++) if (crosses(p.points[j - 1], p.points[j], l)) fail([c.id, l.id, other.id], '线上标题遮挡其他连接');
  }
  const verified: string[] = [];
  for (const [index, r] of (input.layout?.constraints ?? []).entries()) {
    const path = `/layout/constraints/${index}`, require = (ok: boolean, message: string) => { if (!ok) fail([r.id], message, path, 'DRAWING_CONSTRAINT_UNSATISFIED'); };
    if (r.type === 'place') { const n = nodes.get(r.node)!, f = frame(n.parentId); require(equal(n.x - f.x, r.x) && equal(n.y - f.y, r.y), '固定位置未满足'); }
    if (r.type === 'size') { const n = nodes.get(r.node)!; require((r.width === undefined || equal(n.width, r.width)) && (r.height === undefined || equal(n.height, r.height)), '固定尺寸未满足'); }
    if (r.type === 'align') { const positions = r.targets.map(t => target(t, r.axis)); require(Math.max(...positions) - Math.min(...positions) < epsilon, '对齐未满足'); }
    if (r.type === 'order') for (let i = 1; i < r.nodes.length; i++) { const a = nodes.get(r.nodes[i - 1])!, b = nodes.get(r.nodes[i])!; require(a[r.axis] + a[r.axis === 'x' ? 'width' : 'height'] + (r.gap ?? 0) <= b[r.axis] + epsilon, '相对顺序或间距未满足'); }
    if (r.type === 'port') {
      const n = nodes.get(r.node)!, p = n.ports.find(p => p.id === r.port)!;
      require(!r.side || p.side === r.side, '端口侧边未满足');
      const axis = ['left', 'right'].includes(p.side) ? 'y' : 'x';
      if (r.offset !== undefined) require(equal(p[axis], n[axis] + n[axis === 'x' ? 'width' : 'height'] * r.offset), '端口比例位置未满足');
      if (r.order !== undefined) for (const q of input.layout?.constraints ?? []) if (q.type === 'port' && q.node === r.node && q.order !== undefined && q.order > r.order) { const b = n.ports.find(p => p.id === q.port)!; if (b.side === p.side) require(b[axis] > p[axis], '端口顺序未满足'); }
    }
    if (r.type === 'route') {
      const c = connections.get(r.connection)!, points = trace(c, r.from, r.to), expected = r.via.map(p => offset(p, frame(r.frame)));
      let cursor = 0; for (const p of expected) { let found = false, length = 0; for (let i = 0; i < points.length - 1; i++) { const distance = Math.abs(points[i + 1].x - points[i].x) + Math.abs(points[i + 1].y - points[i].y), at = length + Math.abs(p.x - points[i].x) + Math.abs(p.y - points[i].y); if (on(p, points[i], points[i + 1]) && at >= cursor - epsilon) { cursor = at; found = true; break; } length += distance; } require(found, '指定经过点未按顺序接入主路径'); }
    }
    if (r.type === 'fixedRoute') {
      const c = connections.get(r.connection)!, f = frame(r.frame), at = (ref: import('./types.ts').RouteRef): Point => 'end' in ref ? c.ends.find(e => e.id === ref.end)! : offset(r.junctions!.find(j => j.id === ref.junction)!, f);
      require(c.paths.length === r.paths.length, '固定路线数量改变');
      for (const p of r.paths) { const g = c.paths.find(g => g.id === p.id), expected = [at(p.from), ...(p.via ?? []).map(p => offset(p, f)), at(p.to)]; require(!!g && g.points.length === expected.length && expected.every((p, i) => same(p, g.points[i])), '固定路线折点改变'); }
      require(c.junctions.length === (r.junctions ?? []).length && (r.junctions ?? []).every(j => c.junctions.some(p => same(p, offset(j, f)))), '固定分叉改变');
    }
    if (r.type === 'label') {
      const c = connections.get(r.connection)!, l = c.labels.find(l => l.id === r.label)!, end = c.ends.find(e => e.id === r.nearEnd)!;
      const paths = r.toEnd ? [trace(c, r.nearEnd, r.toEnd)] : c.paths.filter(p => same(p.points[0], end) || same(p.points.at(-1)!, end)).map(p => same(p.points[0], end) ? p.points : p.points.slice().reverse());
      const projection = {x: l.x + l.width / 2, y: l.y + l.height / 2};
      if (r.fraction === undefined) require(paths.some(points => points.slice(1).some((b, i) => b.x === points[i].x ? projection.y >= Math.min(b.y, points[i].y) && projection.y <= Math.max(b.y, points[i].y) : projection.x >= Math.min(b.x, points[i].x) && projection.x <= Math.max(b.x, points[i].x))), '标签未位于参考端相邻路径');
      else {
        const points = paths[0], lengths = points.slice(1).map((b, i) => Math.abs(b.x - points[i].x) + Math.abs(b.y - points[i].y)); let remain = lengths.reduce((a, b) => a + b, 0) * r.fraction;
        let point = points[0], vertical = false;
        for (let i = 0; i < lengths.length; i++) { if (remain <= lengths[i]) { const a = points[i], b = points[i + 1]; point = {x: a.x + (b.x - a.x) * remain / lengths[i], y: a.y + (b.y - a.y) * remain / lengths[i]}; vertical = a.x === b.x; break; } remain -= lengths[i]; }
        require(equal(projection.x,point.x)&&equal(projection.y,point.y), '标签路径比例未满足');
      }
    }
    verified.push(r.id);
  }
  return verified;
}

// 从声明端沿唯一连接树追踪，不能以 paths 数组顺序猜主干。
export function trace(c: ConnectionGeometry, from: string, to: string): Point[] {
  const start = c.ends.find(e => e.id === from)!, end = c.ends.find(e => e.id === to)!, pending: Point[][] = [[start]], seen: Point[] = [];
  while (pending.length) { const points = pending.shift()!, at = points.at(-1)!; if (same(at, end)) return points; if (seen.some(p => same(p, at))) continue; seen.push(at); for (const p of c.paths) { if (same(p.points[0], at)) pending.push([...points, ...p.points.slice(1)]); else if (same(p.points.at(-1)!, at)) pending.push([...points, ...p.points.slice().reverse().slice(1)]); } }
  throw new DrawingError('DRAWING_VERIFY', 'verify', [c.id, from, to], '声明端之间没有可追踪路线');
}
