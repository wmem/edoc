import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {prepareInterfaceModel, initialInterfaceState} from '../packages/render-graph/interfaces.ts';
import {drawingInterfaceScene} from '../packages/drawing/interface-scene.ts';
import {svg} from '../packages/render-graph/index.ts';
import type {Point} from '../packages/drawing/types.ts';

// 独立于几何校验器检查折返和自交，避免只验证求解器自己的成功状态。
function assertSimplePath(points: Point[]) {
  const segments = points.slice(1).map((b, i) => ({a: points[i], b}));
  for (const [i, u] of segments.entries()) {
    assert.ok(u.a.x === u.b.x || u.a.y === u.b.y, '路径必须正交');
    for (const [j, v] of segments.entries()) {
      if (j <= i) continue;
      const horizontal = u.a.y === u.b.y, otherHorizontal = v.a.y === v.b.y;
      if (horizontal === otherHorizontal) {
        const axis = horizontal ? 'x' : 'y', perpendicular = horizontal ? 'y' : 'x';
        if (u.a[perpendicular] !== v.a[perpendicular]) continue;
        const overlap = Math.min(Math.max(u.a[axis], u.b[axis]), Math.max(v.a[axis], v.b[axis])) - Math.max(Math.min(u.a[axis], u.b[axis]), Math.min(v.a[axis], v.b[axis]));
        assert.ok(overlap <= 0, '同一连接不能折返或重叠');
      } else if (j !== i + 1) {
        const p = {x: horizontal ? v.a.x : u.a.x, y: horizontal ? u.a.y : v.a.y};
        const on = (a: Point, b: Point) => p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x) && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
        assert.ok(!on(u.a, u.b) || !on(v.a, v.b), '同一连接不能自交');
      }
    }
  }
}

for (const direction of ['LR', 'RL'] as const) test(`纵向对齐的双向接口保留端点和四项硬约束（${direction}）`, async t => {
  const f = fixture(t);
  const objects = [
    {id: 'host', kind: 'node', label: '任务控制', ports: [{id: 'host.start', label: '启动', direction: 'out', width: 1}, {id: 'host.status', label: '状态', direction: 'in', width: 1}], interfaces: [{id: 'host.control', label: '控制', members: ['host.start', 'host.status']}]},
    {id: 'recorder', kind: 'node', label: '记录模块', ports: [{id: 'recorder.start', label: '启动', direction: 'in', width: 1}, {id: 'recorder.status', label: '状态', direction: 'out', width: 1}, {id: 'recorder.data', label: '数据', direction: 'out', width: 16}, {id: 'recorder.valid', label: '有效', direction: 'out', width: 1}], interfaces: [{id: 'recorder.control', label: '控制', members: ['recorder.start', 'recorder.status']}, {id: 'recorder.samples', label: '样本', members: ['recorder.data', 'recorder.valid']}]},
    {id: 'storage', kind: 'node', label: '存储端', ports: [{id: 'storage.data', label: '数据', direction: 'in', width: 16}, {id: 'storage.valid', label: '有效', direction: 'in', width: 1}], interfaces: [{id: 'storage.samples', label: '样本', members: ['storage.data', 'storage.valid']}]},
  ];
  const relations = [
    {id: 'start', kind: 'connection', class: 'control', label: '启动', endpoints: ['host.start', 'recorder.start'], direction: {sources: ['host.start'], targets: ['recorder.start']}},
    {id: 'status', kind: 'connection', class: 'event', label: '状态', endpoints: ['recorder.status', 'host.status'], direction: {sources: ['recorder.status'], targets: ['host.status']}},
    {id: 'data', kind: 'connection', class: 'data', label: '样本数据', endpoints: ['recorder.data', 'storage.data'], direction: {sources: ['recorder.data'], targets: ['storage.data']}},
    {id: 'valid', kind: 'connection', class: 'data', label: '有效标记', endpoints: ['recorder.valid', 'storage.valid'], direction: {sources: ['recorder.valid'], targets: ['storage.valid']}},
  ];
  f.edit('objects', d => d.objects = objects);
  f.edit('relations', d => d.relations = relations);
  f.edit('views', d => d.views = [{id: 'system', kind: 'architecture', include: {objects: ['host', 'recorder', 'storage'], relations: relations.map(r => r.id)}, display: {interfaceMode: 'collapsed', showInterfaceDetails: false}, layout: {direction, constraints: [
    {type: 'order', axis: 'y', nodes: ['host', 'recorder'], gap: 64},
    {type: 'align', axis: 'x', nodes: ['host', 'recorder']},
    {type: 'order', axis: 'x', nodes: ['recorder', 'storage'], gap: 80},
    {type: 'align', axis: 'y', nodes: ['recorder', 'storage']},
  ]}}]);
  f.edit('manifest', d => {d.irVersion = '1.2'; d.requiredFeatures = ['interface-groups', 'layout-intent']; d.entryDocuments = [];});
  const model = prepareInterfaceModel(f.load(), 'system')!, original = structuredClone(model);
  for (const mode of ['collapsed', 'expanded'] as const) {
    const state = {...initialInterfaceState(model), modes: Object.fromEntries(model.nodes.flatMap(n => n.interfaces!.map(i => [i.id, mode])))};
    const scene = await drawingInterfaceScene(model, state), drawing = scene.drawing!;
    const host = drawing.nodes.find(n => n.id === 'host')!, recorder = drawing.nodes.find(n => n.id === 'recorder')!, storage = drawing.nodes.find(n => n.id === 'storage')!;
    assert.ok(Math.abs(host.x + host.width / 2 - recorder.x - recorder.width / 2) < .001);
    assert.ok(Math.abs(recorder.y + recorder.height / 2 - storage.y - storage.height / 2) < .001);
    assert.ok(recorder.y >= host.y + host.height + 64);
    assert.ok(storage.x >= recorder.x + recorder.width + 80);
    assert.deepEqual(new Set(scene.nets.flatMap(n => n.sourceRelations!.map(r => r.id))), new Set(relations.map(r => r.id)));
    for (const connection of drawing.connections) for (const path of connection.paths) assertSimplePath(path.points);
    if (mode === 'expanded') {
      for (const relation of relations) {
        const connection = drawing.connections.find(c => c.id === relation.id)!, path = connection.paths[0].points;
        for (const [index, endpoint] of relation.endpoints.entries()) {
          const port = drawing.nodes.flatMap(n => n.ports).find(p => p.id === endpoint)!;
          const point = index === 0 ? path[0] : path.at(-1)!;
          assert.deepEqual(point, {x: port.x, y: port.y}, `${relation.id} 保留原端口 ${endpoint}`);
          assert.equal(connection.ends[index].port, endpoint);
        }
      }
      assert.equal((svg(scene, false).match(/data-relation="/g) ?? []).length, 4);
    } else assert.ok(svg(scene, false).includes('data-bundle="true"'));
  }
  assert.deepEqual(model, original, '求解和展开不得修改工程模型');
});

for (const direction of ['LR', 'RL'] as const) test(`双向控制接口的四种展开组合预留完整出线通道（${direction}）`, async t => {
  const f = fixture(t), members = ['start', 'status'];
  const objects = ['host', 'recorder'].map(id => ({id, kind: 'node', label: id === 'host' ? '任务控制' : '记录模块', ports: members.map((member, i) => ({id: `${id}.${member}`, label: i ? '状态' : '启动', width: 1, direction: (id === 'host') === (i === 0) ? 'out' : 'in'})), interfaces: [{id: id + '.control', label: '控制', members: members.map(member => `${id}.${member}`)}]}));
  const relations = members.map((id, i) => {const endpoints = i ? ['recorder.status', 'host.status'] : ['host.start', 'recorder.start'];return {id, kind: 'connection', class: i ? 'event' : 'control', label: i ? '状态' : '启动', endpoints, direction: {sources: [endpoints[0]], targets: [endpoints[1]]}};});
  f.edit('objects', d => d.objects = objects);
  f.edit('relations', d => d.relations = relations);
  f.edit('views', d => d.views = [{id: 'control', kind: 'interface', include: {objects: ['host.control', 'recorder.control'], relations: members}, display: {interfaceMode: 'collapsed', showInterfaceDetails: false}, layout: {direction, constraints: [{type: 'order', axis: 'x', nodes: ['host', 'recorder'], gap: 80}]}}]);
  f.edit('manifest', d => {d.irVersion = '1.2'; d.requiredFeatures = ['interface-groups', 'layout-intent']; d.entryDocuments = [];});
  const model = prepareInterfaceModel(f.load(), 'control')!, original = structuredClone(model);
  for (let mask = 0; mask < 4; mask++) {
    const state = {...initialInterfaceState(model), modes: {'host.control': mask & 1 ? 'expanded' as const : 'collapsed' as const, 'recorder.control': mask & 2 ? 'expanded' as const : 'collapsed' as const}};
    const scene = await drawingInterfaceScene(model, state), drawing = scene.drawing!;
    const host = drawing.nodes.find(n => n.id === 'host')!, recorder = drawing.nodes.find(n => n.id === 'recorder')!;
    assert.ok(recorder.x >= host.x + host.width + 80, `组合 ${mask} 保留模块顺序与最小间距`);
    assert.deepEqual(new Set(scene.nets.flatMap(n => n.sourceRelations!.map(r => r.id))), new Set(members));
    for (const connection of drawing.connections) for (const path of connection.paths) assertSimplePath(path.points);
    for (const relation of relations) {
      const net = scene.nets.find(n => n.sourceRelations!.some(r => r.id === relation.id))!;
      assert.deepEqual(net.sourceRelations!.find(r => r.id === relation.id), model.relations.find(r => r.id === relation.id));
      for (const endpoint of relation.endpoints) {
        const projected = net.endpointMap![relation.id][endpoint], branch = net.branches.find(b => b.endpoint === projected)!;
        const port = scene.nodes.flatMap(n => n.ports).find(p => p.id === projected)!;
        assert.deepEqual(branch.points[0], {x: port.x, y: port.y}, `组合 ${mask} 保留 ${endpoint} 的投影端点`);
        const originalPort = drawing.nodes.flatMap(n => n.ports).find(p => p.id === projected)!;
        assert.ok(originalPort.originIds.includes(endpoint), '临时槽位保留真实信号来源');
        if (state.modes[endpoint.startsWith('host.') ? 'host.control' : 'recorder.control'] === 'expanded') assert.equal(projected, endpoint);
      }
    }
    assert.ok(svg(scene, false).includes('<svg'));
  }
  assert.deepEqual(model, original, '单端展开不得修改工程模型');
});
