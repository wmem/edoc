import test from 'node:test';
import assert from 'node:assert/strict';
import {interfaceFixture} from './interface-fixture.ts';
import {expectCode} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {prepareInterfaceModel,interfaceScene,initialInterfaceState} from '../packages/render-graph/interfaces.ts';
import {query} from '../packages/core/index.ts';
import {crosses,intersects} from '../packages/render-graph/geometry.ts';
import type {Scene} from '../packages/render-graph/scene.ts';
function geometry(s:Scene){
 for(const net of s.nets){const box=net.labelBox,p={x:box.x+box.width/2,y:box.y+box.height/2};
  assert.ok(net.branches.some(b=>b.points.slice(1).some((q,i)=>{const a=b.points[i];return Math.abs((q.x-a.x)*(p.y-a.y)-(q.y-a.y)*(p.x-a.x))<.01&&p.x>=Math.min(a.x,q.x)-.01&&p.x<=Math.max(a.x,q.x)+.01&&p.y>=Math.min(a.y,q.y)-.01&&p.y<=Math.max(a.y,q.y)+.01;})),net.id+' 标题必须在线上');
  for(const n of s.nodes)assert.ok(!intersects(box,n),net.id+' 标签不能盖框');
  for(const b of net.branches){const port=s.nodes.flatMap(n=>n.ports).find(p=>p.id===b.endpoint)!;assert.ok(Math.abs(b.points[0].x-port.x)<.001&&Math.abs(b.points[0].y-port.y)<.001,'真实显示端点必须准确挂接');for(let i=1;i<b.points.length;i++)for(const n of s.nodes)assert.ok(!crosses(b.points[i-1],b.points[i],n),net.id+' 连线不能穿框');}
  for(const other of s.nets.filter(n=>n!==net)){assert.ok(!intersects(box,other.labelBox));for(const b of other.branches)for(let i=1;i<b.points.length;i++)assert.ok(!crosses(b.points[i-1],b.points[i],box));}
 }
}
const host='ifdemo:host.m_ctrl',ctrl='ifdemo:engine.s_ctrl',dma='ifdemo:engine.m_dma';
test('接口归属与查询独立，保留真实端口、方向、来源关系和未知参数',t=>{
 const f=interfaceFixture(t),g=f.load(),q=query(g,ctrl,{depth:1});assert.equal(q.target.type,'interface');assert.equal(q.target.ownerId,'ifdemo:engine');assert.equal(q.directRelations.length,9);assert.ok(q.expansion.items.some(e=>e.id==='ifdemo:engine.ctrl_optional'));
 assert.equal(g.interfaceByPort!.get('ifdemo:engine.ctrl_awvalid'),ctrl);assert.equal((g.index.get('ifdemo:engine.ctrl_optional')!.entity as any).widthExpr,'OPTION_WIDTH');
 assert.equal((g.index.get('ifdemo:engine.ctrl_awready')!.entity as any).direction,'out');
});
for(const [name,change,code]of [
 ['跨模块成员',(d:any)=>d.objects[1].interfaces[0].members.push('ifdemo:host.ctrl_awvalid'),'INTERFACE_OWNER'],
 ['重复接口归属',(d:any)=>d.objects[1].interfaces[1].members.push('ifdemo:engine.ctrl_awvalid'),'INTERFACE_MEMBER'],
 ['不存在的成员',(d:any)=>d.objects[1].interfaces[0].members.push('missing'),'REFERENCE_MISSING'],
 ['成员不是信号端口',(d:any)=>d.objects[1].interfaces[0].members.push('ifdemo:engine'),'REFERENCE_TYPE'],
 ['接口与端口重名',(d:any)=>d.objects[1].interfaces[0].id='ifdemo:engine.ctrl_awvalid','DUPLICATE_ID'],
 ['空接口成员',(d:any)=>d.objects[1].interfaces[0].members=[],'SCHEMA'],
]as const)test(name+' 明确失败',t=>{const f=interfaceFixture(t);f.edit('objects',change);expectCode(f.load,code);});
test('接口必须协商必需能力，视图不能把接口当成真实 Connection 端点',t=>{
 const f=interfaceFixture(t);f.edit('manifest',d=>d.requiredFeatures=[]);expectCode(f.load,'IR_FEATURE_REQUIRED');f.edit('manifest',d=>d.requiredFeatures=['interface-groups']);f.edit('relations',d=>d.relations[0].endpoints[0]=host);expectCode(f.load,'REFERENCE_TYPE');
});
test('分组附注显隐及四接口全部状态组合都保留原关系/成员，单端显示槽位且两组接口独立',{timeout:20000},async t=>{
 const f=interfaceFixture(t),g=f.load(),model=prepareInterfaceModel(g,'gallery:interface-buses')!,original=structuredClone(model),ids=model.nodes.flatMap(n=>n.interfaces!.map(i=>i.id));
 for(const showInterfaceDetails of [true,false])for(let mask=0;mask<16;mask++){
  const s=await interfaceScene(model,{modes:Object.fromEntries(ids.map((id,i)=>[id,mask&(1<<i)?'expanded':'collapsed'])),classes:null,showInterfaceDetails});geometry(s);
  const originals=s.nets.flatMap(n=>n.sourceRelations!);assert.equal(originals.length,17);assert.deepEqual(new Set(originals.map(r=>r.id)),new Set(model.relations.map(r=>r.id)));for(const r of originals)assert.deepEqual(r,model.relations.find(old=>old.id===r.id));
 }
 const collapsed=await interfaceScene(model),mixed=await interfaceScene(model,{modes:{...initialInterfaceState(model).modes,[ctrl]:'expanded'},classes:null});
 assert.equal(collapsed.nets.length,2);assert.equal(mixed.nets.length,10);assert.equal(mixed.interfaces!.find(i=>i.id===dma)!.expanded,false);assert.equal(mixed.nodes.find(n=>n.id==='ifdemo:host')!.ports.filter(p=>p.slot).length,9);
 assert.ok(mixed.nodes.find(n=>n.id==='ifdemo:engine')!.height>collapsed.nodes.find(n=>n.id==='ifdemo:engine')!.height);assert.deepEqual(model,original);
});
test('部分信号视图保留 k/N 成员范围，不因接口自动引入其他信号关系',async t=>{
 const f=interfaceFixture(t);f.edit('views',d=>{d.views[0].include.objects=['ifdemo:engine.ctrl_awvalid'];d.views[0].include.relations=['ifdemo:net.ctrl_awvalid'];});const s=await scene(f.load(),'gallery:interface-buses');assert.equal(s.nets.length,1);assert.equal(s.interfaces!.find(i=>i.id===ctrl)!.visibleMembers.length,1);assert.equal(s.interfaces!.find(i=>i.id===ctrl)!.members.length,10);assert.ok(s.nodes.flatMap(n=>n.ports).some(p=>p.annotation.includes('1/10')));
 f.edit('views',d=>{d.views[0].include.objects=[dma];d.views[0].include.relations=[];});const only=await scene(f.load(),'gallery:interface-buses');assert.equal(only.nodes.length,1);assert.deepEqual(only.interfaces!.map(i=>i.id),[dma]);
});
test('第三端点不会混入双端聚合，分类先过滤原关系且聚合不借用单条方向',async t=>{
 const f=interfaceFixture(t);f.edit('objects',d=>d.objects.push({id:'probe',kind:'node',label:'第三端点',ports:[{id:'probe.p',label:'probe',direction:'unknown'}]}));f.edit('relations',d=>d.relations[0].endpoints.push('probe.p'));
 const model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,s=await interfaceScene(model);geometry(s);assert.equal(s.nets.length,3);const r=s.nets.find(n=>n.sourceRelations!.some(r=>r.id==='ifdemo:net.ctrl_awaddr'))!;assert.equal(r.endpoints.length,3);assert.equal(r.sourceRelations![0].endpoints.length,3);assert.ok(s.nets.filter(n=>n.bundle).every(n=>n.branches.every(b=>!b.arrow)));
 const filtered=await interfaceScene(model,{...initialInterfaceState(model),classes:['control']});assert.ok(filtered.nets.every(n=>n.sourceRelations!.every(r=>r.class==='control')));const empty=await interfaceScene(model,{...initialInterfaceState(model),classes:[]});assert.equal(empty.nets.length,0);
});
test('同模块对的第二个接口不与第一组聚合，展开只改变指定接口',async t=>{
 const f=interfaceFixture(t);f.edit('objects',d=>{for(const n of d.objects.slice(0,2)){const i=structuredClone(n.interfaces[0]);i.id+='2';i.label+='2';i.members=i.members.filter((p:string)=>!p.endsWith('optional')).map((p:string)=>p+'2');for(const p of n.ports.filter((p:any)=>n.interfaces[0].members.includes(p.id)&&!p.id.endsWith('optional'))){const copy=structuredClone(p);copy.id+='2';copy.label+='2';n.ports.push(copy);}n.interfaces.push(i);}});f.edit('relations',d=>d.relations.push(...d.relations.filter((r:any)=>r.id.includes('.ctrl_')).map((r:any)=>({...r,id:r.id+'2',endpoints:r.endpoints.map((p:string)=>p+'2'),direction:undefined}))));f.edit('views',d=>d.views[0].include.relations.push(...d.views[0].include.relations.filter((id:string)=>id.includes('.ctrl_')).map((id:string)=>id+'2')));
 const model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,s=await interfaceScene(model);assert.equal(s.nets.filter(n=>n.bundle).length,3);assert.ok(s.nets.every(n=>!n.interfaceIds!.includes(ctrl)||!n.interfaceIds!.includes(ctrl+'2')));
});
test('接口内部关系折叠时记账，展开恢复，不伪造对外自环',async t=>{
 const f=interfaceFixture(t);f.edit('relations',d=>d.relations.push({id:'internal',kind:'connection',class:'control',label:'内部关系',endpoints:['ifdemo:engine.ctrl_awvalid','ifdemo:engine.ctrl_wvalid']}));f.edit('views',d=>d.views[0].include.relations.push('internal'));
 const model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,s=await interfaceScene(model);assert.deepEqual(s.internalRelations![ctrl],['internal']);const expanded=await interfaceScene(model,{...initialInterfaceState(model),modes:{[ctrl]:'expanded'}});assert.ok(expanded.nets.some(n=>n.id==='internal'));
});
test('固定位置不足时展开明确失败，当前成功场景和源数据保持',async t=>{
 const f=interfaceFixture(t);f.edit('views',d=>d.views[0].layout.positions=[{objectId:'ifdemo:host',x:0,y:0},{objectId:'ifdemo:engine',x:700,y:0},{objectId:'ifdemo:memory',x:0,y:300}]);const model=prepareInterfaceModel(f.load(),'gallery:interface-buses')!,s=await interfaceScene(model);await assert.rejects(()=>interfaceScene(model,{...initialInterfaceState(model),modes:{[host]:'expanded'}}),/固定位置不足以展开/);assert.equal(s.interfaces!.find(i=>i.id===host)!.expanded,false);
});
test('当前 SVG 带聚合来源，完整 SVG 保留所有真实信号及关系',async t=>{
 const f=interfaceFixture(t),g=f.load(),collapsed=await scene(g,'gallery:interface-buses'),full=await scene(g,'gallery:interface-buses',{interfaces:'expanded'});assert.match(svg(collapsed,false),/data-bundle="true"/);assert.ok(!svg(full,false).includes('data-bundle="true"'));assert.equal(full.nets.length,17);assert.ok(svg(collapsed,false).includes('ifdemo:engine.ctrl_optional'));assert.ok(svg(full,false).includes('OPTION_WIDTH'));
});

test('隐藏分组附注收回宽高，保留展开/折叠槽位与完整事实',{timeout:30000},async t=>{
 const f=interfaceFixture(t);
 f.edit('objects',d=>{for(const n of d.objects)for(const [j,i]of (n.interfaces??[]).entries()){i.label=j?'sample':'control';i.role='very_long_interface_role_for_layout';i.protocol='很长的协议附注必须在关闭时停止参与宽度计算'.repeat(3);}});
 const graph=f.load(),model=prepareInterfaceModel(graph,'gallery:interface-buses')!,original=structuredClone(model),initial=initialInterfaceState(model);
 assert.equal(initial.showInterfaceDetails,true);
 const ids=model.nodes.flatMap(n=>(n.interfaces??[]).map(i=>i.id));
 for(const modes of [initial.modes,Object.fromEntries(ids.map(id=>[id,'expanded' as const])),{...initial.modes,[ctrl]:'expanded' as const}]){
  const detailed=await interfaceScene(model,{...initial,modes}),compact=await interfaceScene(model,{...initial,modes,showInterfaceDetails:false});geometry(compact);
  assert.equal(compact.display.showInterfaceDetails,false);
  assert.deepEqual(compact.nets.flatMap(n=>n.sourceRelations).sort((a,b)=>a!.id.localeCompare(b!.id)),detailed.nets.flatMap(n=>n.sourceRelations).sort((a,b)=>a!.id.localeCompare(b!.id)));
  for(const n of compact.nodes){const before=detailed.nodes.find(old=>old.id===n.id)!;assert.ok(n.width<before.width,n.id+' 隐藏的角色与附注不能撑宽');assert.ok(n.height<=before.height,n.id+' 隐藏附注不能增高');
   if(!n.ports.some(p=>p.slot))assert.ok(n.height<before.height,n.id+' 无槽位约束时应收回行高');
   for(const p of n.ports.filter(p=>p.interfaceHeader)){assert.ok(['sample','control'].includes(p.label));assert.equal(p.annotation,'');const members=n.ports.filter(member=>member.interfaceId===p.id&&!member.interfaceHeader&&!member.slot);if(members.length)assert.ok(members[0].y-p.y<before.ports.find(member=>member.id===members[0].id)!.y-before.ports.find(header=>header.id===p.id)!.y);}
   for(const p of n.ports.filter(p=>p.slot)){const header=n.ports.find(header=>header.id===p.interfaceId)!;assert.ok(Math.abs(p.y-header.y)<=(header.padHeight??0)/2,'所有接入槽位仍须位于接口垫片范围内');}
  }
  const content=svg(compact,false);assert.ok(!content.includes('data-interface-annotation='));assert.ok(!content.includes(' · very_long_interface_role_for_layout</text>'));assert.ok(content.includes('很长的协议附注'),'隐藏后元数据仍携带协议事实');
 }
 assert.deepEqual(model,original);assert.equal((query(graph,ctrl).target.entity as any).role,'very_long_interface_role_for_layout');
 f.edit('views',d=>d.views[0].display.showInterfaceDetails=false);
 const configured=f.load(),full=await scene(configured,'gallery:interface-buses',{interfaces:'expanded'});assert.equal(full.display.showInterfaceDetails,false);assert.equal(full.nets.length,17);assert.ok(!svg(full,false).includes('data-interface-annotation='));
 const restored=await interfaceScene(prepareInterfaceModel(configured,'gallery:interface-buses')!,{...initial,showInterfaceDetails:true});assert.match(svg(restored,false),/data-interface-annotation=/);
});

for(const [name,edit,code]of [
 ['非法展开模式',(d:any)=>d.views[0].display.interfaceMode='both','SCHEMA'],
 ['覆盖引用不存在',(d:any)=>d.views[0].display.interfaceOverrides={missing:'expanded'},'REFERENCE_MISSING'],
 ['接口排序引用普通端口',(d:any)=>d.views[0].layout.interfaceOrder=['ifdemo:engine.ctrl_awvalid'],'REFERENCE_TYPE'],
]as const)test(name+' 不静默忽略',t=>{const f=interfaceFixture(t);f.edit('views',edit);expectCode(f.load,code);});
test('同一接口内重复成员由 Schema 拒绝',t=>{const f=interfaceFixture(t);f.edit('objects',d=>d.objects[1].interfaces[0].members.push(d.objects[1].interfaces[0].members[0]));expectCode(f.load,'SCHEMA');});
test('接口与模块的 overview/detailed 标签共用同一批真实成员',async t=>{
 const {writeFileSync}=await import('node:fs'),{join}=await import('node:path'),{renderDocument}=await import('../packages/doc-theme/render.ts');
 const f=interfaceFixture(t);writeFileSync(join(f.root,'docs/interfaces.mdoc'),'{% interface-table id="ifdemo:engine" mode="overview" /%}\n{% interface-table id="ifdemo:engine.s_ctrl" mode="detailed" /%}');f.edit('manifest',d=>d.entryDocuments=['docs/interfaces.mdoc']);const doc=await renderDocument(f.load(),'接口');assert.match(doc.chapters,/S_AXI_CTRL/);assert.match(doc.chapters,/M_AXI_DMA/);assert.match(doc.chapters,/ctrl_optional/);assert.match(doc.chapters,/OPTION_WIDTH/);assert.ok(!doc.chapters.includes('未分组信号'));
});

test('未指定接口边时按真实邻接布局选边，四方向中整组信号保持同边',async t=>{
 const f=interfaceFixture(t);
 for(const direction of ['LR','RL','TB','BT']){f.edit('views',d=>{delete d.views[0].layout.interfaceSides;d.views[0].layout.direction=direction;});const s=await scene(f.load(),'gallery:interface-buses',{interfaces:'expanded'});geometry(s);for(const i of s.interfaces!){const sides=new Set(s.nodes.flatMap(n=>n.ports).filter(p=>p.interfaceId===i.id).map(p=>p.side));assert.equal(sides.size,1);}}
});
