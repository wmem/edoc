import Markdoc from '@markdoc/markdoc';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {tags,documentAST} from '../core/documents.ts';
import type {Graph,Table,Waveform,View,Port,Node,Group,Interface} from '../core/types.ts';
import {scene,svg,esc,anchor} from '../render-graph/index.ts';
import type {Scene} from '../render-graph/index.ts';
import {waveform} from '../render-wave/index.ts';
import {projectPath} from '../core/paths.ts';
import {prepareOutline} from '../core/outline.ts';
export function field(data:any,path:string):unknown {return path.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);}
export function tableHTML(graph:Graph,table:Table):string{
 return `<table><caption>${esc(table.label)}</caption><thead><tr>${table.columns.map(c=>`<th>${esc(c.label)}${c.unit?' ('+esc(c.unit)+')':''}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr id="${anchor(row.id)}">${table.columns.map(c=>{const value=field(row.objectId?graph.index.get(row.objectId)!.entity:row.values,c.field);return `<td>${esc(typeof value==='object'?JSON.stringify(value):value??'unknown')}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
}
function interfaceHTML(graph:Graph,id:string,mode:string):string{
 const entry=graph.index.get(id)!;let ids:string[]=[];
 if(entry.type==='node')ids=(entry.entity as Node).ports?.map(p=>p.id)??[];
 if(entry.type==='group')ids=(entry.entity as Group).members;
 if(entry.type==='interface')ids=(entry.entity as Interface).members;
 const ports=ids.map(id=>graph.index.get(id)!).filter(e=>e.type==='port');
 if(mode==='overview'){
  const sets:{id:string;label:string;ports:Port[]}[]=[];
  if(entry.type==='group'||entry.type==='interface')sets.push({id,label:entry.entity.label??id,ports:ports.map(e=>e.entity as Port)});
  else if(entry.type==='node'&&(entry.entity as Node).interfaces?.length){const covered=new Set<string>();for(const i of (entry.entity as Node).interfaces!){sets.push({id:i.id,label:i.label,ports:i.members.map(id=>graph.index.get(id)!.entity as Port)});i.members.forEach(id=>covered.add(id));}const remaining=ports.filter(p=>!covered.has(p.id));if(remaining.length)sets.push({id,label:'独立信号',ports:remaining.map(p=>p.entity as Port)});}
  else{const covered=new Set<string>();for(const e of graph.index.values())if(e.type==='group'){const members=(e.entity as Group).members.filter(id=>ports.some(p=>p.id===id));if(members.length){sets.push({id:e.id,label:e.entity.label??e.id,ports:members.map(id=>graph.index.get(id)!.entity as Port)});members.forEach(id=>covered.add(id));}}const remaining=ports.filter(e=>!covered.has(e.id));if(remaining.length)sets.push({id,label:'未分组信号',ports:remaining.map(e=>e.entity as Port)});}
  return `<table class="interface-overview"><caption>${esc(entry.entity.label??id)} · overview</caption><thead><tr><th>接口组</th><th>信号数</th><th>方向</th><th>位宽集合</th></tr></thead><tbody>${sets.map(set=>`<tr><td><a href="#${anchor(set.id)}">${esc(set.label)}</a></td><td>${set.ports.length}</td><td>${esc([...new Set(set.ports.map(p=>p.direction))].join('/'))}</td><td>${esc([...new Set(set.ports.map(p=>p.width??p.widthExpr??'unknown'))].join('/'))}</td></tr>`).join('')}</tbody></table>`;
 }

 return `<table><caption>${esc(entry.entity.label??id)} · ${esc(mode)}</caption><thead><tr><th>信号</th><th>方向</th><th>位宽</th><th>时钟域</th><th>属性 / 来源</th></tr></thead><tbody>${ports.map(e=>{const p=e.entity as Port;return `<tr><td><a href="#${anchor(e.id)}">${esc(p.label)}</a></td><td>${esc(p.direction)}</td><td>${esc(p.width??p.widthExpr??'unknown')}</td><td>${esc(p.clockDomainId??'unknown')}</td><td>${esc(JSON.stringify(p.attributes??{}))}<br>${esc(p.source?.file??'')}</td></tr>`}).join('')}</tbody></table>`;
}
export async function renderDocument(graph:Graph,title:string,options:{compactIndex?:boolean}={}){
 const scenes:Record<string,Scene>={},printScenes:Record<string,Scene>={};
 for(const e of graph.index.values())if(e.type==='view'){scenes[e.id]=await scene(graph,e.id);printScenes[e.id]=scenes[e.id].interfaceModel?await scene(graph,e.id,{interfaces:'expanded'}):scenes[e.id];}
 const plan=prepareOutline(graph),headings=new Map(plan.flat.map(e=>[e.id,e]));let counter=0,wave=0;
 const heading=(level:number,body:string,section=false)=>{const tag='h'+Math.min(level+1,6);return `<${tag} data-heading-level="${level}"${section?' data-section-title':''}${level+1>6?` aria-level="${level+1}"`:''}>${body}</${tag}>`;};
 function render(tree:any):string{
  if(tree===null||tree===undefined||tree===false)return '';
  if(Array.isArray(tree))return tree.map(render).join('');
  if(typeof tree!=='object')return esc(tree);
  const n=tree.name,a=tree.attributes??{},children=()=>render(tree.children);
  if(n.startsWith('ed-')){
   const type=n.slice(3),id=a.id;
   if(type==='section'){const body=`${a.title?heading(a.outlineLevel,esc(a.title),true):''}${children()}`;return a.collapsed?`<details id="${anchor(id)}"><summary>${esc(a.title??id)}</summary>${body}</details>`:`<section id="${anchor(id)}">${body}</section>`;}
   if(type==='heading')return `<div id="${id}" class="heading-anchor">${heading(a.outlineLevel,children())}</div>`;
   if(type==='columns')return `<div class="columns" style="--columns:${(a.ratio??'1:1').split(':').map((v:string)=>v+'fr').join(' ')}">${children()}</div>`;
   if(type==='panel')return `<div class="panel">${a.title?`<p class="panel-title">${esc(a.title)}</p>`:''}${children()}</div>`;
   if(type==='tabs')return `<div class="tabs">${children()}</div>`;
   if(type==='tab')return `<div class="tab" data-name="${esc(a.name)}">${children()}</div>`;
   if(type==='reference')return `<a href="#${anchor(id)}">${esc(graph.index.get(id)!.entity.label??id)}</a>`;
   if(type==='table')return tableHTML(graph,graph.index.get(id)!.entity as Table);
   if(type==='waveform')return waveform(graph.index.get(id)!.entity as Waveform,wave++);
   if(type==='diagram'||(type==='interface'&&graph.index.get(id)!.type==='view'))return `<figure class="graph-box" data-diagram="${esc(id)}" data-kind="${esc(scenes[id].kind)}"><figcaption>${esc(scenes[id].label)}</figcaption>${scenes[id].nets.flatMap(n=>n.layoutWarnings??[]).map(w=>`<p class="layout-note">${esc(w.message)}</p>`).join('')}<div class="toolbar"><button data-action="fit">适配画布</button><button data-action="read" title="按原始比例显示，拖动画布查看">清晰阅读</button><button data-action="expand" aria-pressed="false">大图查看</button><button data-action="plus">＋</button><button data-action="minus">－</button><button data-action="reset">清除高亮</button><button data-action="svg">${scenes[id].interfaceModel?'SVG（逐信号）':'SVG'}</button>${scenes[id].interfaceModel?'<button data-action="svg-current">当前视图 SVG</button><button data-action="interfaces-collapse">接口总览</button><button data-action="interfaces-expand">全部展开</button>':''}${scenes[id].nodes.some(n=>n.ports.length)?`<label class="display-control"><input type="checkbox" data-display="port-attributes"${scenes[id].display.showPortAttributes?' checked':''}>端口属性</label>`:''}${scenes[id].nets.length?`<label class="display-control"><input type="checkbox" data-display="relation-labels"${scenes[id].display.showRelationLabels?' checked':''}>连线标题</label>`:''}</div><div class="filters"></div><div class="groups"></div>${scenes[id].interfaceModel?'<div class="interface-status" role="status" aria-live="polite"></div>':''}<div class="canvas"></div><div class="static-svg">${svg(printScenes[id],false,id+'-instance-'+(++counter))}</div></figure>`;
   if(type==='interface')return interfaceHTML(graph,id,a.mode??'detailed');
  }
  if(n==='img'){const file=projectPath(graph.projectRoot,graph.projectRoot,a.src);const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};if(!mime[extname(file)])throw new Error('文档图片只支持 PNG/JPEG/WebP');return `<img class="doc-image" alt="${esc(a.alt??'')}" src="data:${mime[extname(file)]};base64,${readFileSync(file).toString('base64')}"/>`;}
  const allowed=new Set(['p','a','ul','ol','li','pre','code','blockquote','table','thead','tbody','tr','th','td','strong','em','s','hr','br','del']);
  if(!allowed.has(n))return children();
  let attrs='';if(n==='a')attrs=` href="${esc(a.href)}"`;if(n==='code'&&a['data-language'])attrs=` data-language="${esc(a['data-language'])}"`;
  return `<${n}${attrs}>${children()}</${n}>`;
 }
 const config={
  tags:Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,k==='section'?{...v,transform(node:any,config:any){
   return new Markdoc.Tag('ed-section',{...node.transformAttributes(config),outlineLevel:headings.get(node.attributes.__engdocOutlineId)!.level},node.transformChildren(config));
  }}:{...v,render:'ed-'+k}])),
  nodes:{heading:{...Markdoc.nodes.heading,transform(node:any,config:any){
   const entry=headings.get(node.attributes.__engdocOutlineId)!;
   return new Markdoc.Tag('ed-heading',{id:entry.id,outlineLevel:entry.level},node.transformChildren(config));
  }}}
 };
 const chapters=plan.documents.map(({file,ast})=>`<article data-source="${esc(file)}">${render(Markdoc.transform(ast,config))}</article>`).join('');
 const allEntities=Object.fromEntries([...graph.index].map(([id,e])=>[id,e.entity]));
 const existing=new Set([...chapters.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const facts=[...graph.index.values()].filter(e=>!existing.has(anchor(e.id))).map(e=>options.compactIndex?`<span id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"></span>`:`<details class="fact" id="${anchor(e.id)}" data-entity-id="${esc(e.id)}"><summary>${esc(e.entity.label??e.id)} · ${esc(e.type)}</summary><pre>${esc(JSON.stringify({...e.entity,...('ports' in e.entity?{ports:e.entity.ports?.map(p=>({id:p.id}))}:{})}))}</pre></details>`).join('');
 return {chapters,facts:options.compactIndex?facts+'<p>全量对象可通过页面搜索查看，精确机器读取使用项目 query。此索引不展开进打印文档。</p><pre id="entity-detail">选择搜索结果查看完整属性与来源。</pre>':facts,toc:plan.flat,outline:plan.roots,scenes,entities:allEntities};
}
