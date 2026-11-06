import {readingOutline,headingGroups} from './reading-structure.ts';
import {presentationGraph} from '../extensions/specification/prepare.ts';
import {specificationHTML} from '../extensions/specification/render.ts';
import Markdoc from '@markdoc/markdoc';
import {localDocumentLink,tags,documentAST} from '../core/documents.ts';
import type {Graph,Table,Waveform} from '../core/types.ts';
import {scene,esc,anchor} from '../render-graph/index.ts';
import type {Scene} from '../render-graph/index.ts';
import {waveform} from '../render-wave/index.ts';
import {loadImageAsset} from '../core/media.ts';
import {pageId} from '../core/book.ts';
import {routeHash} from '../core/routes.ts';
import {prepareOutline} from '../core/outline.ts';
import {tableHTML} from '../extensions/data-table/render.ts';
import {relationDiagramHTML} from '../extensions/relation-diagram/render.ts';
import {interfaceTableHTML} from '../extensions/relation-diagram/interface-table.ts';
export {tableHTML,field} from '../extensions/data-table/render.ts';
export async function renderDocument(graph:Graph,title:string,options:{compactIndex?:boolean;headingLevel?:(id:string,level:number)=>number;projectLink?:(alias:string)=>{project:string;page:string;title:string};documentLink?:(href:string,source:string)=>string}={}){
 graph=presentationGraph(graph);
 const aliases=new Map<string,string|undefined>();
 const scenes:Record<string,Scene>={},printScenes:Record<string,Scene>={};
 const usedViews=new Set<string>();for(const {ast}of documentAST(graph))for(const node of ast.walk())if(node.type==='tag'&&node.tag==='relation-diagram')usedViews.add(node.attributes.id);
 for(const id of usedViews){scenes[id]=await scene(graph,id);printScenes[id]=scenes[id].interfaceModel?await scene(graph,id,{interfaces:'expanded'}):scenes[id];}
 const plan=prepareOutline(graph),headings=new Map(plan.all.map(e=>[e.id,e]));let counter=0,wave=0,codeCounter=0,tableCounter=0;const tableInstances=new Map<string,number>();
 const specIds=new Set(plan.all.filter(e=>e.sectionId&&graph.index.get(e.sectionId)?.type==='specification').map(e=>e.id));
 const reading=readingOutline(plan.roots,title,specIds),usedIds=new Set(plan.all.map(e=>e.id));
 for(const {ast}of plan.documents)for(const node of ast.walk())if(typeof node.attributes.id==='string')usedIds.add(node.attributes.id);
 const codeId=()=>{let id:string;do{id='reading-code-'+(++codeCounter);}while(usedIds.has(id));usedIds.add(id);return id;};
 const heading=(id:string,level:number,body:string,section=false)=>{level=options.headingLevel?.(id,level)??level;const tag='h'+Math.min(level+1,6);return `<${tag} data-heading-level="${level}"${section?' data-section-title':''}${level+1>6?` aria-level="${level+1}"`:''}>${reading.numbers.has(id)?`<span class="heading-number" aria-hidden="true">${esc(reading.numbers.get(id))}</span>`:''}${body}</${tag}>`;};
 function render(tree:any,fold=true,scope=''):string{
  if(tree===null||tree===undefined||tree===false)return '';
  if(Array.isArray(tree))return (fold?headingGroups(tree,reading.titleId):tree).map(node=>render(node,fold,scope)).join('');
  if(typeof tree==='string'||typeof tree==='number')return esc(tree);
  if(typeof tree!=='object'||!Markdoc.Tag.isTag(tree))return '';
  const n=tree.name,a=tree.attributes??{},children=()=>render(tree.children,fold&&!['pre','code'].includes(n),a.specification?a.bodyNamespace:scope);
  for(const key of Object.keys(a))if(/^on/i.test(key)||key.toLowerCase()==='style')throw new Error('Markdoc Schema 不允许事件或自由样式属性：'+key);
  if(typeof n!=='string')throw new Error('Markdoc 扩展标签须输出语义 HTML 标签名');
  if(n.startsWith('ed-')){
   const type=n.slice(3),id=a.id;
   if(type==='directory-order')return '';
   if(type==='heading-group'){
    const [caption,...content]=tree.children;if(!Markdoc.Tag.isTag(caption))throw new Error('标题分组缺少标题节点');
    return `<details id="${esc(id)}" class="heading-section heading-anchor${a.class?' '+esc(a.class):''}" data-heading-section open><summary>${heading(id,a.outlineLevel,render(caption.children,true,scope))}</summary><div class="heading-content">${render(content,true,scope)}</div></details>`;
   }
   if(type==='code')return `<details id="${esc(a.id??codeId())}" class="code-block" data-code-block open><summary><span>代码${a.language?' · '+esc(a.language):''}</span><span class="code-lines">${a.lines} 行</span></summary>${children()}</details>`;
   if(type==='section'){const specSource=a.specification?graph.specifications!.definitions.get(a.specification)!.entity.source:undefined;if(a.specification)return specificationHTML({specification:a.specification,bodyNamespace:a.bodyNamespace,renderAnchor:a.renderAnchor,role:a.role,namespace:a.namespace,title:a.title,collapsed:a.collapsed},children(),{
    source:specSource!,evidenceHref:specSource?.attachment?routeHash({kind:'pdf',project:specSource.attachment.project??graph.manifest.projectId,id:specSource.attachment.id,...(specSource.attachment.target?{target:specSource.attachment.target}:{})}):undefined,
    canonicalHref:routeHash({kind:'entity',project:graph.manifest.projectId,id:a.specification}),
    fallback(fragment){if([...graph.index.keys()].some(id=>anchor(id)===fragment))return '#'+fragment;return esc(routeHash({kind:'page',project:graph.manifest.projectId,id:pageId(graph.specifications!.definitions.get(a.specification)!.document.file),anchor:fragment}));},
    alias(local,value){if(!aliases.has(local))aliases.set(local,value);else if(aliases.get(local)!==value)aliases.set(local,undefined);}
   });
    if(fold&&!a.local&&a.title&&(a.renderAnchor!==reading.titleId||a.collapsed))return `<details id="${esc(a.renderAnchor)}" class="heading-section${a.class?' '+esc(a.class):''}" data-heading-section${a.collapsed?'':' open'}><summary>${heading(a.renderAnchor,a.outlineLevel,esc(a.title),true)}</summary><div class="heading-content">${children()}</div></details>`;
    const body=`${a.title?(a.local?`<p class="specification-heading">${esc(a.title)}</p>`:heading(a.renderAnchor??anchor(id),a.outlineLevel,esc(a.title),true)):''}${children()}`;return a.collapsed?`<details id="${a.renderAnchor??anchor(id)}"><summary>${esc(a.title??id)}</summary>${body}</details>`:`<section id="${a.renderAnchor??anchor(id)}"${a.class?` class="${esc(a.class)}"`:""}>${body}</section>`;}
   if(type==='heading'&&a.local)return `<div id="${esc(id)}" class="specification-heading${a.class?' '+esc(a.class):''}">${children()}</div>`;
   if(type==='heading')return `<div id="${id}" class="heading-anchor${a.class?' '+esc(a.class):''}">${heading(id,a.outlineLevel,children())}</div>`;
   if(type==='columns')return `<div class="columns${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''} style="--columns:${(a.ratio??'1:1').split(':').map((v:string)=>v+'fr').join(' ')}">${children()}</div>`;
   if(type==='panel')return `<div class="panel${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}>${a.title?`<p class="panel-title">${esc(a.title)}</p>`:''}${children()}</div>`;
   if(type==='tabs')return `<div class="tabs${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}>${children()}</div>`;
   if(type==='tab')return `<div class="tab${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''} data-name="${esc(a.name)}">${children()}</div>`;
   if(type==='reference')return `<a href="${esc(a.project?routeHash({kind:'entity',project:a.project,id}):'#'+anchor(id))}">${esc(a.label??(!a.project||a.project===graph.manifest.projectId?graph.index.get(id)?.entity.label:undefined)??id)}</a>`;
   if(type==='page')return `<a href="${esc(routeHash({kind:'page',project:a.project??graph.manifest.projectId,id,...(a.anchor?{anchor:a.anchor}:{})}))}">${esc(a.label??id)}</a>`;
   if(type==='attachment')return `<a class="attachment-link" href="${esc(routeHash({kind:'pdf',project:a.project??graph.manifest.projectId,id,...(a.target?{target:a.target}:{})}))}">${esc(a.label??(!a.project||a.project===graph.manifest.projectId?graph.attachments?.[id]?.title:undefined)??id)}</a>`;
   if(type==='include'&&a.project){const link=options.projectLink?.(a.project);return link?`<a class="project-entry" href="${esc(routeHash({kind:'page',project:link.project,id:link.page}))}">进入 ${esc(link.title)}</a>`:'';}
   if(type==='data-table'){
    const table=graph.index.get(id)!.entity as Table,key=JSON.stringify([scope,id]),instance=tableInstances.get(key)??0;tableInstances.set(key,instance+1);let rowNamespace='';
    if(instance)do{rowNamespace='table-instance-'+(++tableCounter)+'-';}while(table.rows.some(row=>usedIds.has(scope+rowNamespace+anchor(row.id))));
    for(const row of table.rows)usedIds.add(scope+rowNamespace+anchor(row.id));
    return tableHTML(graph,table,{sortable:a.sortable,filterable:a.filterable,rowNamespace});
   }
   if(type==='waveform')return waveform(graph.index.get(id)!.entity as Waveform,wave++);
   if(type==='relation-diagram')return relationDiagramHTML(id,scenes[id],printScenes[id],++counter);
   if(type==='interface-table')return interfaceTableHTML(graph,id,a.mode??'detailed');
  }
  if(n==='img'){if(graph.documentPlan&&!graph.documentPlan.files.includes(a.src))throw new Error('Schema 图片须通过 Markdown 图片节点或 render:img 的声明式属性记录来源：'+a.src);const asset=graph.documentPlan?.media?.get(a.src)??loadImageAsset(graph.projectRoot,a.src);return `<img class="doc-image${a.class?' '+esc(a.class):''}"${a.id?` id="${esc(a.id)}"`:''}${a.title?` title="${esc(a.title)}"`:''} alt="${esc(a.alt??'')}" src="data:${asset.mime};base64,${asset.data}"/>`;}
  const common=()=>Object.entries(a).filter(([key,value])=>value!==undefined&&key!=='href'&&key!=='sourceFile'&&!key.startsWith('__edoc')).map(([key,value])=>{if(!/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(key))throw new Error('HTML 属性名非法：'+key);return ` ${key.toLowerCase()}="${esc(String(value))}"`;}).join('');
  const allowed=new Set(['div','span','aside','section','article','details','summary','figure','figcaption','caption','dl','dt','dd','abbr','kbd','mark','small','sub','sup','time','q','b','i','u','h1','h2','h3','h4','h5','h6','p','a','ul','ol','li','pre','code','blockquote','table','thead','tbody','tr','th','td','strong','em','s','hr','br','del']);
  if(!allowed.has(n))throw new Error('Markdoc 扩展输出不支持的 HTML 标签：'+n);
  let attrs=common();if(n==='a'&&a.href!==undefined){if(typeof a.href!=='string'||!/^(#|https?:|mailto:)/i.test(a.href)&&!localDocumentLink(graph.projectRoot,a.sourceFile??plan.documents[0].file,a.href))throw new Error('Markdoc 链接目标不符合工程链接规则：'+a.href);attrs+=` href="${esc(options.documentLink?.(a.href,a.sourceFile??'')??a.href)}"`;}
  return `<${n}${attrs}>${children()}</${n}>`;
 }
 const inherited=graph.documentPlan?.markdoc??{};
 const config={...inherited,
  tags:{...inherited.tags,'__spec-list':{transform(node:any,cfg:any){return new Markdoc.Tag('div',{'class':'spec-list','data-spec-for':node.attributes.for},node.transformChildren(cfg));}},...Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,k==='section'?{...v,transform(node:any,config:any){
   const entry=headings.get(node.attributes.__edocOutlineId)!;
   const attrs=node.attributes,scoped=config;
   return new Markdoc.Tag('ed-section',{...node.transformAttributes(scoped),outlineLevel:entry.level,renderAnchor:entry.id,specification:attrs.__edocSpecification,namespace:attrs.__edocNamespace,bodyNamespace:attrs.__edocBodyNamespace,role:attrs.__edocApplicationRole,local:entry.local,outlineParentId:entry.parentId},node.transformChildren(scoped));
  }}:{...v,render:'ed-'+k}]))},
  nodes:{...inherited.nodes,document:{...Markdoc.nodes.document,transform(node:any,config:any){return node.transformChildren(config);}},fence:{...Markdoc.nodes.fence,transform(node:any,config:any){const attrs=node.transformAttributes(config);const pre=new Markdoc.Tag('pre',{class:attrs.class},[new Markdoc.Tag('code',{'data-language':node.attributes.language},node.attributes.process===false||!node.children.length?[node.attributes.content]:node.transformChildren(config))]);return new Markdoc.Tag('ed-code',{id:attrs.id,language:node.attributes.language,lines:String(node.attributes.content??'').replace(/\n$/,'').split('\n').length},[pre]);}},link:{...Markdoc.nodes.link,attributes:{...Markdoc.nodes.link.attributes,__edocSourceFile:{type:String}},transform(node:any,config:any){const source=plan.documents.map(d=>d.locations.get(node)).find(Boolean);return new Markdoc.Tag('a',{...node.transformAttributes(config),sourceFile:node.attributes.__edocSourceFile??source?.file},node.transformChildren(config));}},heading:{...Markdoc.nodes.heading,transform(node:any,config:any){
   const entry=headings.get(node.attributes.__edocOutlineId)!;
   return new Markdoc.Tag('ed-heading',{...node.transformAttributes(config),id:entry.id,outlineLevel:entry.level,local:entry.local,outlineParentId:entry.parentId},node.transformChildren(config));
  }}}
 };
 // Markdoc.resolve 会克隆节点，用内部键恢复定义处的词法作用域。
 for(const collection of [config.nodes,config.tags])for(const [name,schema] of Object.entries(collection) as [string,any][])if(schema.transform){
  const transform=schema.transform;(collection as Record<string,any>)[name]={...schema,transform:(node:any,cfg:any)=>{const scopes=graph.documentPlan?.renderScopes,key=node.attributes.__edocScopeKey;return transform(node,scopes?.has(key)?{...cfg,variables:scopes.get(key)}:cfg);}};
 }
 // 自定义 Schema 可异步转换；Tag 内部的异步 children 也必须先完成，不能静默丢失。
 const settled=async(tree:any):Promise<any>=>{
  if(tree&&typeof tree.then==='function')return settled(await tree);
  if(Array.isArray(tree))return Promise.all(tree.map(settled));
  if(Markdoc.Tag.isTag(tree))return new Markdoc.Tag(tree.name,tree.attributes,await settled(tree.children));
  return tree;
 };
 // 先并行完成转换，再按源文顺序渲染，避免异步Schema改变重复表的首处锚点。
 const trees=await Promise.all(plan.documents.map(async({ast})=>settled(await Markdoc.transform(ast,config))));
 const chapters=plan.documents.map(({file},index)=>`<article data-source="${esc(file)}">${render(trees[index])}</article>`).join('');
 const allEntities=Object.fromEntries([...graph.index].map(([id,e])=>[id,e.entity]));
 const existing=new Set([...chapters.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const facts=[...graph.index.values()].filter(e=>!existing.has(anchor(e.id))).map(e=>options.compactIndex?`<span id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"></span>`:`<details class="fact" id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"><summary>${esc(e.entity.label??e.id)} · ${esc(e.type)}</summary><pre>${esc(JSON.stringify({...e.entity,...('ports' in e.entity?{ports:e.entity.ports?.map(p=>({id:p.id}))}:{})}))}</pre></details>`).join('');
 return {anchorAliases:Object.fromEntries([...aliases].filter((entry):entry is [string,string]=>entry[1]!==undefined)),chapters,facts:options.compactIndex?facts+'<p>全量对象可通过页面搜索查看，精确机器读取使用项目 query。详情按需显示。</p><pre id="entity-detail">选择搜索结果查看完整属性与来源。</pre>':facts,toc:plan.flat.map(e=>({...e,...(reading.numbers.has(e.id)?{number:reading.numbers.get(e.id)}:{})})),outline:reading.roots,scenes,entities:allEntities};
}
