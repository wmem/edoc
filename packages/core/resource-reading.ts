import type {ResourceContext} from './resource-types.ts';
import type {ResourceRoute} from './routes.ts';
import {parseRoute,routeHash} from './routes.ts';
import {routeResource,resourceBindings,resourceTrail} from './resource-pages.ts';
import {readRange} from './read-range.ts';
import {failure} from './errors.ts';
export function parseResourceRoute(raw:string):ResourceRoute{
 let value:any;try{value=JSON.parse(raw);}catch{failure('RESOURCE_ROUTE','<route>','','--route 必须是资源路由 JSON');}
 const route=parseRoute(routeHash(value));if(route?.kind!=='resource')failure('RESOURCE_ROUTE','<route>','','--route 需要合法 kind=resource 路由');return route;
}
export function queryResource(context:ResourceContext,route:ResourceRoute,limit=50){
 const result=routeResource(context,route,{limit});return {...result,trail:resourceTrail(context,result.route),bindings:resourceBindings(context,result.view)};
}
export function readResource(context:ResourceContext,route:ResourceRoute,readSection:(project:string,id:string,scope:'self'|'subtree',offset?:number)=>{content:string;sources:{file:string;line?:number}[];range?:{truncated:boolean;nextOffset:number|null}},options:{offset?:number;maxChars?:number;scope?:'self'|'subtree'}={}){
 const result=queryResource(context,route),scope=options.scope??'subtree';
 const parts=result.bindings.map(binding=>{let part=readSection(binding.source.projectId,binding.sectionId,scope,0),content=part.content;while(part.range?.truncated&&part.range.nextOffset!==null){part=readSection(binding.source.projectId,binding.sectionId,scope,part.range.nextOffset);content+=part.content;}return {...part,content};});
 const localFile=(file:string)=>{
  const normalized=file.replace(/\\/g,'/'),roots=[...context.projects.values()].map(graph=>graph.projectRoot.replace(/\\/g,'/').replace(/\/$/,'')).filter(Boolean).sort((a,b)=>b.length-a.length);
  const root=roots.find(root=>normalized.startsWith(root+'/'));return root?normalized.slice(root.length+1):file;
 };
 // location 是发布元数据；原始 definition/entity 内的 source.file 声明不改写。
 const value=result.view.facts as any,facts=value?.location?.file?{...value,location:{...value.location,file:localFile(value.location.file)}}:value;
 const content='# '+result.view.title+'\n\n```json\n'+JSON.stringify(facts,null,2)+'\n```\n'+parts.map(part=>'\n'+part.content).join('');
 const source={file:'<resource>',line:1,projectId:result.route.project};
 return {projectId:result.route.project,id:result.route.id,route:result.route,title:result.view.title,format:'markdown' as const,scope,source,sources:[source,...parts.flatMap((part,index)=>part.sources.map(source=>({...source,file:localFile(source.file),projectId:result.bindings[index].source.projectId})))],children:[],resourceChildren:result.view.children,bindings:result.bindings,...readRange(content,options.offset,options.maxChars)};
}
