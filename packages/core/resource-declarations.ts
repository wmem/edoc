import type {Graph} from './types.ts';
import type {ResourceCatalog,ResourceSource} from './resource-types.ts';
import {documentAST} from './documents.ts';
import {resourceTarget,resolveResource,resourceTargetKey,emptyResourceCatalog,resourceProviders,routeResource,resourceRoute} from './resource-pages.ts';
import {createAddressResolver} from '../extensions/register-map/resolver.ts';
import {validateSchema} from './schema.ts';
import {FigureError} from '../figure/errors.ts';
import {failure,EdocError} from './errors.ts';

// 预检覆盖未生效条件分支；激活、查重和挂载位置只由实际 AST 决定。
export function resourceDeclarations(graph:Graph,options:{defer?:boolean}={}):ResourceCatalog{
 const catalog=emptyResourceCatalog(),project=graph.manifest.projectId,projects=createAddressResolver(graph).projects;
 const source=(file:string,line:number,page:string,sectionId?:string):ResourceSource=>({projectId:project,file,line,page:page.replace(/\.(md|mdoc)$/i,''),...(sectionId?{sectionId}:{})});
 const deferredSeen=new Set<string>();
 const validate=(node:any,file:string,line:number)=>{
  if(!['resource-directory','resource-content','resource-link'].includes(node.tag))return;
  const fail=(message:string)=>failure('RESOURCE_DECLARATION',file,`#L${line}`,`[${project}] ${message}`);
  if(node.tag==='resource-directory'&&(typeof node.attributes.mount!=='string'||!node.attributes.mount.trim()||typeof node.attributes.id!=='string'||!node.attributes.id.trim()))fail('resource-directory 需要非空 id 和 mount');
  if(node.tag==='resource-link'&&node.attributes.mount!==undefined&&(typeof node.attributes.mount!=='string'||!node.attributes.mount.trim()))fail('resource-link 的 mount 必须非空');
  const raw=node.tag==='resource-directory'?{kind:'definition',id:node.attributes.id,...(node.attributes.project!==undefined?{project:node.attributes.project}:{})}:node.attributes.target;
  const schema=validateSchema('resource-target',raw,file);if(schema.length)throw new EdocError(schema.map(d=>({...d,path:`#L${line}`+d.path,message:`[${project}] ${d.message}`})));
  let target=resourceTarget(raw,project);
  if(node.tag==='resource-content'){
   if(typeof node.attributes.section!=='string'||!node.attributes.section.trim()||graph.index.get(node.attributes.section)?.type!=='document')fail('绑定 section 必须是声明工程内已发布的真实作者 Section：'+String(node.attributes.section));
  }
  if(options.defer&&!projects.has(target.project)){catalog.status='deferred';const key=JSON.stringify([resourceTargetKey(target),file,line]);if(!deferredSeen.has(key)){deferredSeen.add(key);catalog.deferred.push({target,source:source(file,line,file)});}return target;}
  try{const context={projects,catalog,preparing:options.defer},view=resolveResource(context,target,{limit:1});target=view.target;if(node.tag==='resource-content')resourceProviders.find(p=>p.id===view.provider)?.validateContent?.(context,target);}
  catch(error){if(error instanceof FigureError)fail(error.message);if(options.defer&&error instanceof EdocError&&error.diagnostics.some(d=>d.code==='ADDRESS_BOOK_CONTEXT'))return target;if(error instanceof EdocError)throw new EdocError(error.diagnostics.map(d=>({...d,file,path:`#L${line}`,message:`[${project}] ${d.message}；目标 ${resourceTargetKey(target)}`})));throw error;}
  return target;
 };
 for(const check of graph.documentPlan?.checks??[]){if(check.node.type==='tag'){validate(check.node,check.file,check.line);}}
 for(const document of documentAST(graph)){
  const visit=(node:any,sectionId?:string)=>{
   const section=node.type==='tag'&&node.tag==='section'?node.attributes.id:sectionId;
   if(node.type==='tag'&&['resource-directory','resource-content','resource-link'].includes(node.tag)){
    const location=document.locations.get(node)??{file:document.file,line:1};
    const target=validate(node,location.file,location.line)!;
    if(!document.hidden){
     const origin=source(location.file,location.line,document.file,section);
     if(node.tag==='resource-directory')catalog.mounts.push({mountId:node.attributes.mount,target,source:origin});
     if(node.tag==='resource-content'){
      const sectionId=node.attributes.section,article=documentAST(graph).find(d=>[...d.ast.walk()].some(n=>n.type==='tag'&&n.tag==='section'&&n.attributes.id===sectionId))!,original=[...article.ast.walk()].find(n=>n.type==='tag'&&n.tag==='section'&&n.attributes.id===sectionId)!,where=article.locations.get(original)??{file:article.file,line:1};
      catalog.bindings.push({target,sectionId,source:source(where.file,where.line,article.file,sectionId),declaration:origin});
     }
    }
   }
   for(const child of [...Object.values(node.slots??{}),...node.children??[]])visit(child,section);
  };visit(document.ast);
 }
 return catalog;
}
export function prepareResourceCatalog(projects:ReadonlyMap<string,Graph>,options:{defer?:boolean}={}){
 const catalog=emptyResourceCatalog(),mounts=new Set<string>(),bindings=new Set<string>();
 // Book 终解析前撤下局部 deferred 元数据；本次声明校验决定新的完整状态。
 if(!options.defer)for(const graph of projects.values())graph.resourceCatalog=emptyResourceCatalog();
 for(const graph of projects.values()){
  const local=resourceDeclarations(graph,options);if(local.status==='deferred'){catalog.status='deferred';catalog.deferred.push(...local.deferred);}
  for(const mount of local.mounts){if(mounts.has(mount.mountId))failure('RESOURCE_MOUNT_DUPLICATE',mount.source.file,`#L${mount.source.line}`,`[${mount.source.projectId}] 重复挂载：${mount.mountId}`);mounts.add(mount.mountId);catalog.mounts.push(mount);}
  for(const binding of local.bindings){const key=JSON.stringify([resourceTargetKey(binding.target),binding.source.projectId,binding.sectionId]);if(bindings.has(key))failure('RESOURCE_CONTENT_DUPLICATE',binding.declaration.file,`#L${binding.declaration.line}`,'同一目标重复绑定同一 Section：'+key);bindings.add(key);catalog.bindings.push(binding);}
 }
 if(!options.defer)for(const graph of projects.values())for(const check of graph.documentPlan?.checks??[])if(check.node.tag==='resource-link'&&check.node.attributes.mount){
  try{routeResource({projects,catalog},resourceRoute(resourceTarget(check.node.attributes.target,graph.manifest.projectId),check.node.attributes.mount));}
  catch(error){if(error instanceof EdocError)throw new EdocError(error.diagnostics.map(d=>({...d,file:check.file,path:'#L'+check.line})));throw error;}
 }
 for(const graph of projects.values())graph.resourceCatalog=catalog;
 return catalog;
}
