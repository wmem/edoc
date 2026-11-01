import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { loadConfig, loadIR, summary } from '../packages/core/index.ts';
import { fixture, expectCode, json, save } from './helpers.ts';

test('完整样例加载、统计及端口归属', t => {
  const f = fixture(t); const graph = f.load();
  assert.deepEqual(summary(graph).counts, { node: 3, port: 13, group: 1, connection: 6, view: 1 });
  assert.equal(graph.index.get('board:U1.QSPI_CLK')?.ownerId, 'board:U1');
  assert.equal(graph.connections.get('board:net.FLASH_SCK')?.endpoints.length, 3);
});
test('跨分片全局稳定 ID 与正向引用', t => {
  const f = fixture(t);
  const data = json(join(f.ir, 'objects.json'));
  save(join(f.ir, 'part-1.json'), { objects: [data.objects[0]] });
  save(join(f.ir, 'part-2.json'), { objects: data.objects.slice(1) });
  f.edit('manifest', m => m.resources = [{ type: 'relations', path: 'relations.json' }, { type: 'objects', path: 'part-1.json' }, { type: 'views', path: 'views.json' }, { type: 'objects', path: 'part-2.json' }]);
  assert.equal(f.load().index.size, 24);
});

const badCases: [string, string, (data: any) => void, string][] = [
  ['跨类型重复 ID', 'objects', d => d.objects[1].id = d.objects[0].ports[0].id, 'DUPLICATE_ID'],
  ['端口重复 ID', 'objects', d => d.objects[1].ports[0].id = d.objects[0].ports[0].id, 'DUPLICATE_ID'],
  ['父节点不存在', 'objects', d => d.objects[0].parentId = 'missing', 'REFERENCE_MISSING'],
  ['父引用不能指向端口', 'objects', d => d.objects[0].parentId = 'board:U5.CLK', 'REFERENCE_TYPE'],
  ['层级自循环', 'objects', d => d.objects[0].parentId = d.objects[0].id, 'RELATION_CYCLE'],
  ['多节点层级循环', 'objects', d => { d.objects[0].parentId = d.objects[1].id; d.objects[1].parentId = d.objects[0].id; }, 'RELATION_CYCLE'],
  ['分组不能包含自身', 'objects', d => d.objects[3].members.push(d.objects[3].id), 'RELATION_CYCLE'],
  ['分组成员缺失', 'objects', d => d.objects[3].members.push('missing'), 'REFERENCE_MISSING'],
  ['端口 groupId 必须指向分组', 'objects', d => d.objects[0].ports[0].groupId = 'board:U5', 'REFERENCE_TYPE'],
  ['端口时钟域引用存在性', 'objects', d => d.objects[0].ports[0].clockDomainId = 'missing', 'REFERENCE_MISSING'],
  ['悬空第三端点', 'relations', d => d.relations[0].endpoints[2] = 'missing', 'REFERENCE_MISSING'],
  ['连接端点不能指向逻辑分组', 'relations', d => d.relations[0].endpoints[2] = 'board:qspi', 'REFERENCE_TYPE'],
  ['方向必须属于原连接', 'relations', d => d.relations[0].direction.sources.push('board:U1.QSPI_DQ0'), 'DIRECTION_ENDPOINT'],
  ['方向源目标不混淆', 'relations', d => d.relations[0].direction.targets.push(d.relations[0].direction.sources[0]), 'DIRECTION_OVERLAP'],
  ['视图缺失对象', 'views', d => d.views[0].include.objects.push('missing'), 'REFERENCE_MISSING'],
  ['视图对象与关系不能混用', 'views', d => d.views[0].include.relations.push('board:U1'), 'REFERENCE_TYPE'],
  ['端口排序必须是端口', 'views', d => d.views[0].layout.portOrder.push('board:U1'), 'REFERENCE_TYPE'],
  ['折叠组引用不存在', 'views', d => d.views[0].display.collapsedGroups = ['missing'], 'REFERENCE_MISSING'],
  ['布局位置不能重复', 'views', d => d.views[0].layout.positions = [{ objectId: 'board:U1', x: 0, y: 0 }, { objectId: 'board:U1', x: 1, y: 2 }], 'POSITION_DUPLICATE'],
  ['未知 major', 'manifest', d => d.irVersion = '2.0', 'IR_VERSION'],
  ['未支持 major 不假装兼容', 'manifest', d => d.irVersion = '7.1', 'IR_VERSION'],
  ['同一分片不能重复', 'manifest', d => d.resources.push(d.resources[0]), 'DUPLICATE_RESOURCE'],
];
for (const [name, resource, mutate, code] of badCases) test(name, t => {
  const f = fixture(t); f.edit(resource, mutate); expectCode(f.load, code);
});

test('分组共享子组是 DAG，不误判成循环', t => {
  const f = fixture(t);
  f.edit('objects', d => d.objects.push(
    { id: 'g:leaf', kind: 'group', label: 'leaf', members: ['board:U1'] },
    { id: 'g:left', kind: 'group', label: 'left', members: ['g:leaf'] },
    { id: 'g:right', kind: 'group', label: 'right', members: ['g:leaf'] },
    { id: 'g:root', kind: 'group', label: 'root', members: ['g:left', 'g:right'] }));
  assert.equal(f.load().index.size, 28);
});
test('节点层级与逻辑分组独立', t => {
  const f = fixture(t); f.edit('objects', d => d.objects[1].parentId = 'board:U1');
  assert.equal(f.load().index.get('board:U5')?.type, 'node');
});
test('错误包含文件、对象 ID、JSON Pointer', t => {
  const f = fixture(t); f.edit('relations', d => d.relations[0].endpoints[2] = 'missing');
  try { f.load(); assert.fail('必须拒绝'); }
  catch (e: any) {
    const error = e.diagnostics.find((d: any) => d.code === 'REFERENCE_MISSING');
    assert.equal(error.file, join(f.ir, 'relations.json'));
    assert.equal(error.path, '/relations/0/endpoints/2');
    assert.equal(error.id, 'board:net.FLASH_SCK');
  }
});
test('资源不存在与格式错误显式失败', t => {
  const f = fixture(t);
  rmSync(join(f.ir, 'relations.json')); expectCode(f.load, 'FILE_MISSING');
  writeFileSync(join(f.ir, 'relations.json'), '{invalid'); expectCode(f.load, 'JSON_PARSE');
});
test('拒绝非 UTF-8 与溢出数字', t => {
  const f = fixture(t);
  writeFileSync(join(f.ir, 'relations.json'), Buffer.from([0xff])); expectCode(f.load, 'JSON_PARSE');
  writeFileSync(join(f.ir, 'relations.json'), '{"relations":[],"n":1e400}'); expectCode(f.load, 'JSON_NUMBER');
});
test('拒绝超大分片与目录冒充文件', t => {
  const f = fixture(t);
  writeFileSync(join(f.ir, 'relations.json'), ' '.repeat(16 * 1024 * 1024 + 1)); expectCode(f.load, 'FILE_SIZE');
  rmSync(join(f.ir, 'relations.json')); mkdirSync(join(f.ir, 'relations.json')); expectCode(f.load, 'FILE_TYPE');
});
for (const path of ['../../outside.json', '/tmp/outside.json', 'https://example.com/facts.json', 'C:\\outside.json']) {
  test(`资源范围保护：${path}`, t => {
    const f = fixture(t); f.edit('manifest', d => d.resources[0].path = path); expectCode(f.load, 'PATH_SCOPE');
  });
}
test('禁止资源符号链接逃逸及同前缀目录绕过', t => {
  const f = fixture(t);
  const sibling = join(f.workspace, 'project-other'); mkdirSync(sibling);
  save(join(sibling, 'outside.json'), { objects: [] });
  symlinkSync(join(sibling, 'outside.json'), join(f.ir, 'link.json'));
  f.edit('manifest', d => d.resources[0].path = 'link.json'); expectCode(f.load, 'PATH_SCOPE');
});
test('文档入口越界、缺失以及来源越界', t => {
  const f = fixture(t);
  f.edit('manifest', d => d.entryDocuments = ['../secret.md']); expectCode(f.load, 'PATH_SCOPE', '/entryDocuments/0');
  f.edit('manifest', d => d.entryDocuments = ['missing.md']); expectCode(f.load, 'FILE_MISSING', '/entryDocuments/0');
  f.edit('manifest', d => d.entryDocuments = []);
  f.edit('objects', d => d.objects[0].source.file = '../secret.sv'); expectCode(f.load, 'PATH_SCOPE', '/objects/0/source/file');
});
test('尚不可用的来源文件允许追溯，但不能通过目录 symlink 越界', t => {
  const f = fixture(t);
  f.edit('objects', d => d.objects[0].source.file = 'unavailable/project.sv'); assert.ok(f.load());
  const outside = join(f.workspace, 'outside'); mkdirSync(outside);
  symlinkSync(outside, join(f.root, 'unavailable'));
  expectCode(f.load, 'PATH_SCOPE');
});
test('配置与 manifest 项目 ID 一致', t => {
  const f = fixture(t); const config = loadConfig(join(f.root, 'engdoc.config.json'));
  assert.equal(loadIR(config.irDirectory, config).manifest.projectId, 'demo-board');
  expectCode(() => loadIR(f.ir, { projectRoot: f.root, projectId: 'different' }), 'PROJECT_ID');
});
test('配置 IR 路径不能跳出工程', t => {
  const f = fixture(t); save(join(f.root, 'engdoc.config.json'), { projectId: 'p', irDirectory: '../elsewhere' });
  expectCode(() => loadConfig(join(f.root, 'engdoc.config.json')), 'PATH_SCOPE');
});
test('未随附来源也不能通过悬空符号链接逃逸', t => {
  const f = fixture(t);
  symlinkSync(join(f.workspace, 'not-created'), join(f.root, 'dangling'));
  f.edit('objects', d => d.objects[0].source.file = 'dangling/top.sv');
  expectCode(f.load, 'PATH_SCOPE', '/objects/0/source/file');
});
test('资源结构错误有定位，不能进入类型不完整的关系遍历', t => {
  const f = fixture(t);
  f.edit('objects', d => d.objects[0].ports = 'invalid');
  expectCode(f.load, 'SCHEMA', '/objects/0/ports');
});
