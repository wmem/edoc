import type {OutlineEntry} from '../core/outline.ts';
import {esc} from '../render-graph/index.ts';

export function renderTOC(entries:OutlineEntry[],interactive=true):string{
 if(!interactive){
  // 打印采用可逐项分页的流式目录，父级与缩进仍由同一章节树计算。
  const flow=(nodes:OutlineEntry[]):string=>nodes.map(entry=>
   `<div class="print-toc-entry" data-outline-id="${esc(entry.id)}" data-outline-level="${entry.level}"${entry.parentId?` data-outline-parent="${esc(entry.parentId)}"`:''} style="padding-left:${entry.depth*18}px"><a href="#${esc(entry.id)}" data-outline-link>${esc(entry.label)}</a></div>`+flow(entry.children)).join('');
  return flow(entries);
 }
 const list=(nodes:OutlineEntry[]):string=>`<ul>${nodes.map(entry=>{
  const link=`<a href="#${esc(entry.id)}" data-outline-link>${esc(entry.label)}</a>`;
  const body=entry.children.length?
   `<details${entry.depth===0&&!entry.collapsed?' open':''}><summary>${link}</summary>${list(entry.children)}</details>`:
   link;
  return `<li data-outline-id="${esc(entry.id)}" data-outline-level="${entry.level}">${body}</li>`;
 }).join('')}</ul>`;
 return list(entries);
}
