import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import type {Drawing, Constraint, Side} from '../packages/drawing/types.ts';
const read = (name: string) => JSON.parse(readFileSync(new URL(`../docs/support/proposals/drawing/${name}.json`, import.meta.url), 'utf8'));

test('独立检查器不信任满足清单，能拒绝每种未满足硬约束并给出输入位置', async () => {
  const input: Drawing = read('fixed-route'), scene = await solveDrawing(input);
  const rules: Constraint[] = [
    {id:'bad-place',type:'place',node:'a',x:10,y:40},
    {id:'bad-size',type:'size',node:'a',width:200},
    {id:'bad-align',type:'align',axis:'y',targets:[{node:'a'},{node:'c'}]},
    {id:'bad-order',type:'order',axis:'x',nodes:['b','a']},
    {id:'bad-side',type:'port',node:'a',port:'p',side:'left'},
    {id:'bad-offset',type:'port',node:'a',port:'p',side:'right',offset:.1},
    {id:'bad-via',type:'route',connection:'clock',from:'a',to:'b',via:[{x:400,y:160}]},
    {id:'bad-label',type:'label',connection:'clock',label:'name',nearEnd:'a',toEnd:'b',fraction:.01},
  ];
  // 固定树样例的真实端ID与标签名从源输入获取，测试不假定匿名数组代表方向。
  const c = input.connections[0];
  for (const r of rules) {
    const changed = structuredClone(input); changed.layout!.constraints=[r];
    if (r.type === 'route') {r.from=c.ends[0].id;r.to=c.ends[1].id;changed.layout!.constraints=[r];}
    if (r.type === 'label') {r.nearEnd=c.ends[0].id;r.toEnd=c.ends[1].id;r.label=c.labels![0].id;changed.layout!.constraints=[r];}
    const forged=structuredClone(scene);forged.satisfiedConstraints=[r.id];
    assert.throws(()=>verifyDrawingScene(changed,forged),(e:any)=>e.code==='DRAWING_CONSTRAINT_UNSATISFIED'&&e.ids.includes(r.id)&&e.path==='/layout/constraints/0',r.id);
  }
  const changed=structuredClone(input),r=changed.layout!.constraints!.find(r=>r.type==='fixedRoute')!;
  if(r.type==='fixedRoute')r.paths[0].via=[{x:200,y:120}];
  assert.throws(()=>verifyDrawingScene(changed,scene),(e:any)=>e.code==='DRAWING_CONSTRAINT_UNSATISFIED'&&e.ids.includes(r.id));
});

test('取消与预算由独立执行线程落实，失败后仍能重新求解', async () => {
  const input=read('automatic'),before=structuredClone(input),controller=new AbortController();
  controller.abort();await assert.rejects(solveDrawing(input,{signal:controller.signal}),{code:'DRAWING_CANCELLED'});
  await assert.rejects(solveDrawing(input,{budgetMs:1}),{code:'DRAWING_BUDGET'});
  const active=new AbortController(),pending=solveDrawing(input,{signal:active.signal});active.abort();await assert.rejects(pending,{code:'DRAWING_CANCELLED'});
  const result=await solveDrawing(input);assert.equal(result.nodes.length,input.nodes.length);assert.deepEqual(input,before);
});

test('四侧分组按文字和附注测量，支持组次序与独立槽位', async () => {
  for(const side of ['left','right','top','bottom'] as Side[]){
    const d:Drawing={schemaVersion:'1.0',id:'groups-'+side,nodes:[{id:'n',label:'接口组',ports:[{id:'h',label:'接口',appearance:'header'},{id:'a',label:'输入A',annotation:'64-bit · clk',appearance:'normal'},{id:'b',label:'输出B',annotation:'ready / valid',appearance:'normal'}],portGroups:[{id:'group',header:'h',ports:['h','a','b']}]}],connections:[],layout:{constraints:[{id:'side',type:'port',node:'n',port:'h',side},{id:'first',type:'port',node:'n',port:'a',order:0},{id:'second',type:'port',node:'n',port:'b',order:1}]}};
    const scene=await solveDrawing(d);assert.equal(scene.nodes[0].ports[1].side,side);assert.deepEqual(scene.satisfiedConstraints,['side','first','second']);
    const collapsed=structuredClone(d);collapsed.nodes[0].ports!.slice(1).forEach(p=>{p.appearance='slot';delete p.annotation;});
    const result=await solveDrawing(collapsed),ports=result.nodes[0].ports.filter(p=>p.appearance==='slot');assert.notDeepEqual({x:ports[0].x,y:ports[0].y},{x:ports[1].x,y:ports[1].y});
  }
});

test('容器自身端口和正文与子图分区，共同参与包含检查', async () => {
  const input:Drawing={schemaVersion:'1.0',id:'container-port',nodes:[{id:'box',label:'子系统',ports:[{id:'boundary',label:'管理接口'}],content:[{id:'note',kind:'text',text:'内部模块共享的职责说明'}]},{id:'child',label:'内部模块',parentId:'box'},{id:'peer',label:'外部模块',ports:[{id:'p',label:'管理接口'}]}],connections:[{id:'cross',ends:[{id:'external',node:'peer',port:'p'},{id:'internal',node:'box',port:'boundary'}]}]};
  const scene=await solveDrawing(input),box=scene.nodes.find(n=>n.id==='box')!,child=scene.nodes.find(n=>n.id==='child')!;
  assert.ok(box.contents[0].y+box.contents[0].height<child.y);assert.equal(box.ports.length,1);assert.doesNotThrow(()=>verifyDrawingScene(input,scene));
});

test('无显式端口的容器按TB叠放，隐式跨层边界不能被错误固定到侧面',async()=>{
  const input:Drawing={schemaVersion:'1.0',id:'compound-free-boundary',nodes:[{id:'a',label:'宽板卡'},{id:'b',label:'窄板卡'},{id:'host',label:'处理器',parentId:'a',ports:['p','q','r','s'].map(id=>({id,label:'',appearance:'slot' as const}))},{id:'peer',label:'接口模块',parentId:'b',ports:['p','q','r','s'].map(id=>({id,label:'',appearance:'slot' as const}))}],connections:['p','q','r','s'].map(port=>({id:port,ends:[{id:'from',node:'host',port},{id:'to',node:'peer',port}]})),layout:{direction:'TB',constraints:[{id:'wide',type:'size',node:'host',width:700},{id:'narrow',type:'size',node:'peer',width:300}]}};
  const scene=await solveDrawing(input),a=scene.nodes.find(n=>n.id==='a')!,b=scene.nodes.find(n=>n.id==='b')!;
  assert.ok(b.y>=a.y+a.height,'TB的后继板卡应在下方');
  assert.ok(b.x<a.x+a.width&&b.x+b.width>a.x,'两板横向范围应重叠，而非被固定的隐式端口挤成对角排列');
  assert.deepEqual(verifyDrawingScene(input,scene),scene.satisfiedConstraints);
});


test('纯关系框紧凑居中，固定板条保留独立槽位和精确位置',async()=>{
  const input:Drawing={schemaVersion:'1.0',id:'compact-strip',nodes:[{id:'board',label:'板卡'},{id:'strip',parentId:'board',label:'BTB',ports:['a','b','c'].map(id=>({id,label:'',appearance:'slot' as const}))}],connections:[],layout:{spacing:{padding:28},constraints:[{id:'board-place',type:'place',node:'board',x:0,y:0},{id:'strip-place',type:'place',node:'strip',x:13,y:37},{id:'strip-size',type:'size',node:'strip',width:900,height:64},...['a','b','c'].map((port,i)=>({id:port,type:'port' as const,node:'strip',port,side:'top' as const,offset:(i+1)/4}))]}};
  const scene=await solveDrawing(input),board=scene.nodes[0],strip=scene.nodes[1];
  assert.equal(strip.x-board.contentBox.x,13);assert.equal(strip.y-board.contentBox.y,37);assert.equal(strip.height,64);
  assert.equal(strip.title.y-strip.y,(strip.height-strip.title.height)/2);assert.equal(strip.title.x-strip.x,(strip.width-strip.title.width)/2);
  assert.deepEqual(strip.ports.map(p=>p.x-strip.x),[225,450,675]);assert.ok(strip.ports.every(p=>p.text.width===0&&p.y===strip.y));
  assert.deepEqual(verifyDrawingScene(input,scene),scene.satisfiedConstraints);
});

test('三条匿名槽位关系也采用联合布局，紧凑框仍有合法通道',async()=>{
  const input:Drawing={schemaVersion:'1.0',id:'small-slot-graph',nodes:['hub','a','b','c'].map(id=>({id,label:id,ports:(id==='hub'?['a','b','c']:['p']).map(id=>({id,label:'',appearance:'slot' as const}))})),connections:['a','b','c'].map(id=>({id,ends:[{id:'from',node:'hub',port:id},{id:'to',node:id,port:'p'}],labels:[{id:'name',text:'APB'}]}))};
  const scene=await solveDrawing(input);assert.equal(scene.connections.length,3);assert.ok(scene.diagnostics.some(d=>d.code==='DRAWING_COMPOUND'));assert.deepEqual(verifyDrawingScene(input,scene),scene.satisfiedConstraints);
});
