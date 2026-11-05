// 每个显示实例隔离 DOM 身份，同时重写实例内部的锚点与 SVG 引用。
// 图表的稳定 IR ID、data-* 属性和语义跳转不改写。
import {anchorCandidates} from '../../core/identity.ts';
import {esc} from '../../render-graph/index.ts';
import type {Source} from '../../core/types.ts';
export function namespaceHTML(html:string,namespace:string,fallback?:(id:string)=>string):string{
 if(!namespace)return html;
 const ids=new Map<string,string>();
 for(const match of html.matchAll(/(?<![\w:-])id="([^"]+)"/g)){
  const id=match[1],local=id.startsWith(namespace)?id.slice(namespace.length):id;
  ids.set(local,namespace+local);ids.set(id,namespace+local);
 }
 return html.replace(/(?<![\w:-])id="([^"]+)"/g,(_all,id)=>`id="${ids.get(id)}"`)
  .replace(/(?<![\w:-])(href|xlink:href)="#([^"]+)"/g,(all,key,id)=>{
   if(id.startsWith('edoc='))return all;
   let decoded=id;try{decoded=decodeURIComponent(id);}catch{}
   const local=anchorCandidates(decoded).find(candidate=>ids.has(candidate));
   return local?`${key}="#${ids.get(local)}"`:fallback?`${key}="${fallback(decoded)}"`:all;
  })
  .replace(/url\(#([^)]*)\)/g,(all,id)=>ids.has(id)?`url(#${ids.get(id)})`:all)
  .replace(/(?<![\w:-])(aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g,(all,key,value)=>`${key}="${value.split(' ').map((id:string)=>ids.get(id)??id).join(' ')}"`);
}

type Presentation={specification:string;namespace?:string;bodyNamespace:string;renderAnchor:string;role?:string;title:string;collapsed?:boolean};
export function specificationHTML(a:Presentation,html:string,context:{canonicalHref:string;source:Source;evidenceHref?:string;fallback:(id:string)=>string;alias:(local:string,id:string)=>void}){
 const content=namespaceHTML(html,a.bodyNamespace,context.fallback);
 if(!a.namespace)for(const match of content.matchAll(/(?<![\w:-])id="([^"]+)"/g)){
  const id=match[1],local=id.startsWith(a.bodyNamespace)?id.slice(a.bodyNamespace.length):id;context.alias(local,id);
 }
 const role=a.role?' · '+esc(a.role==='common'?'公共约束':'专属约束'):'';
 const originalFile=esc(context.source.file)+(context.source.line?':'+context.source.line:'');
 const origin=a.namespace?`<a class="specification-origin" href="${esc(context.canonicalHref)}">规范原文</a>`:context.evidenceHref?`<a class="specification-origin" href="${esc(context.evidenceHref)}">原始 PDF</a>`:'';
 return `<details class="specification" id="${esc(a.renderAnchor)}" data-specification="${esc(a.specification)}"${a.collapsed?'':' open'}${a.role?` data-spec-role="${esc(a.role)}"`:''}><summary><span class="specification-caption"><span class="specification-kind">SPEC${role}</span><strong class="specification-title">${esc(a.title)}</strong><code class="specification-id">${esc(a.specification)}</code></span>${origin}</summary><div class="specification-body"><p class="specification-meta">来源：${originalFile}</p>${content}</div></details>`;
}
