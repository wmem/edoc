import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { validateSchema, checkSchemaDefinition } from '../packages/core/index.ts';
import { json, sample, expectCode } from './helpers.ts';

for (const [schema, resource] of [['manifest', 'manifest'], ['object', 'objects'], ['relation', 'relations'], ['view', 'views']] as const) {
  test(`${schema} Schema 接受完整演示正例`, () => assert.deepEqual(validateSchema(schema, json(join(sample, 'ir', resource + '.json'))), []));
}
test('config Schema 正例', () => assert.deepEqual(validateSchema('config', json(join(sample, 'engdoc.config.json'))), []));

const cases: [string, Parameters<typeof validateSchema>[0], any, string][] = [
  ['manifest 缺少 projectId', 'manifest', { irVersion: '1.0', resources: [], entryDocuments: [] }, '/projectId'],
  ['未知资源类型不能忽略', 'manifest', { irVersion: '1.0', projectId: 'p', resources: [{ type: 'unknown', path: 't.json' }], entryDocuments: [] }, '/resources/0/type'],
  ['端口方向必须显式合法', 'object', { objects: [{ id: 'a', kind: 'node', label: 'A', ports: [{ id: 'a.p', label: 'p', direction: 'input' }] }] }, '/objects/0/ports/0/direction'],
  ['未知对象类型', 'object', { objects: [{ id: 'a', kind: 'magic', label: 'A' }] }, '/objects/0'],
  ['空 ID', 'object', { objects: [{ id: '', kind: 'node', label: 'A' }] }, '/objects/0/id'],
  ['全空白 ID', 'object', { objects: [{ id: '   ', kind: 'node', label: 'A' }] }, '/objects/0/id'],
  ['非整数 width', 'object', { objects: [{ id: 'a', kind: 'node', label: 'A', ports: [{ id: 'a.p', label: 'p', direction: 'in', width: 1.5 }] }] }, '/objects/0/ports/0/width'],
  ['零宽度', 'object', { objects: [{ id: 'a', kind: 'node', label: 'A', ports: [{ id: 'a.p', label: 'p', direction: 'in', width: 0 }] }] }, '/objects/0/ports/0/width'],
  ['单端点不是 Connection', 'relation', { relations: [{ id: 'n', kind: 'connection', class: 'clock', endpoints: ['a'] }] }, '/relations/0/endpoints'],
  ['重复端点不能伪装成多端点', 'relation', { relations: [{ id: 'n', kind: 'connection', class: 'clock', endpoints: ['a', 'a'] }] }, '/relations/0/endpoints'],
  ['视图不能重复保存 endpoints', 'view', { views: [{ id: 'v', kind: 'wiring', include: { objects: [], relations: [] }, endpoints: ['a', 'b'] }] }, '/views/0/endpoints'],
  ['视图不能写任意 HTML', 'view', { views: [{ id: 'v', kind: 'wiring', include: { objects: [], relations: [] }, html: '<script>' }] }, '/views/0/html'],
  ['source.line 从 1 开始', 'object', { objects: [{ id: 'a', kind: 'node', label: 'A', source: { file: 'a.sv', line: 0 } }] }, '/objects/0/source/line'],
  ['配置未知字段拒绝', 'config', { projectId: 'p', irDirectory: 'ir', adapter: ['unknown'] }, '/adapter'],
];
for (const [name, schema, data, pointer] of cases) {
  test(name, () => {
    const errors = validateSchema(schema, data, 'fixture.json');
    assert.ok(errors.some(e => e.path === pointer), JSON.stringify(errors));
    assert.ok(errors.every(e => e.file === 'fixture.json' && e.code === 'SCHEMA'));
  });
}

test('未知信息与领域扩展原样保留', () => {
  assert.deepEqual(validateSchema('object', { objects: [{ id: 'a', kind: 'node', label: 'A',
    attributes: { protocol: 'my-custom-protocol' }, ports: [{ id: 'a.p', label: 'p', direction: 'unknown', widthExpr: 'DATA_WIDTH', parameterContext: { DATA_WIDTH: 'unresolved' }, attributes: { ball: 'unknown' } }] }] }), []);
});
test('自定义连接 class 与双向端点可接受', () => {
  assert.deepEqual(validateSchema('relation', { relations: [{ id: 'n', kind: 'connection', class: 'project-class', endpoints: ['a', 'b', 'c'] }] }), []);
});
test('正式 Schema 支持标准关键字并拒绝未知断言', () => {
  expectCode(() => checkSchemaDefinition({ type: 'string', unknownKeyword: 10 }), 'SCHEMA_KEYWORD');
  checkSchemaDefinition({type:'string',maxLength:10});
});
test('视图 include 中的 ID 不得重复', () => {
  assert.ok(validateSchema('view', { views: [{ id: 'v', kind: 'wiring', include: { objects: ['a', 'a'], relations: [] } }] }).length > 0);
});
