import test from 'node:test';
import assert from 'node:assert/strict';
import { query } from '../packages/core/index.ts';
import { fixture, expectCode } from './helpers.ts';

test('默认查询保留完整三端点，不自动深度展开', t => {
  const f = fixture(t); const result = query(f.load(), 'board:net.FLASH_SCK');
  assert.deepEqual((result.target.entity as any).endpoints, ['board:U1.QSPI_CLK', 'board:U5.CLK', 'board:J1.SCK']);
  assert.deepEqual(result.expansion.items, []);
  assert.equal(result.expansion.depth, 0);
  assert.equal(result.target.location.path, '/relations/0');
  assert.equal(result.target.entity.source?.file, 'ir/relations.json');
});
test('显式深度 1 解析全部三端点与 Ball/Pin', t => {
  const f = fixture(t); const result = query(f.load(), 'board:net.FLASH_SCK', { depth: 1 });
  assert.equal(result.expansion.items.length, 3);
  assert.equal((result.expansion.items[0].entity as any).attributes.ball, 'A12');
  assert.equal((result.expansion.items[1].entity as any).attributes.pin, '6');
  assert.equal(result.expansion.items[2].id, 'board:J1.SCK');
  assert.equal(result.expansion.truncated, false);
});
test('查询第三端点反向找到原来一条 Net，节点查询也保留它', t => {
  const graph = fixture(t).load();
  for (const id of ['board:J1.SCK', 'board:J1']) {
    const result = query(graph, id);
    assert.equal(result.directRelations.length, 1);
    assert.equal(result.directRelations[0].id, 'board:net.FLASH_SCK');
    assert.equal(result.directRelations[0].endpoints.length, 3);
  }
});
test('节点查询只包含直接连接，不加载无关视图', t => {
  const result = query(fixture(t).load(), 'board:U1');
  assert.equal(result.directRelations.length, 6);
  assert.ok(!JSON.stringify(result).includes('board:flash-wiring'));
});
test('label 重命名不改变 ID、端口关系或来源', t => {
  const f = fixture(t); const before = query(f.load(), 'board:U1.QSPI_CLK');
  f.edit('objects', d => { d.objects[0].label = '新标题'; d.objects[0].ports[0].label = '新端口显示名'; });
  const after = query(f.load(), 'board:U1.QSPI_CLK');
  assert.equal(after.target.id, before.target.id);
  assert.equal((after.target.entity as any).label, '新端口显示名');
  assert.deepEqual(after.directRelations, before.directRelations);
});
test('唯一事实更改后新查询立即更新，视图与连线不需复制值', t => {
  const f = fixture(t);
  const before = f.load();
  const oldView = query(before, 'board:flash-wiring');
  f.edit('objects', d => d.objects[0].ports[0].attributes.ball = 'Z99');
  const after = f.load();
  assert.equal((query(after, 'board:U1.QSPI_CLK').target.entity as any).attributes.ball, 'Z99');
  assert.deepEqual(query(after, 'board:flash-wiring'), oldView);
  assert.deepEqual(after.connections.get('board:net.FLASH_SCK'), before.connections.get('board:net.FLASH_SCK'));
});
test('未显示对象仍可查询，过滤只改变视图', t => {
  const f = fixture(t);
  f.edit('views', d => { d.views[0].include.objects = ['board:U1']; d.views[0].include.relations = []; });
  assert.equal(query(f.load(), 'board:J1.SCK').target.id, 'board:J1.SCK');
});
test('深度上限、查询结果限额与截断显式可见', t => {
  const graph = fixture(t).load();
  const small = query(graph, 'board:net.FLASH_SCK', { depth: 1, maxItems: 1 });
  assert.equal(small.expansion.items.length, 1); assert.equal(small.expansion.truncated, true);
  assert.equal((small.target.entity as any).endpoints.length, 3);
  const deep = query(graph, 'board:U1', { depth: 10 });
  assert.equal(new Set(deep.expansion.items.map(i => i.id)).size, deep.expansion.items.length);
  assert.ok(!deep.expansion.items.some(i => i.id === 'board:U1'));
  for (const depth of [-1, 1.5, 11, NaN]) expectCode(() => query(graph, 'board:U1', { depth }), 'QUERY_DEPTH');
  for (const maxItems of [0, 1.5, 10001]) expectCode(() => query(graph, 'board:U1', { maxItems }), 'QUERY_LIMIT');
});
test('分组与视图可按需展开工程 ID', t => {
  const graph = fixture(t).load();
  assert.equal(query(graph, 'board:qspi', { depth: 1 }).expansion.items.length, 12);
  const view = query(graph, 'board:flash-wiring', { depth: 1 });
  assert.ok(view.expansion.items.some(i => i.id === 'board:net.FLASH_SCK'));
});
test('查询未知 ID 失败', t => {
  expectCode(() => query(fixture(t).load(), 'missing'), 'QUERY_NOT_FOUND');
});
