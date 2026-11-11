import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {graphFromResources} from '../packages/core/graph.ts';
import {query,queryElement} from '../packages/core/query.ts';
import {readDocument} from '../packages/core/read.ts';
import {projectControl,presentation} from '../packages/extensions/control-diagram/project.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import {onShapeBoundary} from '../packages/drawing/shapes.ts';
import type {StateMachine,Flowchart,ControlModel,ControlView} from '../packages/extensions/control-diagram/types.ts';
const load=(models:ControlModel[],views:ControlView[]=[])=>graphFromResources([
 {type:'stateMachines',data:{stateMachines:models.filter(m=>m.kind==='state-machine')},file:'models.json'},
 {type:'flowcharts',data:{flowcharts:models.filter(m=>m.kind==='flowchart')},file:'models.json'},
 {type:'views',data:{views},file:'views.json'},
],{projectId:'control-test',irVersion:'1.7',resources:[],entryDocuments:[],requiredFeatures:['state-machines','flowcharts']},{root:process.cwd(),strict:true});
const simple=():StateMachine=>({id:'sm:test',kind:'state-machine',initial:'idle',states:[{id:'idle',label:'空闲'},{id:'busy',label:'处理',entry:['锁存'],do:['处理'],exit:['报告']}],transitions:[{id:'submit',from:'idle',to:'busy',trigger:'请求',guard:'合法'},{id:'done',from:'busy',to:'idle',trigger:'完成'},{id:'tick',from:'busy',to:'busy',kind:'internal',trigger:{kind:'clock',clock:'clk'},actions:['更新进度']}]});
const rejects=(model:ControlModel,code:string)=>assert.throws(()=>load([model]),(e:any)=>e.diagnostics?.some((d:any)=>d.code===code));
test('局部身份独立于模型和全局对象，查询、来源与分页read同源',()=>{
 const a=simple(),b={...simple(),id:'sm:other'},graph=load([a,b]);assert.equal(graph.index.size,2);assert.equal(query(graph,a.id).target.type,'state-machine');
 const element=queryElement(graph,a.id,'busy');assert.equal(element.target.location.path,'/stateMachines/0/states/1');assert.deepEqual(element.outgoing.map(t=>t.id),['done','tick']);
 assert.equal(queryElement(graph,b.id,'busy').modelId,b.id);assert.throws(()=>queryElement(graph,a.id,'missing'));
 let offset=0,text='';for(;;){const part=readDocument(graph,a.id,{offset,maxChars:80});text+=part.content;if(part.range.nextOffset===null)break;offset=part.range.nextOffset;}
 assert.match(text,/"entry"/);assert.match(text,/"internal"/);assert.match(text,/"clock": "clk"/);
});
test('错误模型独立检查重复ID、触发、伪状态度数与动作作用域',()=>{
 let m=simple();m.transitions[0].id='idle';rejects(m,'CONTROL_DUPLICATE');
 m=simple();m.transitions[0].to='missing';rejects(m,'CONTROL_REFERENCE');
 m=simple();m.transitions[0].trigger={kind:'after',value:2,unit:'cycles'};rejects(m,'CONTROL_CLOCK');
 m=simple();m.states[0].kind='final';rejects(m,'CONTROL_DEGREE');
 m=simple();m.transitions[0].kind='internal';rejects(m,'CONTROL_INTERNAL');
 m=simple();m.transitions[0].kind='local';rejects(m,'CONTROL_LOCAL');
 m=simple();m.states.push({id:'entry',kind:'initial'});rejects(m,'CONTROL_DEGREE');
 m=simple();(m.states[0] as any).unsupported=true;rejects(m,'SCHEMA');
});
test('正交区域、历史、局部迁移与归属循环有不同规则',()=>{
 const model:StateMachine={id:'parallel',kind:'state-machine',initial:'p',states:[{id:'p',kind:'parallel'},{id:'a',region:'r1'},{id:'b',region:'r2'},{id:'h',region:'r1',kind:'history',history:'deep',default:'a'}],regions:[{id:'r1',owner:'p',initial:'a'},{id:'r2',owner:'p',initial:'b'}],transitions:[]};
 load([model]);let bad=structuredClone(model);bad.transitions.push({id:'cross',from:'a',to:'b',trigger:'go'});rejects(bad,'CONTROL_ORTHOGONAL');
 bad=structuredClone(model);bad.states[3].default='b';rejects(bad,'CONTROL_HISTORY');
 bad=structuredClone(model);bad.states[0].region='r1';rejects(bad,'CONTROL_CYCLE');
 const nested=structuredClone(model);nested.states[1].kind='composite';nested.regions!.push({id:'nested',owner:'a',initial:'inner'});nested.states.push({id:'inner',region:'nested'});nested.transitions.push({id:'within-region',from:'inner',to:'a',trigger:'reset'});load([nested]);
 bad=structuredClone(model);bad.transitions.push({id:'enter',from:'p',to:'a',kind:'local',trigger:'reset'});load([bad]);
});
test('流程显式网关、默认出口、合并与等待分别校验',()=>{
 const f:Flowchart=JSON.parse(readFileSync('docs/ir/authoring/flows.json','utf8')).flowcharts[0];load([f]);
 let bad=structuredClone(f);bad.edges[2].guard=undefined;rejects(bad,'CONTROL_GUARD');
 bad=structuredClone(f);bad.edges[2].otherwise=true;bad.edges[2].guard=undefined;rejects(bad,'CONTROL_DEFAULT');
 bad=structuredClone(f);bad.nodes[2].kind='process';rejects(bad,'CONTROL_GATEWAY');
 bad=structuredClone(f);bad.nodes[1].kind='wait';rejects(bad,'CONTROL_WAIT');
 bad=structuredClone(f);bad.nodes[2].kind='join';rejects(bad,'CONTROL_DEGREE');
});
test('状态自环、多重边和反向迁移保留独立路线和真实形状锚点',async()=>{
 const m=simple();m.transitions.push({id:'other',from:'idle',to:'busy',trigger:'再次请求'});const graph=load([m]),s=await scene(graph,m.id);
 assert.ok(s.drawing!.nodes.find(n=>n.id==='idle')!.x<s.drawing!.nodes.find(n=>n.id==='busy')!.x,'主路径从初始状态向右推进，反馈边反向');assert.equal(s.drawing!.connections.length,5);assert.match(svg(s,false),/更新进度/);assert.match(svg(s,false),/entry/);
 verifyDrawingScene(s.drawingInput!,s.drawing!);
 for(const c of s.drawing!.connections)for(const end of c.ends)assert.ok(onShapeBoundary(s.drawing!.nodes.find(n=>n.id===end.node)!,end));
 const broken=structuredClone(s.drawing!);broken.connections[0].paths[0].points[0].x+=10;assert.throws(()=>verifyDrawingScene(s.drawingInput!,broken));
});
test('折叠投影保留原始跨层迁移身份；展开调用保留被调用模型来源',async()=>{
 const child=simple(),parent:StateMachine={id:'parent',kind:'state-machine',initial:'outer',states:[{id:'outer',kind:'composite'},{id:'a',region:'r'},{id:'call',kind:'submachine',call:{model:child.id}},{id:'end',kind:'final'}],regions:[{id:'r',owner:'outer',initial:'a'}],transitions:[{id:'leave',from:'a',to:'call',trigger:'go'},{id:'finish',from:'call',to:'end',trigger:'done'}]};
 const graph=load([child,parent]),p=presentation(graph,parent.id)!;const folded=projectControl(p,{collapsed:['outer']});assert.equal(folded.connections.find(c=>c.id==='leave')?.ends[0].node,'outer');assert.deepEqual(folded.connections.find(c=>c.id==='leave')?.originIds,[parent.id,'leave']);
 const expanded=projectControl(p,{expandedCalls:['call']});assert.ok(expanded.nodes.some(n=>n.originIds?.[0]===child.id&&n.originIds[1]==='busy'));await solveDrawing(folded);await solveDrawing(expanded);
});
test('公开复杂案例使用同一求解器与独立几何校验',async()=>{
 const data=JSON.parse(readFileSync('docs/ir/authoring/control-complex.json','utf8'));for(const m of [...JSON.parse(readFileSync('docs/ir/authoring/state-hierarchy.json','utf8')).stateMachines,...data.stateMachines,...data.flowcharts]){const s=await scene(load([m]),m.id);assert.ok(s.drawing);verifyDrawingScene(s.drawingInput!,s.drawing!);assert.ok(!svg(s,false).includes('<script'));}
});
test('旧state关系视图拒绝，不降低Connection的电气约束',()=>{
 assert.throws(()=>graphFromResources([{type:'views',data:{views:[{id:'old',kind:'state',include:{objects:[],relations:[]}}]},file:'old.json'}],{projectId:'p',irVersion:'1.7',resources:[],entryDocuments:[]},{root:process.cwd(),strict:true}));
});

test('判断、静态连接点与I/O形状贯通投影和轮廓检查',async()=>{
 const state:StateMachine={id:'sm:choices',kind:'state-machine',initial:'idle',states:[{id:'idle'},{id:'choice',kind:'choice',label:'选择'},{id:'link',kind:'junction'},{id:'ok',kind:'final'},{id:'error',kind:'terminate'}],transitions:[{id:'check',from:'idle',to:'choice',trigger:'提交'},{id:'yes',from:'choice',to:'link',guard:'条件成立'},{id:'no',from:'choice',to:'error',otherwise:true},{id:'continue',from:'link',to:'ok'}]};
 const graph=load([state]);const s=await scene(graph,state.id);verifyDrawingScene(s.drawingInput!,s.drawing!);assert.match(svg(s,false),/diamond|选择/);
 const flow:Flowchart={id:'flow:io',kind:'flowchart',nodes:[{id:'start',kind:'start'},{id:'io',kind:'io',label:'读取数据'},{id:'end',kind:'end'}],edges:[{id:'read',from:'start',to:'io'},{id:'finish',from:'io',to:'end'}]};
 const f=await scene(load([flow]),flow.id);for(const c of f.drawing!.connections)for(const e of c.ends)assert.ok(onShapeBoundary(f.drawing!.nodes.find(n=>n.id===e.node)!,e));
});
test('命名视图、显示字段与合成ID不改变模型或掩盖硬约束',async()=>{
 const m=simple();m.states[0].id='["edoc","initial","root"]';m.initial=m.states[0].id;m.transitions.filter(t=>t.from==='idle').forEach(t=>t.from=m.initial!);m.transitions.filter(t=>t.to==='idle').forEach(t=>t.to=m.initial!);
 const view:ControlView={id:'view:test',kind:'state-machine',model:m.id,display:{showRelationLabels:false},layout:{constraints:[{id:'first',type:'place',node:m.states[0].id,x:0,y:0},{id:'conflict',type:'place',node:m.states[0].id,x:20,y:0}]}};
 const graph=load([m],[view]),before=structuredClone(m);assert.equal(projectControl(presentation(graph,m.id)!).nodes.length,3);assert.deepEqual(m,before);await assert.rejects(()=>scene(graph,view.id));
});

test('调用展开保留子状态机自己的采样时钟，不借用父状态机的公共时钟',()=>{
 const child=simple();child.transitions.forEach(e=>e.trigger={kind:'clock',clock:'child_clk',edge:'falling'});
 const parent:StateMachine={id:'parent-clock',kind:'state-machine',initial:'call',states:[{id:'call',kind:'submachine',call:{model:child.id}},{id:'end',kind:'final'}],transitions:[{id:'finish',from:'call',to:'end',trigger:{kind:'clock',clock:'parent_clk',edge:'rising'}}]};
 const projected=projectControl(presentation(load([parent,child]),parent.id)!,{expandedCalls:['call']});
 const childEdges=projected.connections.filter(c=>c.originIds?.[0]===child.id&&child.transitions.some(t=>c.originIds?.includes(t.id)));assert.equal(childEdges.length,child.transitions.length);assert.ok(childEdges.every(c=>c.labels?.some(l=>l.text.includes('falling child_clk'))));
});
