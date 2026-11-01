import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,repository,expectCode} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import type {Scene,SceneNet} from '../packages/render-graph/index.ts';
import {same,simplify,intersects} from '../packages/render-graph/geometry.ts';
import {drawnPaths} from '../packages/render-graph/net-tree.ts';
import {interfaceFixture} from './interface-fixture.ts';
import {prepareInterfaceModel,interfaceScene,initialInterfaceState} from '../packages/render-graph/interfaces.ts';

function enable(f:ReturnType<typeof fixture>){f.edit('manifest',d=>{d.irVersion='1.2';d.requiredFeatures=[...d.requiredFeatures??[],'layout-intent'];d.entryDocuments=[];});}
function mac(f:ReturnType<typeof fixture>){
 const data=JSON.parse(readFileSync(join(repository,'examples/fpga-mac/project/semantics.json'),'utf8'));
 f.edit('objects',d=>d.objects=data.nodes);f.edit('relations',d=>d.relations=data.relations);f.edit('views',d=>d.views=[data.views[0]]);f.edit('manifest',d=>d.entryDocuments=[]);
}
const fullPaths=(net:SceneNet)=>net.junction?drawnPaths(net).map(b=>b.points):[simplify([...net.branches[0].points,...net.branches[1].points.slice().reverse().slice(1)])];
const on=(p:{x:number;y:number},a:{x:number;y:number},b:{x:number;y:number})=>Math.abs((p.x-a.x)*(b.y-a.y)-(p.y-a.y)*(b.x-a.x))<.001&&p.x>=Math.min(a.x,b.x)-.001&&p.x<=Math.max(a.x,b.x)+.001&&p.y>=Math.min(a.y,b.y)-.001&&p.y<=Math.max(a.y,b.y)+.001;
function distinguish(s:Scene){
 for(const [i,a]of s.nets.entries())for(const b of s.nets.slice(i+1))for(const pa of fullPaths(a))for(const pb of fullPaths(b)){
  for(const vertex of pa)for(let j=1;j<pb.length;j++)assert.ok(!on(vertex,pb[j-1],pb[j]),`${a.id} 的端点/折角与 ${b.id} 形成假接触：${JSON.stringify(vertex)}`);
  for(const vertex of pb)for(let j=1;j<pa.length;j++)assert.ok(!on(vertex,pa[j-1],pa[j]),`${b.id} 的端点/折角与 ${a.id} 形成假接触`);
  for(let j=1;j<pa.length;j++)for(let k=1;k<pb.length;k++){
   const a=pa[j-1],b=pa[j],c=pb[k-1],d=pb[k];
   if(a.x===b.x&&c.x===d.x&&a.x===c.x)assert.ok(Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))<=Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)),'独立关系不能共用纵向线段');
   if(a.y===b.y&&c.y===d.y&&a.y===c.y)assert.ok(Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))<=Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)),'独立关系不能共用横向线段');
  }
 }
}
test('原 MAC 固定/层级图无需新提示也有独立锚点、无假接触且标签避父框',async t=>{
 const f=fixture(t);mac(f);const s=await scene(f.load(),'mac:overview');distinguish(s);
 const anchors=s.nets.filter(n=>n.endpoints.includes('mac:control')).map(n=>n.branches.find(b=>b.endpoint==='mac:control')!.points[0]);assert.equal(new Set(anchors.map(p=>JSON.stringify(p))).size,3);
 const parent=s.nodes.find(n=>n.id==='mac:data-plane')!;
 const borders=[{x:parent.x-1,y:parent.y,width:2,height:parent.height},{x:parent.x+parent.width-1,y:parent.y,width:2,height:parent.height},{x:parent.x,y:parent.y,width:parent.width,height:2},{x:parent.x,y:parent.y+parent.height-1,width:parent.width,height:2}];
 for(const net of s.nets)assert.ok(!borders.some(b=>intersects(b,net.labelBox)),net.id+' 的标题不能压父容器边框');
});
test('真实多端点图的每个标记均位于实际 T 点，共享段只绘制一次',async t=>{
 const f=fixture(t),graph=f.load(),before=JSON.stringify([...graph.connections.values()]),s=await scene(graph,'board:flash-wiring'),net=s.nets.find(n=>n.id==='board:net.FLASH_SCK')!;
 assert.equal(net.endpoints.length,3);assert.ok(net.junctions!.length>=1);
 for(const point of net.junctions!){const directions=new Set<string>();for(const path of drawnPaths(net))for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i];if(!on(point,a,b))continue;for(const p of [a,b])if(!same(p,point))directions.add(p.x<point.x?'left':p.x>point.x?'right':p.y<point.y?'up':'down');}assert.ok(directions.size>=3,'分叉标记必须有至少三个实际方向');}
 const drawn=drawnPaths(net);for(const [i,a]of drawn.entries())for(const b of drawn.slice(i+1))for(let j=1;j<a.points.length;j++)for(let k=1;k<b.points.length;k++){
  const p=a.points[j-1],q=a.points[j],r=b.points[k-1],s=b.points[k];
  if(p.x===q.x&&r.x===s.x&&p.x===r.x)assert.ok(Math.min(Math.max(p.y,q.y),Math.max(r.y,s.y))<=Math.max(Math.min(p.y,q.y),Math.min(r.y,s.y)));
  if(p.y===q.y&&r.y===s.y&&p.y===r.y)assert.ok(Math.min(Math.max(p.x,q.x),Math.max(r.x,s.x))<=Math.max(Math.min(p.x,q.x),Math.min(r.x,s.x)));
 }
 assert.equal(JSON.stringify([...graph.connections.values()]),before);assert.equal((svg(s,false).match(/<circle cx="[^"]+" cy="[^"]+" r="3"/g)??[]).length,net.junctions!.length);
});
test('order/align 替代逐节点坐标，主通路及下方反馈共享实际渲染路径',async t=>{
 const f=fixture(t);mac(f);enable(f);
 f.edit('views',d=>{d.views[0].layout={direction:'LR',constraints:[{type:'order',axis:'x',nodes:['mac:control','mac:data-plane']},{type:'order',axis:'y',nodes:['mac:tx','mac:rx'],gap:100},{type:'order',axis:'x',nodes:['mac:rx','mac:fifo'],gap:220},{type:'align',axis:'x',nodes:['mac:tx','mac:rx']},{type:'align',axis:'y',nodes:['mac:rx','mac:fifo']}],relationHints:{'mac:rel.rxfifo':{priority:'main',endpointSides:{'mac:rx':'right','mac:fifo':'left'}},'mac:rel.event':{channel:'bottom'}}};});
 const graph=f.load(),before=JSON.stringify([...graph.index]),s=await scene(graph,'mac:overview'),node=(id:string)=>s.nodes.find(n=>n.id==='mac:'+id)!;
 assert.ok(node('control').x+node('control').width+80<=node('data-plane').x+.001);assert.equal(node('tx').x,node('rx').x);assert.equal(node('rx').y+node('rx').height/2,node('fifo').y+node('fifo').height/2);
 const event=s.nets.find(n=>n.id==='mac:rel.event')!;assert.ok(event.branches.flatMap(b=>b.points).some(p=>p.y>Math.max(...s.nodes.map(n=>n.y+n.height))+40));distinguish(s);assert.equal(JSON.stringify([...graph.index]),before);
});
test('backbone 接受真实端点，第三端点仍参与完整渲染树',async t=>{
 const f=fixture(t);enable(f);f.edit('views',d=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{backbone:['board:U1.QSPI_CLK','board:U5.CLK']}});
 const s=await scene(f.load(),'board:flash-wiring'),net=s.nets[0];assert.equal(net.endpoints.length,3);assert.ok(net.branches.some(b=>b.endpoint==='board:J1.SCK'));assert.ok(net.junctions!.length);assert.ok(net.branches.every(b=>same(b.points.at(-1)!,net.hub)));
});
for(const [name,mutate,code]of [
 ['未协商能力',(d:any)=>d.views[0].layout.relationHints={},'IR_FEATURE_REQUIRED'],
 ['不存在的关系',(d:any)=>d.views[0].layout.relationHints={missing:{priority:'main'}},'LAYOUT_REFERENCE'],
 ['不是原关系端点',(d:any)=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{backbone:['board:U1.QSPI_CLK','board:U5.IO0']}},'LAYOUT_BACKBONE'],
 ['重复主干端点',(d:any)=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{backbone:['board:U5.CLK','board:U5.CLK']}},'SCHEMA'],
 ['用显示侧边覆盖真实端口',(d:any)=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{endpointSides:{'board:U5.CLK':'top'}}},'LAYOUT_ENDPOINT'],
 ['多端点通道尚不支持',(d:any)=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{channel:'bottom'}},'LAYOUT_CHANNEL'],
 ['拼错字段',(d:any)=>d.views[0].layout.relationHints={'board:net.FLASH_SCK':{backbon:['board:U1.QSPI_CLK','board:U5.CLK']}},'SCHEMA']
] as const)test(name+' 明确报错',t=>{const f=fixture(t);if(name!=='未协商能力')enable(f);f.edit('views',mutate);expectCode(f.load,code);});
test('跨父容器约束和视图外引用不静默忽略',t=>{
 const f=fixture(t);mac(f);enable(f);f.edit('views',d=>d.views[0].layout.constraints=[{type:'align',axis:'x',nodes:['mac:control','mac:rx']}]);expectCode(f.load,'LAYOUT_SCOPE');
 f.edit('views',d=>d.views[0].layout.constraints=[{type:'align',axis:'x',nodes:['mac:state.idle','mac:control']}]);expectCode(f.load,'LAYOUT_SCOPE');
});
test('循环顺序、对齐矛盾及固定位置冲突均不能悄悄违背',async t=>{
 const f=fixture(t);mac(f);enable(f);
 for(const constraints of [[{type:'order',axis:'x',nodes:['mac:tx','mac:rx']},{type:'order',axis:'x',nodes:['mac:rx','mac:tx']}],[{type:'align',axis:'x',nodes:['mac:rx','mac:fifo']}],[{type:'order',axis:'x',nodes:['mac:fifo','mac:rx']}]]){
  f.edit('views',d=>d.views[0].layout.constraints=constraints);await assert.rejects(async()=>scene(f.load(),'mac:overview'),/布局约束冲突|order 与 align/);
 }
});
test('接口折叠/单端展开/全展开后，原关系布局提示不引用临时 ID',async t=>{
 const f=interfaceFixture(t);enable(f);f.edit('views',d=>d.views[0].layout.relationHints={'ifdemo:net.ctrl_awvalid':{priority:'main'}});
 const graph=f.load(),model=prepareInterfaceModel(graph,'gallery:interface-buses')!,original=JSON.stringify(model),initial=initialInterfaceState(model);
 for(const modes of [initial.modes,{...initial.modes,'ifdemo:engine.s_ctrl':'expanded' as const},Object.fromEntries(Object.keys(initial.modes).map(id=>[id,'expanded' as const]))]){
  const s=await interfaceScene(model,{...initial,modes});const net=s.nets.find(n=>n.sourceRelations!.some(r=>r.id==='ifdemo:net.ctrl_awvalid'))!;assert.equal(net.id,'ifdemo:net.ctrl_awvalid');assert.equal(net.sourceRelations!.length,1);assert.equal(s.nets.reduce((sum,n)=>sum+n.sourceRelations!.length,0),17);
 }
 assert.equal(JSON.stringify(model),original);
});
test('四端点树可以有多个真实 T 点，主干与所有分支均有可读标签',async t=>{
 const f=fixture(t);enable(f);const ids=['a','b','c','d'];
 f.edit('objects',d=>d.objects=ids.map(id=>({id,kind:'node',label:id,ports:[{id:id+'.p',label:'CLK',direction:id==='a'?'out':'in'}]})));
 f.edit('relations',d=>d.relations=[{id:'clk',kind:'connection',class:'clock',label:'CLOCK_TREE',endpoints:ids.map(id=>id+'.p'),direction:{sources:['a.p'],targets:['b.p','c.p','d.p']}}]);
 f.edit('views',d=>d.views=[{id:'v',kind:'wiring',include:{objects:ids,relations:['clk']},layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:900,y:0},{objectId:'c',x:450,y:300},{objectId:'d',x:900,y:450}],relationHints:{clk:{backbone:['a.p','b.p']}}}}]);
 const s=await scene(f.load(),'v'),net=s.nets[0];assert.equal(net.branches.length,4);assert.ok(net.junctions!.length>=2);assert.ok(net.branches.every(b=>same(b.points.at(-1)!,net.hub)));
 const center={x:net.labelBox.x+net.labelBox.width/2,y:net.labelBox.y+net.labelBox.height/2};assert.ok(drawnPaths(net).some(path=>path.points.slice(1).some((p,i)=>on(center,path.points[i],p))));
 assert.equal(drawnPaths(net).filter(p=>p.arrow).length,3);assert.match(svg(s,false),/orient="auto"/);
});
test('传递对齐保留共同轴，未指定的另一轴自动分开节点',async t=>{
 const f=fixture(t);enable(f);f.edit('objects',d=>d.objects=['a','b','c'].map(id=>({id,kind:'node',label:id})));
 f.edit('relations',d=>d.relations=[]);f.edit('views',d=>d.views=[{id:'v',kind:'architecture',include:{objects:['a','b','c'],relations:[]},layout:{constraints:[{type:'align',axis:'x',nodes:['a','b']},{type:'align',axis:'x',nodes:['b','c']}]}}]);
 const s=await scene(f.load(),'v');assert.equal(new Set(s.nodes.map(n=>n.x)).size,1);for(const [i,a]of s.nodes.entries())for(const b of s.nodes.slice(i+1))assert.ok(!intersects(a,b));
});
test('布局字典将特殊字段名当作稳定关系 ID，接口投影不丢失专属提示',async t=>{
 const f=interfaceFixture(t);enable(f);f.edit('relations',d=>d.relations[0].id='__proto__');f.edit('views',d=>{for(const view of d.views)view.include.relations=view.include.relations.map((id:string)=>id==='ifdemo:net.ctrl_awaddr'?'__proto__':id);d.views[0].layout.relationHints=Object.fromEntries([['__proto__',{priority:'main'}]]);});
 const s=await scene(f.load(),'gallery:interface-buses'),net=s.nets.find(n=>n.id==='__proto__')!;assert.ok(net);assert.equal(net.sourceRelations!.length,1);assert.equal(net.sourceRelations![0].id,'__proto__');
});
