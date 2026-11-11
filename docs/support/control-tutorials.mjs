import {readFileSync} from 'node:fs';
import {join} from 'node:path';

// 只解释1011教程使用的显式din二值守卫与matched动作；不执行任意模型表达式。
export function stateTraceTable(model, input = '1011011') {
  if (!/^[01]+$/.test(input) || !model.initial || !model.semantics?.profile?.includes('matched 默认为 0')) throw new Error('1011轨迹需要二值输入、明确入口和默认输出约定');
  const labels = new Map(model.states.map(state => [state.id, state.label ?? state.id]));
  let current = model.initial;
  const rows = [...input].map((bit, index) => {
    const candidates = model.transitions.filter(transition => transition.from === current && transition.guard === 'din == ' + bit);
    if (candidates.length !== 1) throw new Error('1011轨迹需要唯一显式迁移：' + current + ' / ' + bit);
    const transition = candidates[0];
    if (transition.trigger?.kind !== 'clock' || transition.trigger.clock !== model.semantics.clock || transition.trigger.edge !== 'rising' || (transition.actions ?? []).some(action => action !== 'matched = 1')) throw new Error('1011轨迹不支持该触发或动作：' + transition.id);
    const values = {cycle: index + 1, din: Number(bit), before: labels.get(current), transition: transition.id, after: labels.get(transition.to), matched: (transition.actions ?? []).includes('matched = 1') ? 1 : 0};
    current = transition.to;
    return {id: 'tutorial:1011:cycle-' + (index + 1), values, links: {transition: {kind: 'source', id: model.id}}};
  });
  return {id: 'tutorial:1011-trace', kind: 'table', label: '输入1011011的逐沿轨迹（由状态模型派生）', columns: [{field: 'cycle', label: '采样沿', type: 'number'}, {field: 'din', label: 'din', type: 'number'}, {field: 'before', label: '采样前状态', type: 'string'}, {field: 'after', label: '采样后状态', type: 'string'}, {field: 'matched', label: '本沿报告matched', type: 'number'}, {field: 'transition', label: '原迁移ID', type: 'string'}], rows, source: {file: 'docs/ir/authoring/states.json', selector: model.id}};
}

// 教程只用0/1/x、带标签总线和延续点；每个字符对应一个采样列。
function samples(signal) {
  const values = [];
  let value, label = 0;
  for (const symbol of signal.wave) {
    if (symbol === '.') {if (value === undefined) throw new Error('首列不能延续未声明值');}
    else if ('01x'.includes(symbol)) value = symbol;
    else if ('=3456789'.includes(symbol)) {value = signal.data?.[label++]; if (value === undefined) throw new Error('总线区间缺少标签');}
    else throw new Error('教程逐拍表不支持波形字符：' + symbol);
    values.push(value);
  }
  return values;
}
export function handshakeBeatTable(waveform) {
  const byName = new Map(waveform.data.signal.map(signal => [signal.name, signal]));
  const valid = samples(byName.get('valid')), ready = samples(byName.get('ready')), payload = samples(byName.get('data'));
  if (valid.length !== ready.length || ready.length !== payload.length || !/^[pP]\.*$/.test(byName.get('clk')?.wave ?? '') || byName.get('clk').wave.length !== valid.length) throw new Error('握手教程信号必须共用逐拍时钟与相同列数');
  const rows = valid.map((v, cycle) => {
    const r = ready[cycle], data = payload[cycle];
    if (![v, r].every(value => value === '0' || value === '1')) throw new Error('握手判据需要已知valid和ready');
    if (cycle && valid[cycle - 1] === '1' && ready[cycle - 1] === '0' && (v !== '1' || data !== payload[cycle - 1])) throw new Error('背压期间valid/data必须保持到被接受');
    return {id: 'tutorial:handshake:cycle-' + cycle, links: {accepted: {kind: 'source', id: waveform.id}}, values: {cycle, valid: Number(v), ready: Number(r), data, accepted: v === '1' && r === '1' ? '接受 ' + data : '无传输', reading: v === '0' ? 'valid=0，不使用data' : r === '0' ? '背压：发送方保持valid/data' : '本沿传输；下一拍可以换数据'}};
  });
  return {id: 'tutorial:handshake-beats', kind: 'table', label: 'valid/ready逐拍解释（由上图WaveJSON派生）', columns: [{field: 'cycle', label: '采样沿', type: 'number'}, {field: 'valid', label: 'valid', type: 'number'}, {field: 'ready', label: 'ready', type: 'number'}, {field: 'data', label: 'data', type: 'string'}, {field: 'accepted', label: '本沿结果', type: 'string'}, {field: 'reading', label: '怎样读', type: 'string'}], rows, source: waveform.source};
}
export function controlTutorialData({root}) {
  const load = file => JSON.parse(readFileSync(join(root, file), 'utf8'));
  const model = load('docs/ir/authoring/states.json').stateMachines.find(model => model.id === 'author:state');
  const waveform = load('docs/ir/authoring/handshake-tutorial.json').waveforms[0];
  return {tables: [stateTraceTable(model), handshakeBeatTable(waveform)]};
}
