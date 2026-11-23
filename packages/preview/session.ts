import type {Book,Navigation} from '../core/book.ts';
import type {Route} from '../core/routes.ts';
import {targetKey,parseRoute,routeHash} from '../core/routes.ts';
import type {ReaderData} from '../core/reader-model.ts';
import {createBookCompiler,pdfResources} from '../pack-html/book.ts';
import {sidebarNavigation} from '../doc-theme/navigation.ts';
import {resourceBindings,routeResource,resourceContext} from '../core/resource-pages.ts';
import {resourceBodyKey} from '../core/resource-body.ts';
import {loadResourceNavigation,resourceMountNavigation} from '../core/resource-navigation.ts';

// 会话内保留原工程上下文，预览不通过裁剪 Book 规避跨页/跨工程语义。
export function previewSession(book:Book){
 const compiler=createBookCompiler(book,{deferDiagramSVG:true}),{data}=compiler;
 const nodes=new Map<string,Navigation>();let next=0;
 const shallow=(list:Navigation[]):Navigation[]=>list.map(node=>{
  const key=node.previewKey??String(++next);node.previewKey=key;nodes.set(key,node);
  return {...node,children:[],previewKey:key,previewChildren:!!(node.children.length||node.resourceChildren)};
 });
 const roots=sidebarNavigation(data.navigation),navigation=shallow(roots);
 const bootstrap:ReaderData={title:data.title,home:data.home,navigation,pages:{},projects:{},pdfFiles:{},resourceCatalog:data.resourceCatalog};
 const projects=(ids:Set<string>,known:Set<string>)=>{
  // 图表交互需要当前工程的完整事实；跨工程地址定义按显式引用闭包一起提供。
  const visit=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [key,item]of Object.entries(value)){if(key==='project'&&typeof item==='string'&&data.projects[item]&&!ids.has(item)){ids.add(item);visit(data.projects[item].entities);}else if(typeof item==='object')visit(item);}};
  for(const id of ids)visit(data.projects[id]?.entities);
  return Object.fromEntries([...ids].filter(id=>!known.has(id)).map(id=>{if(!Object.hasOwn(data.projects,id))throw Error('工程不存在：'+id);return [id,data.projects[id]];}));
 };
 const navigationTrail=(route:Route)=>{
  if(route.kind==='resource'&&route.mountId){
   const refresh=(list:Navigation[])=>{for(const node of list){if(node.kind==='resource'&&node.mountId===route.mountId){const mount=book.resourceCatalog.mounts.find(m=>m.mountId===route.mountId);if(mount)Object.assign(node,resourceMountNavigation(resourceContext(book.root.graph),mount,route,node));}else refresh(node.children);}};refresh(roots);
  }
  const matches=(node:Navigation)=>route.kind==='page'?node.project===route.project&&node.page===route.id:route.kind==='resource'&&node.route?.kind==='resource'&&node.route.project===route.project&&node.route.id===route.id&&node.route.view===route.view&&node.mountId===route.mountId&&JSON.stringify(node.route.segments)===JSON.stringify(route.segments);
  const find=(list:Navigation[],parents:Navigation[]=[]):Navigation[]|undefined=>{for(const node of list){if(matches(node))return parents;const found=find(node.children,[...parents,node]);if(found)return found;}};
  return (find(roots)??[]).map(node=>({key:node.previewKey!,children:shallow(node.children),more:!!node.resourceChildren}));
 };
 const rendered=new Set<string>();
 const searchIndex=[...Object.values(data.pages).map(page=>{
  const node=book.projects.get(page.project)!,doc=node.documents.documents.find(d=>d.file===page.file)!;
  const text=[...doc.ast.walk()].map((n:any)=>typeof n.attributes?.content==='string'?n.attributes.content:typeof n.attributes?.title==='string'?n.attributes.title:'').join(' ');
  return {label:data.projects[page.project].title+' / '+page.title,route:{kind:'page',project:page.project,id:page.id} as Route,text:(page.title+' '+page.file+' '+text).toLowerCase()};
 }),...Object.values(data.projects).flatMap(project=>Object.entries(project.entities).map(([id,entity])=>({label:project.title+' / '+(entity.label??id),route:{kind:'entity',project:project.id,id} as Route,text:(id+' '+JSON.stringify(entity)).toLowerCase()})))];
 return {bootstrap,inputs:book.inputs,async request(method:string,arg:any){
  if(method==='navigation'){
   const node=nodes.get(arg.key);if(!node)throw Error('目录不存在');
   if((arg.more||!node.children.length)&&node.resourceChildren)loadResourceNavigation(resourceContext(book.root.graph),node);
   return {children:shallow(node.children),more:!!node.resourceChildren};
  }
  if(method==='search'){const term=String(arg.term??'').trim().toLowerCase();return term?searchIndex.filter(item=>item.text.includes(term)).slice(0,30).map(({label,route})=>({label,route})):[];}
  if(method==='stats')return {pages:rendered.size};
  if(method!=='route')throw Error('未知预览请求');
  const route=parseRoute(routeHash(arg.route));if(!route)throw Error('页面路由无效');
  const project=data.projects[route.project];if(!project)throw Error('工程不存在：'+route.project);
  const ids=new Set([route.project]),payload:Partial<ReaderData>={pages:{},resourceBodies:{}};
  if(route.kind==='entity'&&project.sections[route.id]){const section=project.sections[route.id];Object.assign(route,{kind:'page',id:section.page,anchor:section.anchor});}
  if(route.kind==='page'){
   const page=await compiler.page(route.project,route.id);payload.pages![targetKey(route.project,route.id)]=page;rendered.add(targetKey(route.project,route.id));
  }else if(route.kind==='resource'){
   const context=resourceContext(book.root.graph),{view}=routeResource(context,route);
   for(const binding of resourceBindings(context,view)){await compiler.body(binding);const key=resourceBodyKey(binding.source.projectId,binding.sectionId);payload.resourceBodies![key]=data.resourceBodies![key];ids.add(binding.source.projectId);}
   // 资源路径可能经过其他工程的定义，视图和面包屑在客户端保持同一解释器。
   const collect=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(k==='project'&&typeof v==='string'&&data.projects[v])ids.add(v);else collect(v);}};collect(view);
  }else if(route.kind==='pdf'){
   const attachment=project.attachments[route.id];if(!attachment)throw Error('附件不存在：'+route.id);
   payload.pdfFiles=attachment.payload?{[attachment.payload]:data.pdfFiles[attachment.payload]}:{};Object.assign(payload,pdfResources());
  }else if(route.id&&!Object.hasOwn(project.entities,route.id))throw Error('对象不存在：'+route.id);
  payload.projects=projects(ids,new Set(Array.isArray(arg.known)?arg.known:[]));
  return {route,data:payload,navigationTrail:navigationTrail(route)};
 }};
}
