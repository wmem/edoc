import type {Graph} from '../../core/types.ts';
import {registerMapProjection} from './model.ts';
import {escape as esc,rect,text,svg} from '../../figure/svg.ts';
import {routeHash} from '../../core/routes.ts';
export function registerMapSVG(graph:Graph,id:string){const p=registerMapProjection(graph,id),model=graph.index.get(id)!.entity,width=1040;let body=text(24,34,model.label??id,'font-size="18" font-weight="600"')+text(24,60,`${p.relative?'相对地址':'绝对地址'} · 地址单位 ${p.addressUnitBits} bit · ${p.total} 个寄存器实例`,'class="muted"');let y=90;
 for(const range of p.intervals){body+=`<g data-local="${esc(range.id)}">${rect(24,y,992,56,'class="frame" rx="5"')}${text(38,y+23,range.id+' · '+range.start+' · span '+range.span)}${text(38,y+44,'count '+range.count+' · stride '+range.stride+' · 覆盖 '+range.total,'class="muted"')}</g>`;y+=68;}
 body+=text(24,y+16,'实例路径 → 地址 → 原寄存器定义','font-weight="600"');y+=34;
 for(const r of p.rows){body+=`<g data-local="${esc(JSON.stringify(r.path))}">${rect(24,y,992,34,'style="fill:white;stroke:#dce4ed"')}${text(38,y+23,JSON.stringify(r.path))}${text(535,y+23,r.address??r.offset)}${text(740,y+23,r.definition)}</g>`;y+=34;}
 if(p.truncated){body+=text(24,y+25,`仅展示前 ${p.limit} 个实例；query --element 可精确定位任意实例。`,'class="muted"');y+=40;}
 return svg(width,y+25,body,{id,label:model.label,projection:p,source:model.source});}
export function registerMapTable(graph:Graph,id:string){const p=registerMapProjection(graph,id);return `<p>${p.relative?'相对':'绝对'}地址，单位 ${p.addressUnitBits} bit，共 ${p.total} 个实例${p.truncated?'，以下展示前 '+p.limit+' 项':''}。</p><table><thead><tr><th>实例路径</th><th>地址</th><th>跨度</th><th>寄存器定义</th></tr></thead><tbody>${p.rows.map(r=>`<tr><td>${esc(JSON.stringify(r.path))}</td><td>${esc(r.address??r.offset)}</td><td>${esc(r.span)}</td><td><a href="${esc(routeHash({kind:'entity',project:graph.manifest.projectId,id:r.definition}))}">${esc(r.definition)}</a></td></tr>`).join('')}</tbody></table>`;}
