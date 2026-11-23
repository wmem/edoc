import {withDrawingPool} from '../drawing/solve.ts';
import {drawingConcurrency} from '../drawing/pool.ts';
import {forEachConcurrent} from './concurrent.ts';
import {cachedScene} from './scene-cache.ts';
import {storeScenes} from '../core/scene-storage.ts';
import {resourcePage} from '../doc-theme/resource-page.ts';
import {resourceContext,resourceRoute,resourceTarget} from '../core/resource-pages.ts';
import {namespaceResourceBody} from '../core/resource-body.ts';
import {parseRoute} from '../core/routes.ts';
import {resourceSectionGraph} from '../core/resource-section.ts';
import {resourceBodyKey} from '../core/resource-body.ts';
import {assertResourceContext} from '../core/resource-context.ts';
import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,resolve,extname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {browserScript} from './runtime.ts';
import type {Book} from '../core/book.ts';
import {bookNavigation,pageGraph,pageId,pageTitle} from '../core/book.ts';
import {routeHash,targetKey} from '../core/routes.ts';
import type {ReaderData} from '../core/reader-model.ts';
import {localDocumentLink} from '../core/documents.ts';
import {clauseNamespace} from '../extensions/clause/prepare.ts';
import {renderDocument} from '../doc-theme/render.ts';
import {anchor,anchorIndex,resolveHTMLAnchor} from '../core/identity.ts';
import {preflightBook} from '../core/document-preflight.ts';
import {failure} from '../core/errors.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../render-graph/index.ts';
import {licenses} from './licenses.ts';
import {assertSelfContained} from './index.ts';
const directory=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
type CompileOptions={workers?:number;deferDiagramSVG?:boolean;scene?:typeof import('../render-graph/native.ts').scene;headingLevel?:(project:string,page:string,id:string,level:number)=>number};
export async function compileBook(book:Book,options:CompileOptions={}):Promise<ReaderData>{
 const workers=drawingConcurrency(options.workers);
 return withDrawingPool(workers,()=>compilePages(book,{...options,workers}));
}
async function compilePages(book:Book,options:CompileOptions&{workers:number}):Promise<ReaderData>{
 const renderScene=cachedScene(options.scene);
 for(const node of book.projects.values())assertResourceContext(node.graph);
 preflightBook(book);
 const data:ReaderData={resourceCatalog:book.resourceCatalog,resourceBodies:Object.create(null),title:book.root.config.title,home:{project:book.root.config.projectId,id:pageId(book.root.documents.documents[0].file)},navigation:bookNavigation(book),pages:Object.create(null),projects:Object.create(null),pdfFiles:Object.create(null)};
 const filePayloads=new Map<string,string>();
 const anchors=new Map([...book.projects].map(([id,node])=>[id,anchorIndex(node.graph.index.keys())]));
 for(const node of book.projects.values()){
  const project=node.config.projectId,sections:Record<string,{page:string;anchor:string}>=Object.create(null);
  for(const document of node.documents.documents){const id=pageId(document.file);if(Object.hasOwn(data.pages,targetKey(project,id)))failure('PAGE_DUPLICATE',document.file,'','文档路由重复：'+id);const collect=(tag:any,namespace='')=>{if(tag.type==='tag'&&['section','clause'].includes(tag.tag)){sections[tag.attributes.id]={page:id,anchor:namespace+anchor(tag.attributes.id)};if(tag.tag==='clause')namespace=clauseNamespace(tag.attributes.id);}for(const child of [...Object.values(tag.slots??{}),...tag.children??[]])collect(child,namespace);};collect(document.ast);
   data.pages[targetKey(project,id)]={id,project,title:pageTitle(document),file:document.file,html:'',scenes:{},outline:[]};}
  const attachments:typeof node.graph.attachments=Object.create(null);for(const [key,attachment]of Object.entries(node.graph.attachments??{})){const identity=realpathSync(resolve(node.config.root,attachment.file));let payload=filePayloads.get(identity);if(!payload){payload='pdf-'+filePayloads.size;filePayloads.set(identity,payload);data.pdfFiles[payload]=attachment.data;}attachments![key]={...attachment,data:'',payload};}
  data.projects[project]={id:project,title:node.config.title,irVersion:node.graph.manifest.irVersion,requiredFeatures:node.graph.manifest.requiredFeatures,records:Object.fromEntries([...node.graph.index].map(([id,e])=>[id,{type:e.type,location:{...e.location,file:isAbsolute(e.location.file)?relative(node.config.root,e.location.file).split('\\').join('/'):e.location.file},...(e.ownerId?{ownerId:e.ownerId}:{}),...(e.semanticKind?{semanticKind:e.semanticKind}:{})}])),entities:Object.fromEntries([...node.graph.index].map(([id,entry])=>[id,entry.entity])),relations:Object.fromEntries(node.graph.connections),sections,attachments:attachments!};
 }
 // 索引保留 Object.entries 的首匹配顺序，包括原片段与编码片段同时命中的情况。
 const sectionIndexes=new Map(Object.entries(data.projects).map(([project,value])=>{
  const entries=new Map<string,{rank:number;value:{page:string;anchor:string}}>();
  Object.values(value.sections).forEach((section,rank)=>{if(!entries.has(section.anchor))entries.set(section.anchor,{rank,value:section});});
  return [project,entries] as const;
 }));
 const findSection=(project:string,fragment:string)=>{
  const entries=sectionIndexes.get(project)!,raw=entries.get(fragment),encoded=entries.get(anchor(fragment));
  return (!raw?encoded:!encoded||raw.rank<encoded.rank?raw:encoded)?.value;
 };
 await forEachConcurrent([...book.projects.values()].flatMap(node=>node.documents.documents.map(document=>({node,document}))),options.workers,async({node,document})=>{
  const project=node.config.projectId,id=pageId(document.file),page=data.pages[targetKey(project,id)];
  const rendered=await renderDocument(pageGraph(node,document),page.title,{anchors:anchors.get(project),scene:renderScene,compactIndex:true,deferDiagramSVG:options.deferDiagramSVG,headingLevel:options.headingLevel?(heading,level)=>options.headingLevel!(project,id,heading,level):undefined,projectLink(alias){const child=node.children.get(alias)!;return {project:child.config.projectId,page:pageId(child.documents.documents[0].file),title:child.config.title};},documentLink(href,source){
   const link=localDocumentLink(node.config.root,source||document.file,href);if(!link)return href;
   const target=pageId(link.file);if(!Object.hasOwn(data.pages,targetKey(project,target)))failure('DOCUMENT_LINK',source,'','链接文档未参与发布：'+link.file);
   return routeHash({kind:'page',project,id:target,...(link.anchor?{anchor:link.anchor}:{})});
  }});
  page.html=rendered.chapters;page.anchorAliases=rendered.anchorAliases;page.scenes=rendered.scenes;if(options.deferDiagramSVG)page.printScenes=rendered.printScenes;page.outline=rendered.outline;
  page.html=page.html.replace(/(<a\b[^>]*\bhref=")#([^"\s]*)(")/g,(whole,before,fragment,after)=>{
   if(fragment.startsWith('edoc='))return whole;
   // Markdown 解析器会编码中文等片段；与跨文件链接相同，只在 URL 边界解码一次。
   try{fragment=decodeURIComponent(fragment);}catch{failure('DOCUMENT_LINK',document.file,'','文档链接编码错误');}
   const section=findSection(project,fragment);
   if(section)return before+esc(routeHash({kind:'page',project,id:section.page,anchor:section.anchor}))+after;
   const entity=anchors.get(project)!.entities.get(fragment);if(entity)return before+esc(routeHash({kind:'entity',project,id:entity}))+after;
   return before+esc(routeHash({kind:'page',project,id,anchor:fragment}))+after;
  });
 });
 // 每个作者 Section 只编译一个有限模板；实例页面由浏览器按路由派生。
 for(const binding of book.resourceCatalog.bindings){
  const project=binding.source.projectId,key=resourceBodyKey(project,binding.sectionId);if(data.resourceBodies![key])continue;
  const node=book.projects.get(project)!,graph=resourceSectionGraph(node.graph,binding.sectionId),document=graph.documentPlan!.documents[0],id=pageId(document.file);
  const rendered=await renderDocument(graph,binding.sectionId,{anchors:anchors.get(project),scene:renderScene,compactIndex:true,deferDiagramSVG:options.deferDiagramSVG,projectLink(alias){const child=node.children.get(alias)!;return {project:child.config.projectId,page:pageId(child.documents.documents[0].file),title:child.config.title};},documentLink(href,source){const link=localDocumentLink(node.config.root,source||document.file,href);return link?routeHash({kind:'page',project,id:pageId(link.file),...(link.anchor?{anchor:link.anchor}:{})}):href;}});
  const links:Record<string,string>=Object.create(null);
  const html=rendered.chapters.replace(/(<a\b[^>]*\bhref=")#([^"\s]*)(")/g,(all,before,fragment,after)=>{
   if(fragment.startsWith('edoc='))return all;
   try{fragment=decodeURIComponent(fragment);}catch{failure('DOCUMENT_LINK',document.file,'','正文链接编码错误');}
   const section=findSection(project,fragment);
   const entity=anchors.get(project)!.entities.get(fragment);
   links[fragment]=routeHash(section?{kind:'page',project,id:section.page,anchor:section.anchor}:entity?{kind:'entity',project,id:entity}:{kind:'page',project,id,anchor:fragment});return all;
  });
  data.resourceBodies![key]={project,page:id,sectionId:binding.sectionId,sourceAnchor:data.projects[project].sections[binding.sectionId]?.anchor,links,html,outline:rendered.outline,scenes:rendered.scenes,...(options.deferDiagramSVG?{printScenes:rendered.printScenes}:{}),anchorAliases:rendered.anchorAliases};
 }
 for(const binding of book.resourceCatalog.bindings)namespaceResourceBody(data.resourceBodies![resourceBodyKey(binding.source.projectId,binding.sectionId)],binding,resourceRoute(binding.target),0);
 // 只校验作者显式写出的有限链接，不生成整个资源实例树。
 for(const node of book.projects.values())for(const check of node.documents.checks??[])if(check.node.tag==='resource-link'&&check.node.attributes.anchor){
  const attrs=check.node.attributes,route={...resourceRoute(resourceTarget(attrs.target,node.config.projectId),attrs.mount),anchor:attrs.anchor},page=resourcePage(resourceContext(node.graph),route,data.resourceBodies);
  if(!resolveHTMLAnchor(page.html,attrs.anchor,page.anchorAliases))failure('RESOURCE_ANCHOR',check.file,'#L'+check.line,'资源页锚点不存在：'+attrs.anchor);
 }
 // 所有目标页生成后，再校验本地页与锚点。跨工程导航不扩大加载集合，也不阻止构建。
 for(const page of Object.values(data.pages)){
  const parser=/<a\b[^>]*href="(#edoc=[^"]+)"/g;for(const match of page.html.matchAll(parser)){
   const route=JSON.parse(decodeURIComponent(match[1].slice('#edoc='.length).replace(/&amp;/g,'&')));if(route.project!==page.project)continue;
   if(route.kind==='page'){
    const target=data.pages[targetKey(route.project,route.id)];if(!target)failure('DOCUMENT_PAGE',page.file,'','本地文档不存在：'+route.id);
    if(route.anchor){const resolved=resolvePageAnchor(target.html,route.anchor,target.anchorAliases);if(!resolved)failure('DOCUMENT_ANCHOR',page.file,'','本地锚点不存在：'+route.anchor);}
   }
  }
 }
 return data;
}
export const resolvePageAnchor=resolveHTMLAnchor;
export async function bookHTML(book:Book,options:{workers?:number;scene?:typeof import('../render-graph/scene.ts').scene}={}):Promise<string>{
 const data=await compileBook(book,{...options,deferDiagramSVG:true}),hasPdf=Object.values(data.projects).some(p=>Object.keys(p.attachments).length),hasInterfaces=[...Object.values(data.pages),...Object.values(data.resourceBodies??{})].some(p=>Object.values(p.scenes).some(s=>s.interfaceModel));
 if(hasPdf){const root=dirname(require.resolve('pdfjs-dist/package.json'));data.pdfWorker=readFileSync(resolve(root,'build/pdf.worker.min.mjs'),'utf8');data.pdfSupport=Object.create(null);for(const name of ['cmaps','standard_fonts','wasm','iccs'])for(const file of readdirSync(resolve(root,name)))if(!file.startsWith('LICENSE')&&!file.startsWith('quickjs'))data.pdfSupport![name+'/'+file]=readFileSync(resolve(root,name,file)).toString('base64');}
 const script=await browserScript('reader-'+hasPdf+'-'+hasInterfaces,'reader-entry',{__EDOC_PDF__:String(hasPdf),__EDOC_INTERFACES__:String(hasInterfaces)});
 const css=readFileSync(resolve(directory,'../doc-theme/style.css'),'utf8')+readFileSync(resolve(directory,'../doc-theme/reader.css'),'utf8');
 const identities=new Map(),diagramScenes={};
 for(const [key,page]of Object.entries(data.pages))data.pages[key]=storeScenes(page,diagramScenes,identities);
 for(const [key,body]of Object.entries(data.resourceBodies??{}))data.resourceBodies![key]=storeScenes(body,diagramScenes,identities);
 data.diagramScenes=diagramScenes;
 const result=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'"><title>${esc(data.title)}</title><style id="edoc-document-style">${fontCSS()}${css}</style></head><body><nav class="sidebar"><div class="brand">edoc</div><div class="version">${esc(data.title)}</div><input id="search" type="search" aria-label="搜索" placeholder="搜索文档、对象与来源"><div id="results"></div><div id="toc"></div></nav><main><div id="notice" role="alert" hidden></div><nav id="breadcrumbs" aria-label="阅读位置"></nav><div id="reader"></div></main><aside class="properties"><h3>对象属性</h3><a id="object-link" hidden>跳转到工程对象</a><div id="selection-actions"></div><pre id="properties">点击图中对象查看来源与完整关系。</pre><nav id="page-toc" aria-label="本页目录"></nav></aside><script id="edoc-data" type="application/json">{}</script><script id="edoc-licenses" type="application/json">${json(licenses())}</script><script id="edoc-book" type="application/json">${json(data)}</script><script>${script!.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 assertSelfContained(result);return result;
}
