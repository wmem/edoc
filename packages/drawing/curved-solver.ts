import type {Drawing,DrawingScene,DrawingPath,Connection,ConnectionGeometry,NodeGeometry,Point,Side,Rect,TextBox,Constraint} from './types.ts';
import {DrawingError} from './types.ts';
import {layoutDrawing} from './layout.ts';
import {prepareAlignment,hasPositionIntent} from './alignment.ts';
import {prepareLanes} from './lanes.ts';
import {shapeRay,shapeAnchor} from './shapes.ts';
import {unit,add,norm,lerp,pathPosition,pathBounds,pathHitsRect} from './bezier.ts';
import {verifyCurvePath} from './curve-verification.ts';
import {checkCurvePaths} from './curve-check.ts';
import {verifyDrawingScene} from './verify.ts';
import {orthogonal,simplify,same,intersects} from '../render-graph/geometry.ts';
import {wrapText,measureText} from '../render-graph/text.ts';
import {styles} from '../render-graph/styles.ts';

const normal:Record<Side,Point>={left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}};
const center=(n:NodeGeometry):Point=>({x:n.x+n.width/2,y:n.y+n.height/2});
const difference=(a:Point,b:Point)=>add(a,b,-1);
const side=(v:Point):Side=>Math.abs(v.x)>=Math.abs(v.y)?v.x<0?'left':'right':v.y<0?'top':'bottom';
function straight(path:DrawingPath,to:Point){const from=path.points.at(-1)!;if(norm(difference(to,from))<1e-7)return;path.points.push(to);path.curves!.push({c1:lerp(from,to,1/3),c2:lerp(from,to,2/3)});}
function rounded(points:Point[],radius:number):DrawingPath{
 const input=simplify(points),path:DrawingPath={id:'main',points:[input[0]],curves:[]};
 for(let i=1;i<input.length-1;i++){const a=input[i-1],b=input[i],c=input[i+1],r=Math.min(radius,norm(difference(b,a))/3,norm(difference(c,b))/3),u=unit(difference(a,b)),v=unit(difference(c,b)),before=add(b,u,r),after=add(b,v,r);straight(path,before);path.points.push(after);path.curves!.push({c1:add(before,u,-r*.5522847498),c2:add(after,v,-r*.5522847498)});}
 straight(path,input.at(-1)!);return path;
}
function interpolate(points:Point[],start:Point,end:Point):DrawingPath{
 const path:DrawingPath={id:'main',points,curves:[]};
 for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],h=norm(difference(b,a))/3,u=i?unit(difference(b,points[i-1])):start,v=i===points.length-2?end:unit(difference(a,points[i+2]));path.curves!.push({c1:add(a,u,h),c2:add(b,v,h)});}
 return path;
}
function bounds(nodes:NodeGeometry[],connections:ConnectionGeometry[]):Rect{
 const boxes=[...nodes,...connections.flatMap(c=>[...c.paths.map(pathBounds),...c.labels])],x=Math.min(...boxes.map(b=>b.x))-24,y=Math.min(...boxes.map(b=>b.y))-60;return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x+24,height:Math.max(...boxes.map(b=>b.y+b.height))-y+24};
}

async function attempt(d:Drawing):Promise<DrawingScene>{
 const nodes=await layoutDrawing(d),byId=new Map(nodes.map(n=>[n.id,n])),rules=d.layout?.constraints??[],gap=d.layout?.spacing?.edge??20,connections:ConnectionGeometry[]=[],allLabels:TextBox[]=[],diagnostics:DrawingScene['diagnostics']=[];
 const ancestor=(a:string,b:string):boolean=>a===b||!!byId.get(b)?.parentId&&ancestor(a,byId.get(b)!.parentId!);
 const container=(n:NodeGeometry)=>nodes.some(c=>c.parentId===n.id);
 const frame=(id?:string)=>id&&id!=='root'?byId.get(id)!.contentBox:{x:0,y:0};
 const textObstacles=nodes.flatMap(n=>[n.title,...n.contents,...n.ports.flatMap(p=>[p.text,...p.annotation?[p.annotation]:[]])]).filter(t=>t.width&&t.height);
 const labelObstacles=nodes.flatMap(n=>container(n)?[n.title,{x:n.x-2,y:n.y,width:4,height:n.height},{x:n.x+n.width-2,y:n.y,width:4,height:n.height},{x:n.x,y:n.y+n.height-2,width:n.width,height:4}]:[n]);
 const end=(c:Connection,i:number,out:Point,orthogonalTo?:Point):ConnectionGeometry['ends'][number]=>{
  const source=c.ends[i],n=byId.get(source.node)!;
  if(source.port){const p=n.ports.find(p=>p.id===source.port)!;return {...source,x:p.x,y:p.y,side:p.side};}
  const s=side({x:out.x/n.width,y:out.y/n.height}),p=orthogonalTo?shapeAnchor(n,{x:s==='left'?n.x:s==='right'?n.x+n.width:orthogonalTo.x,y:s==='top'?n.y:s==='bottom'?n.y+n.height:orthogonalTo.y},orthogonalTo):shapeRay(n,out);
  return {...source,...p,side:s};
 };
 const outgoing=(e:ConnectionGeometry['ends'][number],suggested:Point,other:string)=>e.port?ancestor(e.node,other)?add({x:0,y:0},normal[e.side],-1):normal[e.side]:ancestor(e.node,other)&&e.node!==other?add({x:0,y:0},suggested,-1):suggested;
 const arc=(c:Connection,k:number,scale=1):ConnectionGeometry=>{
  const a=byId.get(c.ends[0].node)!,b=byId.get(c.ends[1].node)!,u=unit(difference(center(b),center(a))),n={x:-u.y,y:u.x},v0=unit(add(u,n,k)),v1=unit(add(add({x:0,y:0},u,-1),n,k)),e0=end(c,0,v0),e1=end(c,1,v1),h=Math.max(.0001,Math.min(220,norm(difference(e1,e0))*.4))*scale;
  const path:DrawingPath=e0.port&&e1.port&&Math.abs(k)>.0001?interpolate([e0,add(lerp(e0,e1,.5),n,norm(difference(e1,e0))*k*.3),e1],outgoing(e0,v0,e1.node),outgoing(e1,v1,e0.node)):{id:'main',points:[e0,e1],curves:[{c1:add(e0,outgoing(e0,v0,e1.node),h),c2:add(e1,outgoing(e1,v1,e0.node),h)}]};
  return {id:c.id,originIds:c.originIds??[],ends:[e0,e1],paths:[path],junctions:[],labels:[]};
 };
 const via=(c:Connection,points:Point[]):ConnectionGeometry=>{
  const a=byId.get(c.ends[0].node)!,b=byId.get(c.ends[1].node)!,u=unit(difference(points[0]??center(b),center(a))),v=unit(difference(points.at(-1)??center(a),center(b))),e0=end(c,0,u),e1=end(c,1,v);
  return {id:c.id,originIds:c.originIds??[],ends:[e0,e1],paths:[interpolate([e0,...points,e1],outgoing(e0,u,e1.node),outgoing(e1,v,e0.node))],junctions:[],labels:[]};
 };
 const loop=(c:Connection,angle:number,radius:number):ConnectionGeometry=>{
  const u={x:Math.cos(angle-.65),y:Math.sin(angle-.65)},v={x:Math.cos(angle+.65),y:Math.sin(angle+.65)},e0=end(c,0,u),e1=end(c,1,v);
  const direction=e0.port?normal[e0.side]:u,across={x:-direction.y,y:direction.x};
  const path:DrawingPath=same(e0,e1)?interpolate([e0,add(add(e0,direction,radius),across,radius*.65),add(add(e0,direction,radius),across,-radius*.65),e1],direction,e1.port?normal[e1.side]:v):{id:'main',points:[e0,e1],curves:[{c1:add(e0,e0.port?normal[e0.side]:u,radius),c2:add(e1,e1.port?normal[e1.side]:v,radius)}]};
  return {id:c.id,originIds:c.originIds??[],ends:[e0,e1],paths:[path],junctions:[],labels:[]};
 };
 const fixed=(c:Connection,r:Extract<Constraint,{type:'fixedRoute'}>):ConnectionGeometry=>{
  const p=r.paths[0],base=frame(r.frame),points=(p.via??[]).map(p=>add(p,base)),a=c.ends.findIndex(e=>e.id===('end'in p.from?p.from.end:'')),b=1-a;
  if(r.paths.length!==1||a<0||!('end'in p.to))throw new DrawingError('DRAWING_CAPABILITY','route',[c.id,r.id],'双端曲线视图的固定路线需要一条连接两端的完整折线');
  const ca=center(byId.get(c.ends[a].node)!),cb=center(byId.get(c.ends[b].node)!),ta=points[0]??cb,tb=points.at(-1)??ca,e0=end(c,a,unit(difference(ta,ca)),ta),e1=end(c,b,unit(difference(tb,cb)),tb);
  return {id:c.id,originIds:c.originIds??[],ends:a===0?[e0,e1]:[e1,e0],paths:[{id:p.id,points:[e0,...points,e1]}],junctions:[],labels:[]};
 };
 function labels(c:Connection,g:ConnectionGeometry){
  const placed:TextBox[]=[];
  for(const label of c.labels??[]){
   const rule=rules.find((r):r is Extract<Constraint,{type:'label'}>=>r.type==='label'&&r.connection===c.id&&r.label===label.id),lines=wrapText(label.text,14,200),width=Math.max(...lines.map(l=>measureText(l,14)))+16,height=lines.length*21+8;
   const fractions=rule?.fraction!==undefined?[rule.fraction]:[.5,.4,.6,.3,.7,.2,.8,.1,.9];let selected:TextBox|undefined;
   for(const path of g.paths){const forward=!rule||(path.from?path.from===rule.nearEnd:same(path.points[0],g.ends.find(e=>e.id===rule.nearEnd)!));
    for(const f of fractions){const p=pathPosition(path,forward?f:1-f).point,t={id:label.id,x:p.x-width/2,y:p.y-height/2,width,height,lines,size:14};
     if([...labelObstacles,...allLabels,...placed].some(b=>intersects(t,b,2))||connections.some(c=>c.paths.some(p=>pathHitsRect(p,t))))continue;
     if(g.ends.some(e=>e.marker==='arrow'&&e.x>t.x-10&&e.x<t.x+t.width+10&&e.y>t.y-10&&e.y<t.y+t.height+10))continue;
     selected=t;break;
    }if(selected)break;
   }
   if(!selected)throw new DrawingError('DRAWING_LABEL','labels',[c.id,label.id,...rule?[rule.id]:[]],'曲线上没有满足约束的完整标题位置');placed.push(selected);
  }
  g.labels=placed;
 }
 function accept(c:Connection,g:ConnectionGeometry):boolean{
  try{
   for(const path of g.paths){path.from=g.ends.find(e=>same(e,path.points[0]))!.id;path.to=g.ends.find(e=>e.id!==path.from&&same(e,path.points.at(-1)!))?.id??g.ends.find(e=>same(e,path.points.at(-1)!))!.id;}
   for(const p of g.paths){const asCurve=p.curves?p:{...p,curves:p.points.slice(1).map((to,i)=>({c1:lerp(p.points[i],to,1/3),c2:lerp(p.points[i],to,2/3)}))};verifyCurvePath(asCurve,g,nodes);if(allLabels.some(r=>pathHitsRect(p,r)))return false;}
   checkCurvePaths([...connections,g],gap,true);labels(c,g);return true;
  }catch(error){if(!(error instanceof DrawingError))throw error;lastError=error;return false;}
 }
 let lastError:DrawingError|undefined;
 const main=d.layout?.hints?.main??[],ordered=d.connections.slice().sort((a,b)=>Number(!main.includes(a.id))-Number(!main.includes(b.id))||Number(a.ends[0].node!==a.ends[1].node)-Number(b.ends[0].node!==b.ends[1].node)||a.id.localeCompare(b.id));
 for(const c of ordered){
  if(c.style&&!Object.hasOwn(styles,c.style))throw new DrawingError('DRAWING_STYLE','validate',[c.id,c.style],'未注册的主题样式');
  let selected:ConnectionGeometry|undefined;lastError=undefined;
  const channel=d.layout?.hints?.channels?.find(h=>h.connection===c.id);let usedChannel=false;
  const locked=rules.filter((r):r is Extract<Constraint,{type:'fixedRoute'}>=>r.type==='fixedRoute'&&r.connection===c.id),route=rules.filter((r):r is Extract<Constraint,{type:'route'}>=>r.type==='route'&&r.connection===c.id);
  if(locked.length>1||route.length>1)throw new DrawingError('DRAWING_CONSTRAINT','route',[c.id],'每条连接最多一份完整路线或途经点声明');
  if(locked.length){const g=fixed(c,locked[0]);if(accept(c,g))selected=g;}
  else if(route.length){const r=route[0],base=frame(r.frame),points=r.via.map(p=>add(p,base)),oriented=r.from===c.ends[0].id?c:{...c,ends:c.ends.slice().reverse()};const g=via(oriented,points);if(accept(c,g))selected=g;}
  else if(c.ends[0].node===c.ends[1].node){
   const n=byId.get(c.ends[0].node)!,peers=nodes.filter(p=>p.parentId===n.parentId&&p.id!==n.id&&p.shape!=='initial'&&p.shape!=='note'),average=peers.length?{x:peers.reduce((v,n)=>v+center(n).x,0)/peers.length,y:peers.reduce((v,n)=>v+center(n).y,0)/peers.length}:add(center(n),{x:0,y:1}),out=difference(center(n),average),angle=Math.atan2(out.y,out.x),size=Math.max(n.width,n.height);
   const preferred=channel?({top:-Math.PI/2,right:0,bottom:Math.PI/2,left:Math.PI}[channel.side]):undefined;
   for(const r of [size*.7+40,size+80,size*1.6+120]){for(const a of [...preferred!==undefined?[preferred]:[],angle,angle-.6,angle+.6,-Math.PI/2,0,Math.PI/2,Math.PI]){const g=loop(c,a,r);if(accept(c,g)){selected=g;usedChannel=a===preferred;break;}}if(selected)break;}
  }else{
   const a=byId.get(c.ends[0].node)!,b=byId.get(c.ends[1].node)!,v=difference(center(b),center(a)),diagonal=Math.abs(v.x)>a.width/2&&Math.abs(v.y)>a.height/2,initial=a.shape==='initial'||b.shape==='initial',samePair=d.connections.filter(e=>e.ends[0].node===c.ends[0].node&&e.ends[1].node===c.ends[1].node).sort((a,b)=>a.id.localeCompare(b.id)),rank=samePair.findIndex(e=>e.id===c.id),base=initial?0:diagonal?.8:.15;
   if(channel){const box=channel.container?byId.get(channel.container)!.contentBox:bounds(nodes,[]),ca=center(a),cb=center(b),x=channel.side==='left'?box.x+20:box.x+box.width-20,y=channel.side==='top'?box.y+20:box.y+box.height-20,points=channel.side==='left'||channel.side==='right'?[{x,y:ca.y},{x,y:cb.y}]:[{x:ca.x,y},{x:cb.x,y}],g=via(c,points);if(accept(c,g)){selected=g;usedChannel=true;}}
   if(!selected)for(const k of [...new Set([base+rank*.45,-base-rank*.45,.4,.8,1.2,1.8,2.5,-.4,-.8,-1.2,-1.8,-2.5,0])]){const g=arc(c,k);if(accept(c,g)){selected=g;break;}}
   // 直接弧线受障碍限制时，沿避障通道组成分段曲线；最终仍检查真正的曲线而非折线骨架。
   if(!selected){
    const s=side(v),e0=end(c,0,normal[s]),e1=end(c,1,add({x:0,y:0},normal[s],-1)),lead=(e:typeof e0)=>{const n=byId.get(e.node)!;return {x:e.side==='left'?n.x-24:e.side==='right'?n.x+n.width+24:e.x,y:e.side==='top'?n.y-24:e.side==='bottom'?n.y+n.height+24:e.y};},from=lead(e0),to=lead(e1);
    const blocked:Rect[]=[...nodes.map(n=>n.shape==='lane'||container(n)&&c.ends.some(e=>ancestor(n.id,e.node))?n.title:n).map(b=>({x:b.x-8,y:b.y-8,width:b.width+16,height:b.height+16})),...textObstacles,...allLabels];
    try{const middle=orthogonal(from,to,blocked,[],{clearance:gap}),points=[e0,...middle,e1];for(const r of [16,8,3,1]){const g:ConnectionGeometry={id:c.id,originIds:c.originIds??[],ends:[e0,e1],paths:[rounded(points,r)],junctions:[],labels:[]};if(accept(c,g)){selected=g;break;}}}catch(error){if(error instanceof DrawingError)lastError=error;}
   }
  }
  if(!selected)throw lastError??new DrawingError('DRAWING_CURVE_ROUTE','route',[c.id],'没有满足端点、障碍与标题要求的曲线通道');
  if(channel&&!usedChannel)diagnostics.push({code:'DRAWING_CHANNEL_RELAXED',id:c.id,message:'曲线偏好通道不可用，保留全部硬约束选择其他曲线'});
  connections.push(selected);allLabels.push(...selected.labels);
 }
 const viewBox=bounds(nodes,connections);return {id:d.id,nodes,connections,width:viewBox.width,height:viewBox.height,viewBox,effectiveLayout:{...d.layout,routing:'curved'},satisfiedConstraints:[],diagnostics,durationMs:0};
}

export async function solveCurvedDrawing(input:Drawing):Promise<DrawingScene>{
 if(input.connections.some(c=>c.ends.length!==2))throw new DrawingError('DRAWING_CAPABILITY','validate',[input.id],'curved 当前要求双端连接；多端点连接请使用 orthogonal');
 const start=performance.now();
 for(let pass=0;pass<4;pass++){
  const d=structuredClone(input);if(pass){d.layout??={};d.layout.spacing={...d.layout.spacing,node:Math.max(64,d.layout.spacing?.node??0)*2**pass,layer:Math.max(100,d.layout.spacing?.layer??0)*2**pass,...!hasPositionIntent(input)?{padding:Math.max(40,d.layout.spacing?.padding??0)*2**pass}:{}};}
  try{const prepared=await prepareAlignment(await prepareLanes(d)),scene=await attempt(prepared);scene.satisfiedConstraints=verifyDrawingScene(input,scene);scene.durationMs=performance.now()-start;if(pass)scene.diagnostics.push({code:'DRAWING_SPACING_EXPANDED',message:'为曲线和标题增加间距，全部硬约束继续验证'});return scene;}
  catch(error){if(!(error instanceof DrawingError)||!['DRAWING_CURVE','DRAWING_CURVE_ROUTE','DRAWING_LABEL','DRAWING_PATH_CONTACT','DRAWING_PATH_CLEARANCE'].includes(error.code)||pass===3)throw error;}
 }
 throw new Error('不可达的曲线布局状态');
}
