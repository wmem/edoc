import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {controlTutorialData, stateTraceTable, handshakeBeatTable} from '../docs/support/control-tutorials.mjs';
import {graphFromResources} from '../packages/core/graph.ts';
import type {ResourcePart} from '../packages/core/graph.ts';
import type {ResourceType, StateMachine, Flowchart, Waveform} from '../packages/core/types.ts';
import {scene} from '../packages/render-graph/index.ts';
import {projectControl, presentation} from '../packages/extensions/control-diagram/project.ts';
import {waveform} from '../packages/render-wave/index.ts';

const resource = (name: string) => JSON.parse(readFileSync(new URL('../docs/ir/authoring/' + name + '.json', import.meta.url), 'utf8'));
function tutorialGraph() {
  const parts: ResourcePart[] = ['states', 'state-hierarchy', 'device-initialization', 'control-tutorial-views', 'handshake-tutorial'].flatMap(name => {
    const data = resource(name);
    const file = 'docs/ir/authoring/' + name + '.json';
    return Object.entries(data).map(([type, items]) => ({type: type as ResourceType, data: {[type]: (items as {id: string; source?: unknown}[]).map(entity => ({...entity, source: entity.source ?? {file, selector: entity.id}}))}, file}));
  });
  parts.push({type: 'tables', data: controlTutorialData({root: process.cwd()}), file: 'docs/support/control-tutorials.mjs'});
  return graphFromResources(parts, {projectId: 'tutorial', irVersion: '2.0', resources: [], entryDocuments: [], requiredFeatures: ['state-machines', 'flowcharts']}, {root: process.cwd(), strict: true});
}

test('1011逐沿表来自原迁移，命中结果与独立前缀扫描一致', () => {
  const model = resource('states').stateMachines[0] as StateMachine, original = structuredClone(model), input = '1011011';
  const table = stateTraceTable(model, input);
  const expected = [...input].map((_, index) => Number(input.slice(0, index + 1).endsWith('1011')));
  assert.deepEqual(table.rows.map(row => row.values.matched), expected);
  assert.deepEqual(table.rows.filter(row => row.values.matched).map(row => row.values.cycle), [4, 7]);
  let previous = model.initial;
  for (const row of table.rows) {
    const transition = model.transitions.find(transition => transition.id === row.values.transition)!;
    assert.equal(transition.from, previous);
    assert.equal(transition.guard, 'din == ' + row.values.din);
    assert.equal(row.values.after, model.states.find(state => state.id === transition.to)!.label);
    assert.equal(row.links.transition.id, model.id);
    previous = transition.to;
  }
  const reordered = structuredClone(model); reordered.states.reverse(); reordered.transitions.reverse();
  assert.deepEqual(stateTraceTable(reordered, input), table, '模型数组顺序不能成为第二套状态语义');
  const changed = structuredClone(model); changed.transitions.find(transition => transition.id === 'seen101-1')!.actions = [];
  assert.ok(stateTraceTable(changed, input).rows.every(row => row.values.matched === 0), '原动作修改时表格同步变化');
  changed.transitions.find(transition => transition.id === 'none-1')!.guard = 'unsupported(din)';
  assert.throws(() => stateTraceTable(changed, input), /唯一显式迁移/);
  assert.deepEqual(model, original);
});

test('握手逐拍解释与WaveJSON同源，背压保持到接受且拒绝错误采样数据', () => {
  const wave = resource('handshake-tutorial').waveforms[0] as Waveform & {data: {signal: {name: string; wave: string; data?: string[]}[]}}, original = structuredClone(wave), table = handshakeBeatTable(wave);
  assert.deepEqual(table.rows.filter(row => row.values.accepted.startsWith('接受')).map(row => [row.values.cycle, row.values.data]), [[1, 'A'], [4, 'B'], [5, 'C']]);
  assert.deepEqual(table.rows.slice(2, 5).map(row => [row.values.valid, row.values.ready, row.values.data]), [[1, 0, 'B'], [1, 0, 'B'], [1, 1, 'B']]);
  assert.equal(table.source!.selector, wave.id);
  assert.ok(table.rows.every(row => row.links.accepted.id === wave.id));
  const changed = structuredClone(wave); changed.data.signal.find(signal => signal.name === 'data')!.data![1] = '新的B';
  assert.equal(handshakeBeatTable(changed).rows[4].values.data, '新的B');
  changed.data.signal.find(signal => signal.name === 'data')!.wave = 'x345.6x.';
  changed.data.signal.find(signal => signal.name === 'data')!.data = ['A', 'B', '错误变化', 'C'];
  assert.throws(() => handshakeBeatTable(changed), /背压期间/);
  const clock = structuredClone(wave); clock.data.signal[0].wave = 'pBAD....';
  assert.throws(() => handshakeBeatTable(clock), /逐拍时钟/);
  assert.match(waveform(wave, 0), /ready/);
  assert.deepEqual(wave, original);
});

test('设备初始化的成功、失败、超时和恢复路径均由完整模型连通', () => {
  const graph = tutorialGraph(), model = graph.index.get('tutorial:device-init')!.entity as Flowchart;
  const follow = (edges: string[], end: string) => {
    let current = 'start';
    for (const id of edges) {const edge = model.edges.find(edge => edge.id === id)!;assert.equal(edge.from, current, id);current = edge.to;}
    assert.equal(current, end);assert.equal(model.nodes.find(node => node.id === end)!.kind, 'end');
  };
  const enter = ['begin', 'read-id', 'check-id'];
  follow([...enter, 'supported-id', 'await-report', 'reported', 'passed'], 'ready');
  follow([...enter, 'unsupported-id', 'report-failure'], 'failed');
  follow([...enter, 'supported-id', 'await-report', 'timed-out', 'retry-budget', 'retry-allowed', 'reconfigure', 'await-report', 'reported', 'passed'], 'ready');
  follow([...enter, 'supported-id', 'await-report', 'io-error', 'retry-budget', 'retry-exhausted', 'report-failure'], 'failed');
  assert.equal(model.edges.find(edge => edge.id === 'timed-out')!.kind, 'timeout');
  assert.equal(model.edges.find(edge => edge.id === 'io-error')!.kind, 'exception');
  assert.deepEqual(model.nodes.filter(node => node.actions?.includes('attempt = 0')).map(node => node.id), ['prepare'], '恢复回边不能重置重试预算');
  assert.ok(model.nodes.find(node => node.id === 'configure')!.actions!.includes('attempt += 1'));
});

test('三阶段初始化与四层微波炉视图保持原模型，并避免默认巨幅局部图', async () => {
  const graph = tutorialGraph(), model = graph.index.get('example:microwave')!.entity as StateMachine, original = structuredClone(model);
  const covered = new Set<string>();
  for (const suffix of ['overview', 'engine', 'working', 'door']) {
    const id = 'tutorial:microwave-' + suffix, p = presentation(graph, id)!, projected = projectControl(p), s = await scene(graph, id);
    assert.equal(p.model.id, model.id);
    assert.ok(s.width < 1000 && s.height < 700, id + ' 保持适于逐区阅读的几何范围');
    if (suffix === 'overview') {assert.ok(projected.nodes.some(node => node.id === 'engine'));assert.ok(projected.nodes.some(node => node.id === 'door'));assert.ok(!projected.nodes.some(node => node.id === 'cooking'));}
    for (const connection of projected.connections) {
      const transition = model.transitions.find(transition => transition.id === connection.id);
      if (!transition) continue;
      covered.add(transition.id);
      assert.deepEqual(connection.ends.map(end => end.node), [transition.from, transition.to]);
      assert.deepEqual(connection.originIds, [model.id, transition.id]);
    }
  }
  assert.deepEqual(covered, new Set(model.transitions.map(transition => transition.id)), '总览与局部阅读合起来保留全部原迁移');
  const flow = graph.index.get('tutorial:device-init')!.entity as Flowchart;
  for (const suffix of ['entry', 'result', 'recovery']) {
    const id = 'tutorial:init-' + suffix, projected = projectControl(presentation(graph, id)!), s = await scene(graph, id);
    assert.ok(s.width < 900 && s.height < 600, id + ' 不要求从巨幅完整图寻找步骤');
    for (const connection of projected.connections) {const edge = flow.edges.find(edge => edge.id === connection.id)!;assert.deepEqual(connection.ends.map(end => end.node), [edge.from, edge.to]);}
  }
  assert.deepEqual(model, original);
});
