import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
test('同一三端点 Net 渲染三分支，Ball/Pin 来自同一事实',async t=>{
 const f=fixture(t); const s=await scene(f.load(),'board:flash-wiring'); const n=s.nets.find(n=>n.id==='board:net.FLASH_SCK')!;
 assert.equal(n.endpoints.length,3);assert.equal(n.branches.length,3);assert.match(svg(s),/ball A12/);assert.match(svg(s),/pin 6/);
 f.edit('objects',d=>d.objects[0].ports[0].attributes.ball='Z99');assert.match(svg(await scene(f.load(),s.id)),/ball Z99/);
});
test('四类视图、手动布局与标签转义',async t=>{
 const f=fixture(t);
 for(const kind of ['wiring','interface','architecture','state']){
 f.edit('views',d=>{d.views[0].kind=kind;d.views[0].layout.positions=[{objectId:'board:U1',x:40,y:20}];d.views[0].label='<script>';});
 const s=await scene(f.load(),'board:flash-wiring');assert.equal(s.nodes.find(n=>n.id==='board:U1')?.x,100);assert.ok(!svg(s).includes('<script>'));}
});
test('端口位于节点边缘、框不重叠、过滤不丢连接端点',async t=>{
 const f=fixture(t);f.edit('views',d=>d.views[0].include.objects=['board:U1']);const s=await scene(f.load(),'board:flash-wiring');
 assert.equal(s.nodes.length,3);
 for(const n of s.nodes) for(const p of n.ports) assert.ok(p.x===n.x||p.x===n.x+n.width);
 for(const a of s.nodes)for(const b of s.nodes)if(a!==b) assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y);
});
