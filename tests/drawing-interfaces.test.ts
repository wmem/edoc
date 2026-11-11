import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {interfaceFixture} from './interface-fixture.ts';
import {prepareInterfaceModel, projectInterfaces, initialInterfaceState} from '../packages/render-graph/interfaces.ts';
import {drawingInterfaceScene} from '../packages/drawing/interface-scene.ts';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {svg} from '../packages/render-graph/index.ts';
import {crosses, intersects} from '../packages/render-graph/geometry.ts';
import type {Scene} from '../packages/render-graph/scene.ts';
import type {Drawing} from '../packages/drawing/types.ts';
function inspect(scene: Scene) {
  for (const net of scene.nets) {
    for (const b of net.branches) {const p = scene.nodes.flatMap(n => n.ports).find(p => p.id === b.endpoint)!;assert.ok(p, b.endpoint);assert.equal(p.x, b.points[0].x);assert.equal(p.y, b.points[0].y);}
    for (const path of net.paths!) for (let i = 1; i < path.points.length; i++) for (const n of scene.nodes) assert.ok(!crosses(path.points[i - 1], path.points[i], n), net.id + ' 穿框');
    for (const n of scene.nodes) assert.ok(!intersects(net.labelBox, n), net.id + ' 标题盖框');
  }
}
test('两板默认并行接口与跨板连接自动直连，源数据没有手动对齐', async () => {
  const drawing = JSON.parse(readFileSync(new URL('../docs/support/proposals/drawing/automatic.json', import.meta.url), 'utf8'));
  const scene = await solveDrawing(drawing);
  for (const id of ['spi', 'sdio', 'rmii-btb', 'rmii-top']) {const c = scene.connections.find(c => c.id === id)!;assert.equal(c.ends[0].y, c.ends[1].y);assert.equal(c.paths[0].points.length, 2);}
  assert.equal(drawing.layout?.constraints, undefined);
});
test('四个方向的成对端口按实际锚点对齐', async () => {
  for (const direction of ['LR', 'RL', 'TB', 'BT'] as const) {
    const d: Drawing = {schemaVersion: '1.0', id: 'aligned', nodes: [{id: 'a', label: 'A', ports: [{id: 'p'}, {id: 'q'}]}, {id: 'b', label: '较长的模块标题', ports: [{id: 'p'}, {id: 'q'}]}], connections: ['p','q'].map(port => ({id: port, ends: [{id:'a',node:'a',port},{id:'b',node:'b',port}]})), layout:{direction}};
    const s = await solveDrawing(d);for(const c of s.connections)assert.equal(c.paths[0].points.length,2,direction+'/'+c.id);
  }
});
test('新内核承载四接口全部16种状态，附注开关后仍保留17条原关系', async t => {
  const f = interfaceFixture(t), model = prepareInterfaceModel(f.load(), 'gallery:interface-buses')!, original = structuredClone(model), ids = model.nodes.flatMap(n => n.interfaces!.map(i => i.id));
  for (const details of [true, false]) for (let mask = 0; mask < 16; mask++) {
    const scene = await drawingInterfaceScene(model, {modes: Object.fromEntries(ids.map((id, i) => [id, mask & 1 << i ? 'expanded' : 'collapsed'])), classes: null, showInterfaceDetails: details});
    inspect(scene); assert.equal(scene.layoutEngine, 'drawing');
    assert.deepEqual(new Set(scene.nets.flatMap(n => n.sourceRelations!.map(r => r.id))), new Set(model.relations.map(r => r.id)));
    for (const net of scene.nets) for (const r of net.sourceRelations!) {
      assert.deepEqual(r, model.relations.find(original => original.id === r.id));
      assert.deepEqual(Object.keys(net.endpointMap![r.id]), r.endpoints);
      assert.ok(Object.values(net.endpointMap![r.id]).every(p => net.endpoints.includes(p)));
    }
    for (const iface of scene.interfaces!) {const ports = scene.nodes.flatMap(n => n.ports).filter(p => p.interfaceId === iface.id);assert.equal(new Set(ports.map(p => p.side)).size,1);}
  }
  assert.deepEqual(model, original);
});
test('分类筛选和当前/逐信号 SVG 保留各自范围', async t => {
  const model = prepareInterfaceModel(interfaceFixture(t).load(), 'gallery:interface-buses')!, base = initialInterfaceState(model);
  const filtered = await drawingInterfaceScene(model, {...base, classes:['control']});
  assert.ok(filtered.nets.every(n => n.sourceRelations!.every(r => r.class === 'control')));
  const current = svg(filtered, false), full = svg(await drawingInterfaceScene(model, {modes: Object.fromEntries(model.nodes.flatMap(n => n.interfaces!.map(i => [i.id, 'expanded']))), classes:null}), false);
  assert.ok(current.includes('data-bundle="true"'));assert.equal((full.match(/data-relation="/g) ?? []).length,17);assert.ok(!full.includes('data-bundle="true"'));
  const empty = await drawingInterfaceScene(model, {...base, classes: []}); assert.equal(empty.nets.length, 0);
});
test('第三端点保持独立三端树，不混入双端聚合', async t => {
  const f = interfaceFixture(t);f.edit('objects', d => d.objects.push({id:'probe',kind:'node',label:'第三端点',ports:[{id:'probe.p',label:'probe',direction:'unknown'}]}));f.edit('relations',d=>d.relations[0].endpoints.push('probe.p'));
  const model = prepareInterfaceModel(f.load(),'gallery:interface-buses')!;
  for(const mode of ['collapsed','expanded'] as const){const s=await drawingInterfaceScene(model,{modes:Object.fromEntries(model.nodes.flatMap(n=>(n.interfaces??[]).map(i=>[i.id,mode]))),classes:null});inspect(s);const net=s.nets.find(n=>n.sourceRelations!.some(r=>r.id==='ifdemo:net.ctrl_awaddr'))!;assert.equal(net.endpoints.length,3);assert.equal(net.originalEndpoints!['ifdemo:net.ctrl_awaddr'].length,3);assert.ok(net.junctions!.length);assert.equal(net.bundle,false);}
});
test('接口内部关系记账，部分成员范围和未知宽度保持原事实', async t => {
  const f=interfaceFixture(t);f.edit('relations',d=>d.relations.push({id:'internal',kind:'connection',class:'control',endpoints:['ifdemo:engine.ctrl_awvalid','ifdemo:engine.ctrl_wvalid']}));f.edit('views',d=>d.views[0].include.relations.push('internal'));
  let model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,s=await drawingInterfaceScene(model);assert.ok(s.internalRelations!['ifdemo:engine.s_ctrl'].includes('internal'));
  f.edit('views',d=>{d.views[0].include.objects=['ifdemo:engine.ctrl_awvalid'];d.views[0].include.relations=['ifdemo:net.ctrl_awvalid'];});model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!;s=await drawingInterfaceScene(model);const i=s.interfaces!.find(i=>i.id==='ifdemo:engine.s_ctrl')!;assert.equal(i.visibleMembers.length,1);assert.equal(i.members.length,10);assert.equal(s.nets.length,1);
  assert.equal((f.load().index.get('ifdemo:engine.ctrl_optional')!.entity as import('../packages/core/types.ts').Port).widthExpr,'OPTION_WIDTH');
});
test('投影可独立查询，分组来源不借用临时槽位的身份', async t => {
  const model=prepareInterfaceModel(interfaceFixture(t).load(),'gallery:interface-buses')!;
  const p=projectInterfaces(model);assert.equal(p.graph.connections.size,2);assert.equal(p.interfaces.length,4);
  const s=await drawingInterfaceScene(model);assert.ok(s.drawing!.connections.every(c=>c.originIds.every(id=>model.relations.some(r=>r.id===id))));
});
test('自动阅读顺序不能覆盖显式对齐，未知分类保留原类别', async t => {
  const s=await solveDrawing({schemaVersion:'1.0',id:'hard-align',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],connections:[{id:'ab',ends:[{id:'a',node:'a'},{id:'b',node:'b'}]}],layout:{constraints:[{id:'aligned',type:'align',axis:'x',targets:[{node:'a'},{node:'b'}]}]}});
  assert.equal(s.nodes[0].x+s.nodes[0].width/2,s.nodes[1].x+s.nodes[1].width/2);
  assert.ok(!intersects(s.nodes[0],s.nodes[1]));
  const f=interfaceFixture(t);f.edit('relations',d=>d.relations[0].class='project-specific');const model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,scene=await drawingInterfaceScene(model,{...initialInterfaceState(model),classes:['project-specific']});assert.equal(scene.nets[0].sourceRelations![0].class,'project-specific');
});
test('分组成员、归属和整体侧边错误不能被静默接受', async () => {
  const base:Drawing={schemaVersion:'1.0',id:'groups',nodes:[{id:'n',label:'N',ports:[{id:'a'},{id:'b'}],portGroups:[{id:'g',ports:['a','b']}]}],connections:[]};
  const repeated=structuredClone(base);repeated.nodes[0].portGroups!.push({id:'g2',ports:['a']});await assert.rejects(solveDrawing(repeated),{code:'DRAWING_SCOPE'});
  const missing=structuredClone(base);missing.nodes[0].portGroups![0].ports=['missing'];await assert.rejects(solveDrawing(missing),{code:'DRAWING_REFERENCE'});
  const conflicting=structuredClone(base);conflicting.layout={constraints:[{id:'left',type:'port',node:'n',port:'a',side:'left'},{id:'right',type:'port',node:'n',port:'b',side:'right'}]};await assert.rejects(solveDrawing(conflicting),{code:'DRAWING_CONSTRAINT'});
});
