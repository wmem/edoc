import type {ElkNode,ElkExtendedEdge} from 'elkjs/lib/elk-api.js';
import type {Graph,Connection,View} from '../core/types.ts';
import type {SceneNode,SceneNet} from './index.ts';
import {labelBox,orthogonal,placeLabel,simplify,splitPath,inside,distance,intersects,crosses} from './geometry.ts';
import type {Point,Rect,LabelBox} from './geometry.ts';
import {normalizeNet} from './net-tree.ts';

type LayoutEngine={layout:(graph:ElkNode)=>Promise<ElkNode>};
const nodeObstacles=(nodes:SceneNode[]):Rect[]=>nodes.map(n=>nodes.some(c=>c.parentId===n.id)?{x:n.x,y:n.y,width:n.width,height:42}:n);
const labelObstacles=(nodes:SceneNode[]):Rect[]=>nodes.flatMap(n=>nodes.some(c=>c.parentId===n.id)?[{x:n.x,y:n.y,width:n.width,height:42},{x:n.x-2,y:n.y,width:4,height:n.height},{x:n.x+n.width-2,y:n.y,width:4,height:n.height},{x:n.x,y:n.y+n.height-2,width:n.width,height:4}]:[n]);
const netBase=(r:Connection)=>({id:r.id,label:r.label??r.id,class:r.class,source:r.source,endpoints:r.endpoints.slice(),junction:r.endpoints.length>2});
const labelPaths=(net:SceneNet)=>net.junction?net.branches.map(b=>b.points):[simplify([...net.branches[0].points,...net.branches[1].points.slice().reverse().slice(1)])];

export async function routeScene(elk:LayoutEngine,nodes:SceneNode[],relations:Connection[],graph:Graph,view:View):Promise<SceneNet[]>{
 // 同一模块两个端口之间的关系需要外部回路和标题通道，不能沿用过短的默认自环。
 const automatic=!(view.layout?.positions?.length)&&!view.layout?.constraints?.length&&!Object.keys(view.layout?.relationHints??{}).length&&!nodes.some(n=>n.parentId)&&!relations.some(r=>new Set(r.endpoints.map(id=>graph.index.get(id)?.ownerId??id)).size===1);
 // 多端点沿用节点层次布局，再求一棵实际连接树；虚拟 hub 不再增加额外布局层。
 if(!automatic||relations.some(r=>r.endpoints.length>2))return fixedRoutes(nodes,relations,graph,view);
 const ids=new Set([...graph.index.keys()]),fresh=()=>{let id='__engdoc_layout_'+ids.size;while(ids.has(id))id+='_';ids.add(id);return id;};
 const labels=new Map(relations.map(r=>[r.id,labelBox(r.label??r.id)]));
 const edgeRecords:{edge:ElkExtendedEdge;relation:Connection}[]=[];
 for(const r of relations){const box=labels.get(r.id)!;
  edgeRecords.push({relation:r,edge:{id:fresh(),sources:[r.endpoints[0]],targets:[r.endpoints[1]],labels:[{text:r.label??r.id,width:box.width,height:box.height,layoutOptions:{'elk.edgeLabels.inline':'true'}}]}});
 }
 const children:ElkNode[]=nodes.map(n=>({id:n.id,width:n.width,height:n.height,...(n.ports.length?{layoutOptions:{'elk.portConstraints':'FIXED_POS'}}:{}),ports:n.ports.map(p=>({id:p.id,width:0,height:0,x:p.x-n.x,y:p.y-n.y,layoutOptions:{'elk.port.side':p.side==='left'?'WEST':'EAST'}}))}));
 const layout=await elk.layout({id:fresh(),layoutOptions:{'elk.algorithm':'layered','elk.direction':({LR:'RIGHT',RL:'LEFT',TB:'DOWN',BT:'UP'}[view.layout?.direction??'LR']),'elk.edgeRouting':view.layout?.routing==='polyline'?'POLYLINE':'ORTHOGONAL','elk.spacing.nodeNode':'76','elk.spacing.edgeEdge':'20','elk.spacing.edgeNode':'24','elk.spacing.edgeLabel':'9','elk.layered.spacing.nodeNodeBetweenLayers':view.kind==='wiring'?'280':'110','elk.layered.spacing.edgeNodeBetweenLayers':'24','elk.layered.spacing.edgeEdgeBetweenLayers':'20','elk.layered.mergeEdges':'false','elk.edgeLabels.inline':'true'},children,edges:edgeRecords.map(e=>e.edge)});
 const positions=new Map(layout.children!.map(n=>[n.id,n]));
 for(const node of nodes){const pos=positions.get(node.id)!,dx=pos.x!+60-node.x,dy=pos.y!+70-node.y;node.x+=dx;node.y+=dy;node.ports.forEach(p=>{p.x+=dx;p.y+=dy;});}
 const routed=new Map(layout.edges!.map(e=>[e.id,e]));
 const points=(edge:ElkExtendedEdge)=>{const section=edge.sections?.[0];if(!section)throw new Error(`ELK 未返回连线路径：${edge.id}`);return simplify([section.startPoint,...section.bendPoints??[],section.endPoint].map(p=>({x:p.x+60,y:p.y+70})));};
 const nets:SceneNet[]=relations.map(r=>{
  const records=edgeRecords.filter(e=>e.relation===r),first=routed.get(records[0].edge.id)!,placed=first.labels![0],label={...labels.get(r.id)!,x:placed.x!+60,y:placed.y!+70};
  const path=points(first),split=splitPath(path);return {...netBase(r),hub:split.hub,labelBox:label,branches:r.endpoints.map((id,i)=>({endpoint:id,points:i?split.last:split.first,arrow:!!r.direction?.targets.includes(id)}))};
 });
 // ELK 为 inline 标签预留通道；投影到真实线段，消除边宽半像素偏差并检查其他关系。
 const placed:Rect[]=[];
 for(const net of nets){
  const box=net.labelBox;
  try{net.labelBox=placeLabel(box,labelPaths(net),nodeObstacles(nodes),placed,nets.filter(n=>n!==net).flatMap(labelPaths),{x:box.x+box.width/2,y:box.y+box.height/2});}
  catch(error){throw new Error(`视图 ${view.id} 关系 ${net.id} 的标题没有可读的线上位置，请增加间距或拆分视图`,{cause:error});}
  placed.push(net.labelBox);
 }
 return nets;
}

function fixedRoutes(nodes:SceneNode[],relations:Connection[],graph:Graph,view:View):SceneNet[]{
 const plain=nodeObstacles(nodes),obstacles=plain.map(r=>({x:r.x-14,y:r.y-14,width:r.width+28,height:r.height+28}));
 const labelNodes=labelObstacles(nodes);
 const hintFor=(id:string)=>Object.hasOwn(view.layout?.relationHints??{},id)?view.layout!.relationHints![id]:undefined;
 const placed:Rect[]=[],used:Point[][]=[],pending:{net:SceneNet;box:LabelBox;paths:Point[][]}[]=[];
 const owner=(id:string)=>nodes.find(n=>n.id===(graph.index.get(id)?.ownerId??id))!;
 type End={point:Point;stub:Point};
 const terminals=new Map<string,End>(),groups=new Map<string,{key:string;node:SceneNode;side:string;towards:Point}[]>();
 const terminalKey=(relation:string,id:string)=>JSON.stringify([relation,id]);
 for(const r of relations)for(const id of r.endpoints){
  const node=owner(id),others=r.endpoints.filter(other=>other!==id).map(owner),towards={x:others.reduce((v,n)=>v+n.x+n.width/2,0)/others.length,y:others.reduce((v,n)=>v+n.y+n.height/2,0)/others.length},port=node.ports.find(p=>p.id===id),key=terminalKey(r.id,id);
  if(port){const dx=port.side==='left'?-1:1,length=16+node.ports.filter(p=>p.side===port.side).indexOf(port)*10;terminals.set(key,{point:{x:port.x,y:port.y},stub:{x:port.x+dx*length,y:port.y}});continue;}
  const x=node.x+node.width/2,y=node.y+node.height/2,vertical=Math.abs(towards.y-y)>Math.abs(towards.x-x),hint=hintFor(r.id),side=(Object.hasOwn(hint?.endpointSides??{},id)?hint!.endpointSides![id]:undefined)??hint?.channel??(vertical?(towards.y<y?'top':'bottom'):(towards.x<x?'left':'right'));
  const groupKey=JSON.stringify([node.id,side]);if(!groups.has(groupKey))groups.set(groupKey,[]);groups.get(groupKey)!.push({key,node,side,towards});
 }
 for(const group of groups.values()){
  group.sort((a,b)=>(['left','right'].includes(a.side)?a.towards.y-b.towards.y:a.towards.x-b.towards.x)||a.key.localeCompare(b.key));
  group.forEach(({key,node,side},i)=>{const vertical=side==='left'||side==='right',fraction=(i+1)/(group.length+1),point=vertical?{x:side==='left'?node.x:node.x+node.width,y:node.y+12+(node.height-24)*fraction}:{x:node.x+12+(node.width-24)*fraction,y:side==='top'?node.y:node.y+node.height};const dx=side==='left'?-1:side==='right'?1:0,dy=side==='top'?-1:side==='bottom'?1:0,length=28+i*16;terminals.set(key,{point,stub:{x:point.x+dx*length,y:point.y+dy*length}});});
 }
 // 交错出线长度不能伸进邻近节点；按实际空白走廊截短，端点坐标保持不变。
 for(const end of terminals.values()){
  const horizontal=end.point.y===end.stub.y,sign=horizontal?Math.sign(end.stub.x-end.point.x):Math.sign(end.stub.y-end.point.y),axis=horizontal?'x':'y';
  let length=distance(end.point,end.stub);
  for(const obstacle of obstacles){if(inside(end.point,obstacle))continue;
   const crossesRay=horizontal?end.point.y>obstacle.y&&end.point.y<obstacle.y+obstacle.height:end.point.x>obstacle.x&&end.point.x<obstacle.x+obstacle.width;
   if(!crossesRay)continue;const edge=horizontal?(sign>0?obstacle.x:obstacle.x+obstacle.width):(sign>0?obstacle.y:obstacle.y+obstacle.height),available=(edge-end.point[axis])*sign;
   if(available>0)length=Math.min(length,Math.max(16,available-12));
  }
  end.stub={...end.point,[axis]:end.point[axis]+sign*length};
 }
 function terminal(relation:string,id:string,_towards?:Point):End{return terminals.get(terminalKey(relation,id))!;}
 // 为所有关系预留端点出线走廊，避免先放置的标签堵住后续连线的固定端口。
 const corridors=relations.flatMap(r=>r.endpoints.map(id=>{const {point,stub}=terminal(r.id,id),pad=8;return {relation:r.id,endpoint:id,x:Math.min(point.x,stub.x)-pad,y:Math.min(point.y,stub.y)-pad,width:Math.abs(point.x-stub.x)+2*pad,height:Math.abs(point.y-stub.y)+2*pad};}));
 const reservedFor=(r:Connection)=>corridors.filter(c=>c.relation!==r.id&&(graph.index.get(c.endpoint)?.type!=='port'||!r.endpoints.includes(c.endpoint)));
 const optionsFor=(r:Connection)=>({contacts:r.endpoints.filter(id=>graph.index.get(id)?.type==='port'&&relations.some(other=>other!==r&&other.endpoints.includes(id))).flatMap(id=>{const end=terminal(r.id,id);return [end.point,end.stub];})});
 // 固定位置不能移动节点。原通道放不下标题时，为同一关系绕出一段足够长的标注线段。
 function labelDetour(relation:Connection,ends:{point:Point;stub:Point}[],box:LabelBox,paths:Point[][],foreign:Point[][],reserved:Rect[],labelReserved:Rect[]){
  const center=splitPath(paths[0]).hub,paddingX=box.width/2+30,paddingY=box.height/2+30;
  const xs=[...new Set([center.x,...plain.flatMap(r=>[r.x-paddingX,r.x+r.width+paddingX]),...placed.flatMap(r=>[r.x-paddingX,r.x+r.width+paddingX])])];
  const ys=[...new Set([center.y,...plain.flatMap(r=>[r.y-paddingY,r.y+r.height+paddingY]),...placed.flatMap(r=>[r.y-paddingY,r.y+r.height+paddingY]),...foreign.flatMap(p=>p.flatMap(q=>[q.y-paddingY,q.y+paddingY]))])];
  const candidates=xs.flatMap(x=>ys.map(y=>({...box,x:x-box.width/2,y:y-box.height/2}))).sort((a,b)=>distance(a,{x:center.x-box.width/2,y:center.y-box.height/2})-distance(b,{x:center.x-box.width/2,y:center.y-box.height/2}));
  const routeObstacles=[...obstacles,...reserved,...placed.map(r=>({x:r.x-7,y:r.y-7,width:r.width+14,height:r.height+14}))];
  for(const candidate of candidates){
   if([...labelNodes,...labelReserved].some(r=>intersects(candidate,r,7))||placed.some(r=>intersects(candidate,r,6))||foreign.some(p=>p.slice(1).some((q,i)=>crosses(p[i],q,candidate))))continue;
   const left={x:candidate.x-12,y:candidate.y+candidate.height/2},right={x:candidate.x+candidate.width+12,y:left.y};
   if(routeObstacles.some(r=>crosses(left,right,r)||inside(left,r)||inside(right,r)))continue;
   const blocked=[...routeObstacles,{x:candidate.x-8,y:candidate.y-8,width:candidate.width+16,height:candidate.height+16}];
   const orders=[[left,right],[right,left]].sort((a,b)=>distance(ends[0].stub,a[0])-distance(ends[0].stub,b[0]));
   for(const [entry,hub]of orders)try{
    const first=simplify([ends[0].point,...orthogonal(ends[0].stub,entry,blocked,foreign,optionsFor(relation)),hub]);
    const branches=[first,...ends.slice(1).map(end=>simplify([end.point,...orthogonal(end.stub,hub,blocked,foreign,optionsFor(relation))]))];
    if(ends.length===2){const path=simplify([...first,...branches[1].slice().reverse().slice(1)]),split=splitPath(path);return {box:candidate,hub:split.hub,paths:[path],branches:[split.first,split.last]};}
    return {box:candidate,hub,paths:branches,branches};
   }catch{/* 另一侧进线或下一个空白通道仍可能可用。 */}
  }
  throw new Error('固定视图没有可用的标题通道');
 }
 const routedRelations=relations.slice().sort((a,b)=>{const rank=(r:Connection)=>hintFor(r.id)?.priority==='main'?0:hintFor(r.id)?.channel?2:1;return rank(a)-rank(b);});
 let channelIndex=0;
 for(const r of routedRelations){
  const routeObstacles=[...obstacles,...reservedFor(r)];
  const hint=hintFor(r.id),warnings:NonNullable<SceneNet['layoutWarnings']>=[];
  if(r.endpoints.length===2){const a=terminal(r.id,r.endpoints[0]),b=terminal(r.id,r.endpoints[1]);
   let middle:Point[]|undefined;
   if(hint?.channel){
    const side=hint.channel,vertical=side==='left'||side==='right',positive=side==='bottom'||side==='right';channelIndex++;
    const boundary=vertical?(positive?Math.max(...nodes.map(n=>n.x+n.width)):Math.min(...nodes.map(n=>n.x))):(positive?Math.max(...nodes.map(n=>n.y+n.height)):Math.min(...nodes.map(n=>n.y)));
    for(let attempt=0;attempt<3&&!middle;attempt++){
     const value=boundary+(positive?1:-1)*(44+channelIndex*24+attempt*28),entry=vertical?{x:value,y:a.stub.y}:{x:a.stub.x,y:value},exit=vertical?{x:value,y:b.stub.y}:{x:b.stub.x,y:value};
     try{const first=orthogonal(a.stub,entry,routeObstacles,used,optionsFor(r)),lane=orthogonal(entry,exit,routeObstacles,used,optionsFor(r)),last=orthogonal(exit,b.stub,routeObstacles,used,optionsFor(r));middle=simplify([...first,...lane.slice(1),...last.slice(1)]);}catch{/* 通道偏好不可行时尝试外侧通道。 */}
    }
    if(!middle)warnings.push({code:'LAYOUT_CHANNEL_RELAXED',message:`${r.label??r.id} 的 ${side} 通道偏好无法满足，使用普通避障路径。`});
   }
   try{middle??=orthogonal(a.stub,b.stub,routeObstacles,used,optionsFor(r));}catch(error){throw new Error(`视图 ${view.id} 关系 ${r.id} 没有可用的避障通道，请调整视图位置或拆分视图`,{cause:error});}
   const path=simplify([a.point,...middle,b.point]),split=splitPath(path);used.push(path);
   pending.push({paths:[path],box:labelBox(r.label??r.id),net:{...netBase(r),...(warnings.length?{layoutWarnings:warnings}:{}),hub:split.hub,labelBox:labelBox(r.label??r.id),branches:r.endpoints.map((id,i)=>({endpoint:id,points:i?split.last:split.first,arrow:!!r.direction?.targets.includes(id)}))}});
  }else{
   const ends=r.endpoints.map(id=>terminal(r.id,id));
   const pairs=ends.flatMap((a,i)=>ends.slice(i+1).map((b,j)=>({a:i,b:i+j+1,length:distance(a.point,b.point)}))).sort((a,b)=>b.length-a.length);
   const pair=hint?.backbone?{a:r.endpoints.indexOf(hint.backbone[0]),b:r.endpoints.indexOf(hint.backbone[1])}:pairs[0],a=ends[pair.a],b=ends[pair.b],trunk=simplify([a.point,...orthogonal(a.stub,b.stub,routeObstacles,used,optionsFor(r)),b.point]),split=splitPath(trunk);
   const paths:Point[][]=ends.map(()=>[]);paths[pair.a]=split.first;paths[pair.b]=split.last;
   for(const [i,end]of ends.entries())if(i!==pair.a&&i!==pair.b){
    const candidates=paths.filter(p=>p.length).flatMap(path=>path.slice(1).map((b,j)=>{const a=path[j];return a.x===b.x?{x:a.x,y:Math.max(Math.min(a.y,b.y),Math.min(Math.max(a.y,b.y),end.stub.y))}:{x:Math.max(Math.min(a.x,b.x),Math.min(Math.max(a.x,b.x),end.stub.x)),y:a.y};})).filter(p=>!routeObstacles.some(o=>inside(p,o))).sort((a,b)=>distance(a,end.stub)-distance(b,end.stub));
    for(const target of candidates)try{paths[i]=simplify([end.point,...orthogonal(end.stub,target,routeObstacles,used,optionsFor(r))]);break;}catch{/* 尝试同一树上的另一个连接位置。 */}
    if(!paths[i].length)throw new Error(`多端点关系没有可用的分支通道：${r.id}`);
   }
   const net=normalizeNet({...netBase(r),hub:split.hub,labelBox:labelBox(r.label??r.id),branches:r.endpoints.map((id,i)=>({endpoint:id,points:paths[i],arrow:!!r.direction?.targets.includes(id)}))});
   const normalized=net.branches.map(b=>b.points);used.push(...normalized);pending.push({paths:normalized,box:labelBox(r.label??r.id),net});
  }
 }
 // 先为全图求路径，再协调标题；标题不能堵住尚未绘制的关系或模块内部回路。
 for(const item of pending){
  const {net,box,paths}=item,r=relations.find(r=>r.id===net.id)!,hint=hintFor(r.id);
  const foreign=used.filter(path=>!paths.includes(path));
  // 本关系的出线段可以承载标题；其他端口的未来走廊和本 Net 的真实分叉仍需留白。
  const jointBoxes=(net.junctions??[]).map(p=>({x:p.x-7,y:p.y-7,width:14,height:14})),labelReserved=corridors.filter(c=>c.relation!==r.id);
  try{net.labelBox=placeLabel(box,paths,[...labelNodes,...labelReserved,...jointBoxes],placed,foreign);}catch{
   try{const detour=labelDetour(r,r.endpoints.map(id=>terminal(r.id,id)),box,paths,foreign,reservedFor(r),labelReserved);net.labelBox=detour.box;net.hub=detour.hub;net.branches.forEach((b,i)=>b.points=detour.branches[i]);normalizeNet(net);const routes=net.junction?net.branches.map(b=>b.points):detour.paths;for(let i=used.length-1;i>=0;i--)if(paths.includes(used[i]))used.splice(i,1);used.push(...routes);item.paths=routes;if(hint?.channel)net.layoutWarnings=[...net.layoutWarnings??[],{code:'LAYOUT_CHANNEL_LABEL',message:`${net.label} 的 ${hint.channel} 通道因标题空间不足，已重新安排标注路径。`}];}
   catch(error){throw new Error(`视图 ${view.id} (${view.kind}) 关系 ${net.id} 的标题没有可读的线上位置，请增加视图间距或拆分视图`,{cause:error});}
  }
  placed.push(net.labelBox);
 }
 return relations.map(r=>pending.find(p=>p.net.id===r.id)!.net);
}
