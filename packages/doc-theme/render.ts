import Markdoc from '@markdoc/markdoc';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {localDocumentLink,tags,documentAST} from '../core/documents.ts';
import type {Graph,Table,Waveform} from '../core/types.ts';
import {scene,esc,anchor} from '../render-graph/index.ts';
import type {Scene} from '../render-graph/index.ts';
import {waveform} from '../render-wave/index.ts';
import {projectPath} from '../core/paths.ts';
import {routeHash} from '../core/routes.ts';
import {prepareOutline} from '../core/outline.ts';
import {tableHTML} from '../extensions/data-table/render.ts';
import {relationDiagramHTML} from '../extensions/relation-diagram/render.ts';
import {interfaceTableHTML} from '../extensions/relation-diagram/interface-table.ts';
export {tableHTML,field} from '../extensions/data-table/render.ts';
export async function renderDocument(graph:Graph,title:string,options:{compactIndex?:boolean;headingLevel?:(id:string,level:number)=>number;projectLink?:(alias:string)=>{project:string;page:string;title:string};documentLink?:(href:string,source:string)=>string}={}){
 const scenes:Record<string,Scene>={},printScenes:Record<string,Scene>={};
 const usedViews=new Set<string>();for(const {ast}of documentAST(graph))for(const node of ast.walk())if(node.type==='tag'&&node.tag==='relation-diagram')usedViews.add(node.attributes.id);
 for(const id of usedViews){scenes[id]=await scene(graph,id);printScenes[id]=scenes[id].interfaceModel?await scene(graph,id,{interfaces:'expanded'}):scenes[id];}
 const plan=prepareOutline(graph),headings=new Map(plan.flat.map(e=>[e.id,e]));let counter=0,wave=0;
 const heading=(id:string,level:number,body:string,section=false)=>{level=options.headingLevel?.(id,level)??level;const tag='h'+Math.min(level+1,6);return `<${tag} data-heading-level="${level}"${section?' data-section-title':''}${level+1>6?` aria-level="${level+1}"`:''}>${body}</${tag}>`;};
 function render(tree:any):string{
  if(tree===null||tree===undefined||tree===false)return '';
  if(Array.isArray(tree))return tree.map(render).join('');
  if(typeof tree==='string'||typeof tree==='number')return esc(tree);
  if(typeof tree!=='object'||!Markdoc.Tag.isTag(tree))return '';
  const n=tree.name,a=tree.attributes??{},children=()=>render(tree.children);
  for(const key of Object.keys(a))if(/^on/i.test(key)||key.toLowerCase()==='style')throw new Error('Markdoc Schema 不允许事件或自由样式属性：'+key);
  if(typeof n!=='string')throw new Error('Markdoc 扩展标签须输出语义 HTML 标签名');
  if(n.startsWith('ed-')){
   const type=n.slice(3),id=a.id;
   if(type==='directory-order')return '';
   if(type==='section'){const body=`${a.title?heading(anchor(id),a.outlineLevel,esc(a.title),true):''}${children()}`;return a.collapsed?`<details id="${anchor(id)}"><summary>${esc(a.title??id)}</summary>${body}</details>`:`<section id="${anchor(id)}"${a.class?` class="${esc(a.class)}"`:""}>${body}</section>`;}
   if(type==='heading')return `<div id="${id}" class="heading-anchor${a.class?' '+esc(a.class):''}">${heading(id,a.outlineLevel,children())}</div>`;
   if(type==='columns')return `<div class="columns${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''} style="--columns:${(a.ratio??'1:1').split(':').map((v:string)=>v+'fr').join(' ')}">${children()}</div>`;
   if(type==='panel')return `<div class="panel${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}>${a.title?`<p class="panel-title">${esc(a.title)}</p>`:''}${children()}</div>`;
   if(type==='tabs')return `<div class="tabs${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}>${children()}</div>`;
   if(type==='tab')return `<div class="tab${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''} data-name="${esc(a.name)}">${children()}</div>`;
   if(type==='reference')return `<a href="${esc(a.project?routeHash({kind:'entity',project:a.project,id}):'#'+anchor(id))}">${esc(a.label??(!a.project||a.project===graph.manifest.projectId?graph.index.get(id)?.entity.label:undefined)??id)}</a>`;
   if(type==='page')return `<a href="${esc(routeHash({kind:'page',project:a.project??graph.manifest.projectId,id,...(a.anchor?{anchor:a.anchor}:{})}))}">${esc(a.label??id)}</a>`;
   if(type==='attachment')return `<a class="attachment-link" href="${esc(routeHash({kind:'pdf',project:a.project??graph.manifest.projectId,id,...(a.target?{target:a.target}:{})}))}">${esc(a.label??(!a.project||a.project===graph.manifest.projectId?graph.attachments?.[id]?.title:undefined)??id)}</a>`;
   if(type==='include'&&a.project){const link=options.projectLink?.(a.project);return link?`<a class="project-entry" href="${esc(routeHash({kind:'page',project:link.project,id:link.page}))}">进入 ${esc(link.title)}</a>`:'';}
   if(type==='data-table')return tableHTML(graph,graph.index.get(id)!.entity as Table);
   if(type==='waveform')return waveform(graph.index.get(id)!.entity as Waveform,wave++);
   if(type==='relation-diagram')return relationDiagramHTML(id,scenes[id],printScenes[id],++counter);
   if(type==='interface-table')return interfaceTableHTML(graph,id,a.mode??'detailed');
  }
  if(n==='img'){if(graph.documentPlan&&!graph.documentPlan.files.includes(a.src))throw new Error('Schema 图片须通过 Markdown 图片节点或 render:img 的声明式属性记录来源：'+a.src);const file=projectPath(graph.projectRoot,graph.projectRoot,a.src);const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};if(!mime[extname(file)])throw new Error('文档图片只支持 PNG/JPEG/WebP');return `<img class="doc-image${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}${a.title?` title="${esc(a.title)}"`:''} alt="${esc(a.alt??'')}" src="data:${mime[extname(file)]};base64,${readFileSync(file).toString('base64')}"/>`;}
  const common=()=>Object.entries(a).filter(([key,value])=>value!==undefined&&key!=='href'&&key!=='sourceFile'&&!key.startsWith('__edoc')).map(([key,value])=>{if(!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(key))throw new Error('HTML 属性名非法：'+key);return ` ${key.toLowerCase()}="${esc(String(value))}"`;}).join('');
  const allowed=new Set(['div','span','aside','section','article','details','summary','figure','figcaption','caption','dl','dt','dd','abbr','kbd','mark','small','sub','sup','time','q','b','i','u','h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','pre','code','blockquote','table','thead','tbody','tr','th','td','strong','em','s','hr','br','del']);
  if(!allowed.has(n))throw new Error('Markdoc 扩展输出不支持的 HTML 标签：'+n);
  let attrs=common();if(n==='a'&&a.href!==undefined){if(typeof a.href!=='string'||!/^(#|https?:|mailto:)/i.test(a.href)&&!localDocumentLink(graph.projectRoot,a.sourceFile??plan.documents[0].file,a.href))throw new Error('Markdoc 链接目标不符合工程链接规则：'+a.href);attrs+=` href="${esc(options.documentLink?.(a.href,a.sourceFile??'')??a.href)}"`;}
  return `<${n}${attrs}>${children()}</${n}>`;
 }
 const inherited=graph.documentPlan?.markdoc??{};
 const config={...inherited,
  tags:{...inherited.tags,...Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,k==='section'?{...v,transform(node:any,config:any){
   return new Markdoc.Tag('ed-section',{...node.transformAttributes(config),outlineLevel:headings.get(node.attributes.__edocOutlineId)!.level},node.transformChildren(config));
  }}:{...v,render:'ed-'+k}]))},
  nodes:{...inherited.nodes,document:{...Markdoc.nodes.document,transform(node:any,config:any){return node.transformChildren(config);}},fence:{...Markdoc.nodes.fence,transform(node:any,config:any){const attrs=node.transformAttributes(config);return new Markdoc.Tag('pre',{id:attrs.id,class:attrs.class},[new Markdoc.Tag('code',{'data-language':node.attributes.language},node.attributes.process===false||!node.children.length?[node.attributes.content]:node.transformChildren(config))]);}},link:{...Markdoc.nodes.link,attributes:{...Markdoc.nodes.link.attributes,__edocSourceFile:{type:String}},transform(node:any,config:any){const source=plan.documents.map(d=>d.locations.get(node)).find(Boolean);return new Markdoc.Tag('a',{...node.transformAttributes(config),sourceFile:node.attributes.__edocSourceFile??source?.file},node.transformChildren(config));}},heading:{...Markdoc.nodes.heading,transform(node:any,config:any){
   const entry=headings.get(node.attributes.__edocOutlineId)!;
   return new Markdoc.Tag('ed-heading',{...node.transformAttributes(config),id:entry.id,outlineLevel:entry.level},node.transformChildren(config));
  }}}
 };
 // 自定义 Schema 可异步转换；Tag 内部的异步 children 也必须先完成，不能静默丢失。
 const settled=async(tree:any):Promise<any>=>{
  if(tree&&typeof tree.then==='function')return settled(await tree);
  if(Array.isArray(tree))return Promise.all(tree.map(settled));
  if(Markdoc.Tag.isTag(tree))return new Markdoc.Tag(tree.name,tree.attributes,await settled(tree.children));
  return tree;
 };
 const chapters=(await Promise.all(plan.documents.map(async({file,ast})=>`<article data-source="${esc(file)}">${render(await settled(await Markdoc.transform(ast,config)))}</article>`))).join('');
 const allEntities=Object.fromEntries([...graph.index].map(([id,e])=>[id,e.entity]));
 const existing=new Set([...chapters.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const facts=[...graph.index.values()].filter(e=>!existing.has(anchor(e.id))).map(e=>options.compactIndex?`<span id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"></span>`:`<details class="fact" id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"><summary>${esc(e.entity.label??e.id)} · ${esc(e.type)}</summary><pre>${esc(JSON.stringify({...e.entity,...('ports' in e.entity?{ports:e.entity.ports?.map(p=>({id:p.id}))}:{})}))}</pre></details>`).join('');
 return {chapters,facts:options.compactIndex?facts+'<p>全量对象可通过页面搜索查看，精确机器读取使用项目 query。此索引不展开进打印文档。</p><pre id="entity-detail">选择搜索结果查看完整属性与来源。</pre>':facts,toc:plan.flat,outline:plan.roots,scenes,entities:allEntities};
}
