import type {ConnectionGeometry, Point, Rect} from './types.ts';
import {DrawingError} from './types.ts';
import {orthogonal, simplify, distance, same} from '../render-graph/geometry.ts';
import {checkPaths} from './check-paths.ts';

// 在已确定的主干上接入其余端点；只接受无自交且有真实 T 点的树。
export function extendConnectionTree(tree: ConnectionGeometry, remaining: ConnectionGeometry['ends'], lead: (e: ConnectionGeometry['ends'][number]) => Point, obstacles: Rect[], used: Point[][], clearance: number): void {
  for (const end of remaining) {
    const start = lead(end), candidates: {connection: ConnectionGeometry; length: number}[] = [];
    for (const [pathIndex, path] of tree.paths.entries()) for (let segment = 1; segment < path.points.length; segment++) {
      const a = path.points[segment - 1], b = path.points[segment], vertical = a.x === b.x, axis = vertical ? 'y' : 'x';
      if (distance(a, b) < 48) continue;
      const min = Math.min(a[axis], b[axis]) + 24, max = Math.max(a[axis], b[axis]) - 24;
      const positions = [...new Set([Math.max(min, Math.min(max, start[axis])), (min + max) / 2, min, max])];
      for (const pos of positions) {
        const joint = vertical ? {x: a.x, y: pos} : {x: pos, y: a.y};
        if (tree.ends.some(e => distance(e, joint) < 24) || tree.junctions.some(p => distance(p, joint) < clearance)) continue;
        try {
          const route = simplify([{x: end.x, y: end.y}, start, ...orthogonal(start, joint, obstacles, [...used, ...tree.paths.map(p => p.points)], {contacts: [start, joint], clearance}).slice(1)]);
          const connection: ConnectionGeometry = {...tree, paths: [...tree.paths.slice(0, pathIndex), {id: path.id + '/a', points: simplify([...path.points.slice(0, segment), joint])}, {id: path.id + '/b', points: simplify([joint, ...path.points.slice(segment)])}, ...tree.paths.slice(pathIndex + 1), {id: 'end/' + end.id, points: route}], junctions: [...tree.junctions, joint]};
          checkPaths([connection]);
          candidates.push({connection, length: route.slice(1).reduce((sum, p, i) => sum + distance(route[i], p), 0) + route.length * 24});
        } catch { /* 仅淘汰几何不可行的候选，不解除任何输入要求。 */ }
      }
    }
    candidates.sort((a, b) => a.length - b.length);
    if (!candidates.length) throw new DrawingError('DRAWING_ROUTE', 'route', [tree.id, end.id], '其余端点无法接入无自交的连接树');
    tree.paths = candidates[0].connection.paths; tree.junctions = candidates[0].connection.junctions;
  }
}
