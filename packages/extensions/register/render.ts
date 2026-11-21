import type {Graph,Table} from '../../core/types.ts';
import type {Register,RegisterField} from './types.ts';
import {registerProjection,fieldRange,resetText,resetState} from './model.ts';
import {measureText} from '../../render-graph/text.ts';
import {routeHash} from '../../core/routes.ts';
import {entitySource,resolveLinkTarget} from '../../core/link-target.ts';
import {anchor} from '../../core/identity.ts';
import {esc} from '../../core/html.ts';

const colors=['#dcebf5','#e1efe7','#f8eddb','#eae6f6'];
const fieldHref=(project:string,id:string)=>esc(routeHash({kind:'entity',project,id}));

// 默认按 32 位字边界组织，而不是随容器宽度拆成 8 位小段。
// 视口不足时由 HTML 容器滚动，SVG 本身始终保留连续的位布局。
export function registerSVG(register:Register,options:{project?:string;bitsPerRow?:number;fontCSS?:string;licenses?:unknown}={}){
 const bits=options.bitsPerRow??32,cell=bits>=24?22:bits>=16?30:34,padding=10,laneHeight=86;
 const projection=registerProjection(register),width=Math.min(bits,register.width)*cell+padding*2;
 const lanes:{high:number;low:number}[]=[];
 for(let low=Math.floor((register.width-1)/bits)*bits;low>=0;low-=bits)lanes.push({high:Math.min(register.width-1,low+bits-1),low});
 const height=lanes.length*laneHeight+8,parts:string[]=[];
 lanes.forEach(({high,low},lane)=>{
  const top=lane*laneHeight;
  parts.push('<text x="10" y="'+(top+13)+'" font-size="11" fill="#60778c">位 '+high+':'+low+'</text>');
  for(let bit=high;bit>=low;bit--)parts.push('<text x="'+(padding+(high-bit+.5)*cell)+'" y="'+(top+32)+'" text-anchor="middle" font-size="10.5" fill="#526b80">'+bit+'</text>');
  for(const segment of projection.segments){
   const msb=Math.min(high,segment.msb),lsb=Math.max(low,segment.lsb);if(msb<lsb)continue;
   const x=padding+(high-msb)*cell,w=(msb-lsb+1)*cell,y=top+41;
   const field=segment.fieldId?register.fields.find(f=>f.id===segment.fieldId):undefined;
   const index=projection.fields.findIndex(f=>f.id===segment.fieldId);
   const continued=!!field&&(msb!==segment.msb||lsb!==segment.lsb);
   const short=segment.label.split(' · ')[0];
   const candidates=continued?[segment.marker+'↔',short,segment.marker??'?']:[segment.label,short,segment.marker??(segment.kind==='reserved'?'R':'?')];
   const label=candidates.find(text=>measureText(text,12)+6<=w)??(segment.marker??'?');
   const body='<title>'+esc(segment.label)+' ['+fieldRange(segment)+']'+(field?' · '+(field.access??'访问未声明')+' · 复位 '+resetText(field.reset):' · 不赋予访问或复位属性')+'</title>'
    +'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="36" rx="2" fill="'+(field?colors[index%colors.length]:segment.kind==='reserved'?'#eef1f3':'#fff5df')+'" stroke="'+(field?'#7796ac':'#9ca8af')+'"'+(segment.kind==='unspecified'?' stroke-dasharray="4 3"':'')+'/>'
    +'<text x="'+(x+w/2)+'" y="'+(y+23)+'" text-anchor="middle" font-size="12" fill="#193b53">'+esc(label)+'</text>';
   parts.push(field?'<a href="'+fieldHref(options.project??'',field.id)+'" data-register-field="'+esc(field.id)+'" aria-label="'+esc(field.label)+' ['+fieldRange(field)+']">'+body+'</a>':'<g data-register-gap="'+segment.kind+'">'+body+'</g>');
  }
 });
 return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+esc(register.label)+' '+register.width+'位寄存器位域图"><style>'+esc(options.fontCSS??'')+"text{font-family:'Noto Sans SC',Arial,sans-serif}</style><metadata>"+esc(JSON.stringify({register,projection,...(options.licenses?{licenses:options.licenses}:{})}))+'</metadata>'+parts.join('')+'</svg>';
}
export function registerDiagramHTML(register:Register,project:string){
 const projection=registerProjection(register);
 return '<figure class="register-diagram" data-register="'+esc(register.id)+'">'
  +'<figcaption><strong>'+esc(register.label)+'</strong><span>'+register.width+' bit</span></figcaption>'
  +'<div class="register-actions"><span>高位在左，连续 32 位；可左右滚动，窄字段编号对应下方表格</span><button type="button" data-register-export>导出 SVG</button></div>'
  +'<div class="register-scroll" tabindex="0" aria-label="寄存器位域图，可左右滚动查看全部位"><div class="register-variant" data-register-bits="32">'+registerSVG(register,{project,bitsPerRow:32})+'</div></div>'
  +'<ul class="register-legend">'+projection.fields.map((field,index)=>'<li><a href="'+fieldHref(project,field.id)+'" data-register-field="'+esc(field.id)+'"><code>F'+(index+1)+'</code> '+esc(field.label)+' <span>['+fieldRange(field)+']</span></a></li>').join('')+'</ul>'
  +'<p class="register-gap-note">'+(register.gapPolicy==='reserved'?'空洞按已声明策略标为保留位':'空洞标为未声明位，不认定为保留位')+'；不补写访问属性或复位值。</p></figure>';
}
// 字段事实始终由 Register 投影，不创建独立 Table/Row 实体。
export function registerFieldTable(register:Register,graph:Graph):Table{
 const projection=registerProjection(register);
 return {id:'register-field-table:'+register.id,kind:'table',label:register.label+' 字段定义',columns:[{field:'name',label:'字段',type:'string'},{field:'bits',label:'位范围',type:'string'},{field:'access',label:'访问',type:'string'},{field:'reset',label:'定义复位',type:'string'},{field:'description',label:'说明',type:'string'},{field:'source',label:'来源',type:'string'}],rows:projection.segments.map(segment=>{
  const field=segment.fieldId?register.fields.find(f=>f.id===segment.fieldId):undefined,source=field?entitySource(graph,field.id):undefined;
  return {id:field?.id??register.id+':gap:'+segment.msb+':'+segment.lsb,values:{name:field?.label??segment.label+'（自动补齐）',bits:fieldRange(segment),access:field?.access??'未声明',reset:resetText(field?.reset),description:field?.description??(field?'':'按覆盖范围计算，不创建字段实体'),source:source?(source.ownerId===field!.id?'查看来源':'寄存器来源'):'未声明'},...(field?{links:{name:{kind:'entity' as const,id:field.id},...(source?{source:{kind:'source' as const,id:field.id}}:{})}}:{})};
 })};
}
// 专用阅读表将位段合在一列、来源收进详情，仍使用原有 data-table 排序和筛选能力。
export function registerFieldTableHTML(register:Register,graph:Graph,options:{rowNamespace?:string}={}){
 const rows=registerFieldTable(register,graph).rows;
 const body=rows.map(row=>{
  const field=graph.index.get(row.id)?.type==='register-field'?graph.index.get(row.id)!.entity as RegisterField:undefined;
  const value=row.values!;
  const name=field?'<a class="register-field-name" href="'+fieldHref(graph.manifest.projectId,field.id)+'">'+esc(field.label)+'</a>':'<span class="register-field-name">'+esc(String(value.name))+'</span>';
  const origin=field&&entitySource(graph,field.id)?'<details class="register-field-origin"><summary>查看来源</summary>'+registerSourceHTML(graph,field.id)+'</details>':'';
  const id=esc((options.rowNamespace??'')+anchor(row.id));
  return '<tr id="'+id+'"'+(field?' data-register-field-row="'+esc(field.id)+'"':' data-register-gap-row')+'>'
    +'<td>'+name+'<span class="register-field-bits">['+esc(String(value.bits))+']</span></td>'
    +'<td><code>'+esc(String(value.access))+'</code></td>'
    +'<td><span class="register-field-reset" data-reset-state="'+resetState(field?.reset)+'">'+esc(String(value.reset))+'</span></td>'
    +'<td><span class="register-field-description">'+esc(String(value.description))+'</span>'+origin+'</td></tr>';
 }).join('');
 return '<div class="data-table register-field-table" data-register-table="'+esc(register.id)+'" data-table="'+esc('register-field-table:'+register.id)+'" data-sortable="true" data-filterable="true">'
  +'<p class="register-field-mobile-hint">左右滑动表格查看全部字段信息；点字段名进入完整定义。</p>'
  +'<div class="data-table-scroll"><table><caption>'+esc(register.label)+' · 字段定义</caption>'
  +'<colgroup><col data-field="name" data-type="string"/><col data-field="access" data-type="string"/><col data-field="reset" data-type="string"/><col data-field="description" data-type="string"/></colgroup>'
  +'<thead><tr><th>字段与位段</th><th>访问</th><th>定义复位</th><th>说明 / 来源</th></tr></thead><tbody>'+body+'</tbody></table></div></div>';
}
export function registerSourceHTML(graph:Graph,id:string){
 const value=entitySource(graph,id);if(!value)return '<p class="register-source">来源未声明。</p>';
 const {source,ownerId}=value,link=source.attachment?' · <a href="'+esc(routeHash(resolveLinkTarget(graph,{kind:'source',id}).route))+'">查看原始 PDF</a>':'';
 return '<p class="register-source">'+(ownerId===id?'来源':'寄存器来源（字段未单独声明）')+'：<code>'+esc(source.file)+'</code>'+(source.line?' · 行 '+source.line:'')+(source.selector?' · '+esc(source.selector):'')+link+'</p>';
}
export function registerFieldDetails(graph:Graph,id:string){
 const field=graph.index.get(id)!.entity as RegisterField,parent=graph.index.get(id)!.ownerId!;
 return '<div class="register-field-detail"><p><a href="'+fieldHref(graph.manifest.projectId,parent)+'">返回寄存器定义</a></p><dl><dt>位范围</dt><dd>['+fieldRange(field)+'] · '+(field.msb-field.lsb+1)+' bit</dd><dt>访问属性</dt><dd>'+esc(field.access??'未声明')+'</dd><dt>定义复位</dt><dd data-reset-state="'+resetState(field.reset)+'">'+esc(resetText(field.reset))+'</dd></dl><p class="register-description">'+esc(field.description??'说明未声明')+'</p>'+registerSourceHTML(graph,id)+'<p class="register-value-note">本页呈现寄存器定义，不将复位声明当作硬件绑定值或观测结果。</p></div>';
}
