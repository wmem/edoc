import Markdoc from '@markdoc/markdoc';
import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {tags,documentAST} from '../core/documents.ts';
import type {Graph,Table,Waveform,View,Port,Node,Group} from '../core/types.ts';
import {scene,svg,esc,anchor} from '../render-graph/index.ts';
import type {Scene} from '../render-graph/index.ts';
import {waveform} from '../render-wave/index.ts';
import {projectPath} from '../core/paths.ts';
export function field(data:any,path:string):unknown {return path.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);}
export function tableHTML(graph:Graph,table:Table):string{
 return `<table><caption>${esc(table.label)}</caption><thead><tr>${table.columns.map(c=>`<th>${esc(c.label)}${c.unit?' ('+esc(c.unit)+')':''}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr id="${anchor(row.id)}">${table.columns.map(c=>{const value=field(row.objectId?graph.index.get(row.objectId)!.entity:row.values,c.field);return `<td>${esc(typeof value==='object'?JSON.stringify(value):value??'unknown')}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
}
function interfaceHTML(graph:Graph,id:string,mode:string):string{
 const entry=graph.index.get(id)!;let ids:string[]=[];
 if(entry.type==='node')ids=(entry.entity as Node).ports?.map(p=>p.id)??[];
 if(entry.type==='group')ids=(entry.entity as Group).members;
 const ports=ids.map(id=>graph.index.get(id)!).filter(e=>e.type==='port');
 if(mode==='overview'){
  const sets:{id:string;label:string;ports:Port[]}[]=[];
  if(entry.type==='group')sets.push({id,label:entry.entity.label??id,ports:ports.map(e=>e.entity as Port)});
  else{const covered=new Set<string>();for(const e of graph.index.values())if(e.type==='group'){const members=(e.entity as Group).members.filter(id=>ports.some(p=>p.id===id));if(members.length){sets.push({id:e.id,label:e.entity.label??e.id,ports:members.map(id=>graph.index.get(id)!.entity as Port)});members.forEach(id=>covered.add(id));}}const remaining=ports.filter(e=>!covered.has(e.id));if(remaining.length)sets.push({id,label:'未分组信号',ports:remaining.map(e=>e.entity as Port)});}
  return `<table class="interface-overview"><caption>${esc(entry.entity.label??id)} · overview</caption><thead><tr><th>接口组</th><th>信号数</th><th>方向</th><th>位宽集合</th></tr></thead><tbody>${sets.map(set=>`<tr><td><a href="#${anchor(set.id)}">${esc(set.label)}</a></td><td>${set.ports.length}</td><td>${esc([...new Set(set.ports.map(p=>p.direction))].join('/'))}</td><td>${esc([...new Set(set.ports.map(p=>p.width??p.widthExpr??'unknown'))].join('/'))}</td></tr>`).join('')}</tbody></table>`;
 }

 return `<table><caption>${esc(entry.entity.label??id)} · ${esc(mode)}</caption><thead><tr><th>信号</th><th>方向</th><th>位宽</th><th>时钟域</th><th>属性 / 来源</th></tr></thead><tbody>${ports.map(e=>{const p=e.entity as Port;return `<tr><td><a href="#${anchor(e.id)}">${esc(p.label)}</a></td><td>${esc(p.direction)}</td><td>${esc(p.width??p.widthExpr??'unknown')}</td><td>${esc(p.clockDomainId??'unknown')}</td><td>${esc(JSON.stringify(p.attributes??{}))}<br>${esc(p.source?.file??'')}</td></tr>`}).join('')}</tbody></table>`;
}
export async function renderDocument(graph:Graph,title:string){
 const scenes:Record<string,Scene>={};
 for(const e of graph.index.values())if(e.type==='view')scenes[e.id]=await scene(graph,e.id);
 const toc:{id:string;label:string}[]=[];let counter=0,wave=0;
 function render(tree:any):string{
  if(tree===null||tree===undefined||tree===false)return '';
  if(Array.isArray(tree))return tree.map(render).join('');
  if(typeof tree!=='object')return esc(tree);
  const n=tree.name,a=tree.attributes??{},children=()=>render(tree.children);
  if(n.startsWith('ed-')){
   const type=n.slice(3),id=a.id;
   if(type==='section'){toc.push({id:anchor(id),label:a.title??id});const body=`${a.title?`<h2>${esc(a.title)}</h2>`:''}${children()}`;return a.collapsed?`<details id="${anchor(id)}"><summary>${esc(a.title??id)}</summary>${body}</details>`:`<section id="${anchor(id)}">${body}</section>`;}
   if(type==='columns')return `<div class="columns" style="--columns:${(a.ratio??'1:1').split(':').map((v:string)=>v+'fr').join(' ')}">${children()}</div>`;
   if(type==='panel')return `<div class="panel">${a.title?`<h3>${esc(a.title)}</h3>`:''}${children()}</div>`;
   if(type==='tabs')return `<div class="tabs">${children()}</div>`;
   if(type==='tab')return `<div class="tab" data-name="${esc(a.name)}">${children()}</div>`;
   if(type==='reference')return `<a href="#${anchor(id)}">${esc(graph.index.get(id)!.entity.label??id)}</a>`;
   if(type==='table')return tableHTML(graph,graph.index.get(id)!.entity as Table);
   if(type==='waveform')return waveform(graph.index.get(id)!.entity as Waveform,wave++);
   if(type==='diagram'||(type==='interface'&&graph.index.get(id)!.type==='view'))return `<figure class="graph-box" data-diagram="${esc(id)}" data-kind="${esc(scenes[id].kind)}"><figcaption>${esc(scenes[id].label)}</figcaption><div class="toolbar"><button data-action="fit">适配画布</button><button data-action="plus">＋</button><button data-action="minus">－</button><button data-action="reset">清除高亮</button><button data-action="svg">SVG</button></div><div class="filters"></div><div class="groups"></div><div class="canvas"></div><div class="static-svg">${svg(scenes[id],false,id+'-instance-'+(++counter))}</div></figure>`;
   if(type==='interface')return interfaceHTML(graph,id,a.mode??'detailed');
  }
  if(/^h[1-6]$/.test(n)){const id='heading-'+(++counter);const label=String(tree.children?.flat(Infinity).filter((v:any)=>typeof v==='string').join('')??title);toc.push({id,label});return `<${n} id="${id}">${children()}</${n}>`;}
  if(n==='img'){const file=projectPath(graph.projectRoot,graph.projectRoot,a.src);const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};if(!mime[extname(file)])throw new Error('文档图片只支持 PNG/JPEG/WebP');return `<img class="doc-image" alt="${esc(a.alt??'')}" src="data:${mime[extname(file)]};base64,${readFileSync(file).toString('base64')}"/>`;}
  const allowed=new Set(['p','a','ul','ol','li','pre','code','blockquote','table','thead','tbody','tr','th','td','strong','em','s','hr','br','del']);
  if(!allowed.has(n))return children();
  let attrs='';if(n==='a')attrs=` href="${esc(a.href)}"`;if(n==='code'&&a['data-language'])attrs=` data-language="${esc(a['data-language'])}"`;
  return `<${n}${attrs}>${children()}</${n}>`;
 }
 const config={tags:Object.fromEntries(Object.entries(tags).map(([k,v])=>[k,{...v,render:'ed-'+k}]))};
 const chapters=documentAST(graph).map(({file,ast})=>`<article data-source="${esc(file)}">${render(Markdoc.transform(ast,config))}</article>`).join('');
 const allEntities=Object.fromEntries([...graph.index].map(([id,e])=>[id,e.entity]));
 const existing=new Set([...chapters.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 const facts=[...graph.index.values()].filter(e=>!existing.has(anchor(e.id))).map(e=>`<details class="fact" id="${anchor(e.id)}"><summary>${esc(e.entity.label??e.id)} · ${esc(e.type)}</summary><pre>${esc(JSON.stringify({...e.entity,...('ports' in e.entity?{ports:e.entity.ports?.map(p=>({id:p.id}))}:{})}))}</pre></details>`).join('');
 return {chapters,facts,toc,scenes,entities:allEntities};
}
