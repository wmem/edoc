// 接口视图的纯数据投影与共享布局；构建端和离线浏览器调用同一实现。
import type {Graph,Node,Port,Interface,Connection,View,Group,RecordEntry} from '../core/types.ts';
import {layoutScene} from './scene.ts';
import {textWidth} from './geometry.ts';
import type {Scene,SceneHints,ScenePort} from './scene.ts';
export type InterfaceState={modes:Record<string,'collapsed'|'expanded'>;classes:string[]|null};
export type InterfaceModel={view:View;nodes:Node[];visiblePorts:string[];relations:Connection[];domains:Record<string,string>};
export type SceneInterface=Interface&{ownerId:string;expanded:boolean;visibleMembers:string[];connectedMembers:number;relationCount:number;visibleRelationCount:number;internalRelations:string[]};

export function prepareInterfaceModel(graph:Graph,id:string):InterfaceModel|undefined{
 const view=graph.index.get(id)?.entity as View;
 if(graph.index.get(id)?.type!=='view')return;
 // 接口元数据不自动改变普通架构图；接口视图或显式显示/包含声明才启用投影。
 if(view.kind!=='interface'&&!view.display?.interfaceMode&&!view.display?.interfaceOverrides&&!view.include.objects.some(id=>graph.index.get(id)?.type==='interface'))return;
 const owners=new Set<string>(),full=new Set<string>(),ports=new Set<string>();
 const add=(id:string)=>{const e=graph.index.get(id)!;
  if(e.type==='group'){(e.entity as Group).members.forEach(add);return;}
  if(e.type==='interface'){(e.entity as Interface).members.forEach(add);return;}
  if(e.type==='node'){owners.add(id);full.add(id);}else if(e.type==='port'){owners.add(e.ownerId!);ports.add(id);}
 };
 view.include.objects.forEach(add);const relations=view.include.relations.map(id=>graph.connections.get(id)!);relations.forEach(r=>r.endpoints.forEach(add));
 for(const id of owners){let parent=(graph.index.get(id)!.entity as Node).parentId;while(parent){owners.add(parent);full.add(parent);parent=(graph.index.get(parent)!.entity as Node).parentId;}}
 const nodes=[...owners].map(id=>graph.index.get(id)!.entity as Node);
 if(!nodes.some(n=>n.interfaces?.some(i=>i.members.some(p=>full.has(n.id)||ports.has(p)))))return;
 return structuredClone({view,nodes,visiblePorts:nodes.flatMap(n=>(n.ports??[]).filter(p=>full.has(n.id)||ports.has(p.id)).map(p=>p.id)),relations,domains:Object.fromEntries([...new Set(nodes.flatMap(n=>(n.ports??[]).map(p=>p.clockDomainId).filter((id):id is string=>!!id)))].map(id=>[id,graph.index.get(id)?.entity.label??id]))});
}
export function initialInterfaceState(model:InterfaceModel):InterfaceState{
 return {modes:Object.fromEntries(model.nodes.flatMap(n=>(n.interfaces??[]).map(i=>[i.id,model.view.display?.interfaceOverrides?.[i.id]??model.view.display?.interfaceMode??'expanded']))),classes:model.view.display?.classes??null};
}

export async function interfaceScene(model:InterfaceModel,state=initialInterfaceState(model)):Promise<Scene>{
 const hintFor=(id:string)=>Object.hasOwn(model.view.layout?.relationHints??{},id)?model.view.layout!.relationHints![id]:undefined;
 const visible=new Set(model.visiblePorts),interfaces:SceneInterface[]=[],byPort=new Map<string,SceneInterface>();
 const modes={...initialInterfaceState(model).modes,...state.modes};
 for(const n of model.nodes)for(const i of n.interfaces??[]){const members=i.members.filter(id=>visible.has(id));if(!members.length)continue;
  const connected=new Set(model.relations.flatMap(r=>r.endpoints).filter(id=>members.includes(id)));
  const item={...i,ownerId:n.id,expanded:modes[i.id]!=='collapsed',visibleMembers:members,connectedMembers:connected.size,relationCount:model.relations.filter(r=>r.endpoints.some(id=>members.includes(id))).length,visibleRelationCount:model.relations.filter(r=>(!state.classes||state.classes.includes(r.class))&&r.endpoints.some(id=>members.includes(id))).length,internalRelations:[] as string[]};interfaces.push(item);members.forEach(p=>byPort.set(p,item));
 }
 const reserved=new Set([...model.nodes.flatMap(n=>[n.id,...(n.ports??[]).map(p=>p.id),...(n.interfaces??[]).map(i=>i.id)]),...model.relations.map(r=>r.id),model.view.id]);
 const fresh=(parts:string[])=>{let id='__edoc_display_'+JSON.stringify(parts);while(reserved.has(id))id+='_';reserved.add(id);return id;};
 const endpoint=(id:string)=>{const i=byPort.get(id);return i&&!i.expanded?i.id:id;};
 const signature=(r:Connection)=>JSON.stringify([...new Set(r.endpoints.map(endpoint))].sort());
 const totals=new Map<string,number>();for(const r of model.relations){const key=signature(r);totals.set(key,(totals.get(key)??0)+1);}
 const buckets=new Map<string,{key:string;endpoints:string[];relations:Connection[]}>();
 const internal:Record<string,string[]>=Object.create(null);
 for(const r of model.relations){if(state.classes&&!state.classes.includes(r.class))continue;
  const ids=[...new Set(r.endpoints.map(endpoint))],folded=r.endpoints.some(id=>endpoint(id)!==id);
  if(ids.length<2){const i=interfaces.find(i=>i.id===ids[0]);if(i){i.internalRelations.push(r.id);(internal[i.id]??=[]).push(r.id);}continue;}
  // 有专属路由意图的原关系保留独立显示线，不能被无提示的聚合吞掉。
  const key=folded&&!hintFor(r.id)?signature(r):JSON.stringify(['relation',r.id]);
  const bucket=buckets.get(key)??{key,endpoints:ids,relations:[]};bucket.relations.push(r);buckets.set(key,bucket);
 }
 const projected=[...buckets.values()].map(b=>({...b,id:b.relations.length>1?fresh(['bundle',...b.relations.map(r=>r.id).sort()]):b.relations[0].id,bundle:b.relations.length>1,slots:new Map<string,string>()}));
 const slots=new Map<string,{id:string;ports:string[]}[]>();
 for(const i of interfaces.filter(i=>!i.expanded)){
  const attached=projected.filter(b=>b.endpoints.includes(i.id));if(attached.length<2)continue;
  slots.set(i.id,attached.map(b=>{const id=fresh(['slot',i.id,b.id]);b.slots.set(i.id,id);return {id,ports:[...new Set(b.relations.flatMap(r=>r.endpoints).filter(p=>byPort.get(p)?.id===i.id))]};}));
 }
 const connections:Connection[]=projected.map(b=>{
  const ids=b.endpoints.map(id=>b.slots.get(id)??id),r=b.relations[0];
  const touched=interfaces.filter(i=>b.relations.some(r=>r.endpoints.some(p=>i.visibleMembers.includes(p))));
  let direction:Connection['direction'];
  if(!b.bundle&&r.direction){const map=(ports:string[])=>[...new Set(ports.map(endpoint).map(id=>b.slots.get(id)??id))];const sources=map(r.direction.sources),targets=map(r.direction.targets);if(!sources.some(id=>targets.includes(id)))direction={sources,targets};}
  const total=totals.get(signature(r))??b.relations.length;
  return {id:b.id,kind:'connection',endpoints:ids,class:b.bundle?'interface-bundle':r.class,label:b.bundle?`${touched[0]?.label??'接口'}\n${b.relations.length===total?total:b.relations.length+'/'+total} 条连接`:r.label,source:r.source,...(direction?{direction}:{})};
 });
 const hints:SceneHints={sideGroups:Object.create(null),widths:Object.create(null),rows:Object.create(null),heights:Object.create(null),sides:Object.create(null),annotations:Object.create(null)},portMeta=new Map<string,Partial<ScenePort>>();
 const fakeNodes:Node[]=model.nodes.map(n=>{
  const ports:Port[]=[],owned=interfaces.filter(i=>i.ownerId===n.id),order=model.view.layout?.interfaceOrder??[];
  owned.sort((a,b)=>(order.includes(a.id)?order.indexOf(a.id):order.length)-(order.includes(b.id)?order.indexOf(b.id):order.length));
  let row=66;
  for(const i of owned){const side=model.view.layout?.interfaceSides?.[i.id],pad=slots.get(i.id)??[],center=row+Math.max(16,(pad.length-1)*4),header:Port={id:i.id,label:i.label+(i.role?' · '+i.role:''),direction:'unknown',source:i.source};
   ports.push(header);hints.rows![i.id]=center;if(side)hints.sides![i.id]=side;
   hints.annotations![i.id]=[i.protocol,`${i.visibleMembers.length}/${i.members.length} 个成员`,i.internalRelations.length?`${i.internalRelations.length} 条内部关系`:undefined].filter(Boolean).join(' · ');
   portMeta.set(i.id,{interfaceId:i.id,interfaceHeader:true,collapsed:!i.expanded,members:i.visibleMembers,totalMembers:i.members.length,padHeight:Math.max(14,(pad.length-1)*8+12)});
   if(i.expanded){row+=50;const members=(n.ports??[]).filter(p=>i.visibleMembers.includes(p.id)),portOrder=model.view.layout?.portOrder??[];
    members.sort((a,b)=>(portOrder.includes(a.id)?portOrder.indexOf(a.id):portOrder.length)-(portOrder.includes(b.id)?portOrder.indexOf(b.id):portOrder.length));
    for(const p of members){ports.push(p);hints.rows![p.id]=row;if(side)hints.sides![p.id]=side;portMeta.set(p.id,{interfaceId:i.id,noConnection:!model.relations.some(r=>r.endpoints.includes(p.id))});row+=38;}
   }else{for(const [j,slot]of pad.entries()){ports.push({id:slot.id,label:'',direction:'unknown'});hints.rows![slot.id]=center-(pad.length-1)*4+j*8;if(side)hints.sides![slot.id]=side;hints.annotations![slot.id]='';portMeta.set(slot.id,{interfaceId:i.id,slot:true,members:slot.ports});}row+=Math.max(54,pad.length*8+24);}
  }
  for(const p of n.ports??[])if(visible.has(p.id)&&!byPort.has(p.id)){ports.push(p);hints.rows![p.id]=row;row+=38;}
  hints.heights![n.id]=Math.max(90,row+14);hints.widths![n.id]=owned.some(i=>i.expanded)?340:Math.max(220,textWidth(n.label,17)+32,...ports.filter(p=>!portMeta.get(p.id)?.slot).map(p=>Math.max(textWidth(p.label,14)+56,textWidth(hints.annotations![p.id]??'',11)+30))); const {interfaces:_interfaces,...node}=n;return {...node,ports};
 });
 for(const i of interfaces){const ids=fakeNodes.flatMap(n=>n.ports??[]).filter(p=>portMeta.get(p.id)?.interfaceId===i.id).map(p=>p.id);for(const id of ids)hints.sideGroups![id]=ids;}
 const relationHints:NonNullable<NonNullable<View['layout']>['relationHints']>=Object.create(null),projectionWarnings=new Map<string,{code:string;message:string}[]>();
 for(const b of projected){const original=b.relations[0],hint=hintFor(original.id);if(!hint)continue;
  const projectedHint=structuredClone(hint);
  if(hint.backbone){const pair=hint.backbone.map(id=>b.slots.get(endpoint(id))??endpoint(id));if(pair[0]===pair[1]){delete projectedHint.backbone;projectionWarnings.set(b.id,[{code:'LAYOUT_BACKBONE_FOLDED',message:`${original.label??original.id} 的主干两端折叠到同一接口，展开后恢复原主干提示。`}]);}else projectedHint.backbone=pair as [string,string];}
  relationHints[b.id]=projectedHint;
 }
 const view:View={...model.view,include:{objects:fakeNodes.map(n=>n.id),relations:connections.map(r=>r.id)},layout:{...model.view.layout,...(model.view.layout?.relationHints?{relationHints}:{}),portOrder:fakeNodes.flatMap(n=>n.ports!.map(p=>p.id))}};
 const index=new Map<string,RecordEntry>();const add=(id:string,entity:RecordEntry['entity'],type:RecordEntry['type'],ownerId?:string)=>index.set(id,{id,entity,type,ownerId,location:{file:'<display>',path:''}});
 fakeNodes.forEach(n=>{add(n.id,n,'node');n.ports!.forEach(p=>add(p.id,p,'port',n.id));});connections.forEach(r=>add(r.id,r,'connection'));add(view.id,view,'view');
 // 时钟域名称不由显示投影推断，沿用构建时收集的标签。
 for(const n of fakeNodes)for(const p of n.ports??[])if(p.clockDomainId&&!index.has(p.clockDomainId))add(p.clockDomainId,{id:p.clockDomainId,kind:'node',label:model.domains[p.clockDomainId]??p.clockDomainId},'node');
 const graph:Graph={index,connections:new Map(connections.map(r=>[r.id,r])),adjacency:new Map(),projectRoot:'',irDirectory:'',manifest:{irVersion:'1.1',projectId:'display',resources:[],entryDocuments:[]}};
 const result=await layoutScene(graph,view.id,hints);
 for(const n of result.nodes)for(const p of n.ports)Object.assign(p,portMeta.get(p.id));
 for(const net of result.nets){const b=projected.find(b=>b.id===net.id)!;if(projectionWarnings.has(net.id))net.layoutWarnings=[...net.layoutWarnings??[],...projectionWarnings.get(net.id)!];Object.assign(net,{bundle:b.bundle,sourceRelations:b.relations,originalEndpoints:Object.fromEntries(b.relations.map(r=>[r.id,r.endpoints])),interfaceIds:interfaces.filter(i=>b.relations.some(r=>r.endpoints.some(p=>i.members.includes(p)))).map(i=>i.id)});}
 result.interfaceModel=model;result.interfaceState={modes,classes:state.classes};result.interfaces=interfaces;result.internalRelations=internal;return result;
}
