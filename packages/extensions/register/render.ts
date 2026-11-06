import type {Graph,Table} from '../../core/types.ts';
import type {Register,RegisterField} from './types.ts';
import {registerProjection,fieldRange,resetText,resetState} from './model.ts';
import {measureText} from '../../render-graph/text.ts';
import {routeHash} from '../../core/routes.ts';
import {entitySource,resolveLinkTarget} from '../../core/link-target.ts';
import {esc} from '../../core/html.ts';
const colors=['#e0eef7','#e6f2e8','#f8efd9','#eee8f6'];
const fieldHref=(project:string,id:string)=>esc(routeHash({kind:'entity',project,id}));
export function registerSVG(register:Register,options:{project?:string;bitsPerRow?:number;fontCSS?:string;licenses?:unknown}={}){
 const bits=options.bitsPerRow??16,cell=32,padding=8,laneHeight=94,projection=registerProjection(register),width=bits*cell+padding*2,height=Math.ceil(register.width/bits)*laneHeight+12,parts:string[]=[];
 let lane=0;
 for(let high=register.width-1;high>=0;high-=bits,lane++){
  const low=Math.max(0,high-bits+1),top=lane*laneHeight;
  parts.push(`<text x="8" y="${top+13}" font-size="11" fill="#60778c">位 ${high}:${low}</text>`);
  for(let bit=high;bit>=low;bit--)parts.push(`<text x="${padding+(high-bit+.5)*cell}" y="${top+31}" text-anchor="middle" font-size="11" fill="#526b80">${bit}</text>`);
  for(const segment of projection.segments){const msb=Math.min(high,segment.msb),lsb=Math.max(low,segment.lsb);if(msb<lsb)continue;
   const x=padding+(high-msb)*cell,w=(msb-lsb+1)*cell,y=top+39,field=segment.fieldId?register.fields.find(f=>f.id===segment.fieldId):undefined,index=projection.fields.findIndex(f=>f.id===segment.fieldId),continued=!!field&&(msb!==segment.msb||lsb!==segment.lsb),label=continued&&measureText(segment.marker+'↔',13)+8<=w?segment.marker+'↔':measureText(segment.label,13)+10<=w?segment.label:segment.marker??(segment.kind==='reserved'?'保留':'?');
   const body=`<title>${esc(segment.label)} [${fieldRange(segment)}]${field?' · '+(field.access??'访问未声明')+' · 复位 '+resetText(field.reset):' · 不赋予访问或复位属性'}</title><rect x="${x}" y="${y}" width="${w}" height="40" rx="2" fill="${field?colors[index%colors.length]:segment.kind==='reserved'?'#eef1f3':'#fff5df'}" stroke="${field?'#7796ac':'#9ca8af'}"${segment.kind==='unspecified'?' stroke-dasharray="4 3"':''}/><text x="${x+w/2}" y="${y+25}" text-anchor="middle" font-size="13" fill="#193b53">${esc(label)}</text>`;
   parts.push(field?`<a href="${fieldHref(options.project??'',field.id)}" data-register-field="${esc(field.id)}" aria-label="${esc(field.label)} [${fieldRange(field)}]">${body}</a>`:`<g data-register-gap="${segment.kind}">${body}</g>`);
  }
 }
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(register.label)} ${register.width}位寄存器位域图"><style>${options.fontCSS??''}text{font-family:'Noto Sans SC',Arial,sans-serif}</style><metadata>${esc(JSON.stringify({register,projection,...(options.licenses?{licenses:options.licenses}:{})}))}</metadata>${parts.join('')}</svg>`;
}
export function registerDiagramHTML(register:Register,project:string){
 const projection=registerProjection(register);
 return `<figure class="register-diagram" data-register="${esc(register.id)}"><figcaption>${esc(register.label)} · ${register.width}-bit</figcaption><div class="register-actions"><span>高位在左；窄字段见编号，↔表示同一字段跨位带</span><button type="button" data-register-export>SVG</button></div><div class="register-scroll">${[8,16,32].map(bits=>`<div class="register-variant register-${bits}" data-register-bits="${bits}">${registerSVG(register,{project,bitsPerRow:bits})}</div>`).join('')}</div><ul class="register-legend">${projection.fields.map((field,index)=>`<li><a href="${fieldHref(project,field.id)}"><code>F${index+1}</code> ${esc(field.label)} <span>[${fieldRange(field)}]</span></a></li>`).join('')}</ul><p class="register-gap-note">${register.gapPolicy==='reserved'?'空洞按已声明策略标为保留位':'空洞标为未声明位，不认定为保留位'}；不补写访问属性或复位值。</p></figure>`;
}
// 临时展示投影，不登记第二份Table/Row事实；字段ID仍属于原寄存器。
export function registerFieldTable(register:Register,graph:Graph):Table{
 const projection=registerProjection(register);
 return {id:'register-field-table:'+register.id,kind:'table',label:register.label+' 字段定义',columns:[{field:'name',label:'字段',type:'string'},{field:'bits',label:'位范围',type:'string'},{field:'access',label:'访问',type:'string'},{field:'reset',label:'定义复位',type:'string'},{field:'description',label:'说明',type:'string'},{field:'source',label:'来源',type:'string'}],rows:projection.segments.map(segment=>{
  const field=segment.fieldId?register.fields.find(f=>f.id===segment.fieldId):undefined,source=field?entitySource(graph,field.id):undefined;
  return {id:field?.id??register.id+':gap:'+segment.msb+':'+segment.lsb,values:{name:field?.label??segment.label+'（自动补齐）',bits:fieldRange(segment),access:field?.access??'未声明',reset:resetText(field?.reset),description:field?.description??(field?'':'按覆盖范围计算，不创建字段实体'),source:source?(source.ownerId===field!.id?'查看来源':'寄存器来源'):'未声明'},...(field?{links:{name:{kind:'entity' as const,id:field.id},...(source?{source:{kind:'source' as const,id:field.id}}:{})}}:{})};
 })};
}
export function registerSourceHTML(graph:Graph,id:string){
 const value=entitySource(graph,id);if(!value)return '<p class="register-source">来源未声明。</p>';
 const {source,ownerId}=value,link=source.attachment?` · <a href="${esc(routeHash(resolveLinkTarget(graph,{kind:'source',id}).route))}">查看原始 PDF</a>`:'';
 return `<p class="register-source">${ownerId===id?'来源':'寄存器来源（字段未单独声明）'}：<code>${esc(source.file)}</code>${source.line?' · 行 '+source.line:''}${source.selector?' · '+esc(source.selector):''}${link}</p>`;
}
export function registerFieldDetails(graph:Graph,id:string){
 const field=graph.index.get(id)!.entity as RegisterField,parent=graph.index.get(id)!.ownerId!;
 return `<div class="register-field-detail"><p><a href="${fieldHref(graph.manifest.projectId,parent)}">返回寄存器定义</a></p><dl><dt>位范围</dt><dd>[${fieldRange(field)}] · ${field.msb-field.lsb+1} bit</dd><dt>访问属性</dt><dd>${esc(field.access??'未声明')}</dd><dt>定义复位</dt><dd data-reset-state="${resetState(field.reset)}">${esc(resetText(field.reset))}</dd></dl><p class="register-description">${esc(field.description??'说明未声明')}</p>${registerSourceHTML(graph,id)}<p class="register-value-note">本页呈现寄存器定义，不将复位声明当作硬件绑定值或观测结果。</p></div>`;
}
