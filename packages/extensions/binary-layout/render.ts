import type {Graph} from '../../core/types.ts';
import type {BinaryLayout,BinaryView} from './types.ts';
import {binaryProjection} from './model.ts';
import {escape as esc,line,rect,svg,text} from '../../figure/svg.ts';
import {wrapText} from '../../render-graph/text.ts';
export function binarySVG(graph:Graph,model:BinaryLayout,view:Partial<BinaryView>={}){
 const p=binaryProjection(graph,model.id,view),bits=view.bitsPerRow??32,width=1000,left=110,content=850,cell=content/bits;let y=90,body='';
 body+=text(24,30,model.label??model.id,'font-size="18" font-weight="600"')+text(24,55,p.scenario?'取值场景：'+JSON.stringify(p.scenario):'符号布局 · 未提供的长度和条件保持未知','class="muted"');
 const collapsed=new Set(view.collapsed),hiddenPaths=p.rows.filter(r=>r.modelId===model.id&&collapsed.has(r.id)).map(r=>r.path);
 const rows=p.rows.filter(r=>!hiddenPaths.some(path=>r.path.length>path.length&&path.every((part,i)=>r.path[i]===part)));
 let lastRow=-1,occupiedEnd=-1,lastCondition:string|undefined;
 for(const r of rows){if(view.focus&&!r.path.includes(view.focus))continue;const offset=r.offset.value,size=r.size.value,leaf=['field','padding','reserved','align'].includes(r.kind);
  if(r.active===false)continue;
  if(lastRow>=0&&(r.conditional!==lastCondition||offset!==undefined&&offset<occupiedEnd)){y+=80;lastRow=-1;}
  if(leaf&&offset!==undefined&&size!==undefined&&r.conditional&&r.conditional!==lastCondition){const guard=wrapText('条件：'+r.conditional,12,content-20);guard.forEach((label,i)=>body+=text(left+8,y+16+i*18,label,'class="muted"'));y+=guard.length*18+30;}lastCondition=r.conditional;
  if(leaf&&offset!==undefined&&size!==undefined&&size>0&&Math.ceil(size/bits)<=64){let consumed=0;while(consumed<size){const at=offset+consumed,row=Math.floor(at/bits),col=at%bits,take=Math.min(size-consumed,bits-col);if(row!==lastRow){if(lastRow>=0)y+=74;lastRow=row;body+=text(left-12,y+29,row*bits,'text-anchor="end" class="muted"');for(let bit=0;bit<bits;bit++)body+=text(left+cell*(bit+.5),y-10,bit,'text-anchor="middle" class="muted"');}const x=left+col*cell,w=take*cell;body+=`<g data-local="${esc(JSON.stringify(r.path))}" data-local-id="${esc(r.id)}"><title>${esc(r.path.join('/')+' · '+r.label+' · '+r.size.expression+' bit')}</title>${rect(x,y,w,48,`class="${r.kind==='field'?'field':'reserved'}"`)}${text(x+w/2,y+28,w>80?r.label:w>30?r.id:'…','text-anchor="middle" font-size="12"')}</g>`;consumed+=take;}occupiedEnd=offset+size;}
  else{if(lastRow>=0){y+=80;lastRow=-1;}const caption=`${r.label} · ${r.kind} · offset ${r.offset.expression} bit · size ${r.size.expression} bit${r.conditional?' · ['+r.conditional+']':''}`;const lines=wrapText(caption,14,content-28);body+=`<g data-local="${esc(JSON.stringify(r.path))}" data-local-id="${esc(r.id)}">${rect(left,y,content,lines.length*20+22,'class="frame" rx="4"')}${lines.map((l,i)=>text(left+14,y+24+i*20,l)).join('')}</g>`;y+=lines.length*20+40;}
 }
 if(lastRow>=0)y+=80;if(p.truncated)body+=text(left,y,'展示已达 '+p.limit+' 项；完整定义通过 read 获取。','class="muted"');body+=text(24,y+30,'偏移从流起点递增；位序与字节序独立于显示方向。总长度 '+p.size.expression+' bit','class="muted"');
 return svg(width,y+65,body,{id:model.id,label:model.label,view:view.id,projection:p,source:model.source});
}
export function binaryFieldTable(graph:Graph,id:string,view:Partial<BinaryView>={}){const p=binaryProjection(graph,id,view);return `<div class="binary-field-table"><table><thead><tr>${['字段路径','类型','偏移 (bit)','大小 (bit)','条件 / 说明'].map(t=>'<th>'+t+'</th>').join('')}</tr></thead><tbody>${p.rows.map(r=>'<tr>'+[r.path.join('/'),r.kind,r.offset.expression,r.size.expression,[r.active===false?'此场景未选中':undefined,r.conditional,r.description].filter(Boolean).join('；')].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')}</tbody></table>${p.truncated?'<p>表格展示已达上限；完整定义通过 read 获取。</p>':''}</div>`;}
