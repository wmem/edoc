import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {drawingSVG} from '../packages/drawing/svg.ts';
import {DrawingError} from '../packages/drawing/types.ts';
import {checkPaths} from '../packages/drawing/check-paths.ts';
import type {Drawing, DrawingScene, Point, Rect, Constraint} from '../packages/drawing/types.ts';
const read = (name: string) => JSON.parse(readFileSync(new URL(`../docs/support/proposals/drawing/${name}.json`, import.meta.url), 'utf8'));
const automatic = (): Drawing => read('automatic');
const controlled = (): Drawing => ({...automatic(), ...read('controlled')});
const fixed = (): Drawing => read('fixed-route');
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < .01, `${a} != ${b}`);
const contains = (a: Rect, b: Rect) => assert.ok(b.x >= a.x - .01 && b.y >= a.y - .01 && b.x + b.width <= a.x + a.width + .01 && b.y + b.height <= a.y + a.height + .01);
const equal = (a: Point, b: Point) => Math.abs(a.x - b.x) < .001 && Math.abs(a.y - b.y) < .001;
function inspect(s: DrawingScene, d: Drawing) {
  assert.equal(s.nodes.length, d.nodes.length); assert.equal(s.connections.length, d.connections.length);
  for (const n of s.nodes) {
    contains(s.viewBox, n);
    if (n.parentId) contains(s.nodes.find(p => p.id === n.parentId)!.contentBox, n);
    for (const text of [n.title, ...n.contents, ...n.ports.map(p => p.text)]) contains(n, text);
  }
  for (const c of s.connections) {
    assert.equal(c.ends.length, d.connections.find(source => source.id === c.id)!.ends.length);
    for (const e of c.ends) {
      const n = s.nodes.find(n => n.id === e.node)!;
      if (e.port) { const p = n.ports.find(p => p.id === e.port)!; close(p.x, e.x); close(p.y, e.y); }
      assert.ok(c.paths.some(p => equal(p.points[0], e) || equal(p.points.at(-1)!, e)));
    }
    for (const p of c.paths) for (let i = 1; i < p.points.length; i++) assert.ok(p.points[i].x === p.points[i - 1].x || p.points[i].y === p.points[i - 1].y);
  }
}
async function rejects(d: Drawing, code: string) { await assert.rejects(solveDrawing(d), e => e instanceof DrawingError && e.code === code); }
function add(d: Drawing, ...rules: Constraint[]) { d.layout ??= {}; d.layout.constraints ??= []; d.layout.constraints.push(...rules); return d; }

test('自动两板布局保留层级、接口、内容与全部端点，不改写输入', async () => {
  const d = automatic(), original = structuredClone(d); d.nodes[2].originIds = ['source:fpga']; d.nodes[2].ports![0].originIds = ['source:spi']; original.nodes = structuredClone(d.nodes);
  const s = await solveDrawing(d); inspect(s, d); assert.deepEqual(d, original);
  assert.deepEqual(s.nodes.find(n => n.id === 'fpga')!.originIds, ['source:fpga']);
  assert.deepEqual(s.nodes.find(n => n.id === 'fpga')!.ports[0].originIds, ['source:spi']);
  assert.equal(s.nodes.find(n => n.id === 'phy')!.contents.length, 2);
  assert.equal(s.connections.flatMap(c => c.ends).filter(e => e.marker === 'arrow').length, 0);
});
test('受控布局保留局部位置、尺寸、板顺序、跨板端口对齐和经过点', async () => {
  const d = controlled(), s = await solveDrawing(d); inspect(s, d);
  const n = (id: string) => s.nodes.find(n => n.id === id)!;
  close(n('fpga').x - n('bottom').contentBox.x, 80); close(n('fpga').y - n('bottom').contentBox.y, 80);
  close(n('fpga').width, 240); close(n('fpga').height, 160);
  assert.ok(n('top').y + n('top').height + 120 <= n('bottom').y + .01);
  const a = n('bottom-btb').ports.find(p => p.id === 'rmii')!, b = n('top-btb').ports.find(p => p.id === 'rmii')!;
  close(a.x, b.x); assert.equal(a.side, 'top'); assert.equal(b.side, 'bottom'); close(a.x, n('bottom-btb').x + n('bottom-btb').width / 2);
  const via = {x: n('bottom').contentBox.x + 400, y: n('bottom').contentBox.y + 40};
  assert.ok(s.connections.find(c => c.id === 'sdio')!.paths.some(p => p.points.some(point => equal(point, via))));
  assert.equal(s.satisfiedConstraints.length, d.layout!.constraints!.length);
});
test('固定三端树精确保留分叉、折点和箭头，导出只消费 Scene', async () => {
  const d = fixed(), s = await solveDrawing(d); inspect(s, d); const c = s.connections[0];
  assert.deepEqual(c.junctions, [{x: 300, y: 120}]);
  assert.deepEqual(c.paths.map(p => p.points), [[{x: 160, y: 120}, {x: 300, y: 120}], [{x: 300, y: 120}, {x: 500, y: 120}], [{x: 300, y: 120}, {x: 300, y: 360}, {x: 500, y: 360}]]);
  const svg = drawingSVG(s, d, false); assert.equal((svg.match(/marker-end=/g) ?? []).length, 2); assert.ok(svg.includes('data-connection="clock"'));
  close(s.nodes.find(n => n.id === 'a')!.x, 0); close(s.nodes.find(n => n.id === 'a')!.y, 40);
});
test('四侧端口按整条边的比例定位，长标题和正文参与尺寸测量', async () => {
  const d: Drawing = {schemaVersion: '1.0', id: 'four-sides', nodes: [{id: 'n', label: '较长的中文模块名称与 English module title', ports: ['top', 'right', 'bottom', 'left'].map(id => ({id})), content: [{id: 'text', kind: 'text', text: '正文内容'}]}], connections: []};
  add(d, {id: 'size', type: 'size', node: 'n', width: 440, height: 240}, ...(['top', 'right', 'bottom', 'left'] as const).map(side => ({id: side, type: 'port' as const, node: 'n', port: side, side, offset: side === 'left' || side === 'right' ? .7 : .5})));
  const s = await solveDrawing(d); inspect(s, d); const n = s.nodes[0];
  for (const p of n.ports) { if (p.side === 'top' || p.side === 'bottom') close(p.x, n.x + n.width * .5); else close(p.y, n.y + n.height * .7); }
  assert.ok(n.title.lines.length > 1);
});
test('冲突位置、次序、侧边和悬空引用明确失败', async () => {
  await rejects(add(fixed(), {id: 'conflict', type: 'place', node: 'a', x: 80, y: 40}), 'DRAWING_CONSTRAINT');
  await rejects(add(controlled(), {id: 'reverse', type: 'order', axis: 'y', nodes: ['bottom', 'top']}), 'DRAWING_CONSTRAINT');
  await rejects(add(fixed(), {id: 'wrong-side', type: 'port', node: 'a', port: 'p', side: 'left'}), 'DRAWING_CONSTRAINT');
  const missing = automatic(); missing.connections[0].ends[0].port = 'missing'; await rejects(missing, 'DRAWING_REFERENCE');
});
test('固定路径不能穿框、含斜线或折返重叠', async () => {
  const diagonal = fixed(); const r = diagonal.layout!.constraints!.find(r => r.type === 'fixedRoute')!; if (r.type === 'fixedRoute') r.paths[0].via = [{x: 220, y: 130}]; await rejects(diagonal, 'DRAWING_ORTHOGONAL');
  const blocked = fixed(); blocked.nodes.push({id: 'obstacle', label: '阻挡'}); add(blocked, {id: 'block-place', type: 'place', node: 'obstacle', x: 200, y: 270}); await rejects(blocked, 'DRAWING_PATH_COLLISION');
  const retrace = fixed(); const route = retrace.layout!.constraints!.find(r => r.type === 'fixedRoute')!; if (route.type === 'fixedRoute') route.paths[0].via = [{x: 260, y: 120}, {x: 220, y: 120}]; await rejects(retrace, 'DRAWING_PATH_CONTACT');
});
test('未实现能力报错，不用默认行为覆盖请求', async () => {
  const multi = fixed(); multi.layout!.constraints = multi.layout!.constraints!.filter(r => r.type !== 'fixedRoute'); const tree = await solveDrawing(multi); inspect(tree, multi); assert.ok(tree.connections[0].junctions.length);
  const polyline = automatic(); polyline.layout = {routing: 'polyline'}; await rejects(polyline, 'DRAWING_CAPABILITY');
  const percentage = add(controlled(), {id: 'percentage', type: 'label', connection: 'spi', label: 'name', nearEnd: 'fpga', fraction: .5}); inspect(await solveDrawing(percentage), percentage);
});
test('直线内部交叉可保留，假分叉、共线和不足的平行间距被拒绝', async () => {
  const source = (await solveDrawing(fixed())).connections[0];
  const line = (id: string, a: Point, b: Point) => ({...source, id, ends: [], junctions: [], labels: [], paths: [{id: 'path', points: [a, b]}]});
  const a = line('a', {x: 0, y: 50}, {x: 100, y: 50});
  assert.doesNotThrow(() => checkPaths([a, line('b', {x: 50, y: 0}, {x: 50, y: 100})]));
  assert.throws(() => checkPaths([a, line('b', {x: 50, y: 0}, {x: 50, y: 50})]), {code: 'DRAWING_PATH_CONTACT'});
  assert.throws(() => checkPaths([a, line('b', {x: 100, y: 50}, {x: 150, y: 50})]), {code: 'DRAWING_PATH_CONTACT'});
  assert.throws(() => checkPaths([a, line('b', {x: 20, y: 65}, {x: 80, y: 65})], 20), {code: 'DRAWING_PATH_CLEARANCE'});
});
