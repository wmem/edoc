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
import {renderDocument} from '../doc-theme/render.ts';
import {anchor} from '../core/identity.ts';
import {failure} from '../core/errors.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../render-graph/index.ts';
import {licenses} from './licenses.ts';
import {assertSelfContained} from './index.ts';
const directory=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url);
const json=(value:unknown)=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
export async function compileBook(book:Book,options:{headingLevel?:(project:string,page:string,id:string,level:number)=>number}={}):Promise<ReaderData>{
 const data:ReaderData={title:book.root.config.title,home:{project:book.root.config.projectId,id:pageId(book.root.documents.documents[0].file)},navigation:bookNavigation(book),pages:Object.create(null),projects:Object.create(null),pdfFiles:Object.create(null)};
 const filePayloads=new Map<string,string>();
 for(const node of book.projects.values()){
  const project=node.config.projectId,sections:Record<string,{page:string;anchor:string}>=Object.create(null);
  for(const document of node.documents.documents){const id=pageId(document.file);if(Object.hasOwn(data.pages,targetKey(project,id)))failure('PAGE_DUPLICATE',document.file,'','文档路由重复：'+id);for(const tag of document.ast.walk())if(tag.type==='tag'&&tag.tag==='section')sections[tag.attributes.id]={page:id,anchor:anchor(tag.attributes.id)};
   data.pages[targetKey(project,id)]={id,project,title:pageTitle(document),file:document.file,html:'',scenes:{},outline:[]};}
  const attachments:typeof node.graph.attachments=Object.create(null);for(const [key,attachment]of Object.entries(node.graph.attachments??{})){const identity=realpathSync(resolve(node.config.root,attachment.file));let payload=filePayloads.get(identity);if(!payload){payload='pdf-'+filePayloads.size;filePayloads.set(identity,payload);data.pdfFiles[payload]=attachment.data;}attachments![key]={...attachment,data:'',payload};}
  data.projects[project]={id:project,title:node.config.title,irVersion:node.graph.manifest.irVersion,records:Object.fromEntries([...node.graph.index].map(([id,e])=>[id,{type:e.type,location:{...e.location,file:isAbsolute(e.location.file)?relative(node.config.root,e.location.file).split('\\').join('/'):e.location.file},...(e.ownerId?{ownerId:e.ownerId}:{})}])),entities:Object.fromEntries([...node.graph.index].map(([id,entry])=>[id,entry.entity])),relations:Object.fromEntries(node.graph.connections),sections,attachments:attachments!};
 }
 for(const node of book.projects.values())for(const document of node.documents.documents){
  const project=node.config.projectId,id=pageId(document.file),page=data.pages[targetKey(project,id)];
  const rendered=await renderDocument(pageGraph(node,document),page.title,{compactIndex:true,headingLevel:options.headingLevel?(heading,level)=>options.headingLevel!(project,id,heading,level):undefined,projectLink(alias){const child=node.children.get(alias)!;return {project:child.config.projectId,page:pageId(child.documents.documents[0].file),title:child.config.title};},documentLink(href,source){
   const link=localDocumentLink(node.config.root,source||document.file,href);if(!link)return href;
   const target=pageId(link.file);if(!Object.hasOwn(data.pages,targetKey(project,target)))failure('DOCUMENT_LINK',source,'','链接文档未参与发布：'+link.file);
   return routeHash({kind:'page',project,id:target,...(link.anchor?{anchor:link.anchor}:{})});
  }});
  page.html=rendered.chapters;page.scenes=rendered.scenes;page.outline=rendered.outline;
  page.html=page.html.replace(/(<a\b[^>]*\bhref=")#([^"\s]*)(")/g,(whole,before,fragment,after)=>{
   if(fragment.startsWith('edoc='))return whole;
   // Markdown 解析器会编码中文等片段；与跨文件链接相同，只在 URL 边界解码一次。
   try{fragment=decodeURIComponent(fragment);}catch{failure('DOCUMENT_LINK',document.file,'','文档链接编码错误');}
   const section=Object.entries(data.projects[project].sections).find(([,s])=>s.anchor===fragment||s.anchor===anchor(fragment));
   if(section)return before+esc(routeHash({kind:'page',project,id:section[1].page,anchor:section[1].anchor}))+after;
   const entity=[...node.graph.index.keys()].find(key=>anchor(key)===fragment);if(entity)return before+esc(routeHash({kind:'entity',project,id:entity}))+after;
   return before+esc(routeHash({kind:'page',project,id,anchor:fragment}))+after;
  });
 }
 // 所有目标页生成后，再校验本地页与锚点。跨工程导航不扩大加载集合，也不阻止构建。
 for(const page of Object.values(data.pages)){
  const parser=/<a\b[^>]*href="(#edoc=[^"]+)"/g;for(const match of page.html.matchAll(parser)){
   const route=JSON.parse(decodeURIComponent(match[1].slice('#edoc='.length).replace(/&amp;/g,'&')));if(route.project!==page.project)continue;
   if(route.kind==='page'){
    const target=data.pages[targetKey(route.project,route.id)];if(!target)failure('DOCUMENT_PAGE',page.file,'','本地文档不存在：'+route.id);
    if(route.anchor){const resolved=resolvePageAnchor(target.html,route.anchor);if(!resolved)failure('DOCUMENT_ANCHOR',page.file,'','本地锚点不存在：'+route.anchor);}
   }
  }
 }
 return data;
}
export function resolvePageAnchor(html:string,id:string){for(const candidate of [id,anchor(id),'heading-'+id.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')])if(html.includes('id="'+esc(candidate)+'"'))return candidate;}
export async function bookHTML(book:Book):Promise<string>{
 const data=await compileBook(book),hasPdf=Object.values(data.projects).some(p=>Object.keys(p.attachments).length),hasInterfaces=Object.values(data.pages).some(p=>Object.values(p.scenes).some(s=>s.interfaceModel));
 if(hasPdf){const root=dirname(require.resolve('pdfjs-dist/package.json'));data.pdfWorker=readFileSync(resolve(root,'build/pdf.worker.min.mjs'),'utf8');data.pdfSupport=Object.create(null);for(const name of ['cmaps','standard_fonts','wasm','iccs'])for(const file of readdirSync(resolve(root,name)))if(!file.startsWith('LICENSE')&&!file.startsWith('quickjs'))data.pdfSupport![name+'/'+file]=readFileSync(resolve(root,name,file)).toString('base64');}
 const script=await browserScript('reader-'+hasPdf+'-'+hasInterfaces,'reader-entry',{__EDOC_PDF__:String(hasPdf),__EDOC_INTERFACES__:String(hasInterfaces)});
 const css=readFileSync(resolve(directory,'../doc-theme/style.css'),'utf8')+readFileSync(resolve(directory,'../doc-theme/reader.css'),'utf8');
 const result=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'"><title>${esc(data.title)}</title><style id="edoc-document-style">${fontCSS()}${css}</style></head><body><nav class="sidebar"><div class="brand">edoc</div><div class="version">${esc(data.title)}</div><input id="search" type="search" aria-label="搜索" placeholder="搜索文档、对象与来源"><div id="results"></div><div id="toc"></div></nav><main><div id="notice" role="alert" hidden></div><nav id="breadcrumbs" aria-label="阅读位置"></nav><div id="reader"></div></main><aside class="properties"><h3>对象属性</h3><a id="object-link" hidden>跳转到工程对象</a><div id="selection-actions"></div><pre id="properties">点击图中对象查看来源与完整关系。</pre><nav id="page-toc" aria-label="本页目录"></nav></aside><script id="edoc-data" type="application/json">{}</script><script id="edoc-licenses" type="application/json">${json(licenses())}</script><script id="edoc-book" type="application/json">${json(data)}</script><script>${script!.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 assertSelfContained(result);return result;
}
