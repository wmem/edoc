import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import Markdoc from '@markdoc/markdoc';
import {graphFromResources} from '../packages/core/graph.ts';
import type {ResourceType, Sequence} from '../packages/core/types.ts';
import {sequenceElements} from '../packages/extensions/sequence/types.ts';
import {sequenceProjection} from '../packages/extensions/sequence/model.ts';
import {sequenceSVG} from '../packages/extensions/sequence/render.ts';
import {binaryProjection} from '../packages/extensions/binary-layout/model.ts';
import {binaryFieldTable, binarySVG} from '../packages/extensions/binary-layout/render.ts';
import {repository} from './helpers.ts';
const read = (file: string) => JSON.parse(readFileSync(join(repository, file), 'utf8'));
function tutorialData() {
  const result: Record<string, any[]> = {};
  for (const file of ['sequences', 'binary-layouts']) {
    for (const [type, values] of Object.entries(read('docs/ir/authoring/' + file + '.json'))) {
      result[type] = [...(result[type] ?? []), ...values as any[]];
    }
  }
  return result;
}
function graph(data: Record<string, any[]>) {
  return graphFromResources(Object.entries(data).map(([type, values]) => ({
    type: type as ResourceType, data: {[type]: values}, file: 'tutorial.json'
  })), {projectId: 'protocol', irVersion: '2.0', resources: [], entryDocuments: [], requiredFeatures: ['sequences', 'binary-layouts']}, {root: repository, strict: true});
}

test('升级规范区分逐块推进与有限尝试，成功和失败是互斥的最终响应', () => {
  const data = tutorialData(), g = graph(data), model = g.index.get('seq:upgrade')!.entity as Sequence;
  const elements = new Map(sequenceElements(model).map(item => [item.element.id, item.element as any]));
  const outer = elements.get('write-loop'), attempts = elements.get('attempt-loop');
  assert.equal(outer.kind, 'loop'); assert.equal(outer.max, undefined, '不能把三次尝试错误应用到整次升级的分块数量');
  assert.equal(attempts.min, 1); assert.equal(attempts.max, 3);
  assert.equal(outer.steps[0], attempts);
  assert.match(attempts.guard, /尚未确认/); assert.match(attempts.guard, /收到块确认即退出/);
  assert.match(outer.guard, /升级尚未失败/);
  for (const id of ['ack', 'nack']) assert.equal(elements.get(id).replyTo, 'block');
  assert.equal(elements.get('begin').protocol, 'binary:packet'); assert.equal(elements.get('block').protocol, 'binary:packet');
  const projection = sequenceProjection(model);
  const done = projection.events.find(event => event.id === 'done:send')!;
  const failed = projection.events.find(event => event.id === 'failed:send')!;
  assert.equal(done.branch.outcome, 'success'); assert.equal(failed.branch.outcome, 'failure');
  assert.equal(elements.get('done').replyTo, 'begin'); assert.equal(elements.get('failed').replyTo, 'begin');
  assert.ok(!projection.ordering.some(edge => edge.from === failed.id && edge.to === done.id));
  assert.ok(!model.steps.some(step => step.id === 'done' || step.id === 'failed'), '最终消息不能位于分支外无条件执行');
  const full = sequenceSVG(g, model, g.index.get('view:upgrade')!.entity as any);
  assert.match(full, /升级成功/); assert.match(full, /升级失败/); assert.match(full, /最多 3 次尝试/);
});

test('时序概览保留两种结局且紧凑，长消息与多行注释有完整占位', () => {
  const g = graph(tutorialData()), model = g.index.get('seq:upgrade')!.entity as Sequence;
  const overview = sequenceSVG(g, model, g.index.get('view:upgrade-overview')!.entity as any);
  const height = Number(overview.match(/viewBox="0 0 [\d.]+ ([\d.]+)"/)![1]);
  assert.ok(height <= 700, '概览应在普通正文视口内呈现完整生命周期');
  assert.match(overview, /升级成功/); assert.match(overview, /升级失败：停止写入/);
  assert.match(overview, /ref · 升级鉴权子交互/); assert.match(overview, /par · 进度通知与温度监测 · 已折叠/);
  assert.ok(!overview.includes('data-local="block"')); assert.ok(!overview.includes('data-local="authenticate/challenge"'));
  const sample: Sequence = {id: 'wrapping', kind: 'sequence', participants: [{id: 'a'}, {id: 'b'}], steps: [
    {id: 'long', from: 'a', to: 'b', label: '校验失败，按剩余次数重传当前数据块并等待确认'},
    {id: 'note', kind: 'note', on: ['b'], text: '标记升级失败并停止分块，不再发送下一块。'},
    {id: 'next', from: 'b', to: 'a', label: '最终结果'}
  ]};
  const rendered = sequenceSVG(g, sample);
  const group = (id: string) => rendered.match(new RegExp('<g data-local="' + id + '">([\\s\\S]*?)</g>'))![1];
  const baselines = (group: string) => [...group.matchAll(/<text[^>]* y="([\d.]+)"/g)].map(match => Number(match[1]));
  const messageYs = baselines(group('long'));
  assert.ok(messageYs.length > 1);
  assert.ok(messageYs.slice(1).every((y, i) => y - messageYs[i] >= 24), '中文多行消息必须留足字体行距');
  const note = group('note'), noteYs = baselines(note);
  const box = note.match(/<rect[^>]* y="([\d.]+)"[^>]* height="([\d.]+)"/)!;
  const top = Number(box[1]), bottom = top + Number(box[2]);
  assert.ok(noteYs.length >= 3);
  assert.ok(noteYs[0] >= top + 20 && noteYs.at(-1)! <= bottom - 10);
  assert.ok(Math.min(...baselines(group('next'))) >= bottom + 18, '后续消息不能压住多行注释');
});

test('引用片段名称优先使用调用处声明，再用被引用模型名称，最后保留模型ID', () => {
  for (const [stepLabel, modelLabel, expected] of [
    ['调用处鉴权', '升级鉴权子交互', '调用处鉴权'],
    [undefined, '升级鉴权子交互', '升级鉴权子交互'],
    [undefined, undefined, 'seq:auth']
  ]) {
    const data = tutorialData();
    const model = data.sequences.find(sequence => sequence.id === 'seq:upgrade') as Sequence;
    const target = data.sequences.find(sequence => sequence.id === 'seq:auth');
    target.label = modelLabel;
    const call = model.steps.find(step => step.id === 'authenticate')!;
    call.label = stepLabel;
    const g = graph(data);
    for (const expandedCalls of [[], ['authenticate']]) {
      const rendered = sequenceSVG(g, model, {expandedCalls});
      assert.ok(rendered.includes('ref · ' + expected + '</text>'));
    }
  }
});

test('字段声明、枚举和所属模型解释规则同源呈现，字段覆盖及未知不被外层污染', () => {
  const g = graph({binaryLayouts: [
    {id: 'parent', kind: 'binary-layout', byteOrder: 'big', bitOrder: 'msb-first', fields: [
      {id: 'fixed', label: '固定头标记', size: 8, value: '0xA5', enums: {'0xA5': '起始 <标记>'}},
      {id: 'override', label: '局部小端字段', size: 16, byteOrder: 'little', bitOrder: 'lsb-first'},
      {id: 'child-ref', kind: 'ref', model: 'child'}
    ]},
    {id: 'child', kind: 'binary-layout', fields: [{id: 'unknown', label: '未声明解释规则', size: 8, value: '0'}]}
  ]});
  const p = binaryProjection(g, 'parent'), fixed = p.rows.find(row => row.id === 'fixed')!, override = p.rows.find(row => row.id === 'override')!, child = p.rows.find(row => row.modelId === 'child')!;
  assert.equal(fixed.value, '0xA5'); assert.deepEqual(fixed.enums, {'0xA5': '起始 <标记>'});
  assert.equal(fixed.byteOrder, 'big'); assert.equal(fixed.byteOrderSource, 'model'); assert.equal(fixed.bitOrderSource, 'model');
  assert.equal(override.byteOrder, 'little'); assert.equal(override.bitOrder, 'lsb-first'); assert.equal(override.byteOrderSource, 'field');
  assert.equal(child.byteOrder, undefined); assert.equal(child.bitOrder, undefined); assert.equal(child.byteOrderSource, undefined);
  const table = binaryFieldTable(g, 'parent');
  assert.match(table, /固定头标记/); assert.match(table, /起始 &lt;标记&gt;/); assert.match(table, /大端（继承 parent）/); assert.match(table, /小端（字段声明）/); assert.match(table, /声明值：0/);
  const svg = binarySVG(g, g.index.get('parent')!.entity as any);
  assert.match(svg, /0xA5/); assert.match(svg, /继承 parent/);
});

test('同一升级报文的两个场景保持原数据块偏移并计算控制头和对齐', () => {
  const g = graph(tutorialData());
  const sample = binaryProjection(g, 'binary:packet', g.index.get('view:packet-sample')!.entity as any);
  const control = binaryProjection(g, 'binary:packet', g.index.get('view:packet-control')!.entity as any);
  assert.equal(sample.size.value, 256); assert.equal(sample.rows.find(row => row.id === 'crc')!.offset.value, 224);
  assert.equal(control.size.value, 96); assert.equal(control.rows.find(row => row.id === 'crc')!.offset.value, 64);
  assert.equal(control.rows.find(row => row.id === 'pad')!.size.value, 16);
  assert.equal(control.rows.find(row => row.id === 'seqno')!.active, false);
  assert.equal(control.rows.find(row => row.id === 'extra')!.size.value, 0);
  const command = control.rows.find(row => row.id === 'command')!;
  assert.equal(command.value, '0x0001'); assert.equal(command.byteOrderSource, 'model'); assert.equal(command.modelId, 'binary:packet');
  const table = binaryFieldTable(g, 'binary:packet', g.index.get('view:packet-control')!.entity as any);
  assert.match(table, /0x0001/); assert.match(table, /1 = 数据块/); assert.match(table, /2 = 控制消息/);
  assert.equal(binaryProjection(g, 'binary:packet').size.value, undefined, '场景不改写符号定义');
});

for (const [file, section, sequence] of [
  ['docs/charts/timing/sequences.mdoc', 'use:sequence-data', true],
  ['docs/charts/data-layout/binary-layouts.mdoc', 'use:binary-data', false]
] as const) {
  test('完整工程配方独立构建：' + section, {timeout: 30000}, t => {
    const ast = Markdoc.parse(readFileSync(join(repository, file), 'utf8'), {file});
    const node = [...ast.walk()].find(node => node.tag === 'section' && node.attributes.id === section)!;
    const sources = [...node.walk()].filter(node => node.tag === 'code' && node.attributes.language === 'json');
    const body = [...node.walk()].find(node => node.type === 'fence' && node.attributes.language === 'text')!;
    assert.equal(sources.length, 1); assert.equal(body.attributes.process, false);
    const root = mkdtempSync(join(tmpdir(), 'edoc-protocol-tutorial-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const write = (path: string, content: string) => {mkdirSync(dirname(join(root, path)), {recursive: true}); writeFileSync(join(root, path), content);};
    write('docs/edoc.config.js', 'export default {};'); write('docs/index.mdoc', body.attributes.content);
    write(sources[0].attributes.file, readFileSync(join(repository, sources[0].attributes.file), 'utf8'));
    if (sequence) write('docs/ir/authoring/binary-layouts.json', readFileSync(join(repository, 'docs/ir/authoring/binary-layouts.json'), 'utf8'));
    const cli = (args: string[]) => {
      const result = spawnSync(process.execPath, [join(repository, 'packages/cli/edoc.ts'), ...args], {cwd: root, encoding: 'utf8', timeout: 25000});
      assert.equal(result.status, 0, result.stderr || result.error?.message || 'CLI 失败'); return result.stdout;
    };
    cli([]);
    const value = JSON.parse(cli(['query', '--id', sequence ? 'seq:upgrade' : 'binary:packet', '--element', sequence ? 'failed' : 'command']));
    assert.equal(value.target.id, sequence ? 'failed' : 'command');
    assert.ok(readFileSync(join(root, 'output/index.html'), 'utf8').includes(sequence ? 'view:upgrade-overview' : 'view:packet-control'));
  });
}
