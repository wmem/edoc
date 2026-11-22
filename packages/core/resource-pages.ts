import {assertResourceContext} from './resource-context.ts';
import type {Graph} from './types.ts';
import type {ResourceTarget,ResourceContext,ResourceView,ResourceCrumb,ResourceCatalog} from './resource-types.ts';
import {addressResourceProvider} from '../extensions/register-map/resource-provider.ts';
import {createAddressResolver} from '../extensions/register-map/resolver.ts';
import type {ResourceRoute} from './routes.ts';
import {parseRoute,routeHash} from './routes.ts';
import {failure,EdocError} from './errors.ts';
import {FigureError} from '../figure/errors.ts';
import {anchor} from './identity.ts';
export const resourceProviders=[addressResourceProvider];
export const emptyResourceCatalog=():ResourceCatalog=>({status:'complete',deferred:[],mounts:[],bindings:[]});
export const resourceTargetKey=(target:ResourceTarget)=>JSON.stringify(target.kind==='definition'?['definition',target.project,target.id]:['instance',target.project,target.space,target.segments]);
export function resourceTarget(value:any,project:string):ResourceTarget{
 if(!value||typeof value!=='object'||Array.isArray(value)||!['definition','instance'].includes(value.kind))failure('RESOURCE_TARGET','<resource>','','target 必须使用 definition/instance 判别联合');
 const keys=value.kind==='definition'?['kind','project','id']:['kind','project','space','segments'];
 if(Object.keys(value).some(k=>!keys.includes(k))||value.project!==undefined&&(typeof value.project!=='string'||!value.project.trim())||typeof value[value.kind==='definition'?'id':'space']!=='string'||!value[value.kind==='definition'?'id':'space'].trim()||value.kind==='instance'&&!Array.isArray(value.segments))failure('RESOURCE_TARGET','<resource>','','target 字段或身份不合法');
 return value.kind==='definition'?{kind:'definition',project:value.project??project,id:value.id}:{kind:'instance',project:value.project??project,space:value.space,segments:value.segments};
}
export function resourceRoute(target:ResourceTarget,mountId?:string):ResourceRoute{
 return {kind:'resource',project:target.project,id:target.kind==='definition'?target.id:target.space,view:target.kind,...(target.kind==='instance'?{segments:target.segments}:{}),...(mountId?{mountId}:{})};
}
export function resourceContext(graph:Graph):ResourceContext{assertResourceContext(graph);return {projects:createAddressResolver(graph).projects,catalog:graph.resourceCatalog??emptyResourceCatalog()};}
export function resolveResource(context:ResourceContext,target:ResourceTarget,options:{offset?:number;limit?:number}={}):ResourceView{
 const offset=options.offset??0,limit=options.limit??50;
 if(!Number.isSafeInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>100)failure('RESOURCE_LIMIT','<resource>','','资源分页 offset 为非负安全整数，limit 为 1..100');
 const graph=context.projects.get(target.project),id=target.kind==='definition'?target.id:target.space,record=graph?.index.get(id);
 if(!record)failure('RESOURCE_REFERENCE','<resource>','',`资源不存在或工程未组合：${target.project}/${id}`);
 if(!context.preparing)assertResourceContext(graph!);
 const provider=resourceProviders.find(provider=>provider.accepts(record));if(!provider)failure('RESOURCE_PROVIDER',record.location.file,record.location.path,`资源类型尚无页面 provider：${target.project}/${id} (${record.type})`);
 try{return provider.resolve(context,target,{offset,limit});}catch(error){if(error instanceof FigureError)throw new EdocError([{code:error.code,id:error.id,file:record.location.file,path:record.location.path+error.path,message:`[${target.project}/${id}] ${error.message}`,...(error.details?{details:error.details}:{})}]);throw error;}
}
export function routeResource(context:ResourceContext,route:ResourceRoute,options:{offset?:number;limit?:number}={}){
 if(!parseRoute(routeHash(route)))failure('RESOURCE_ROUTE','<route>','','资源路由不合法');
 const target:ResourceTarget=route.view==='definition'?{kind:'definition',project:route.project,id:route.id}:{kind:'instance',project:route.project,space:route.id,segments:route.segments!};
 const view=resolveResource(context,target,options);
 if(route.spaceId&&route.spaceId!==view.spaceId)failure('RESOURCE_ROUTE','<route>','','相对资源路径不能声明 AddressSpace');
 route={...resourceRoute(view.target,route.mountId),...(route.anchor!==undefined?{anchor:route.anchor}:{}),...(route.definitionId!==undefined?{definitionId:route.definitionId}:{})};
 if(route.view==='instance'&&view.spaceId)route.spaceId=view.spaceId;
 if(route.definitionId!==undefined&&route.definitionId!==view.definition?.id)failure('RESOURCE_ROUTE','<route>','','路由 definitionId 与强解析路径不一致');
 if(route.mountId){const mount=context.catalog.mounts.find(m=>m.mountId===route.mountId);if(!mount)failure('RESOURCE_MOUNT','<route>','','挂载不存在：'+route.mountId);const root=mount.target;
  if(root.project!==target.project||(root.kind==='definition'?root.id!==(target.kind==='definition'?target.id:target.space):target.kind!=='instance'||root.space!==target.space||JSON.stringify(target.segments.slice(0,root.segments.length))!==JSON.stringify(root.segments)))failure('RESOURCE_MOUNT','<route>','','实例不属于所指定的挂载：'+route.mountId);
 }
 return {route,view};
}
export function resourceBindings(context:ResourceContext,view:ResourceView){
 const definition=view.definition?resourceTargetKey({kind:'definition',...view.definition}):undefined,key=resourceTargetKey(view.target);
 return [...context.catalog.bindings.filter(b=>b.target.kind==='definition'&&resourceTargetKey(b.target)===definition),...context.catalog.bindings.filter(b=>b.target.kind==='instance'&&resourceTargetKey(b.target)===key)];
}
export function resourceTrail(context:ResourceContext,route:ResourceRoute):ResourceCrumb[]{
 const resolved=routeResource(context,route),view=resolved.view,result:ResourceCrumb[]=[];route=resolved.route;
 const mount=route.mountId?context.catalog.mounts.find(m=>m.mountId===route.mountId):undefined;
 if(mount)result.push({label:mount.source.sectionId?context.projects.get(mount.source.projectId)?.index.get(mount.source.sectionId)?.entity.label??mount.source.sectionId:mount.source.page,route:{kind:'page',project:mount.source.projectId,id:mount.source.page,...(mount.source.sectionId?{anchor:anchor(mount.source.sectionId)}:{})}});
 const root:ResourceTarget={kind:'definition',project:route.project,id:route.id};
 result.push({label:resolveResource(context,root).title,route:resourceRoute(root,route.mountId)});
 if(route.view==='instance')for(let i=1;i<=route.segments!.length;i++){
  const target:ResourceTarget={kind:'instance',project:route.project,space:route.id,segments:route.segments!.slice(0,i)};
  const label=view.pathLabels?.[i-1]??resolveResource(context,target,{limit:1}).title;result.push({label,route:{...resourceRoute(target,route.mountId),...(route.spaceId?{spaceId:route.spaceId}:{})}});
 }
 if(route.view==='definition')result[result.length-1].label=view.title;return result;
}

// 有界明细由 provider 提供；全局导航与通用页面不解释资源领域的路径或地址。
export function resourceCollection(context:ResourceContext,target:ResourceTarget,options:{cursor?:string;limit?:number}={}){
 const view=resolveResource(context,target,{limit:1});
 const limit=options.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)failure('RESOURCE_LIMIT','<resource>','','资源明细 limit 为 1..100');
 try{return resourceProviders.find(p=>p.id===view.provider)?.list?.(context,view.target,{cursor:options.cursor,limit});}
 catch(error){if(error instanceof FigureError){const record=context.projects.get(target.project)!.index.get(target.kind==='definition'?target.id:target.space)!;throw new EdocError([{code:error.code,id:error.id,file:record.location.file,path:record.location.path+error.path,message:`[${target.project}/${record.id}] ${error.message}`,...(error.details?{details:error.details}:{})}]);}throw error;}
}
