import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {dirname,resolve,extname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {build} from 'vite';
import type {Book} from '../core/book.ts';
import {bookNavigation,pageGraph,pageId,pageTitle} from '../core/book.ts';
import {routeHash,targetKey} from '../core/routes.ts';
import type {ReaderData,ReaderPage} from '../core/reader-model.ts';
import {localDocumentLink} from '../core/documents.ts';
import {renderDocument} from '../doc-theme/render.ts';
import {anchor} from '../core/identity.ts';
import {failure} from '../core/errors.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../render-graph/index.ts';
import {licenses} from './licenses.ts';
import {assertSelfContained,html as documentHTML} from './index.ts';
const directory=dirname(fileURLToPath(import.meta.url)),require=createRequire(import.meta.url),clients=new Map<string,string>();
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
 const data=await compileBook(book),hasPdf=Object.values(data.projects).some(p=>Object.keys(p.attachments).length),hasInterfaces=Object.values(data.pages).some(p=>Object.values(p.scenes).some(s=>s.interfaceModel)),extension=import.meta.url.endsWith('.ts')?'ts':'js';
 if(hasPdf){const root=dirname(require.resolve('pdfjs-dist/package.json'));data.pdfWorker=readFileSync(resolve(root,'build/pdf.worker.min.mjs'),'utf8');data.pdfSupport=Object.create(null);for(const name of ['cmaps','standard_fonts','wasm','iccs'])for(const file of readdirSync(resolve(root,name)))if(!file.startsWith('LICENSE')&&!file.startsWith('quickjs'))data.pdfSupport![name+'/'+file]=readFileSync(resolve(root,name,file)).toString('base64');}
 const key=String(hasPdf)+':'+String(hasInterfaces);let script=clients.get(key);
 if(!script){const result:any=await build({configFile:false,logLevel:'error',define:{__EDOC_PDF__:String(hasPdf),__EDOC_INTERFACES__:String(hasInterfaces)},build:{write:false,minify:true,target:'es2024',lib:{entry:resolve(directory,`../doc-theme/reader-entry.${extension}`),formats:['iife'],name:'EdocReader'}}});script=(result.output??result[0].output).filter((c:any)=>c.type==='chunk').map((c:any)=>c.code).join('\n');clients.set(key,script!);}
 const css=readFileSync(resolve(directory,'../doc-theme/style.css'),'utf8')+readFileSync(resolve(directory,'../doc-theme/reader.css'),'utf8');
 const result=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:; connect-src 'none'; worker-src blob:; object-src 'none'; base-uri 'none'"><title>${esc(data.title)}</title><style>${fontCSS()}${css}</style></head><body><nav class="sidebar"><div class="brand">edoc</div><div class="version">${esc(data.title)}</div><input id="search" type="search" aria-label="搜索" placeholder="搜索文档、对象与来源"><div id="results"></div><div id="toc"></div></nav><main><div id="notice" role="alert" hidden></div><nav id="breadcrumbs" aria-label="阅读位置"></nav><div id="reader"></div></main><aside class="properties"><h3>对象属性</h3><a id="object-link" hidden>跳转到工程对象</a><div id="selection-actions"></div><pre id="properties">点击图中对象查看来源与完整关系。</pre><nav id="page-toc" aria-label="本页目录"></nav></aside><script id="edoc-data" type="application/json">{}</script><script id="edoc-licenses" type="application/json">${json(licenses())}</script><script id="edoc-book" type="application/json">${json(data)}</script><script>${script!.replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 assertSelfContained(result);return result;
}

// 文档导出继续复用单文档打印；组合工程分别保留自己的索引及身份。
export async function bookPrintHTML(book:Book):Promise<string>{
 const legacySafe=[...book.root.documents.documents].every(d=>[...d.ast.walk()].every(n=>!(n.type==='tag'&&(['page','attachment'].includes(n.tag??'')||n.attributes.project!==undefined))&&!(n.type==='link'&&!/^(#|https?:|mailto:)/i.test(n.attributes.href??''))));
 if(book.projects.size===1&&book.root.documents.documents.length===1&&legacySafe)return documentHTML(book.root.graph,book.root.config.title,{compactIndex:book.root.config.compactIndex});
 // 打印与网页共用逻辑目录，在渲染标题时保留分组深度。
 const navigation=bookNavigation(book),levels=new Map<string,number>(),emitted=new Set<string>();
 const headingKey=(project:string,page:string,id:string)=>JSON.stringify([project,page,id]);
 const collectLevels=(nodes:typeof navigation,depth=0)=>{for(const node of nodes){if(node.anchor)levels.set(headingKey(node.project,node.page,node.anchor),depth);collectLevels(node.children,depth+1);}};
 collectLevels(navigation);
 const data=await compileBook(book,{headingLevel:(project,page,id,level)=>levels.get(headingKey(project,page,id))??level});
 const printId=(project:string,page:string,id='')=>'print-'+Array.from(new TextEncoder().encode(JSON.stringify([project,page,id])),b=>b.toString(16).padStart(2,'0')).join('');
 const destination=(route:any)=>{if(!data.projects[route.project])return '';if(route.kind==='page'&&!Object.hasOwn(data.pages,targetKey(route.project,route.id)))return '';if(route.kind==='entity'&&!Object.hasOwn(data.projects[route.project].entities,route.id))return '';if(route.kind==='page')return printId(route.project,route.id,route.anchor??'');if(route.kind==='entity'){const section=data.projects[route.project]?.sections[route.id];return section?printId(route.project,section.page,section.anchor):printId(route.project,'objects',route.id);}return '';};
 const rewrite=(text:string,project:string,page:string)=>text.replace(/\bid="([^"]+)"/g,(_all,id)=>'id="'+printId(project,page,id)+'"').replace(/((?:xlink:)?href=")#(?!edoc=)([^"]+)(")/g,(_all,before,id,after)=>before+'#'+printId(project,page,id)+after).replace(/url\(#([^)]*)\)/g,(_all,id)=>'url(#'+printId(project,page,id)+')').replace(/(<a\b[^>]*href=")#edoc=([^"]+)(")/g,(_all,before,encoded,after)=>{const target=destination(JSON.parse(decodeURIComponent(encoded)));return target?before+'#'+target+after:before.replace(/href="$/,'data-print-reference="')+'HTML'+after;});
 const toc=(nodes:ReturnType<typeof bookNavigation>,depth=0):string=>nodes.map(n=>`<div class="print-toc-entry" style="padding-left:${depth*18}px">${n.page?`<a href="#${printId(n.project,n.page,n.anchor??'')}">${esc(n.label)}</a>`:`<span>${esc(n.label)}</span>`}</div>`+toc(n.children,depth+1)).join('');
 const printPage=(p:ReaderPage,depth:number)=>{
  emitted.add(targetKey(p.project,p.id));
  const level=Math.min(6,depth+1),title=p.outline[0]?.label===p.title?'':`<h${level}>${esc(p.title)}</h${level}>`;
  return `<section class="print-project" id="${printId(p.project,p.id)}">${title}${rewrite(p.html,p.project,p.id)}</section>`;
 };
 const printNavigation=(nodes:typeof navigation,depth=0):string=>nodes.map(node=>{
  const key=targetKey(node.project,node.page),page=data.pages[key];let content='';
  const container=!node.anchor&&node.children.some(child=>child.project===node.project&&child.page===node.page);
  if(!node.page||container){const level=Math.min(6,depth+1);content=`<h${level}>${esc(node.label)}</h${level}>`;}
  else if(page&&!emitted.has(key))content=printPage(page,depth);
  return content+printNavigation(node.children,depth+1);
 }).join('');
 const chapters=printNavigation(navigation)+Object.values(data.pages).filter(p=>!emitted.has(targetKey(p.project,p.id))).map(p=>printPage(p,0)).join('');
 const referenced=new Map<string,Set<string>>();
 for(const page of Object.values(data.pages))for(const match of page.html.matchAll(/<a\b[^>]*href="#edoc=([^"]+)"/g)){
  const route=JSON.parse(decodeURIComponent(match[1]));
  if(route.kind!=='entity'||!data.projects[route.project]?.entities[route.id]||data.projects[route.project].sections[route.id])continue;
  if(!referenced.has(route.project))referenced.set(route.project,new Set());referenced.get(route.project)!.add(route.id);
 }
 const facts=Object.values(data.projects).map(p=>{
  const compact=book.projects.get(p.id)!.config.compactIndex;
  const entries=Object.entries(p.entities).filter(([id])=>!compact||referenced.get(p.id)?.has(id));
  if(!entries.length)return '';
  return `<section class="appendix"><h2>${esc(p.title)} · 工程对象${compact?'引用':''}</h2>`+entries.map(([id,e])=>compact
   ?`<div class="fact" id="${printId(p.id,'objects',id)}"><strong>${esc(e.label??id)}</strong><p>${esc(id)} · ${esc(e.source?.file??p.records[id].location.file)}</p></div>`
   :`<details class="fact" id="${printId(p.id,'objects',id)}"><summary>${esc(e.label??id)}</summary><pre>${esc(JSON.stringify(e))}</pre></details>`).join('')+'</section>';
 }).join('');
 const css=readFileSync(resolve(directory,'../doc-theme/style.css'),'utf8')+readFileSync(resolve(directory,'../doc-theme/reader.css'),'utf8');
 return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><style>${fontCSS()}${css}</style></head><body><main><header class="cover"><h1>${esc(data.title)}</h1></header><div class="print-toc"><p class="print-toc-title">目录</p>${toc(navigation)}</div>${chapters}${facts}</main><script>window.EdocReady=true</script></body></html>`;
}
