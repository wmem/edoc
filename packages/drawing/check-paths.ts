import {DrawingError} from './types.ts';
import type {ConnectionGeometry, Point} from './types.ts';
import {same} from '../render-graph/geometry.ts';
import {checkCurvePaths} from './curve-check.ts';

// 与路由算法分开检查，包括直接采用的 fixedRoute；交叉只能在两条直线内部发生。
export function checkPaths(connections: ConnectionGeometry[], clearance = 0): void {
  if(connections.some(c=>c.paths.some(p=>p.curves))){checkCurvePaths(connections,clearance);return;}
  const segments = connections.flatMap(c => c.paths.flatMap(path => path.points.slice(1).map((b, i) => ({c, path, i, a: path.points[i], b}))));
  const on = (p: Point, a: Point, b: Point) => p.x >= Math.min(a.x, b.x) - .001 && p.x <= Math.max(a.x, b.x) + .001 && p.y >= Math.min(a.y, b.y) - .001 && p.y <= Math.max(a.y, b.y) + .001;
  for (const [index, u] of segments.entries()) for (const v of segments.slice(index + 1)) {
    const uh = u.a.y === u.b.y, vh = v.a.y === v.b.y;
    const fail = (message: string): never => { throw new DrawingError('DRAWING_PATH_CONTACT', 'geometry', [u.c.id, u.path.id, v.c.id, v.path.id], message); };
    if (uh === vh) {
      const collinear = uh ? Math.abs(u.a.y - v.a.y) < .001 : Math.abs(u.a.x - v.a.x) < .001;
      const axis = uh ? 'x' : 'y';
      const overlap = Math.min(Math.max(u.a[axis], u.b[axis]), Math.max(v.a[axis], v.b[axis])) - Math.max(Math.min(u.a[axis], u.b[axis]), Math.min(v.a[axis], v.b[axis]));
      if (collinear && overlap > .001) fail('路线存在重合、折返或未声明的共享线段');
      if (u.c !== v.c && overlap > .001 && Math.abs(u.a[uh ? 'y' : 'x'] - v.a[uh ? 'y' : 'x']) < clearance - .01) throw new DrawingError('DRAWING_PATH_CLEARANCE', 'geometry', [u.c.id, v.c.id], `独立连接的平行段未满足 ${clearance} 最小间距：${JSON.stringify([u.a, u.b, v.a, v.b])}`);
      if (collinear && overlap > -.001 && u.c !== v.c && [u.a, u.b].some(p => [v.a, v.b].some(q => same(p, q)))) fail('独立连接首尾相贴，形成假连接');
      continue;
    }
    const p = {x: uh ? v.a.x : u.a.x, y: uh ? u.a.y : v.a.y};
    if (!on(p, u.a, u.b) || !on(p, v.a, v.b)) continue;
    const atU = same(p, u.a) || same(p, u.b), atV = same(p, v.a) || same(p, v.b);
    if (u.c === v.c) {
      if (u.path === v.path && Math.abs(u.i - v.i) === 1 && atU && atV) continue;
      if (u.path !== v.path && atU && atV && u.c.junctions.some(j => same(j, p))) continue;
      fail('同一连接出现未声明的分叉或自交');
    }
    if (!atU && !atV) continue;
    if (u.c.ends.some(e => same(e, p) && v.c.ends.some(f => f.node === e.node && f.port === e.port && same(f, p)))) continue;
    fail('独立连接在端点或折角相接，形成假分叉');
  }
}
