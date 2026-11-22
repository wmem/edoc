import {wrapText,measureText} from '../packages/render-graph/text.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graphFromResources} from '../packages/core/graph.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import {onShapeBoundary} from '../packages/drawing/shapes.ts';
import type {ControlModel,ControlView} from '../packages/extensions/control-diagram/types.ts';
import {presentation,projectControl,commonClockCaption} from '../packages/extensions/control-diagram/project.ts';
import {simplify} from '../packages/render-graph/geometry.ts';
import {relationDiagramHTML} from '../packages/extensions/relation-diagram/render.ts';
const graph=(models:ControlModel[],views:ControlView[]=[])=>graphFromResources([{type:'stateMachines',data:{stateMachines:models.filter(m=>m.kind==='state-machine')},file:'data.json'},{type:'flowcharts',data:{flowcharts:models.filter(m=>m.kind==='flowchart')},file:'data.json'},{type:'views',data:{views},file:'views.json'}],{projectId:'alignment',irVersion:'2.0',entryDocuments:[],resources:[],requiredFeatures:['state-machines','flowcharts']},{root:process.cwd(),strict:true});
const json=(name:string)=>JSON.parse(readFileSync('docs/ir/authoring/'+name+'.json','utf8'));
const machine=()=>json('states').stateMachines[0];
const chain=()=>({id:'sm:chain',kind:'state-machine',initial:'idle',states:['idle','prepare','send','done'].map(id=>({id,label:id.toUpperCase()})),transitions:[['start-transfer','idle','prepare','start'],['prepared','prepare','send','prepare_done'],['last-beat','send','done','tx_valid && tx_ready && tx_last'],['return-idle','done','idle',"1'b1"]].map(([id,from,to,guard])=>({id,from,to,guard,trigger:{kind:'clock',clock:'clk',edge:'rising'}}))} as any);
const eq=(a:number,b:number)=>assert.ok(Math.abs(a-b)<.01,`${a} 与 ${b} 应对齐`);
const center=(n:{x:number;y:number;width:number;height:number},axis:'x'|'y')=>n[axis]+n[axis==='x'?'width':'height']/2;
test('显式分层的四状态主链仍同轴且直接连接，回边独立走外围',async()=>{
 const model=chain(),before=JSON.stringify(model),view:ControlView={id:'chain:layered',kind:'state-machine',model:model.id,layout:{arrangement:'layered',routing:'orthogonal'}},s=await scene(graph([model],[view]),view.id),g=s.drawing!;
 assert.equal(JSON.stringify(model),before);const states=g.nodes.filter(n=>model.states.some((state:any)=>state.id===n.id));assert.equal(states.length,4);assert.ok(states.every(n=>n.shape==='ellipse'));
 for(const n of states)eq(center(n,'y'),center(states[0],'y'));
 for(const id of ['start-transfer','prepared','last-beat']){const edge=g.connections.find(c=>c.id===id)!;assert.equal(edge.paths[0].points.length,2,id+' 应为直线');eq(edge.ends[0].y,edge.ends[1].y);}
 const initial=g.connections.find(c=>!model.transitions.some((t:any)=>t.id===c.id))!;assert.equal(initial.paths[0].points.length,2,'初始入口应直接连接');
 const back=g.connections.find(c=>c.id==='return-idle')!;assert.ok(Math.min(...back.paths.flatMap(p=>p.points.map(p=>p.y)))<Math.min(...states.map(n=>n.y)));
 for(const c of g.connections)for(const e of c.ends)assert.ok(onShapeBoundary(g.nodes.find(n=>n.id===e.node)!,e));
 for(const n of states)for(const t of [n.title,...n.contents])for(const x of [t.x,t.x+t.width])for(const y of [t.y,t.y+t.height])assert.ok(((x-center(n,'x'))/(n.width/2))**2+((y-center(n,'y'))/(n.height/2))**2<=1.001,'文字必须在真实椭圆内');
 const xml=svg(s,false);assert.match(xml,/PREPARE/);assert.match(xml,/prepare_done/);
 const markerIDs=new Set([...xml.matchAll(/<marker id="([^"]+)"/g)].map(m=>m[1])),references=[...xml.matchAll(/marker-(?:start|end)="url\(#([^\)]+)\)"/g)].map(m=>m[1]);
 assert.equal(references.length,5,'每条状态迁移与初始入口都应有箭头');for(const ref of references)assert.ok(markerIDs.has(ref),'SVG箭头引用必须存在：'+ref);
 verifyDrawingScene(s.drawingInput!,g);
});
test('不同形状和高度的流程主链按中心轴对齐，分支结果同层',async()=>{
 const model=json('flows').flowcharts[0],s=await scene(graph([model]),model.id),g=s.drawing!;const node=(id:string)=>g.nodes.find(n=>n.id===id)!;
 for(const id of ['init','check'])eq(center(node('start'),'x'),center(node(id),'x'));
 for(const id of ['begin','result'])assert.equal(g.connections.find(e=>e.id===id)!.paths[0].points.length,2,id+' 不应出现多余弯折');
 eq(center(node('ready'),'y'),center(node('failed'),'y'));verifyDrawingScene(s.drawingInput!,g);
});
test('泳道内主链同轴，跨泳道并行分支同层，节点与挂点同时对齐',async()=>{
 const model=json('control-complex').flowcharts[0],s=await scene(graph([model]),model.id),g=s.drawing!,node=(id:string)=>g.nodes.find(n=>n.id===id)!;
 for(const chain of [['start','record','validate'],['inventory','stock'],['manufacture','production'],['join','archive','end']])for(const id of chain.slice(1))eq(center(node(chain[0]),'x'),center(node(id),'x'));
 eq(center(node('ship'),'y'),center(node('invoice'),'y'));
 for(const id of ['edge-begin','edge-validate','edge-stock','edge-production','edge-archive','edge-end'])assert.equal(g.connections.find(e=>e.id===id)!.paths[0].points.length,2,id+' 应可直接连线');
 verifyDrawingScene(s.drawingInput!,g);
});
test('四个方向的RTL主链保持中心对齐，方向和反馈关系不被改写',async()=>{
 for(const direction of ['LR','RL','TB','BT']as const){const model=chain(),view:ControlView={id:'direction:'+direction,kind:'state-machine',model:model.id,layout:{direction,arrangement:'layered'}},s=await scene(graph([model],[view]),view.id),g=s.drawing!,axis=direction==='LR'||direction==='RL'?'y':'x';const states=model.states.map((state:any)=>g.nodes.find(n=>n.id===state.id)!);for(const n of states)eq(center(n,axis),center(states[0],axis));for(const id of ['start-transfer','prepared','last-beat'])assert.equal(g.connections.find(e=>e.id===id)!.paths[0].points.length,2);verifyDrawingScene(s.drawingInput!,g);}
});

test('RTL状态与迁移数组重排不改变入口到主链的布局方向',async()=>{
 const model=chain();model.states.reverse();model.transitions.reverse();const view:ControlView={id:'chain:reordered',kind:'state-machine',model:model.id,layout:{arrangement:'layered'}},s=await scene(graph([model],[view]),view.id),g=s.drawing!,ordered=['idle','prepare','send','done'].map(id=>g.nodes.find(n=>n.id===id)!);
 for(let i=1;i<ordered.length;i++){assert.ok(ordered[i].x>ordered[i-1].x);eq(center(ordered[i],'y'),center(ordered[0],'y'));}
 for(const id of ['start-transfer','prepared','last-beat'])assert.equal(g.connections.find(e=>e.id===id)!.paths[0].points.length,2);
});

test('迁移条件优先在词边界换行，信号名不会被拆成两半',()=>{
 const value='[tx_valid && tx_ready && tx_last]',lines=wrapText(value,14,200);assert.equal(lines.join(''),value);assert.ok(lines.some(line=>line.includes('tx_last')));assert.ok(lines.every(line=>measureText(line,14)<=200));
});

test('1011模型完整表达每个状态的0/1出口、保持自环与重叠匹配',()=>{
 const m=machine(),expected:any={none:['none','seen1'],seen1:['seen10','seen1'],seen10:['none','seen101'],seen101:['seen10','seen1']};
 for(const state of m.states){const outs=m.transitions.filter((t:any)=>t.from===state.id);assert.equal(outs.length,2);for(const bit of [0,1])assert.equal(outs.find((t:any)=>t.guard===`din == ${bit}`).to,expected[state.id][bit]);}
 // 独立判据以已读输入的后缀判断匹配，覆盖重叠和回退，不复述布局算法。
 for(const input of ['1011011','0001101011001011','111111','1010101']){let state=m.initial,read='';for(const bit of input){const t=m.transitions.find((t:any)=>t.from===state&&t.guard===`din == ${bit}`);read+=bit;assert.equal(t.actions?.includes('matched = 1')??false,read.endsWith('1011'));state=t.to;}}
});

test('状态默认二维循环排列，对齐局部行列且保留全部条件、自环和方向',async()=>{
 const m=machine(),before=JSON.stringify(m),s=await scene(graph([m]),m.id),g=s.drawing!,n=(id:string)=>g.nodes.find(n=>n.id===id)!;
 assert.equal(JSON.stringify(m),before);assert.equal(g.connections.length,9);assert.equal(g.nodes.filter(n=>n.shape==='ellipse').length,4);
 eq(center(n('none'),'y'),center(n('seen1'),'y'));eq(center(n('seen10'),'y'),center(n('seen101'),'y'));
 eq(center(n('none'),'x'),center(n('seen101'),'x'));eq(center(n('seen1'),'x'),center(n('seen10'),'x'));
 assert.ok(Math.abs(center(n('none'),'y')-center(n('seen10'),'y'))>150,'循环不能被拉成一行');
 for(const t of m.transitions){const c=g.connections.find(c=>c.id===t.id)!;assert.deepEqual(c.ends.map(e=>e.node),[t.from,t.to]);assert.ok(c.labels.some(l=>l.lines.join('').includes(t.guard)));for(const e of c.ends)assert.ok(onShapeBoundary(n(e.node),e));}
 const xml=svg(s,false);assert.match(xml,/matched = 1/);assert.match(xml,/data-clock-caption/);assert.match(xml,/clk 上升沿/);verifyDrawingScene(s.drawingInput!,g);
});

test('公共时钟只合并完全相同的声明，事件、缺省和不同边沿均原样保留',()=>{
 const m=machine(),make=(model:any,repeatClock=false)=>presentation(graph([model],[{id:'v',kind:'state-machine',model:model.id,display:{repeatClock}}]),'v')!;
 let p=make(m);assert.ok(commonClockCaption(p));assert.ok(projectControl(p).connections.filter(c=>m.transitions.some((t:any)=>t.id===c.id)).every(c=>!c.labels?.some(l=>l.text.includes('rising clk'))));
 p=make(m,true);assert.equal(commonClockCaption(p),'');assert.ok(projectControl(p).connections.some(c=>c.labels?.some(l=>l.text.includes('rising clk'))));
 for(const trigger of [undefined,{kind:'clock',clock:'clk',edge:'falling'},{kind:'event',event:'请求'}]){const changed=structuredClone(m);changed.transitions[0].trigger=trigger;p=make(changed);assert.equal(commonClockCaption(p),'');assert.ok(projectControl(p).connections.some(c=>c.labels?.some(l=>l.text.includes('rising clk'))));}
});

test('二维循环支持四方向与数组重排；显式分层仍可选择',async()=>{
 const m=machine();m.states.reverse();m.transitions.reverse();
 for(const direction of ['LR','RL','TB','BT']as const){const view:ControlView={id:'view:'+direction,kind:'state-machine',model:m.id,layout:{direction}},s=await scene(graph([m],[view]),view.id),g=s.drawing!,nodes=m.states.map((n:any)=>g.nodes.find(s=>s.id===n.id)!);assert.ok(new Set(nodes.map((n:any)=>center(n,'x').toFixed(3))).size>=2);assert.ok(new Set(nodes.map((n:any)=>center(n,'y').toFixed(3))).size>=2);verifyDrawingScene(s.drawingInput!,g);}
 const view:ControlView={id:'layered',kind:'state-machine',model:m.id,layout:{arrangement:'layered'}},s=await scene(graph([m],[view]),view.id);assert.equal(s.drawingInput!.layout!.arrangement,'layered');verifyDrawingScene(s.drawingInput!,s.drawing!);
});

test('循环分组只包含互相可达状态，出口保持真实关系且更大循环仍受几何检查',async()=>{
 for(const count of [3,5]){
  const m:any={id:'cycle:'+count,kind:'state-machine',initial:'n0',states:[...Array.from({length:count},(_,i)=>({id:'n'+i})),{id:'end',kind:'final'}],transitions:[...Array.from({length:count},(_,i)=>({id:'e'+i,from:'n'+i,to:'n'+((i+1)%count),trigger:'继续'})),{id:'exit',from:'n1',to:'end',trigger:'结束'}]};
  const s=await scene(graph([m]),m.id),g=s.drawing!;assert.equal(g.nodes.length,count+2);assert.equal(g.connections.length,count+2);assert.deepEqual(g.connections.find(e=>e.id==='exit')!.ends.map(e=>e.node),['n1','end']);verifyDrawingScene(s.drawingInput!,g);
 }
});

test('浮点数附近的正交折点不能因近似重合被删除为斜线',()=>{
 const p=simplify([{x:0,y:0},{x:24,y:0},{x:24,y:24},{x:24+1e-9,y:24},{x:24+1e-9,y:48}]);
 for(let i=1;i<p.length;i++)assert.ok(p[i-1].x===p[i].x||p[i-1].y===p[i].y);assert.deepEqual(p.at(-1),{x:24+1e-9,y:48});
});

test('公共采样说明不能覆盖或隐藏不同的全局时钟说明',async()=>{
 const m=machine();m.semantics.clock='额外时钟约束：采样使能必须有效';const s=await scene(graph([m]),m.id),html=relationDiagramHTML(m.id,s,s,0);assert.match(html,/clk 上升沿/);assert.match(html,/额外时钟约束：采样使能必须有效/);
});
