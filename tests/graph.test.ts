import test from 'node:test';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {fixture} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
test('同一三端点 Net 渲染三分支，Ball/Pin 来自同一事实',async t=>{
 const f=fixture(t); const s=await scene(f.load(),'board:flash-wiring'); const n=s.nets.find(n=>n.id==='board:net.FLASH_SCK')!;
 const xml=spawnSync('python3',['-c','import sys,xml.etree.ElementTree as ET;ET.fromstring(sys.stdin.read())'],{input:svg(s),encoding:'utf8',timeout:5000});assert.equal(xml.status,0,xml.stderr);
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
test('相反状态迁移使用分离的条件标签，避免重叠',async t=>{const f=fixture(t);f.edit('objects',d=>d.objects=[{id:'a',kind:'node',label:'A'},{id:'b',kind:'node',label:'B'}]);f.edit('relations',d=>d.relations=[{id:'ab',kind:'connection',class:'control',label:'!ready',endpoints:['a','b']},{id:'ba',kind:'connection',class:'event',label:'ready',endpoints:['b','a']}]);f.edit('views',d=>d.views=[{id:'states',kind:'state',include:{objects:['a','b'],relations:['ab','ba']}}]);const s=await scene(f.load(),'states');assert.ok(!intersects(s.nets[0].labelBox,s.nets[1].labelBox));assert.ok(!same(s.nets[0].branches[0].points[0],s.nets[1].branches[1].points[0]));assert.match(svg(s,false),/!ready/);});

// 针对实际扇出图回归路径质量，不能只统计节点数量或 SVG 根边界。
import {crosses,intersects,inside,same} from '../packages/render-graph/geometry.ts';
import type {Scene} from '../packages/render-graph/index.ts';
function clean(s:Scene,orthogonal=true){
 const obstacles=s.nodes.filter(n=>!s.nodes.some(child=>child.parentId===n.id));
 for(const net of s.nets){
  const center={x:net.labelBox.x+net.labelBox.width/2,y:net.labelBox.y+net.labelBox.height/2};
  assert.ok(net.branches.some(b=>b.points.slice(1).some((p,i)=>{const a=b.points[i];return Math.abs((p.x-a.x)*(center.y-a.y)-(p.y-a.y)*(center.x-a.x))<.01&&center.x>=Math.min(a.x,p.x)-.01&&center.x<=Math.max(a.x,p.x)+.01&&center.y>=Math.min(a.y,p.y)-.01&&center.y<=Math.max(a.y,p.y)+.01;})),`${net.id}: 标题必须直接落在所属线上`);
  for(const other of s.nets.filter(n=>n!==net))for(const b of other.branches)for(let i=1;i<b.points.length;i++)assert.ok(!crosses(b.points[i-1],b.points[i],net.labelBox),`${net.id}: 标题背景不能遮断其他关系`);
  assert.ok(!obstacles.some(n=>inside(net.hub,n)),`${net.id}: 汇合点不能落在节点内部`);
  assert.ok(!obstacles.some(n=>intersects(net.labelBox,n)),`${net.id}: 标签不能覆盖节点`);
  for(const branch of net.branches){
   const node=s.nodes.find(n=>n.id===branch.endpoint||n.ports.some(p=>p.id===branch.endpoint))!;
   const port=node.ports.find(p=>p.id===branch.endpoint),first=branch.points[0];
   if(port)assert.ok(same(first,port),`${branch.endpoint}: 必须精确连接真实端口`);
   else assert.ok(((first.x===node.x||first.x===node.x+node.width)&&first.y>=node.y&&first.y<=node.y+node.height)||((first.y===node.y||first.y===node.y+node.height)&&first.x>=node.x&&first.x<=node.x+node.width),`${branch.endpoint}: 必须从节点边界出线`);
   for(let i=1;i<branch.points.length;i++){
    const a=branch.points[i-1],b=branch.points[i];if(orthogonal)assert.ok(Math.abs(a.x-b.x)<.001||Math.abs(a.y-b.y)<.001,`${net.id}: 正交线不能出现斜段`);
    assert.ok(!obstacles.some(n=>crosses(a,b,n)),`${net.id}: 连线不能穿入节点`);
   }
  }
 }
 for(let i=0;i<s.nets.length;i++)for(const other of s.nets.slice(i+1))assert.ok(!intersects(s.nets[i].labelBox,other.labelBox),'关系标签不能重叠');
}
function architecture(f:ReturnType<typeof fixture>,direction='TB'){
 f.edit('objects',d=>d.objects=['s','a','b','c','d'].map(id=>({id,kind:'node',label:id==='s'?'电源转换':'模块 '+id})));
 f.edit('relations',d=>d.relations=[...['a','b','c','d'].map(id=>({id:'s:'+id,kind:'connection',class:'功能关联',label:'供电',endpoints:['s',id]})),{id:'a:d',kind:'connection',class:'control',label:'控制与通信',endpoints:['a','d']}]);
 f.edit('views',d=>d.views=[{id:'v',kind:'architecture',include:{objects:['s','a','b','c','d'],relations:['s:a','s:b','s:c','s:d','a:d']},layout:{direction,routing:'orthogonal'}}]);
}
test('四个布局方向的扇出与跨层关系从正确框边连接，路径与标签无碰撞',async t=>{
 const f=fixture(t);
 for(const direction of ['LR','RL','TB','BT']){architecture(f,direction);const s=await scene(f.load(),'v');clean(s);
  const source=s.nodes.find(n=>n.id==='s')!;
  assert.equal(new Set(s.nets.filter(n=>n.endpoints[0]==='s').map(n=>JSON.stringify(n.branches[0].points[0]))).size,4,'无端口框的扇出应分配独立边界位置');
  for(const net of s.nets.filter(n=>n.endpoints[0]==='s')){const p=net.branches[0].points[0];assert.equal(direction==='LR'?p.x:direction==='RL'?p.x:direction==='TB'?p.y:p.y,direction==='LR'?source.x+source.width:direction==='RL'?source.x:direction==='TB'?source.y+source.height:source.y);}
 }
});

test('显示配置只隐藏文字，保留端口、完整关系与可查询属性，重复功能名不重复显示',async t=>{
 const f=fixture(t),before=f.load(),s=await scene(before,'board:flash-wiring');
 assert.deepEqual(s.display,{showPortAttributes:false,showRelationLabels:true,showInterfaceDetails:true});
 const p=s.nodes.flatMap(n=>n.ports).find(p=>p.id==='board:U1.QSPI_CLK')!;
 assert.match(p.annotation,/ball A12/);assert.ok(!p.annotation.includes('function QSPI_CLK'));
 assert.match(svg(s,false),/data-port-annotation="board:U1.QSPI_CLK" display="none"/);
 f.edit('views',d=>{d.views[0].display.showPortAttributes=true;d.views[0].display.showRelationLabels=false;});
 const changed=await scene(f.load(),s.id);assert.deepEqual(changed.nodes,s.nodes);assert.deepEqual(changed.nets,s.nets);
 assert.match(svg(changed,false),/data-port-annotation="board:U1.QSPI_CLK" x=/);
 assert.match(svg(changed,false),/data-relation-label="board:net.FLASH_SCK" display="none"/);
 assert.equal((before.index.get(p.id)!.entity as any).attributes.function,'QSPI_CLK');
});
test('固定位置保持不动，连接绕开中间无关节点并保留标签空间',async t=>{
 const f=fixture(t);f.edit('objects',d=>d.objects=['a','b','obstacle'].map(id=>({id,kind:'node',label:id})));
 f.edit('relations',d=>d.relations=[{id:'ab',kind:'connection',class:'control',label:'控制链路',endpoints:['a','b']}]);
 f.edit('views',d=>d.views=[{id:'v',kind:'architecture',include:{objects:['a','b','obstacle'],relations:['ab']},layout:{direction:'LR',positions:[{objectId:'a',x:0,y:80},{objectId:'b',x:900,y:80},{objectId:'obstacle',x:450,y:60}]}}]);
 const s=await scene(f.load(),'v');clean(s);assert.equal(s.nodes.find(n=>n.id==='a')!.x,60);assert.equal(s.nodes.find(n=>n.id==='b')!.x,960);assert.ok(s.nets[0].branches.flatMap(b=>b.points).length>=6);
});

test('polyline 自动布局的标题也落在真实线段上且不遮断其他关系',async t=>{
 const f=fixture(t);architecture(f,'LR');f.edit('views',d=>d.views[0].layout.routing='polyline');clean(await scene(f.load(),'v'),false);
});
test('真实三端点图使用共同外部分叉，保留全部端点与方向',async t=>{
 const f=fixture(t),s=await scene(f.load(),'board:flash-wiring');clean(s);
 const net=s.nets.find(n=>n.id==='board:net.FLASH_SCK')!;assert.equal(net.junction,true);assert.equal(net.branches.length,3);
 assert.deepEqual(net.branches.map(b=>b.endpoint),net.endpoints);assert.equal(net.branches.filter(b=>b.arrow).length,2);
 for(const branch of net.branches)assert.ok(same(branch.points.at(-1)!,net.hub));
});
test('长中文标签参与布局，平行及反向关系保持独立路径与标签',async t=>{
 const f=fixture(t);architecture(f,'LR');
 f.edit('relations',d=>d.relations=[{id:'one',kind:'connection',class:'clock',label:'很长的中文时钟与配置说明不能遮住其他模块和连线',endpoints:['s','a']},{id:'two',kind:'connection',class:'control',label:'复位条件',endpoints:['s','a']},{id:'back',kind:'connection',class:'event',label:'返回状态',endpoints:['a','s']}]);
 f.edit('views',d=>d.views[0].include.relations=['one','two','back']);
 const s=await scene(f.load(),'v');clean(s);assert.ok(s.nets[0].labelBox.lines.length>1);assert.ok(s.nets.every(n=>!n.junction));
 assert.match(svg(s,false),/data-legend-class="clock"/);assert.match(svg(s,false),/data-relation-label="one"/);
});

test('固定位置的循环控制关系不被先放置的标签堵住公共出线口',async t=>{
 const f=fixture(t);f.edit('objects',d=>d.objects=['a','b','c'].map(id=>({id,kind:'node',label:id})));
 f.edit('relations',d=>d.relations=[['a','b'],['b','c'],['c','a']].map(([a,b])=>({id:a+b,kind:'connection',class:'control',label:'控制与状态反馈 '+a+b,endpoints:[a,b]})));
 f.edit('views',d=>d.views=[{id:'v',kind:'architecture',include:{objects:['a','b','c'],relations:['ab','bc','ca']},layout:{positions:[{objectId:'a',x:0,y:100},{objectId:'b',x:450,y:100},{objectId:'c',x:900,y:100}]}}]);
 clean(await scene(f.load(),'v'));
});

test('固定位置短出线通道为线上标题绕线，保留真实端口与多端点分叉',async t=>{
 const f=fixture(t);
 for(const count of [2,3]){
  const ids=['a','b','c'].slice(0,count);
  f.edit('objects',d=>d.objects=ids.map(id=>({id,kind:'node',label:id,ports:[{id:id+'.p',label:'CLK',direction:id==='a'?'out':'in',width:1}]})));
  f.edit('relations',d=>d.relations=[{id:'clk',kind:'connection',class:'clock',label:'REFCLK_1_50M',endpoints:ids.map(id=>id+'.p'),direction:{sources:['a.p'],targets:ids.slice(1).map(id=>id+'.p')}}]);
  f.edit('views',d=>d.views=[{id:'v',kind:'wiring',include:{objects:ids,relations:['clk']},layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:540,y:60},...(count===3?[{objectId:'c',x:540,y:300}]:[])]}}]);
  const s=await scene(f.load(),'v');clean(s);const net=s.nets[0];assert.equal(net.branches.length,count);assert.equal(net.branches.filter(b=>b.arrow).length,count-1);
  assert.equal(s.nodes.find(n=>n.id==='a')!.x,60);assert.equal(s.nodes.find(n=>n.id==='b')!.x,600);
  assert.deepEqual(net.endpoints,ids.map(id=>id+'.p'));assert.ok(net.branches.every(b=>same(b.points.at(-1)!,net.hub)));
 }
});

test('多端点标题绕线在清理虚拟汇合点后仍落在保留的真实连接树上',async t=>{
 const f=fixture(t);
 f.edit('objects',d=>d.objects=[
  {id:'a',kind:'node',label:'传感器',ports:[{id:'a.scl',label:'SCL',direction:'unknown'},{id:'a.sda',label:'SDA',direction:'unknown'}]},
  {id:'b',kind:'node',label:'控制器',ports:[{id:'b.scl',label:'SCL',direction:'unknown'},{id:'b.sda',label:'SDA',direction:'unknown'}]},
  ...['data-pull','clock-pull'].map(id=>({id,kind:'node',label:id,ports:[{id:id+'.p',label:'1',direction:'unknown'}]}))
 ]);
 f.edit('relations',d=>d.relations=[
  {id:'sda',kind:'connection',class:'control',label:'I2C_MCU_TMP_SDA',endpoints:['a.sda','b.sda','data-pull.p']},
  {id:'scl',kind:'connection',class:'control',label:'I2C_MCU_TMP_SCL',endpoints:['a.scl','clock-pull.p','b.scl']}
 ]);
 f.edit('views',d=>d.views=[{id:'v',kind:'wiring',include:{objects:[],relations:['sda','scl']},layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:540,y:60},{objectId:'data-pull',x:0,y:320},{objectId:'clock-pull',x:540,y:380}]}}]);
 const s=await scene(f.load(),'v');clean(s);
 for(const net of s.nets){assert.equal(net.branches.length,3);assert.deepEqual(net.branches.map(b=>b.endpoint),net.endpoints);}
});
