import {resolveLinkTarget} from '../../core/link-target.ts';
import {routeHash} from '../../core/routes.ts';
import type {Graph,Table} from '../../core/types.ts';
import {esc} from '../../core/html.ts';
import {anchor} from '../../core/identity.ts';
export function field(data:any,path:string):unknown {return path.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);}
export function tableHTML(graph:Graph,table:Table,options:{sortable?:boolean;filterable?:boolean;rowNamespace?:string}={}):string{
 const rows=table.rows.map(row=>{
  const data=row.objectId?graph.index.get(row.objectId)!.entity:row.values,values=table.columns.map(c=>field(data,c.field)),missing=values.flatMap((value,i)=>value===undefined?[i]:[]);
  return `<tr id="${esc((options.rowNamespace??'')+anchor(row.id))}"${missing.length?` data-missing="${missing.join(',')}"`:''}>${values.map((value,index)=>{const text=esc(typeof value==='object'?JSON.stringify(value):value??'unknown'),link=row.links&&Object.hasOwn(row.links,table.columns[index].field)?row.links[table.columns[index].field]:undefined;return `<td>${link?`<a href="${esc(routeHash(resolveLinkTarget(graph,link).route))}">${text}</a>`:text}</td>`;}).join('')}</tr>`;
 }).join('');
 return `<div class="data-table" data-table="${esc(table.id)}" data-sortable="${options.sortable!==false}" data-filterable="${options.filterable!==false}"><div class="data-table-scroll"><table><caption>${esc(table.label)}</caption><colgroup>${table.columns.map(c=>`<col data-field="${esc(c.field)}" data-type="${c.type}">`).join('')}</colgroup><thead><tr>${table.columns.map(c=>`<th>${esc(c.label)}${c.unit?' ('+esc(c.unit)+')':''}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
