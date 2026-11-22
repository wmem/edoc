import {failure} from './errors.ts';
import type {Navigation} from './book.ts';
import type {ResourceContext,ResourceMount} from './resource-types.ts';
import type {ResourceRoute} from './routes.ts';
import {resolveResource,resourceRoute,resourceTrail,routeResource} from './resource-pages.ts';

// 初始挂载最多 200 个节点、两层；后续页由通用 provider 按需加载，不展开 count。
export function resourceTargetNavigation(context:ResourceContext,target:ResourceMount['target'],options:{mountId?:string;depth?:number}={}):Navigation{
 let budget=200;const mount={mountId:options.mountId};
 const build=(target:ResourceMount['target'],depth:number):Navigation=>{
  const view=resolveResource(context,target,{limit:20}),route=resourceRoute(view.target,mount.mountId);
  if(view.spaceId&&route.view==='instance')route.spaceId=view.spaceId;
  const node:Navigation={kind:'resource',label:view.title,project:route.project,page:'',mountId:mount.mountId,route,children:[]};budget--;
  let consumed=0;
  if(depth<(options.depth??2))for(const item of view.children.items){if(budget<=0)break;consumed++;
   if(item.status)continue;
   if(item.count!=='1'){
    const child:Navigation={kind:'resource-summary',label:`${item.label} [0…${BigInt(item.count)-1n}]`,project:route.project,page:'',mountId:mount.mountId,resourceCount:item.count,children:[]};budget--;
    if(budget>0&&(options.depth===undefined||depth+1<options.depth))child.children.push({...build(item.target,depth+2),label:item.label+'['+(item.firstIndex??'0')+']'});node.children.push(child);
   }else node.children.push(build(item.target,depth+1));
   node.children.at(-1)!.resourceOrdinal=consumed-1;
  }
  if(BigInt(view.children.total)>BigInt(consumed)){node.childrenOmitted=Number(BigInt(view.children.total)-BigInt(consumed));node.resourceChildren={target:view.target,offset:consumed,total:view.children.total};}
  return node;
 };
 return build(target,0);
}
export function resourceMountNavigation(context:ResourceContext,mount:ResourceMount,current?:ResourceRoute,existing?:Navigation):Navigation{
 const root=existing??resourceTargetNavigation(context,mount.target,{mountId:mount.mountId});root.id=mount.mountId;
 if(current?.mountId===mount.mountId){
  const trail=resourceTrail(context,current).filter(c=>c.route.kind==='resource');let parent=root;
  for(const crumb of trail.slice(1)){
   let child=parent.children.flatMap(node=>node.resourceCount?node.children:[node]).find(c=>c.route&&JSON.stringify(c.route)===JSON.stringify(crumb.route));
   if(!child){child={kind:'resource',label:crumb.label,project:crumb.route.project,page:'',mountId:mount.mountId,route:crumb.route,children:[]};const view=routeResource(context,crumb.route as ResourceRoute,{limit:1}).view;if(view.children.total!=='0')child.resourceChildren={target:view.target,offset:0,total:view.children.total};parent.children.push(child);}parent=child;
  }
 }
 const own=(node:Navigation)=>{node.project=mount.source.projectId;node.children.forEach(own);};own(root);
 return root;
}

export function outlineResource(context:ResourceContext,route:ResourceRoute,depth=2){if(!Number.isInteger(depth)||depth<0||depth>10)failure('OUTLINE_DEPTH','<resource>','/depth','资源目录深度必须是 0..10');const resolved=routeResource(context,route);return {projectId:route.project,projects:[route.project],chapters:[resourceTargetNavigation(context,resolved.view.target,{mountId:route.mountId,depth})],maxDepth:depth};}

// 一次只取 20 个定义项。当前路径已补入的节点与后续页合并，保留已展开子树。
export function loadResourceNavigation(context:ResourceContext,node:Navigation){
 const pending=node.resourceChildren;if(!pending)return;
 const view=resolveResource(context,pending.target,{offset:pending.offset,limit:20});
 for(const item of view.children.items){
  if(item.status)continue;
  const child=resourceTargetNavigation(context,item.target,{mountId:node.mountId,depth:0});
  const key=(n:Navigation)=>n.route?.kind==='resource'?JSON.stringify([n.route.project,n.route.id,n.route.view,n.route.segments]):undefined;
  const existing=node.children.flatMap(n=>n.resourceCount?n.children:[n]).find(n=>key(n)===key(child));
  const ordinal=pending.offset+view.children.items.indexOf(item);
  if(existing){existing.resourceOrdinal=ordinal;continue;}
  child.resourceOrdinal=ordinal;
  if(item.count!=='1')node.children.push({kind:'resource-summary',label:`${item.label} [0…${BigInt(item.count)-1n}]`,project:node.project,page:'',mountId:node.mountId,resourceCount:item.count,resourceOrdinal:ordinal,children:[{...child,label:item.label+'['+(item.firstIndex??'0')+']'}]});
  else node.children.push(child);
 }
 node.children.sort((a,b)=>(a.resourceOrdinal??Number.MAX_SAFE_INTEGER)-(b.resourceOrdinal??Number.MAX_SAFE_INTEGER));
 const own=(n:Navigation)=>{n.project=node.project;n.children.forEach(own);};node.children.forEach(own);
 const offset=pending.offset+view.children.items.length;
 if(BigInt(offset)<BigInt(view.children.total)){node.resourceChildren={...pending,offset,total:view.children.total};node.childrenOmitted=Number(BigInt(view.children.total)-BigInt(offset));}
 else {delete node.resourceChildren;delete node.childrenOmitted;}
}
