import type { Diagnostic, Graph, Node, Group, Port, Connection, View, RecordEntry } from './types.ts';
import { EngDocError } from './errors.ts';
import { projectPath } from './paths.ts';

export function validateRelations(graph: Graph): void {
  const errors: Diagnostic[] = [];
  const report = (entry: RecordEntry, code: string, path: string, message: string) => errors.push({ code, file: entry.location.file, path: `${entry.location.path}${path}`, id: entry.id, message });
  const reference = (entry: RecordEntry, id: string, path: string, types: RecordEntry['type'][]) => {
    const target = graph.index.get(id);
    if (!target) report(entry, 'REFERENCE_MISSING', path, `引用不存在：${id}`);
    else if (!types.includes(target.type)) report(entry, 'REFERENCE_TYPE', path, `引用 ${id} 需要 ${types.join('/')}，实际为 ${target.type}`);
  };
  for (const entry of graph.index.values()) {
    if (entry.entity.source) {
      try { projectPath(graph.projectRoot, graph.projectRoot, entry.entity.source.file, false); }
      catch (error) {
        if (error instanceof EngDocError) for (const d of error.diagnostics) report(entry, d.code, '/source/file', d.message);
        else throw error;
      }
    }
    if (entry.type === 'node') {
      const node = entry.entity as Node;
      if (node.parentId) reference(entry, node.parentId, '/parentId', ['node']);
    }
    if (entry.type === 'port') {
      const port = entry.entity as Port;
      if (port.groupId) reference(entry, port.groupId, '/groupId', ['group']);
      if (port.clockDomainId) reference(entry, port.clockDomainId, '/clockDomainId', ['node', 'port', 'group']);
    }
    if (entry.type === 'group') {
      (entry.entity as Group).members.forEach((id, i) => reference(entry, id, `/members/${i}`, ['node', 'port', 'group']));
    }
    if (entry.type === 'connection') {
      const connection = entry.entity as Connection;
      connection.endpoints.forEach((id, i) => reference(entry, id, `/endpoints/${i}`, ['node', 'port']));
      if (connection.direction) {
        for (const role of ['sources', 'targets'] as const) connection.direction[role].forEach((id, i) => {
          if (!connection.endpoints.includes(id)) report(entry, 'DIRECTION_ENDPOINT', `/direction/${role}/${i}`, `方向 ID 必须属于同一连接端点：${id}`);
        });
        if (connection.direction.sources.some(id => connection.direction!.targets.includes(id))) report(entry, 'DIRECTION_OVERLAP', '/direction', '同一端点不能同时是显式源和目标；双向连接请省略方向');
      }
    }
    if (entry.type === 'view') {
      const view = entry.entity as View;
      view.include.objects.forEach((id, i) => reference(entry, id, `/include/objects/${i}`, ['node', 'port', 'group']));
      view.include.relations.forEach((id, i) => reference(entry, id, `/include/relations/${i}`, ['connection']));
      view.layout?.portOrder?.forEach((id, i) => reference(entry, id, `/layout/portOrder/${i}`, ['port']));
      view.display?.collapsedGroups?.forEach((id, i) => reference(entry, id, `/display/collapsedGroups/${i}`, ['group']));
      const positions = new Set<string>();
      view.layout?.positions?.forEach((pos, i) => {
        reference(entry, pos.objectId, `/layout/positions/${i}/objectId`, ['node', 'group']);
        if (positions.has(pos.objectId)) report(entry, 'POSITION_DUPLICATE', `/layout/positions/${i}/objectId`, '同一对象的位置提示重复');
        positions.add(pos.objectId);
      });
    }
  }
  // 迭代 DFS 避免深层图使用递归导致调用栈溢出；node 层级与 group 集合分别检查。
  for (const type of ['node', 'group'] as const) {
    const color = new Map<string, number>();
    const links = (e: RecordEntry): string[] => type === 'node'
      ? ((e.entity as Node).parentId ? [(e.entity as Node).parentId!] : [])
      : (e.entity as Group).members.filter(id => graph.index.get(id)?.type === 'group');
    for (const start of graph.index.values()) {
      if (start.type !== type || color.has(start.id)) continue;
      const stack: { entry: RecordEntry; exit: boolean }[] = [{ entry: start, exit: false }];
      while (stack.length) {
        const { entry, exit } = stack.pop()!;
        if (exit) { color.set(entry.id, 2); continue; }
        if (color.get(entry.id) === 2) continue;
        if (color.get(entry.id) === 1) { report(entry, 'RELATION_CYCLE', type === 'node' ? '/parentId' : '/members', `${type} 关系存在循环`); continue; }
        color.set(entry.id, 1);
        stack.push({ entry, exit: true });
        for (const id of links(entry).reverse()) {
          const target = graph.index.get(id);
          if (target?.type === type) stack.push({ entry: target, exit: false });
        }
      }
    }
  }
  if (errors.length) throw new EngDocError(errors);
}
