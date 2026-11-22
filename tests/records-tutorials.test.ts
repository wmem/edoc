import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {DOMParser} from '@xmldom/xmldom';
import {graphFromResources} from '../packages/core/graph.ts';
import {resolveLinkTarget} from '../packages/core/link-target.ts';
import type {PlotView, ResourceType} from '../packages/core/types.ts';
import {plotProjection} from '../packages/extensions/plot/model.ts';
import {plotSVG} from '../packages/extensions/plot/render.ts';

const file = 'docs/ir/authoring/measurements.json';
const dataset = () => JSON.parse(readFileSync(file, 'utf8'));
const load = () => {
  const data = dataset();
  const graph = graphFromResources(Object.entries(data).map(([type, values]) => ({
    type: type as ResourceType, data: {[type]: values}, file
  })), {projectId: 'records-tutorials', irVersion: '2.0', requiredFeatures: ['plots'], resources: [], entryDocuments: []}, {root: process.cwd(), strict: true});
  const view = (id: string): PlotView => data.views.find((view: PlotView) => view.id === id);
  return {data, graph, view};
};
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} 应等于 ${expected}`);

test('配置比较保持48条原始记录、两处缺测与原视图身份', () => {
  const {data, graph} = load();
  const rows = data.tables[0].rows;
  assert.equal(rows.length, 48);
  for (const mode of ['A', 'B']) for (let i = 0; i < 24; i++) {
    const row = rows.find((row: any) => row.id === `measurement:${mode}:${i}`)!;
    assert.equal(row.values.mode, mode);
    assert.equal(row.values.sample, i);
    assert.equal(row.values.load, (Math.floor(i / 4) + 1) * 15);
    if (i === 11) assert.equal(row.values.latency, undefined);
    else close(row.values.latency, 7.85 + Math.floor(i / 4) * 1.95 + (i % 4) * 1.4 + (mode === 'B' ? 4 : 0));
    const link = resolveLinkTarget(graph, row.links.sample);
    assert.equal(link.sourceOwnerId, 'table:measurements');
    assert.equal(link.source?.file, file);
  }
  for (const id of ['plot:simple', 'plot:distribution', 'plot:quantile']) assert.ok(data.views.some((view: PlotView) => view.id === id));
});

test('均值与分位数按配置和负载计算，缺测组使用三个有效值', () => {
  const {graph, view} = load();
  const trend = plotProjection(graph, view('plot:load-trend'));
  assert.equal(trend.inputCount, 48);
  assert.equal(trend.projection.rows.length, 12);
  for (const row of trend.projection.rows) {
    const {mode, load, meanLatency} = row.values;
    const expected = 9.95 + (Number(load) / 15 - 1) * 1.95 + (mode === 'B' ? 4 : 0) - (load === 45 ? .7 : 0);
    close(meanLatency, expected);
    assert.equal(row.rowIds.length, 4, '参与分组的来源行保留缺测记录身份');
  }
  const distribution = plotProjection(graph, view('plot:distribution')).projection.spec.layer[0].statistics;
  assert.equal(distribution.length, 12);
  assert.equal(distribution.reduce((n: number, group: any) => n + group.fields.latency.validCount, 0), 46);
  for (const group of distribution) {
    assert.equal(group.count, 4);
    assert.equal(group.fields.latency.validCount, group.group.load === 45 ? 3 : 4);
    assert.equal(group.fields.latency.missingCount, group.group.load === 45 ? 1 : 0);
  }
  const quantiles = plotProjection(graph, view('plot:load-quantile')).projection.spec.rows;
  assert.equal(quantiles.length, 36);
  for (const row of quantiles) {
    const {load, probability, latencyQ} = row.values;
    const mode = Object.values(row.facets)[0];
    const lower = 7.85 + (Number(load) / 15 - 1) * 1.95 + (mode === 'B' ? 4 : 0);
    // 这些构造组是等差数列；R-7 可用首值 + (n-1)×概率×间距独立验算。
    close(latencyQ, lower + (load === 45 ? 2 : 3) * probability * 1.4);
    assert.equal(row.rowIds.length, 4);
    assert.ok(row.rowIds.every((id: string) => id.startsWith(`measurement:${mode}:`)));
  }
});

test('旧分位数视图保留六档混合口径，与逐负载分位数区别明确', () => {
  const {graph, view} = load();
  const mixed = plotProjection(graph, view('plot:quantile')).projection;
  assert.equal(mixed.rows.length, 6);
  assert.deepEqual(mixed.audit[0].transform.groupby, ['mode']);
  for (const row of mixed.rows) {
    assert.equal(row.rowIds.length, 24);
    assert.equal(new Set(row.rowIds.map((id: string) => Math.floor(Number(id.split(':').at(-1)) / 4))).size, 6);
  }
  const body = readFileSync('docs/charts/records/plots.mdoc', 'utf8');
  assert.match(body, /跨负载的混合统计/);
  assert.match(body, /不能用它回答“90% 负载下的 P99”/);
});

test('统计图SVG坐标、图例与分面显示列名，显式title仍优先', async () => {
  const {graph, view} = load();
  const dom = (svg: string) => new DOMParser().parseFromString(svg, 'image/svg+xml');
  const texts = (svg: string) => Array.from(dom(svg).getElementsByTagName('text')).map(node => node.textContent).join('\n');
  const svg = await plotSVG(graph, view('plot:distribution'));
  const visible = texts(svg);
  assert.match(visible, /负载 \(%\)/);
  assert.match(visible, /时延 \(us\)/);
  assert.match(visible, /配置/);
  assert.doesNotMatch(visible, /\b(?:load|latency|mode)\b/);
  const overridden = structuredClone(view('plot:load-trend'));
  overridden.encoding!.x!.title = '指定负载标题';
  const projected = plotProjection(graph, overridden).projection;
  assert.equal(projected.encoding.x.title, '指定负载标题');
  assert.equal(projected.encoding.color.title, '配置');
  assert.match(texts(await plotSVG(graph, overridden)), /指定负载标题/);
});
