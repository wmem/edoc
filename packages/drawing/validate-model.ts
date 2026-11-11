import {DrawingError} from './types.ts';
import type {Drawing, Content} from './types.ts';
export function validateDrawingModel(drawing: Drawing): void {
  const fail = (code: string, ids: string[], message: string): never => { throw new DrawingError(code, 'validate', ids, message); };
  const unique = <T extends {id: string}>(items: T[], scope: string) => {
    const result = new Map<string, T>();
    for (const item of items) { if (result.has(item.id)) fail('DRAWING_DUPLICATE', [scope, item.id], '同一作用域内 ID 重复'); result.set(item.id, item); }
    return result;
  };
  const nodes = unique(drawing.nodes, drawing.id), connections = unique(drawing.connections, drawing.id);
  const getNode = (id: string) => { const n = nodes.get(id); if (!n) fail('DRAWING_REFERENCE', [id], '节点不存在'); return n!; };
  const getConnection = (id: string) => { const c = connections.get(id); if (!c) fail('DRAWING_REFERENCE', [id], '连接不存在'); return c!; };
  const anchor = (target: {node: string; port?: string}) => {
    const n = getNode(target.node);
    if (target.port !== undefined && !n.ports?.some(p => p.id === target.port)) fail('DRAWING_REFERENCE', [n.id, target.port], '端口不存在');
  };
  const flatten = (contents: Content[]): Content[] => contents.flatMap(c => [c, ...c.kind === 'stack' ? flatten(c.children) : []]);
  for (const n of nodes.values()) {
    unique(n.ports ?? [], n.id); unique(flatten(n.content ?? []), n.id);
    unique(n.portGroups ?? [], n.id); const grouped = new Set<string>();
    for (const group of n.portGroups ?? []) {
      if (group.header && !group.ports.includes(group.header)) fail('DRAWING_SCOPE', [n.id, group.id], '分组标题须属于本组端口');
      for (const port of group.ports) { anchor({node: n.id, port}); if (grouped.has(port)) fail('DRAWING_SCOPE', [n.id, port], '端口不能重复加入显示分组'); grouped.add(port); }
    }
    const seen = new Set<string>(); let p: typeof n | undefined = n;
    while (p) { if (seen.has(p.id)) fail('DRAWING_CYCLE', [...seen], '父容器形成循环'); seen.add(p.id); p = p.parentId ? getNode(p.parentId) : undefined; }
  }
  for (const c of connections.values()) { unique(c.ends, c.id); unique(c.labels ?? [], c.id); c.ends.forEach(anchor); }
  for (const id of Object.keys(drawing.layout?.containers ?? {})) { getNode(id); if (!drawing.nodes.some(n => n.parentId === id)) fail('DRAWING_SCOPE', [id], '局部容器没有子图'); }
  const rules = drawing.layout?.constraints ?? []; unique(rules, 'constraints');
  for (const rule of rules) {
    if ('node' in rule) anchor(rule);
    if (rule.type === 'order' && new Set(rule.nodes.map(id => getNode(id).parentId)).size !== 1) fail('DRAWING_SCOPE', [rule.id], '顺序约束须作用于兄弟节点');
    if (rule.type === 'align') rule.targets.forEach(anchor);
    if (!('connection' in rule)) continue;
    const c = getConnection(rule.connection), ends = unique(c.ends, c.id);
    const end = (id: string) => { if (!ends.has(id)) fail('DRAWING_REFERENCE', [rule.id, id], '连接端不存在'); };
    if ('frame' in rule && rule.frame && rule.frame !== 'root') {
      getNode(rule.frame);
      for (const e of c.ends) { let n: ReturnType<typeof getNode> | undefined = getNode(e.node); while (n && n.id !== rule.frame) n = n.parentId ? getNode(n.parentId) : undefined; if (!n) fail('DRAWING_SCOPE', [rule.id, rule.frame, e.id], '坐标区不包含端点'); }
    }
    if (rule.type === 'route') { end(rule.from); end(rule.to); if (rule.from === rule.to) fail('DRAWING_SCOPE', [rule.id], '主路径两端不能相同'); }
    if (rule.type === 'label') { end(rule.nearEnd); if (rule.toEnd) end(rule.toEnd); if (!c.labels?.some(l => l.id === rule.label)) fail('DRAWING_REFERENCE', [rule.id, rule.label], '标签不存在'); if (rule.fraction !== undefined && c.ends.length > 2 && !rule.toEnd) fail('DRAWING_SCOPE', [rule.id], '多端点标签比例缺少另一参考端'); }
    if (rule.type === 'fixedRoute') {
      const junctions = unique(rule.junctions ?? [], rule.id); unique(rule.paths, rule.id);
      const adjacency = new Map<string, Set<string>>([...c.ends.map(e => 'e:' + e.id), ...[...junctions.keys()].map(id => 'j:' + id)].map(id => [id, new Set()]));
      const key = (r: import('./types.ts').RouteRef) => 'end' in r ? 'e:' + r.end : 'j:' + r.junction;
      for (const path of rule.paths) { const a = key(path.from), b = key(path.to); if (!adjacency.has(a) || !adjacency.has(b) || a === b) fail('DRAWING_REFERENCE', [rule.id, path.id], '固定路径引用错误'); adjacency.get(a)!.add(b); adjacency.get(b)!.add(a); }
      const seen = new Set<string>(), pending = [adjacency.keys().next().value!];
      while (pending.length) { const id = pending.pop()!; if (seen.has(id)) continue; seen.add(id); pending.push(...adjacency.get(id)!); }
      if (seen.size !== adjacency.size || rule.paths.length !== adjacency.size - 1) fail('DRAWING_TOPOLOGY', [rule.id], '固定路线不是连接全部端点的树');
      for (const id of junctions.keys()) if (adjacency.get('j:' + id)!.size < 3) fail('DRAWING_TOPOLOGY', [rule.id, id], '分叉未接入三条不同关系');
    }
  }
  for (const id of drawing.layout?.hints?.main ?? []) getConnection(id);
  for (const hint of drawing.layout?.hints?.channels ?? []) { getConnection(hint.connection); if (hint.container) getNode(hint.container); }
}
