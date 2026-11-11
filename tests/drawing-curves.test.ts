import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {curveBounds,point,hitsRect,hitsNode,closest,pathPosition,pathBounds,pathD,samples} from '../packages/drawing/bezier.ts';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import {onShapeBoundary} from '../packages/drawing/shapes.ts';
import {graphFromResources} from '../packages/core/graph.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import type {Drawing,DrawingPath,NodeGeometry,ConnectionGeometry} from '../packages/drawing/types.ts';
import type {Cubic} from '../packages/drawing/bezier.ts';
import {checkCurvePaths} from '../packages/drawing/curve-check.ts';
import {drawingSVG} from '../packages/drawing/svg.ts';
const arch:Cubic=[{x:0,y:0},{x:0,y:100},{x:100,y:100},{x:100,y:0}];
const close=(a:number,b:number,tol=.02)=>assert.ok(Math.abs(a-b)<tol,`${a} 与 ${b} 不相等`);
const source=():Drawing=>({schemaVersion:'1.0',id:'curves',nodes:[{id:'a',label:'空闲',shape:'ellipse'},{id:'b',label:'工作',shape:'ellipse'}],connections:[{id:'go',ends:[{id:'from',node:'a'},{id:'to',node:'b',marker:'arrow'}],labels:[{id:'label',text:'请求'}]},{id:'back',ends:[{id:'from',node:'b'},{id:'to',node:'a',marker:'arrow'}],labels:[{id:'label',text:'完成'}]},{id:'loop',ends:[{id:'from',node:'b'},{id:'to',node:'b',marker:'arrow'}],labels:[{id:'label',text:'等待'}]}],layout:{routing:'curved',direction:'LR',alignment:'auto'}});
test('三次曲线使用真实极值、弧长与求交，不把弦或控制点包围盒当曲线',()=>{
 const bounds=curveBounds(arch);close(bounds.x,0);close(bounds.y,0);close(bounds.width,100);close(bounds.height,75);
 assert.ok(hitsRect(arch,{x:45,y:70,width:10,height:10}),'障碍在弧线上但不在弦上');assert.ok(!hitsRect(arch,{x:45,y:20,width:10,height:10}),'障碍在控制点包围盒内但不在弧线上');
 const ellipse={x:40,y:65,width:20,height:20,shape:'ellipse'} as NodeGeometry;assert.ok(hitsNode(arch,ellipse));assert.ok(!hitsNode(arch,{...ellipse,y:20}));
 const path:DrawingPath={id:'p',points:[arch[0],arch[3]],curves:[{c1:arch[1],c2:arch[2]}]},mid=pathPosition(path,.5).point;close(mid.x,50);close(mid.y,75);assert.ok(closest(arch,point(arch,.373)).distance<1e-6);assert.match(pathD(path),/ C /);
});
test('曲线细分带凸包误差界，独立密集取点不偏离细分线超过约定精度',()=>{
 const path:DrawingPath={id:'p',points:[arch[0],arch[3]],curves:[{c1:arch[1],c2:arch[2]}]},flat=samples(path,.02).map(s=>s.point);
 const distance=(p:{x:number;y:number},a:typeof p,b:typeof p)=>{const x=b.x-a.x,y=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*x+(p.y-a.y)*y)/(x*x+y*y)));return Math.hypot(p.x-a.x-t*x,p.y-a.y-t*y);};
 for(let i=0;i<=2000;i++){const p=point(arch,i/2000);assert.ok(Math.min(...flat.slice(1).map((b,j)=>distance(p,flat[j],b)))<=.02001);}
});
test('普通、反向和自环均有控制点，箭头按真实切线和形状轮廓接入',async()=>{
 const d=source(),before=JSON.stringify(d),s=await solveDrawing(d);assert.equal(JSON.stringify(d),before);assert.equal(s.connections.length,3);verifyDrawingScene(d,s);
 for(const c of s.connections)for(const e of c.ends){const n=s.nodes.find(n=>n.id===e.node)!;assert.ok(onShapeBoundary(n,e));const p=c.paths[0],control=e.id==='from'?p.curves![0].c1:p.curves!.at(-1)!.c2,gx=(e.x-n.x-n.width/2)/(n.width/2)**2,gy=(e.y-n.y-n.height/2)/(n.height/2)**2;assert.ok((control.x-e.x)*gx+(control.y-e.y)*gy>0,'控制点应在轮廓外侧');}
 const go=s.connections.find(c=>c.id==='go')!,back=s.connections.find(c=>c.id==='back')!,middle=(s.nodes[0].y+s.nodes[0].height/2);assert.ok((pathPosition(go.paths[0],.5).point.y-middle)*(pathPosition(back.paths[0],.5).point.y-middle)<0,'双向迁移分到两侧');
 for(const c of s.connections)for(const p of c.paths){assert.equal(p.curves!.length,p.points.length-1);assert.match(pathD(p),/ C /);const b=pathBounds(p);assert.ok(b.x>=s.viewBox.x&&b.y>=s.viewBox.y);}
});
test('多条同向迁移保留独立曲线和条件，标签按实际弧长比例放置',async()=>{
 const d=source();d.connections.splice(1,2);d.connections.push({...structuredClone(d.connections[0]),id:'other',labels:[{id:'label',text:'另一请求'}]});d.layout!.constraints=[{id:'label-position',type:'label',connection:'go',label:'label',nearEnd:'from',fraction:.35}];
 const s=await solveDrawing(d);assert.equal(s.connections.length,2);assert.notEqual(pathD(s.connections[0].paths[0]),pathD(s.connections[1].paths[0]));const c=s.connections.find(c=>c.id==='go')!,l=c.labels[0],expected=pathPosition(c.paths[0],.35).point;close(l.x+l.width/2,expected.x);close(l.y+l.height/2,expected.y);verifyDrawingScene(d,s);
});
test('独立检查器拒绝控制点穿框、无效控制点、曲线裁切和脱离弧线的标题',async()=>{
 const d=source(),s=await solveDrawing(d),go=s.connections.find(c=>c.id==='go')!;
 let bad=structuredClone(s),c=bad.connections.find(c=>c.id==='go')!;c.paths[0].curves![0].c1={...bad.nodes[0].title};assert.throws(()=>verifyDrawingScene(d,bad));
 bad=structuredClone(s);bad.connections[0].paths[0].curves![0].c1.x=NaN;assert.throws(()=>verifyDrawingScene(d,bad));
 bad=structuredClone(s);bad.connections[0].paths[0].curves=[];assert.throws(()=>verifyDrawingScene(d,bad));
 bad=structuredClone(s);bad.viewBox.height-=100;bad.height-=100;assert.throws(()=>verifyDrawingScene(d,bad));
 bad=structuredClone(s);bad.connections.find(c=>c.id===go.id)!.labels[0].y+=40;assert.throws(()=>verifyDrawingScene(d,bad));
});
test('曲线不能遗漏多端点，固定折线和位置仍按作者声明精确保留',async()=>{
 const bad=source();bad.connections[0].ends.push({id:'third',node:'b'});await assert.rejects(()=>solveDrawing(bad),/双端/);
 const d:Drawing={schemaVersion:'1.0',id:'fixed',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],connections:[{id:'line',ends:[{id:'a',node:'a'},{id:'b',node:'b',marker:'arrow'}]}],layout:{routing:'curved',constraints:[{id:'a-pos',type:'place',node:'a',x:0,y:0},{id:'b-pos',type:'place',node:'b',x:400,y:0},{id:'fixed-line',type:'fixedRoute',connection:'line',paths:[{id:'wire',from:{end:'a'},to:{end:'b'}}]}]}};
 const s=await solveDrawing(d);assert.ok(!s.connections[0].paths[0].curves);assert.deepEqual(s.connections[0].paths[0].points.map(p=>({x:p.x,y:p.y})),[{x:160,y:44},{x:400,y:44}]);verifyDrawingScene(d,s);
});
test('状态图主示例默认输出曲线，SVG包含相同控制点及完整条件动作',async()=>{
 const data=JSON.parse(readFileSync('docs/ir/authoring/states.json','utf8')),m=data.stateMachines[0],g=graphFromResources([{type:'stateMachines',data,file:'states.json'}],{projectId:'t',irVersion:'1.7',resources:[],entryDocuments:[],requiredFeatures:['state-machines']},{root:process.cwd(),strict:true}),s=await scene(g,m.id),xml=svg(s,false);
 assert.equal(s.drawingInput!.layout!.routing,'curved');assert.equal(s.drawing!.connections.length,9);for(const c of s.drawing!.connections)for(const p of c.paths)assert.ok(xml.includes(pathD(p)));assert.match(xml,/matched = 1/);assert.match(xml,/din == 0/);assert.match(xml,/clk 上升沿/);
});

test('曲线求交允许内部横穿，拒绝相切、重合和端点造成的假分叉',()=>{
 const make=(id:string,c:Cubic):ConnectionGeometry=>({id,originIds:[],ends:[{id:'a',node:id+'a',side:'right',...c[0]},{id:'b',node:id+'b',side:'left',...c[3]}],paths:[{id:'p',points:[c[0],c[3]],curves:[{c1:c[1],c2:c[2]}]}],junctions:[],labels:[]});
 const a=make('arch',arch),line=(a:{x:number;y:number},b:typeof a):Cubic=>[a,{x:a.x+(b.x-a.x)/3,y:a.y+(b.y-a.y)/3},{x:a.x+2*(b.x-a.x)/3,y:a.y+2*(b.y-a.y)/3},b];
 assert.doesNotThrow(()=>checkCurvePaths([a,make('cross',line({x:50,y:-50},{x:50,y:120}))],20));
 assert.throws(()=>checkCurvePaths([a,make('overlap',arch)],20));assert.throws(()=>checkCurvePaths([a,make('tangent',line({x:-20,y:75},{x:120,y:75}))],20));assert.throws(()=>checkCurvePaths([a,make('false-join',line({x:50,y:-50},{x:50,y:75}))],20));
});

test('显式曲线途经点按声明顺序经过，端口仍精确使用指定侧边和锚点',async()=>{
 const d:Drawing={schemaVersion:'1.0',id:'via',nodes:[{id:'a',label:'A'},{id:'b',label:'B'}],connections:[{id:'go',ends:[{id:'a',node:'a'},{id:'b',node:'b',marker:'arrow'}]}],layout:{routing:'curved',constraints:[{id:'a-pos',type:'place',node:'a',x:0,y:0},{id:'b-pos',type:'place',node:'b',x:400,y:200},{id:'via',type:'route',connection:'go',from:'a',to:'b',via:[{x:240,y:44},{x:240,y:244}]}]}};
 let s=await solveDrawing(d);assert.deepEqual(s.connections[0].paths[0].points.slice(1,-1),[{x:240,y:44},{x:240,y:244}]);verifyDrawingScene(d,s);
 d.nodes[0].ports=[{id:'out',label:'输出'}];d.nodes[1].ports=[{id:'in',label:'输入'}];d.connections[0].ends[0].port='out';d.connections[0].ends[1].port='in';d.layout!.constraints=d.layout!.constraints!.filter(r=>r.id!=='via');d.layout!.constraints!.push({id:'a-port',type:'port',node:'a',port:'out',side:'right'},{id:'b-port',type:'port',node:'b',port:'in',side:'left'});
 s=await solveDrawing(d);for(const e of s.connections[0].ends){const port=s.nodes.find(n=>n.id===e.node)!.ports.find(p=>p.id===e.port)!;assert.equal(e.x,port.x);assert.equal(e.y,port.y);assert.equal(e.side,port.side);}verifyDrawingScene(d,s);
});

test('相同物理端口的多条关系仍分开，闭合自环保留源端与目标箭头身份',async()=>{
 const d:Drawing={schemaVersion:'1.0',id:'port-curves',nodes:[{id:'a',label:'A',ports:[{id:'p',label:'端口'}]},{id:'b',label:'B',ports:[{id:'p',label:'端口'}]}],connections:[{id:'one',ends:[{id:'from',node:'a',port:'p'},{id:'to',node:'b',port:'p',marker:'arrow'}]},{id:'two',ends:[{id:'from',node:'a',port:'p'},{id:'to',node:'b',port:'p',marker:'arrow'}]}],layout:{routing:'curved',constraints:[{id:'a',type:'place',node:'a',x:0,y:0},{id:'b',type:'place',node:'b',x:500,y:0},{id:'ap',type:'port',node:'a',port:'p',side:'right'},{id:'bp',type:'port',node:'b',port:'p',side:'left'}]}};
 let s=await solveDrawing(d);assert.notEqual(pathD(s.connections[0].paths[0]),pathD(s.connections[1].paths[0]));verifyDrawingScene(d,s);
 d.nodes.pop();d.connections=[{id:'closed',ends:[{id:'from',node:'a',port:'p'},{id:'to',node:'a',port:'p',marker:'arrow'}]}];d.layout!.constraints=d.layout!.constraints!.filter(r=>r.id==='a'||r.id==='ap');
 s=await solveDrawing(d);const p=s.connections[0].paths[0];assert.equal(p.points[0].x,p.points.at(-1)!.x);assert.equal(p.points[0].y,p.points.at(-1)!.y);assert.equal(p.from,'from');assert.equal(p.to,'to');assert.ok(p.curves!.length>=2);assert.equal((drawingSVG(s,d,false).match(/marker-end="url/g)??[]).length,1);verifyDrawingScene(d,s);
});

test('流程可显式选择曲线，判断与复杂泳道仍使用完整模型及严格几何检查',async()=>{
 for(const [file,id]of [['flows','author:init'],['control-complex','example:fulfillment']]){
  const data=JSON.parse(readFileSync('docs/ir/authoring/'+file+'.json','utf8')),m=data.flowcharts.find((m:any)=>m.id===id),g=graphFromResources([{type:'flowcharts',data:{flowcharts:[m]},file:'flows.json'},{type:'views',data:{views:[{id:'view:curved',kind:'flowchart',model:m.id,layout:{routing:'curved'}}]},file:'view.json'}],{projectId:'t',irVersion:'1.7',resources:[],entryDocuments:[],requiredFeatures:['flowcharts']},{root:process.cwd(),strict:true}),s=await scene(g,'view:curved');
  assert.equal(s.drawing!.connections.length,m.edges.length);assert.ok(s.drawing!.connections.every(c=>c.paths.every(p=>p.curves)));verifyDrawingScene(s.drawingInput!,s.drawing!);
 }
});

test('宽矩形的匿名端点侧边按实际轮廓判断，不用方向向量的长轴猜测',async()=>{
 const d:Drawing={schemaVersion:'1.0',id:'wide',nodes:[{id:'a',label:'宽模块A'},{id:'b',label:'宽模块B'}],connections:[{id:'go',ends:[{id:'a',node:'a'},{id:'b',node:'b',marker:'arrow'}]}],layout:{routing:'curved',constraints:[{id:'a-pos',type:'place',node:'a',x:0,y:0},{id:'b-pos',type:'place',node:'b',x:700,y:300},{id:'a-size',type:'size',node:'a',width:400},{id:'b-size',type:'size',node:'b',width:400}]}};
 const s=await solveDrawing(d);assert.equal(s.connections[0].ends[0].side,'bottom');for(const e of s.connections[0].ends){const n=s.nodes.find(n=>n.id===e.node)!;if(e.side==='top'||e.side==='bottom')close(e.y,n.y+(e.side==='bottom'?n.height:0));else close(e.x,n.x+(e.side==='right'?n.width:0));}verifyDrawingScene(d,s);
});
