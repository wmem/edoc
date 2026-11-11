// 仅自检候选设计资源和样例引用，不是公开 Drawing 校验器，也不进行布局求解。
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import Ajv from 'ajv/dist/2020.js';

const directory = new URL('../docs/support/proposals/drawing/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(`${name}.json`, directory), 'utf8'));
const schema = JSON.parse(readFileSync(new URL('../packages/drawing/drawing.schema.json', import.meta.url), 'utf8'));
const ajv = new Ajv({strict: true, allErrors: true});
const structure = ajv.compile(schema);
const overlayStructure = ajv.compile({$ref: schema.$id + '#/$defs/layoutOverlay'});
const automatic = read('automatic');
const overlay = read('controlled');
const controlled = {...automatic, ...overlay};
const fixed = read('fixed-route');

function unique(items, context) {
  const map = new Map();
  for (const item of items) {
    assert.ok(!map.has(item.id), `${context} 重复 ID：${item.id}`);
    map.set(item.id, item);
  }
  return map;
}

function references(drawing) {
  const nodes = unique(drawing.nodes, '节点');
  const connections = unique(drawing.connections, '连接');
  const node = id => { assert.ok(nodes.has(id), `节点不存在：${id}`); return nodes.get(id); };
  const connection = id => { assert.ok(connections.has(id), `连接不存在：${id}`); return connections.get(id); };
  const anchor = target => {
    const owner = node(target.node);
    if (target.port !== undefined) assert.ok(owner.ports?.some(p => p.id === target.port), `端口不存在：${target.node}/${target.port}`);
  };
  const end = (owner, id) => assert.ok(owner.ends.some(e => e.id === id), `连接端不存在：${owner.id}/${id}`);
  for (const item of nodes.values()) {
    unique(item.ports ?? [], item.id + ' 的端口');
    const content = entries => entries.flatMap(c => [c, ...c.kind === 'stack' ? content(c.children) : []]);
    unique(content(item.content ?? []), item.id + ' 的内容');
    const seen = new Set();
    let ancestor = item;
    while (ancestor) {
      assert.ok(!seen.has(ancestor.id), `父层级循环：${item.id}`);
      seen.add(ancestor.id);
      ancestor = ancestor.parentId ? node(ancestor.parentId) : undefined;
    }
  }
  for (const item of connections.values()) {
    unique(item.ends, item.id + ' 的端');
    unique(item.labels ?? [], item.id + ' 的标签');
    item.ends.forEach(anchor);
  }
  for (const id of Object.keys(drawing.layout?.containers ?? {})) {
    node(id);
    assert.ok(drawing.nodes.some(n => n.parentId === id), `局部容器无子节点：${id}`);
  }
  const constraints = drawing.layout?.constraints ?? [];
  unique(constraints, '约束');
  for (const rule of constraints) {
    if (rule.node) anchor(rule);
    if (rule.type === 'order') {
      const parents = new Set(rule.nodes.map(id => node(id).parentId));
      assert.equal(parents.size, 1, `顺序约束跨父容器：${rule.id}`);
    }
    if (rule.type === 'align') rule.targets.forEach(anchor);
    if (!rule.connection) continue;
    const owner = connection(rule.connection);
    if (rule.frame && rule.frame !== 'root') {
      node(rule.frame);
      for (const terminal of owner.ends) {
        let ancestor = node(terminal.node);
        while (ancestor && ancestor.id !== rule.frame) ancestor = ancestor.parentId ? node(ancestor.parentId) : undefined;
        assert.ok(ancestor, `路径坐标区不包含端点：${rule.id}/${terminal.id}`);
      }
    }
    if (rule.type === 'route') {
      end(owner, rule.from); end(owner, rule.to);
      assert.notEqual(rule.from, rule.to, `路径主干端重复：${rule.id}`);
    }
    if (rule.type === 'label') {
      assert.ok(owner.labels?.some(l => l.id === rule.label), `标签不存在：${rule.id}`);
      end(owner, rule.nearEnd);
      if (rule.toEnd !== undefined) { end(owner, rule.toEnd); assert.notEqual(rule.nearEnd, rule.toEnd, `标签参考端重复：${rule.id}`); }
      if (rule.fraction !== undefined && owner.ends.length > 2) {
        assert.ok(rule.toEnd !== undefined, `多端点标签未指定另一端：${rule.id}`);
      }
    }
    if (rule.type === 'fixedRoute') {
      const junctions = unique(rule.junctions ?? [], rule.id + ' 的分叉');
      unique(rule.paths, rule.id + ' 的路径');
      const adjacency = new Map([...owner.ends.map(e => 'end/' + e.id), ...junctions.keys().map(id => 'junction/' + id)].map(id => [id, new Set()]));
      const key = ref => ref.end !== undefined ? 'end/' + ref.end : 'junction/' + ref.junction;
      for (const path of rule.paths) {
        const from = key(path.from), to = key(path.to);
        assert.ok(adjacency.has(from) && adjacency.has(to), `固定路径端引用不存在：${rule.id}/${path.id}`);
        assert.notEqual(from, to, `固定路径重复端：${rule.id}/${path.id}`);
        adjacency.get(from).add(to); adjacency.get(to).add(from);
      }
      const visited = new Set(), pending = [adjacency.keys().next().value];
      while (pending.length) { const current = pending.pop(); if (visited.has(current)) continue; visited.add(current); pending.push(...adjacency.get(current)); }
      assert.equal(visited.size, adjacency.size, `固定路径未连通全部端：${rule.id}`);
      assert.equal(rule.paths.length, adjacency.size - 1, `固定路径重复或产生回路：${rule.id}`);
      for (const id of junctions.keys()) assert.ok(adjacency.get('junction/' + id).size >= 3, `分叉不足三条不同邻接关系：${rule.id}/${id}`);
    }
  }
  for (const id of drawing.layout?.hints?.main ?? []) connection(id);
  for (const hint of drawing.layout?.hints?.channels ?? []) { connection(hint.connection); if (hint.container) node(hint.container); }
}

assert.ok(overlayStructure(overlay), JSON.stringify(overlayStructure.errors));
for (const example of [automatic, controlled, fixed]) {
  assert.ok(structure(example), JSON.stringify(structure.errors));
  references(example);
}
assert.deepEqual(controlled.nodes, automatic.nodes);
assert.deepEqual(controlled.connections, automatic.connections);

const structuralMutations = [
  d => { d.unrecognized = true; },
  d => { d.layout.constraints.find(c => c.type === 'port').side = 'diagonal'; },
  d => { d.layout.constraints.find(c => c.type === 'port').offset = 1.1; },
  d => { delete d.layout.constraints.find(c => c.type === 'port').side; },
  d => { d.layout.constraints.find(c => c.type === 'size').width = -1; },
];
for (const mutate of structuralMutations) { const d = structuredClone(controlled); mutate(d); assert.equal(structure(d), false, '结构负例应拒绝'); }
const wrongRoute = structuredClone(fixed);
wrongRoute.layout.constraints.find(c => c.type === 'fixedRoute').paths[0].from.junction = 'branch';
assert.equal(structure(wrongRoute), false, '路径端不能同时是 end 和 junction');
const referenceMutations = [
  d => { d.connections[0].ends[0].port = 'missing'; },
  d => { d.nodes[0].parentId = 'fpga'; },
  d => { d.nodes.push(structuredClone(d.nodes[0])); },
  d => { d.layout.constraints.find(c => c.type === 'align').targets[0].node = 'missing'; },
  d => { d.layout.constraints.find(c => c.type === 'route').from = 'missing'; },
  d => { d.layout.constraints.find(c => c.type === 'label').label = 'missing'; },
];
for (const mutate of referenceMutations) { const d = structuredClone(controlled); mutate(d); assert.ok(structure(d)); assert.throws(() => references(d)); }
const disconnected = structuredClone(fixed);
disconnected.layout.constraints.find(c => c.type === 'fixedRoute').paths.pop();
assert.ok(structure(disconnected)); assert.throws(() => references(disconnected));
console.log(JSON.stringify({scope: '候选 Schema 与设计样例自检',examples: 3,structuralRejections: structuralMutations.length + 1,referenceRejections: referenceMutations.length + 1,geometrySolved: false}, null, 2));
