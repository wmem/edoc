import type {Graph} from '../../core/types.ts';
import type {BinaryLayout,BinaryView} from './types.ts';
import {binaryProjection} from './model.ts';
import type {BinaryRow} from './model.ts';
import {escape as esc,line,rect,svg,text} from '../../figure/svg.ts';
import {wrapText} from '../../render-graph/text.ts';
const byteOrderName:Record<string,string>={big:'大端',little:'小端'};
const bitOrderName:Record<string,string>={'msb-first':'高位先','lsb-first':'低位先'};
const orderSource=(source:BinaryRow['byteOrderSource'],modelId:string)=>source==='field'?'字段声明':source==='model'?'继承 '+modelId:'';
function ordering(row:BinaryRow){
 const byte=row.byteOrder?`${byteOrderName[row.byteOrder]??row.byteOrder}（${orderSource(row.byteOrderSource,row.modelId)}）`:'未声明';
 const bit=row.bitOrder?`${bitOrderName[row.bitOrder]??row.bitOrder}（${orderSource(row.bitOrderSource,row.modelId)}）`:'未声明';
 return `字节序：${byte}；位序：${bit}`;
}
function declarations(row:BinaryRow){
 const values:string[]=[];
 if(row.value!==undefined)values.push('声明值：'+(row.value===''?'空字符串':row.value));
 if(row.enums)values.push('枚举：'+(Object.entries(row.enums).map(([value,label])=>value+' = '+label).join('；')||'未列出条目'));
 return values.length?values.join('；'):'未声明';
}
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
  if(leaf&&offset!==undefined&&size!==undefined&&size>0&&Math.ceil(size/bits)<=64){let consumed=0;while(consumed<size){const at=offset+consumed,row=Math.floor(at/bits),col=at%bits,take=Math.min(size-consumed,bits-col);if(row!==lastRow){if(lastRow>=0)y+=74;lastRow=row;body+=text(left-12,y+29,row*bits,'text-anchor="end" class="muted"');for(let bit=0;bit<bits;bit++)body+=text(left+cell*(bit+.5),y-10,bit,'text-anchor="middle" class="muted"');}const x=left+col*cell,w=take*cell;body+=`<g data-local="${esc(JSON.stringify(r.path))}" data-local-id="${esc(r.id)}"><title>${esc(r.path.join('/')+' · '+r.label+' · '+r.size.expression+' bit · '+declarations(r)+' · '+ordering(r)+(r.description?' · '+r.description:''))}</title>${rect(x,y,w,48,`class="${r.kind==='field'?'field':'reserved'}"`)}${text(x+w/2,y+28,w>80?r.label:w>30?r.id:'…','text-anchor="middle" font-size="12"')}</g>`;consumed+=take;}occupiedEnd=offset+size;}
  else{if(lastRow>=0){y+=80;lastRow=-1;}const caption=`${r.label} · ${r.kind} · offset ${r.offset.expression} bit · size ${r.size.expression} bit${r.conditional?' · ['+r.conditional+']':''}`;const lines=wrapText(caption,14,content-28);body+=`<g data-local="${esc(JSON.stringify(r.path))}" data-local-id="${esc(r.id)}">${rect(left,y,content,lines.length*20+22,'class="frame" rx="4"')}${lines.map((l,i)=>text(left+14,y+24+i*20,l)).join('')}</g>`;y+=lines.length*20+40;}
 }
 if(lastRow>=0)y+=80;if(p.truncated)body+=text(left,y,'展示已达 '+p.limit+' 项；完整定义通过 read 获取。','class="muted"');body+=text(24,y+30,'偏移从流起点递增；位序与字节序独立于显示方向。总长度 '+p.size.expression+' bit','class="muted"');
 return svg(width,y+65,body,{id:model.id,label:model.label,view:view.id,projection:p,source:model.source});
}
export function binaryFieldTable(graph:Graph,id:string,view:Partial<BinaryView>={}){
 const p=binaryProjection(graph,id,view);
 const header=['字段与路径','类型','偏移 (bit)','大小 (bit)','声明值 / 枚举','字节序 / 位序','条件 / 说明'];
 const rows=p.rows.map(row=>{
  const name=`<strong>${esc(row.label)}</strong><br/><code>${esc(row.path.join('/'))}</code>`;
  const explanation=[row.active===false?'此场景未选中':undefined,row.conditional,row.description].filter(Boolean).join('；');
  return '<tr><td>'+name+'</td>'+[row.kind,row.offset.expression,row.size.expression,declarations(row),ordering(row),explanation].map(value=>'<td>'+esc(value)+'</td>').join('')+'</tr>';
 }).join('');
 return `<div class="binary-field-table"><div class="data-table-scroll"><table><thead><tr>${header.map(label=>'<th>'+label+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div>${p.truncated?'<p>表格展示已达上限；完整定义通过 read 获取。</p>':''}</div>`;
}
