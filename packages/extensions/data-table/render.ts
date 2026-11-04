import type {Graph,Table} from '../../core/types.ts';
import {esc,anchor} from '../../render-graph/index.ts';
export function field(data:any,path:string):unknown {return path.split('.').reduce((v,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);}
export function tableHTML(graph:Graph,table:Table):string{
 return `<table><caption>${esc(table.label)}</caption><thead><tr>${table.columns.map(c=>`<th>${esc(c.label)}${c.unit?' ('+esc(c.unit)+')':''}</th>`).join('')}</tr></thead><tbody>${table.rows.map(row=>`<tr id="${anchor(row.id)}">${table.columns.map(c=>{const value=field(row.objectId?graph.index.get(row.objectId)!.entity:row.values,c.field);return `<td>${esc(typeof value==='object'?JSON.stringify(value):value??'unknown')}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;
}
