import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import {graphFromResources} from '../packages/core/graph.ts';
import type {ResourceType} from '../packages/core/types.ts';
import {queryElement} from '../packages/core/query.ts';
import {parseRoute} from '../packages/core/routes.ts';
import {registerMapProjection} from '../packages/extensions/register-map/model.ts';
import {registerMapTable, registerMapSVG} from '../packages/extensions/register-map/render.ts';
import {resolveProjectConfig, loadProject} from '../packages/core/project.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';

const reg = (id: string) => ({id, kind: 'register', label: id === 'r' ? '控制寄存器' : '其他寄存器', description: '控制采样。', width: 32, fields: []});
function data() {
  return {registers: [reg('r'), reg('other')], registerBlocks: [
    {id: 'leaf', kind: 'register-block', label: '端口块', description: '端口控制。', entries: [{id: 'reg', label: '采样使能', register: 'r', offset: '0', count: 3, stride: '0x8'}]},
    {id: 'root', kind: 'register-block', label: '设备块', entries: [{id: 'child', label: '采样端口', block: 'leaf', offset: '0x20'}]}
  ], addressSpaces: [{id: 'space', kind: 'address-space', addressUnitBits: 8, mappings: [{id: 'device', label: '通道', block: 'root', base: '0x1000', count: 2, stride: '0x100'}]}]};
}
const graph = (value: Record<string, unknown>) => graphFromResources(Object.entries(value).map(([type, items]) => ({type: type as ResourceType, data: {[type]: items}, file: 'facts.json'})), {projectId: 'test', irVersion: '1.8', resources: [], entryDocuments: [], requiredFeatures: ['registers', 'register-maps']}, {root: process.cwd(), strict: true});
function project(t: {after: (fn: () => void) => void}, value: unknown, body: string) {
  const root = mkdtempSync(join(tmpdir(), 'edoc-register-map-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'docs/ir'), {recursive: true});
  writeFileSync(join(root, 'docs/edoc.config.js'), 'export default {};');
  writeFileSync(join(root, 'docs/ir/facts.json'), JSON.stringify(value));
  const write = (text: string) => writeFileSync(join(root, 'docs/index.mdoc'), text);
  write(body);
  return {write, load: async () => loadProject(await resolveProjectConfig(undefined, root))};
}
test('区域内偏移以映射数组实例为基准，嵌套与数组身份不变', () => {
  const g = graph(data()), p = registerMapProjection(g, 'space');
  const row = p.rows.find(row => JSON.stringify(row.path) === '["device",1,"child","reg",2]')!;
  assert.equal(row.address, '0x1130');
  assert.equal(row.offset, '0x1130', '保留旧 offset 语义');
  assert.equal(row.regionOffset, '0x30');
  assert.deepEqual(row.pathLabels, ['通道[1]', '采样端口', '采样使能[2]']);
  assert.equal(row.description, '控制采样。');
  assert.equal((queryElement(g, 'space', JSON.stringify(row.path)) as any).address, row.address);
  assert.equal(p.total, '6');
  assert.equal(p.intervals[0].label, '通道');
  assert.equal(p.intervals[0].start, '0x1000');
});
test('筛选在展开前跳过海量不匹配子块，截断与总数按所选定义计算', {timeout: 3000}, () => {
  const d = data();
  d.registerBlocks.push({id: 'unmatched', kind: 'register-block', label: '其他块', entries: [{id: 'other', register: 'other', offset: '0'}]} as any);
  d.registerBlocks[1].entries = [
    {id: 'huge', block: 'unmatched', offset: '0', count: 1000000000, stride: '8'},
    {id: 'matched', block: 'leaf', offset: '0x1000000000'}
  ] as any;
  d.addressSpaces[0].mappings[0].count = 1;
  const g = graph(d), p = registerMapProjection(g, 'space', 2, {register: 'r'});
  assert.equal(p.total, '3'); assert.equal(p.rows.length, 2); assert.equal(p.truncated, true);
  assert.ok(p.rows.every(row => row.definition === 'r'));
});
test('地址区域表继承空间单位且不枚举区域数组，名称用途来自原定义', () => {
  const d = data(); d.addressSpaces[0].addressUnitBits = 32;
  d.addressSpaces[0].mappings[0].count = 1000000000;
  const g = graph(d), p = registerMapProjection(g, 'space', 2);
  assert.equal(p.rows[0].span, '0x1'); assert.equal(p.addressUnitBits, 32);
  const html = registerMapTable(g, 'space', {mode: 'regions'});
  assert.match(html, /起始地址/); assert.match(html, /1000000000 个实例/);
  assert.equal((html.match(/<tbody><tr>/g) ?? []).length, 1);
  const block = registerMapTable(g, 'leaf', {mode: 'regions'});
  assert.match(block, /起始偏移/);
});
test('显式定义链接、遗漏回退和原型同名 ID 均生成有效路由', () => {
  const d = {registers: [reg('toString'), reg('constructor')], registerBlocks: [{id: 'b', kind: 'register-block', entries: [{id: 'a', register: 'toString', offset: '0'}, {id: 'b', register: 'constructor', offset: '4'}]}]};
  const g = graph(d);
  for (const definitions of [{}, {toString: 'definition'}]) {
    const html = registerMapTable(g, 'b', {mode: 'registers', definitions} as any);
    const xml = new DOMParser().parseFromString('<html>' + html + '</html>', 'text/html');
    const routes = Array.from(xml.getElementsByTagName('a')).map(a => parseRoute(a.getAttribute('href')!)!.id);
    assert.deepEqual(routes, Object.hasOwn(definitions, 'toString') ? ['definition', 'constructor'] : ['toString', 'constructor']);
  }
});
test('呈现模式隔离且显式定义目标严格校验，包括隐藏内容', async t => {
  const d = data();
  const body = '{% section id="definition" title="定义" %}说明。{% /section %}\n{% register-map id="space" mode="regions" /%}\n{% register-map id="space" mode="registers" definitions={"r":"definition"} /%}';
  const p = project(t, d, body), loaded = await p.load(), rendered = await renderDocument(loaded.graph, '手册');
  assert.ok(!rendered.chapters.includes('<svg'), '纯表不生成无关 SVG');
  assert.match(rendered.chapters, /data-map-mode="regions"/); assert.match(rendered.chapters, /data-map-mode="registers"/);
  p.write(body + '\n{% register-map id="space" /%}');
  const mixed = await renderDocument((await p.load()).graph, '手册');
  assert.equal((mixed.chapters.match(/data-engineering-figure=/g) ?? []).length, 1, '同 ID 的纯表与默认图互不污染');
  for (const attrs of ['register=""', 'register=" "', 'register="other"', 'definitions={"other":"definition"}', 'definitions={"r":"r"}', 'definitions={"r":"missing"}']) {
    p.write('{% section id="definition" title="定义" %}{% /section %}\n{% tabs %}{% tab name="显示" %}说明。{% /tab %}{% tab name="隐藏" %}{% register-map id="space" mode="registers" ' + attrs + ' /%}{% /tab %}{% /tabs %}');
    await assert.rejects(p.load, (error: any) => error.diagnostics?.some((d: any) => d.code === 'DOCUMENT_REFERENCE'), attrs);
  }
  for (const mode of ['all', 'regions']) {
    p.write('{% register-map id="space" mode="' + mode + '" register="r" /%}');
    await assert.rejects(p.load, /DOCUMENT_REFERENCE/);
  }
});
test('完整 FPGA 主例的区域、四个定义和复位行为同源', () => {
  const d = JSON.parse(readFileSync('docs/ir/authoring/fpga-register-handbook.json', 'utf8')), g = graph(d);
  const p = registerMapProjection(g, 'fpga:csr');
  assert.deepEqual(p.intervals.map(range => [range.start, range.end]), [['0x40000000', '0x400000FF'], ['0x40000100', '0x400001FF']]);
  assert.deepEqual(p.rows.map(row => [row.definition, row.regionOffset, row.address]), [['fpga:control', '0x0', '0x40000000'], ['fpga:version', '0x4', '0x40000004'], ['fpga:status', '0x0', '0x40000100'], ['fpga:threshold', '0x4', '0x40000104']]);
  const status = d.registers.find((r: any) => r.id === 'fpga:status');
  for (const id of ['fpga:status.active', 'fpga:status.count']) assert.deepEqual(status.fields.find((field: any) => field.id === id).reset, {value: '0'});
  for (const register of d.registers) {
    assert.equal(register.fields.reduce((bits: number, field: any) => bits + field.msb - field.lsb + 1, 0), 32);
    for (const reserved of register.fields.filter((field: any) => field.id.endsWith('.reserved'))) {
      assert.equal(reserved.access, 'RO');assert.deepEqual(reserved.reset, {value: '0'});assert.match(reserved.description, /写入忽略/);
    }
  }
  assert.match(registerMapSVG(g, 'fpga:csr'), /全局控制区/);
});
