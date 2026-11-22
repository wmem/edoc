import {anchor} from '../core/identity.ts';
import {readingOutline} from './reading-structure.ts';
import {failure} from '../core/errors.ts';
import type {ResourceContext,ResourceBinding,ResourceView} from '../core/resource-types.ts';
import type {ResourceRoute} from '../core/routes.ts';
import {routeHash} from '../core/routes.ts';
import {routeResource,resourceRoute,resourceBindings,resourceTrail,resourceCollection} from '../core/resource-pages.ts';
import type {ResourceBody} from '../core/resource-body.ts';
import {resourceBodyKey,namespaceResourceBody} from '../core/resource-body.ts';
import type {OutlineEntry} from '../core/outline.ts';
import {registerDiagramHTML,registerFieldTableHTML,registerSourceHTML} from '../extensions/register/render.ts';
import type {Register} from '../extensions/register/types.ts';
import {registerPresentationId} from '../extensions/register/presentation.ts';
import {esc} from '../core/html.ts';

const pretty=(value:unknown)=>JSON.stringify(value,null,2);
const auto=(id:string)=>'resource-auto-'+id;
export function resourcePage(context:ResourceContext,input:ResourceRoute,bodies:Record<string,ResourceBody>={},offset=0,cursor?:string){
 const {route,view}=routeResource(context,input,{offset,limit:50}),outline:OutlineEntry[]=[],bodyParts:{binding:ResourceBinding;body:ResourceBody;html:string}[]=[];
 const section=(id:string,label:string,html:string)=>{
  const key=auto(id);outline.push({id:key,label,kind:'heading',level:1,depth:0,source:{file:'<resource>',line:1},children:[]});return `<section id="${key}"><h2 data-heading-level="1">${esc(label)}</h2>${html}</section>`;
 };
 const facts=view.facts as any,entity=facts?.definition??facts?.entity,absolute=!!view.spaceId&&view.target.kind==='instance';
 const mapping=facts?.mapping,declared=mapping?.targetDefinition??entity,mode=view.type==='address-space'?'地址空间视图 · '+route.project+'/'+route.id+' · 本空间绝对坐标':absolute?'实例视图 · '+route.project+'/'+view.spaceId+' · 绝对空间坐标':view.target.kind==='instance'?'相对实例视图 · '+route.project+'/'+route.id:'独立定义视图 · 不推断项目绝对地址';
 const factList=(details:{label:string;value:string}[])=>'<dl class="resource-facts">'+details.map(item=>'<dt>'+esc(item.label)+'</dt><dd>'+esc(item.value)+'</dd>').join('')+'</dl>';
 const detail=view.details??[],sourceLabels=new Set(['定义来源','路径来源','访问约定']);
 let html=section('overview','概述',`<p class="resource-view-mode">${esc(mode)}</p><p>${esc(view.type+(mapping?' → '+mapping.targetType:''))}${declared?.width?' · '+esc(declared.width)+' bit':''}</p><p>${esc(entity?.description??declared?.description??'说明未声明')}</p>${factList(detail.filter(item=>!sourceLabels.has(item.label)))}${facts?.coordinate?`<p>${absolute?'源空间绝对坐标':'根 Block 相对偏移'}：<code>${esc(facts.coordinate.address??facts.coordinate.unitIndex+' + '+facts.coordinate.subUnitBitOffset+' bit')}</code> × ${esc(facts.addressUnitBits)} bit${facts.partial?'；部分可见，以下列表只对完整寄存器提供正常跳转。':''}</p>`:''}${view.definition&&view.target.kind==='instance'?`<p>共享定义：<a href="${esc(routeHash(resourceRoute({kind:'definition',...view.definition})))}">${esc(view.definition.project+'/'+view.definition.id)}</a></p>`:''}`);
 if(view.type==='window'&&mapping){html+=section('translation','窗口转换与目标',`<p>目标空间：<a href="${esc(routeHash(resourceRoute({kind:'definition',project:mapping.targetProject,id:mapping.targetId})))}">${esc(mapping.targetProject+'/'+mapping.targetId)}</a>。下方 Region 与叶寄存器链接继续保留当前源空间的完整路径。</p><p>区间均为半开位区间；坐标转换按 bit 精确平移，保留子单位余数。未映射尾部、未分配空洞和 Reserved 不赋予访问能力。</p>`);}
 if(declared?.kind==='register'||declared?.kind==='register-block'){
  const policy=facts?.accessPolicy??facts?.effectiveAccessPolicy??(declared.kind==='register-block'?declared.accessPolicy:undefined);
  const labels:Record<string,string>={allowedTransferBits:'允许事务位宽',alignment:'声明处对齐约束',byteOrder:'字节顺序',splitOrder:'多事务顺序',readConsistency:'读一致性',writeAtomicity:'写原子性'};
  html+=section('access-policy','访问约定',factList(Object.entries(labels).map(([key,label])=>({label,value:policy?.[key]===undefined?'未声明':key==='alignment'&&typeof policy[key]==='object'?policy[key].value+' × '+policy[key].addressUnitBits+' bit = '+policy[key].bitAlignment+' bit（声明于 '+policy[key].declaredBy+'）':key==='allowedTransferBits'?policy[key].join(' / ')+' bit':typeof policy[key]==='string'?policy[key]:JSON.stringify(policy[key])})))+'<p>位域图表示位分布。事务顺序、读一致性和写原子性分别遵循显式声明；不从位宽推断硬件访问保证。'+(declared.kind==='register'?'复位状态见下方各字段定义，不拼造整寄存器复位值。':'')+'</p>');
 }
 if(view.children.total!=='0'){
  const columns=view.childColumns??[{key:'coordinate',label:'首项坐标'}];
  const rows=view.children.items.map((child,index)=>{
   const link={...resourceRoute(child.target,route.mountId),...(view.spaceId?{spaceId:view.spaceId}:{})};
   const extra=child.values?Object.entries(child.values).filter(([key])=>!columns.some(c=>c.key===key)):[];
   const navigation=child.status?`${esc(child.label)}<br><span role="status">${esc(child.status)}：${esc(child.error)}</span>`:`<a data-resource-child href="${esc(routeHash(link))}">${esc(child.label)}${child.count==='1'?'':' ['+esc(child.firstIndex??'0')+']'}</a>`;
   return `<tr><td>${navigation}${child.count!=='1'?`<p>${esc(child.count)} 个实例</p><form data-resource-index="${index}"><label>实例索引 <input type="number" min="0" max="${BigInt(child.count)-1n}" step="1" value="${esc(child.firstIndex??'0')}" required aria-label="${esc(child.label)} 实例索引"></label><button type="submit">按索引进入</button></form>`:''}${extra.length?'<details><summary>映射与重复事实</summary>'+factList(extra.map(([key,value])=>({label:({repeat:'count / stride',span:'每项槽位跨度（原生单位）',target:'目标身份',offset:'目标起点 / 单位',visibility:'可见性',coordinate:'投影坐标'} as Record<string,string>)[key]??key,value})))+'</details>':''}</td>${columns.map(col=>'<td>'+esc(child.values?.[col.key]??(col.key==='coordinate'?pretty(child.coordinate):'—'))+'</td>').join('')}</tr>`;
  }).join('');
  const label=declared?.kind==='address-space'||view.type==='window'?'地址划分与 Region':'寄存器与嵌套分组';
  html+=section('resources',label,`<p>共 ${esc(view.children.total)} 个定义项/数组汇总，当前 ${view.children.items.length} 项；数组不全量展开。${declared?.kind==='address-space'?'size / mappedSize / stride 使用声明空间的 '+esc(declared.addressUnitBits)+' bit 单位。':''}${declared?.kind==='register-block'?'槽位跨度 / stride 使用 Block 的 '+esc(declared.addressUnitBits??8)+' bit 单位。':''}</p><div class="register-map-scroll" tabindex="0" aria-label="${label}，可横向滚动"><table data-resource-table><thead><tr><th>名称 / 导航</th>${columns.map(col=>'<th>'+esc(col.label)+'</th>').join('')}</tr></thead><tbody>${rows}</tbody></table></div>${offset?'<button data-resource-page="'+Math.max(0,offset-50)+'">上一组</button>':''}${view.children.truncated?'<button data-resource-page="'+(offset+50)+'">下一组</button>':''}`);
 }
 const collection=resourceCollection(context,view.target,{cursor,limit:50});
 if(collection){
  const rows=collection.items.map(child=>'<tr><td>'+ (child.status?esc(child.label)+'<p role="status">'+esc(child.status)+' · '+esc(child.error)+'</p>':'<a data-resource-leaf href="'+esc(routeHash({...resourceRoute(child.target,route.mountId),...(view.spaceId?{spaceId:view.spaceId}:{})}))+'">'+esc(child.label)+'</a>')+'</td>'+collection.columns.map(col=>'<td>'+esc(child.values?.[col.key]??'—')+'</td>').join('')+'<td>'+(child.status?'<span role="status">'+esc(child.status)+' · '+esc(child.error)+'</span>':'完整槽位可见')+'</td></tr>').join('');
  html+=section('register-list',collection.title,'<p>'+esc(collection.notice)+'</p><div class="register-map-scroll" tabindex="0" aria-label="可见寄存器列表，可横向滚动"><table data-resource-leaves><thead><tr><th>完整实例路径</th>'+collection.columns.map(col=>'<th>'+esc(col.label)+'</th>').join('')+'<th>状态</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(!collection.items.length?'<p>本段没有完整寄存器；Memory、Reserved 和未分配空洞保持原有身份，请查地址划分。</p>':'')+(cursor?'<button data-resource-leaves-page="">回到首组寄存器</button>':'')+(collection.nextCursor?'<button data-resource-leaves-page="'+esc(collection.nextCursor)+'">继续查看寄存器</button>':'')+'<form data-resource-leaf-seek><label>从源 bit 坐标开始 <input name="cursor" value="'+esc(cursor??'0')+'" aria-label="叶列表起始位坐标" pattern="(0[xX][0-9a-fA-F]+|[0-9]+)" required></label><button>定位范围</button></form>');
 }
 if(view.presentation?.kind==='register'){const graph=context.projects.get(view.presentation.project)!,register=graph.index.get(view.presentation.id)!.entity as Register;
  const presentationId=registerPresentationId(view.presentation.project,register.id,JSON.stringify(['resource',route.project,route.id,route.view,route.segments??[],route.mountId??null]));
  html+=section('bit-layout','位域图',registerSourceHTML(graph,register.id)+registerDiagramHTML(register,view.presentation.project,presentationId));
  html+=section('field-table','字段表',registerFieldTableHTML(register,graph,{presentationId}));
 }
 const sourceFacts=facts?.sources??(declared?.source?[{role:'definition',projectId:view.definition?.project??route.project,source:declared.source}]:[]);
 html+=section('sources','身份与来源',sourceFacts.length?'<ul class="resource-sources">'+sourceFacts.map((item:any)=>'<li>'+esc(({mapping:'项目映射',entry:'Block 布局',definition:'资源定义'} as Record<string,string>)[item.role]??item.role)+' · '+esc(item.projectId)+' · <code>'+esc(item.source.file)+'</code>'+esc(item.source.line?':'+item.source.line:'')+' '+esc(item.source.selector??'')+(item.source.attachment?' · <a href="'+esc(routeHash({kind:'pdf',project:item.source.attachment.project??item.projectId,id:item.source.attachment.id,...(item.source.attachment.target?{target:item.source.attachment.target}:{})}))+'">查看来源 PDF</a>':'')+'</li>').join('')+'</ul>':'<p>来源未声明。</p>');
 html+='<details class="resource-raw"><summary>精确事实与声明</summary><pre>'+esc(pretty(view.facts))+'</pre></details>';
 const bindings=resourceBindings(context,view),aliases:Record<string,string>={},ambiguous=new Set<string>();
 for(const [index,binding]of bindings.entries()){
  const body=bodies[resourceBodyKey(binding.source.projectId,binding.sectionId)];if(!body)failure('RESOURCE_CONTENT',binding.source.file,'','离线数据缺少绑定正文：'+binding.sectionId);
  const scoped=namespaceResourceBody(body,binding,route,index);
  for(const [key,value]of Object.entries(scoped.aliases)){if(aliases[key]&&aliases[key]!==value){delete aliases[key];ambiguous.add(key);}else if(!ambiguous.has(key))aliases[key]=value;}
  outline.push(...scoped.outline);bodyParts.push({binding,body,html:scoped.html});
 }
 // 页标题独立于自动区块，不按 IR 显示名猜测哪个区块充当标题。
 const reading=readingOutline(outline,'',new Set());
 let output='<article class="resource-page"><h1>'+esc(view.title)+'</h1><div data-resource-auto>'+html+'</div>'+bodyParts.map((part,index)=>'<section data-resource-author="'+index+'" data-source-project="'+esc(part.body.project)+'"><p class="resource-author-source">作者正文：<a href="'+esc(routeHash({kind:'page',project:part.body.project,id:part.body.page,anchor:part.body.sourceAnchor??anchor(part.body.sectionId)}))+'">'+esc(part.body.project+' / '+part.body.sectionId)+'</a> · '+esc(part.binding.source.file)+':'+part.binding.source.line+'</p>'+part.html+'</section>').join('')+'</article>';
 output=output.replace(/<span class="heading-number"[^>]*>[\s\S]*?<\/span>/g,'');
 const insertions:{index:number;number:string}[]=[];
 const numbered=(nodes:OutlineEntry[])=>{for(const node of nodes){const begin=output.indexOf('id="'+esc(node.id)+'"'),heading=begin<0?undefined:/<h[1-6]\b[^>]*data-heading-level=[^>]*>/.exec(output.slice(begin));if(heading&&node.number)insertions.push({index:begin+heading.index+heading[0].length,number:node.number});numbered(node.children);}};numbered(reading.roots);
 for(const insertion of insertions.sort((a,b)=>b.index-a.index))output=output.slice(0,insertion.index)+'<span class="heading-number" aria-hidden="true">'+esc(insertion.number)+'</span>'+output.slice(insertion.index);
 return {route,view,collection,title:view.title,trail:resourceTrail(context,route),html:output,outline:reading.roots,anchorAliases:aliases,bodyParts};
}
