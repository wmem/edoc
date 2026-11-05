import ELKModule from 'elkjs/lib/elk.bundled.js';
import type {ElkNode} from 'elkjs/lib/elk-api.js';
import type {Graph,Node,Port,RelationView,Group,Connection,Source} from '../core/types.ts';
import {failure} from '../core/errors.ts';
import {routeScene} from './routing.ts';
import {textWidth,labelBox,intersects} from './geometry.ts';
import type {LabelBox} from './geometry.ts';
import {prepareInterfaceModel,interfaceScene} from './interfaces.ts';
import type {InterfaceModel,InterfaceState,SceneInterface} from './interfaces.ts';
import {constrainNodes} from './constraints.ts';
import {measureText,wrapText} from './text.ts';
import {decoratePortLeads,widthRange,portAnnotation} from './ports.ts';
export type SceneHints={sideGroups?:Record<string,string[]>;widths?:Record<string,number>;rows?:Record<string,number>;heights?:Record<string,number>;sides?:Record<string,'left'|'right'>;annotations?:Record<string,string>};
export async function scene(graph:Graph,id:string,options:{interfaces?:'expanded'}={}):Promise<Scene>{
 const model=prepareInterfaceModel(graph,id);
 if(model)return interfaceScene(model,options.interfaces==='expanded'?{modes:Object.fromEntries(model.nodes.flatMap(n=>(n.interfaces??[]).map(i=>[i.id,'expanded' as const]))),classes:null}:undefined);
 return layoutScene(graph,id);
}
export type ScenePort = {direction?:Port['direction'];displayLabel?:string;lead?:{points:{x:number;y:number}[];startArrow:boolean;endArrow:boolean;aggregate:boolean};padHeight?:number;interfaceId?:string;interfaceHeader?:boolean;collapsed?:boolean;members?:string[];totalMembers?:number;slot?:boolean;noConnection?:boolean;id:string;label:string;annotation:string; x:number;y:number;side:'left'|'right';source?:Source};
export type SceneNode = {id:string;label:string;x:number;y:number;width:number;height:number;titleSize:number;titleLines?:string[];headerHeight?:number;parentId?:string;source?:Source;ports:ScenePort[]};
export type SceneNet = {layoutWarnings?:{code:string;message:string}[];paths?:{points:{x:number;y:number}[];arrow:boolean;endArrow?:boolean;endpoint?:string}[];junctions?:{x:number;y:number}[];bundle?:boolean;sourceRelations?:Connection[];originalEndpoints?:Record<string,string[]>;interfaceIds?:string[];id:string;label:string;class:string;endpoints:string[];source?:Source;junction:boolean;labelBox:LabelBox;hub:{x:number;y:number};branches:{endpoint:string;points:{x:number;y:number}[];arrow:boolean}[]};
export type Scene = {interfaceModel?:InterfaceModel;interfaceState?:InterfaceState;interfaces?:SceneInterface[];internalRelations?:Record<string,string[]>;id:string;label:string;kind:string;width:number;height:number;display:{showPortAttributes:boolean;showRelationLabels:boolean};visibleClasses?:string[];nodes:SceneNode[];nets:SceneNet[];collapsedGroups:string[];groups:{id:string;label:string;members:string[]}[]};

export async function layoutScene(graph:Graph, id:string,hints:SceneHints={}):Promise<Scene> {
 const entry=graph.index.get(id);
 if(entry?.type!=='view') failure('VIEW_NOT_FOUND','<view>','',`视图不存在：${id}`);
 const view=entry.entity as RelationView;
 const chosen=new Set<string>(),fullNodes=new Set<string>(),selectedPorts=new Set<string>();
 const add=(id:string)=>{const e=graph.index.get(id)!;if(e.type==='group'){(e.entity as Group).members.forEach(add);}else {chosen.add(e.ownerId??id);if(e.type==='port')selectedPorts.add(id);if(e.type==='node')fullNodes.add(id);}};
 view.include.objects.forEach(add);
 // 端点被视图过滤时保留边界上下文，不把 Net 截成错误的两点关系。
 const relations=view.include.relations.map(id=>graph.connections.get(id)!);
 relations.forEach(r=>r.endpoints.forEach(add));
 for(const id of [...chosen]){let parent=(graph.index.get(id)?.entity as Node)?.parentId;while(parent){chosen.add(parent);fullNodes.add(parent);parent=(graph.index.get(parent)?.entity as Node)?.parentId;}}
 const nodes=[...chosen].map(id=>graph.index.get(id)!).filter(e=>e.type==='node').map(e=>e.entity as Node);
 const order=view.layout?.portOrder??[];
 const ports=(node:Node)=>(node.ports??[]).filter(p=>fullNodes.has(node.id)||selectedPorts.has(p.id)).slice().sort((a,b)=>{
  const rank=(id:string)=>order.includes(id)?order.indexOf(id):order.length+(node.ports??[]).findIndex(p=>p.id===id);
  return rank(a.id)-rank(b.id);
 });
 const titles=new Map(nodes.map(n=>[n.id,wrapText(n.label,ports(n).length?17:15,248)]));
 const header=(id:string)=>Math.max(42,20+titles.get(id)!.length*22);
 const annotation=(p:Port)=>hints.annotations?.[p.id]??portAnnotation(p,p.clockDomainId?graph.index.get(p.clockDomainId)?.entity.label??p.clockDomainId:'',view.display?.portAttributes);
 const displayLabel=(p:Port)=>p.label+(view.kind==='interface'&&widthRange(p)?' '+widthRange(p):'');
 const dimensions=nodes.map(n=>({id:n.id,width:Math.max(hints.widths?.[n.id]??(view.layout?.positions?.length&&ports(n).length?340:160),...titles.get(n.id)!.map(line=>measureText(line,ports(n).length?17:15)+36),...ports(n).map(p=>Math.max(measureText(displayLabel(p),14),measureText(annotation(p),11))+30)),height:(hints.heights?.[n.id]??(ports(n).length?Math.max(110,80+ports(n).length*38):Math.max(60,24+relations.filter(r=>r.endpoints.includes(n.id)).length*18)))+header(n.id)-42}));
 const owner=(id:string)=>graph.index.get(id)?.ownerId??id;
 const edges=relations.flatMap(r=>r.endpoints.slice(1).filter(id=>owner(id)!==owner(r.endpoints[0])).map((id,i)=>({id:r.id+':layout:'+i,sources:[owner(r.endpoints[0])],targets:[owner(id)],...(i?{}:{labels:[{text:r.label??r.id,width:labelBox(r.label??r.id).width,height:labelBox(r.label??r.id).height}]})})));
 const ELK = ELKModule as unknown as new () => { layout: (graph: ElkNode) => Promise<ElkNode> };
 const elk=new ELK();
 const options=(direction:'LR'|'TB'|'RL'|'BT')=>({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':({LR:'RIGHT',RL:'LEFT',TB:'DOWN',BT:'UP'}[direction]),'elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':automatic?'64':'80','elk.layered.spacing.nodeNodeBetweenLayers':view.kind==='wiring'?'300':automatic?'80':'120'},children:dimensions.map(n=>({...n})),edges:structuredClone(edges)});
 const automatic=!view.layout?.direction&&!view.layout?.positions?.length&&!view.layout?.constraints?.length&&!Object.keys(view.layout?.relationHints??{}).length&&view.kind!=='wiring'&&nodes.length<=12&&nodes.every(n=>!n.parentId);
 let layout=await elk.layout(options(view.layout?.direction??'LR'));
 if(automatic&&nodes.length>1){const alternative=await elk.layout(options('TB')),score=(candidate:ElkNode)=>Math.min(760/((candidate.width??1)+120),500/((candidate.height??1)+140));if(score(alternative)>score(layout)*1.08)layout=alternative;}
 const positions=new Map<string,{x:number;y:number}>((layout.children??[]).map(n=>[n.id,{x:(n.x??0)+60,y:(n.y??0)+70}]));
 for(const pos of view.layout?.positions??[]) if(chosen.has(pos.objectId)) positions.set(pos.objectId,{x:pos.x+60,y:pos.y+70});
 const result:SceneNode[]=nodes.map(node=>{
  const pos=positions.get(node.id)!; const size=dimensions.find(n=>n.id===node.id)!;
  return {id:node.id,label:node.label,parentId:node.parentId,source:node.source,...pos,width:size.width,height:size.height,titleSize:ports(node).length?17:15,titleLines:titles.get(node.id),headerHeight:header(node.id),ports:ports(node).map((p,i)=>{
   const related=hints.sideGroups?.[p.id]??[p.id];
   const neighbors=relations.filter(r=>r.endpoints.some(id=>related.includes(id))).flatMap(r=>r.endpoints.filter(id=>owner(id)!==node.id).map(id=>positions.get(owner(id))?.x??pos.x));
   const avg=neighbors.length?neighbors.reduce((a,b)=>a+b,0)/neighbors.length:pos.x;
   const side: 'left'|'right'=hints.sides?.[p.id]??(hints.sideGroups?.[p.id]?(avg<=pos.x?'left':'right'):view.kind==='interface'?(p.direction==='in'?'left':'right'):(avg===pos.x?(p.direction==='in'?'left':'right'):avg<pos.x?'left':'right'));
   return {id:p.id,label:p.label,displayLabel:displayLabel(p),direction:p.direction,source:p.source,annotation:annotation(p),x:pos.x+(side==='right'?size.width:0),y:pos.y+(hints.rows?.[p.id]??66+i*38)+header(node.id)-42,side};
  })};
 });
 // 父节点以包围框表达层级，逻辑 Group 不参与该层级计算。
 const resized=new Set<string>();
 const enclose=(id:string)=>{if(resized.has(id))return;const parent=result.find(n=>n.id===id)!;const children=result.filter(n=>n.parentId===id);children.forEach(c=>enclose(c.id));if(children.length){parent.x=Math.min(...children.map(n=>n.x))-60;parent.y=Math.min(...children.map(n=>n.y))-((parent.headerHeight??42)+48);parent.width=Math.max(...children.map(n=>n.x+n.width))-parent.x+60;parent.height=Math.max(Math.max(...children.map(n=>n.y+n.height))-parent.y+60,hints.heights?.[parent.id]??80+parent.ports.length*38);parent.width=Math.max(parent.width,dimensions.find(n=>n.id===parent.id)!.width);parent.ports.forEach((p,i)=>{p.x=parent.x+(p.side==='right'?parent.width:0);p.y=parent.y+(hints.rows?.[p.id]??66+i*38)+(parent.headerHeight??42)-42;});}resized.add(id);};
 if(view.layout?.constraints?.length){
  try{constrainNodes(result,view,relations);}catch(error){failure('LAYOUT_CONFLICT',entry.location.file,entry.location.path+'/layout/constraints',String(error));}
  // 相对布局完成后再按真实邻居更新自动侧边，显式接口侧边保持不变。
  for(const n of result)for(const p of n.ports){
   if(hints.sides?.[p.id])continue;
   const related=hints.sideGroups?.[p.id]??[p.id],neighbors=relations.filter(r=>r.endpoints.some(id=>related.includes(id))).flatMap(r=>r.endpoints.filter(id=>owner(id)!==n.id).map(id=>result.find(other=>other.id===owner(id))?.x??n.x));
   const avg=neighbors.length?neighbors.reduce((sum,x)=>sum+x,0)/neighbors.length:n.x,original=graph.index.get(p.id)?.entity as Port;
   p.side=hints.sideGroups?.[p.id]?(avg<=n.x?'left':'right'):view.kind==='interface'?(original.direction==='in'?'left':'right'):(avg===n.x?(original.direction==='in'?'left':'right'):avg<n.x?'left':'right');p.x=n.x+(p.side==='right'?n.width:0);
  }
 }else result.forEach(n=>enclose(n.id));
 const shiftX=Math.max(0,35-Math.min(35,...result.map(n=>n.x))),shiftY=Math.max(0,65-Math.min(65,...result.map(n=>n.y)));
 result.forEach(n=>{n.x+=shiftX;n.y+=shiftY;n.ports.forEach(p=>{p.x+=shiftX;p.y+=shiftY;});});
 if(view.layout?.positions?.length&&hints.rows)for(const [i,a]of result.entries())for(const b of result.slice(i+1))if(a.parentId!==b.id&&b.parentId!==a.id&&intersects(a,b))throw new Error('固定位置不足以展开接口：'+a.label+' / '+b.label);
 const nets=await routeScene(elk,result,relations,graph,view);
 const groupMembers=(id:string):string[]=>{const e=graph.index.get(id)!;if(e.type==='group')return [...new Set((e.entity as Group).members.flatMap(groupMembers))];if(e.type==='node')return [id,...((e.entity as Node).ports??[]).map(p=>p.id)];return [id];};
 // 标签与回退通道也属于画布范围，保留标题/图例区，不仅检查节点框。
 const geometry=[...result.map(n=>({x:n.x,y:n.y})),...nets.flatMap(n=>[{x:n.labelBox.x,y:n.labelBox.y},...n.branches.flatMap(b=>b.points)])];
 const dx=Math.max(0,35-Math.min(35,...geometry.map(p=>p.x))),dy=Math.max(0,75-Math.min(75,...geometry.map(p=>p.y)));
 result.forEach(n=>{n.x+=dx;n.y+=dy;n.ports.forEach(p=>{p.x+=dx;p.y+=dy;});});
 nets.forEach(n=>{n.hub={x:n.hub.x+dx,y:n.hub.y+dy};n.labelBox.x+=dx;n.labelBox.y+=dy;n.branches.forEach(b=>b.points=b.points.map(p=>({x:p.x+dx,y:p.y+dy})));n.paths?.forEach(b=>b.points=b.points.map(p=>({x:p.x+dx,y:p.y+dy})));n.junctions=n.junctions?.map(p=>({x:p.x+dx,y:p.y+dy}));});
 const maxX=Math.max(400,...result.map(n=>n.x+n.width),...nets.flatMap(n=>[n.hub.x,n.labelBox.x+n.labelBox.width,...n.branches.flatMap(b=>b.points.map(p=>p.x))]));
 const maxY=Math.max(200,...result.map(n=>n.y+n.height),...nets.flatMap(n=>[n.labelBox.y+n.labelBox.height,...n.branches.flatMap(b=>b.points.map(p=>p.y))]));
 return decoratePortLeads({id,label:view.label??id,kind:view.kind,width:Math.max(maxX+70,[...new Set(nets.map(n=>n.class))].reduce((w,c)=>w+textWidth(c,11)+58,60)),height:maxY+65,display:{showPortAttributes:view.display?.showPortAttributes??false,showRelationLabels:view.display?.showRelationLabels??true},visibleClasses:view.display?.classes,nodes:result,nets,collapsedGroups:view.display?.collapsedGroups??[],groups:[...graph.index.values()].filter(e=>e.type==='group').map(e=>({id:e.id,label:e.entity.label??e.id,members:groupMembers(e.id)}))});
}
