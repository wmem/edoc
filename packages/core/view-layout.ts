import type {Graph,View,Node,Interface,Group,RecordEntry} from './types.ts';
import {validateSchema} from './schema.ts';

// 布局引用遵循实际视图范围，包含完整关系端点及其父容器；不改写原始 include。
export function viewNodeIds(graph:Graph,view:View):Set<string>{
 const selected=new Set<string>(),visiting=new Set<string>();
 const add=(id:string)=>{if(visiting.has(id))return;visiting.add(id);const e=graph.index.get(id);if(!e)return;
  if(e.type==='group'){(e.entity as Group).members.forEach(add);return;}
  if(e.type==='interface'){(e.entity as Interface).members.forEach(add);return;}
  if(e.type==='node')selected.add(id);if(e.type==='port'&&e.ownerId)selected.add(e.ownerId);
 };
 view.include.objects.forEach(add);view.include.relations.forEach(id=>graph.connections.get(id)?.endpoints.forEach(add));
 for(const id of selected){const p=(graph.index.get(id)?.entity as Node)?.parentId;if(p&&!selected.has(p))selected.add(p);}
 return selected;
}
export function validateViewLayout(graph:Graph,entry:RecordEntry,report:(code:string,path:string,message:string)=>void){
 const view=entry.entity as View,layout=view.layout;
 const enabled=graph.manifest.requiredFeatures?.includes('layout-intent');
 if((layout?.constraints!==undefined||layout?.relationHints!==undefined)&&!enabled)report('IR_FEATURE_REQUIRED','/layout','布局意图需要声明 requiredFeatures: layout-intent');
 if(!layout||!enabled)return;
 // 同 major minor 兼容其他可选字段，但显式启用的新布局契约不能静默忽略拼写错误。
 for(const d of validateSchema('view',{views:[view]}))if(d.path.startsWith('/views/0/layout'))report(d.code,d.path.slice('/views/0'.length),d.message);
 const selected=viewNodeIds(graph,view);
 layout.constraints?.forEach((constraint,i)=>{
  const path=`/layout/constraints/${i}`,parents=new Set<string|undefined>();
  for(const [j,id]of constraint.nodes.entries()){
   const target=graph.index.get(id);
   if(target?.type!=='node')report('LAYOUT_REFERENCE',`${path}/nodes/${j}`,`布局约束需要 Node ID：${id}`);
   else if(!selected.has(id))report('LAYOUT_SCOPE',`${path}/nodes/${j}`,`对象不在当前视图范围：${id}`);
   else parents.add((target.entity as Node).parentId);
  }
  if(parents.size>1)report('LAYOUT_SCOPE',path,'同一 order/align 约束的节点必须属于同一个父容器；顶层节点可共同约束');
 });
 for(const axis of ['x','y'] as const){
  const rules=(layout.constraints??[]).filter(c=>c.axis===axis),roots=new Map(rules.flatMap(c=>c.nodes).map(id=>[id,id]));
  const find=(id:string):string=>{let p=id;while(roots.get(p)!==p)p=roots.get(p)!;return p;};
  for(const c of rules)if(c.type==='align')for(const id of c.nodes.slice(1))roots.set(find(id),find(c.nodes[0]));
  const edges=new Map([...new Set([...roots.keys()].map(find))].map(id=>[id,new Set<string>()])),degree=new Map([...edges.keys()].map(id=>[id,0]));
  for(const c of rules)if(c.type==='order')for(let i=1;i<c.nodes.length;i++){const a=find(c.nodes[i-1]),b=find(c.nodes[i]);if(!edges.get(a)!.has(b)){edges.get(a)!.add(b);degree.set(b,degree.get(b)!+1);}}
  const queue=[...degree].filter(([,n])=>!n).map(([id])=>id);for(let i=0;i<queue.length;i++)for(const next of edges.get(queue[i])!){degree.set(next,degree.get(next)!-1);if(!degree.get(next))queue.push(next);}
  if(queue.length!==edges.size)report('LAYOUT_CONFLICT','/layout/constraints',`${axis} 方向的 order 与 align 构成循环或互相矛盾`);
 }
 for(const [id,hint]of Object.entries(layout.relationHints??{})){
  const path='/layout/relationHints/'+id.replace(/~/g,'~0').replace(/\//g,'~1'),relation=graph.connections.get(id);
  if(!relation||!view.include.relations.includes(id)){report('LAYOUT_REFERENCE',path,`关系不在当前视图范围：${id}`);continue;}
  if(hint.backbone?.some(endpoint=>!relation.endpoints.includes(endpoint)))report('LAYOUT_BACKBONE',path+'/backbone','主干必须引用同一原关系中的两个不同端点');
  if(hint.channel&&relation.endpoints.length!==2)report('LAYOUT_CHANNEL',path+'/channel','当前通道偏好只适用于两端点关系；多端点关系请使用 backbone');
  for(const endpoint of Object.keys(hint.endpointSides??{})){
   if(!relation.endpoints.includes(endpoint)||graph.index.get(endpoint)?.type!=='node')report('LAYOUT_ENDPOINT',path+'/endpointSides','endpointSides 只接受本关系无真实端口的 Node 端点；Port 侧边由端口/接口布局决定：'+endpoint);
  }
 }
}
