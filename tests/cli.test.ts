import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fixture, repository } from './helpers.ts';

function run(args: string[], cwd = repository) {
  const result = spawnSync(process.execPath, [join(repository, 'packages/cli/engdoc.ts'), ...args], { cwd, encoding: 'utf8', timeout: 10000 });
  assert.ifError(result.error);
  return result;
}

test('guide 无需项目配置，默认与 JSON 读取同一推荐指南',()=>{
 const plain=run(['guide']),json=run(['guide','--format','json']);
 assert.equal(plain.status,0,plain.stderr);assert.equal(json.status,0,json.stderr);
 assert.equal(JSON.parse(json.stdout).content,plain.stdout);
 assert.match(plain.stdout,/理解性内容与查询性内容/);
 assert.equal(run(['guide','--config','x']).status,2);
});
test('outline 返回章节树与源位置，不要求生成 HTML',t=>{
 const f=fixture(t);writeFileSync(join(f.root,'docs/book.mdoc'),'{% section id="parent" title="父章节" %}\n{% section id="child" title="子章节" %}\n## 详情\n{% /section %}\n{% /section %}');
 f.edit('manifest',d=>d.entryDocuments=['docs/book.mdoc']);
 const result=run(['outline','--config',join(f.root,'engdoc.config.js')]);assert.equal(result.status,0,result.stderr);
 const tree=JSON.parse(result.stdout);assert.equal(tree.chapters[0].children[0].label,'子章节');
 assert.equal(tree.chapters[0].children[0].children[0].source.file,'docs/book.mdoc');
 const plain=run(['outline','--config',join(f.root,'engdoc.config.js'),'--format','text']);
 assert.equal(plain.stdout,'父章节\n  子章节\n    详情\n');
 const short=run(['outline','--config',join(f.root,'engdoc.config.js'),'--id','parent','--depth','0']);assert.equal(short.status,0,short.stderr);assert.equal(JSON.parse(short.stdout).chapters[0].childrenOmitted,1);
 const branch=run(['outline','--config',join(f.root,'engdoc.config.js'),'--id','child','--depth','0','--format','text']);assert.equal(branch.status,0,branch.stderr);assert.match(branch.stdout,/子章节（另有 1 个子项）/);
 assert.equal(run(['outline','--config',join(f.root,'engdoc.config.js'),'--id','unknown']).status,3);assert.equal(run(['outline','--depth','11']).status,2);
});

test('CLI validate 输出纯 JSON 与正确退出码', t => {
  const f = fixture(t);
  const result = run(['validate', '--config', join(f.root, 'engdoc.config.js'), '--format', 'json'], f.workspace);
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stderr, '');
  assert.equal(JSON.parse(result.stdout).counts.connection, 6);
});
test('CLI 默认查询是 JSON，默认不展开，多端点完整', t => {
  const f = fixture(t); const result = run(['query', '--config', join(f.root, 'engdoc.config.js'), '--id', 'board:net.FLASH_SCK']);
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout); assert.equal(data.target.entity.endpoints.length, 3); assert.equal(data.expansion.items.length, 0);
});
test('CLI 显式配置的独立读取路径', t => {
  const f = fixture(t); const result = run(['query', '--config', join(f.root,'engdoc.config.js'), '--id', 'board:net.FLASH_SCK', '--depth', '1', '--format', 'json']);
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).expansion.items.length, 3);
});
test('CLI JSON 错误包含定位信息，stdout 不输出陈旧成功结果', t => {
  const f = fixture(t); const args = ['validate', '--config', join(f.root, 'engdoc.config.js'), '--format', 'json'];
  assert.equal(run(args).status, 0);
  f.edit('relations', d => d.relations[0].endpoints[2] = 'missing');
  const result = run(args);
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  const data = JSON.parse(result.stderr); assert.equal(data.valid, false);
  assert.ok(data.diagnostics.some((d: any) => d.code === 'REFERENCE_MISSING' && d.id === 'board:net.FLASH_SCK' && d.path === '/relations/0/endpoints/2'));
});
test('CLI 未知 ID 使用退出码 3', t => {
  const f = fixture(t); const result = run(['query', '--config', join(f.root, 'engdoc.config.js'), '--id', 'missing']);
  assert.equal(result.status, 3); assert.equal(JSON.parse(result.stderr).diagnostics[0].code, 'QUERY_NOT_FOUND');
});
const usageCases = [
  ['export'], ['validate', '--ir', 'x', '--config', 'x'],
  ['validate', '--config'], ['validate', '--config', 'x', '--unknown', 'x'],
  ['validate', '--config', 'x', '--config', 'x'], ['validate', '--config', 'x', '--format', 'yaml'],
  ['query'], ['query', '--config', 'x', '--id', 'a', '--depth', '-1'],
  ['query', '--config', 'x', '--id', 'a', '--depth', '1.5'], ['query', '--config', 'x', '--id', 'a', '--max-items', '0'],
  ['validate', '--config', 'x', '--project-root', 'x'],
];
for (const args of usageCases) test(`CLI 拒绝错误用法 ${args.join(' ') || '(空)'}`, () => assert.equal(run(args).status, 2));
test('CLI 文件不存在返回 1 且不伪装校验成功', () => {
  const result = run(['validate', '--config', '/nonexistent/engdoc.config.json', '--format', 'json']);
  assert.equal(result.status, 1); assert.equal(result.stdout, ''); assert.equal(JSON.parse(result.stderr).valid, false);
});
test('CLI 执行不修改项目源文件和文件时间，不使用构建缓存', t => {
  const f = fixture(t);
  const files = ['manifest', 'objects', 'relations', 'views'].map(n => join(f.ir, n + '.json'));
  const before = files.map(path => ({ bytes: readFileSync(path), mtime: statSync(path).mtimeMs }));
  assert.equal(run(['validate', '--config', join(f.root, 'engdoc.config.js')]).status, 0);
  assert.equal(run(['query', '--config', join(f.root, 'engdoc.config.js'), '--id', 'board:U1']).status, 0);
  files.forEach((path, i) => { assert.deepEqual(readFileSync(path), before[i].bytes); assert.equal(statSync(path).mtimeMs, before[i].mtime); });
});
test('CLI 直接重读相同路径的 IR，失败后不会回退旧查询', t => {
  const f = fixture(t); const file = join(f.ir, 'objects.json');
  const original = readFileSync(file, 'utf8');
  const args = ['query', '--config', join(f.root, 'engdoc.config.js'), '--id', 'board:U1.QSPI_CLK', '--format', 'json'];
  assert.equal(JSON.parse(run(args).stdout).target.entity.attributes.ball, 'A12');
  writeFileSync(file, original.replace('A12', 'Z99'));
  assert.equal(JSON.parse(run(args).stdout).target.entity.attributes.ball, 'Z99');
  writeFileSync(file, '{bad');
  const result = run(args); assert.equal(result.status, 1); assert.equal(result.stdout, '');
});
test('CLI 帮助、版本与可执行文件入口', () => {
  assert.match(run(['--help']).stdout, /不要求 manifest/);
  assert.match(run(['--version']).stdout, /1.0.0/);
  const executable = spawnSync(join(repository, 'packages/cli/engdoc.ts'), ['--version'], { encoding: 'utf8', timeout: 10000 });
  assert.equal(executable.status, 0, executable.stderr);
});
