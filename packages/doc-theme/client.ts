import {specificationControls} from './specification-controls.ts';
import {nodeHeading,addPortLeads,readableViewport} from './graph-presentation.ts';
import {portLabel} from '../render-graph/ports.ts';
import {drawnPaths} from '../render-graph/net-tree.ts';
import {anchor} from '../core/identity.ts';
import {Graph as X6} from '@antv/x6';
import type {Scene} from '../render-graph/index.ts';
import {styles} from '../render-graph/styles.ts';
// 构建时注入纯数据，浏览器不读取旁路 JSON、不使用动态 import。
declare global {interface Window {EdocReady:boolean; EdocGraphs:X6[];}}
export type InterfaceRenderer=(holder:HTMLElement,context:{data:any;select:(id:string,detail?:unknown)=>void;signal?:AbortSignal;cleanup?:(fn:()=>void)=>void})=>void;
export function start(interfaceRenderer?:InterfaceRenderer,options:{managed?:boolean;initialize?:number[]}={}){
const abort=new AbortController(),cleanups:(()=>void)[]=[];let stopped=false;
const dispose=()=>{stopped=true;abort.abort();cleanups.forEach(fn=>fn());window.EdocGraphs.forEach(g=>g.dispose());window.EdocGraphs=[];if(window.EdocInterfaceViews)window.EdocInterfaceViews=[];};
if(!options.managed)cleanups.push(specificationControls(document.querySelector<HTMLElement>('main')!));
const data=JSON.parse(document.querySelector('#edoc-data')!.textContent!);
window.EdocGraphs=[];
const panel=document.querySelector<HTMLElement>('#properties')!;
function select(id:string,detail?:unknown,origin?:HTMLElement){
 const actions=document.querySelector('#selection-actions')!;actions.replaceChildren();panel.textContent=JSON.stringify(detail??data.entities[id]??{id},null,2);const detailNode=document.querySelector('#entity-detail');if(detailNode)detailNode.textContent=panel.textContent;const a=document.querySelector<HTMLAnchorElement>('#object-link')!;a.href='#'+anchor(id);a.hidden=!data.entities[id];
 const candidates=[...document.querySelectorAll<HTMLElement>('[data-diagram]')].filter(h=>{const m=data.scenes[h.dataset.diagram!]?.interfaceModel;return m?.visiblePorts.includes(id)&&m.nodes.some((n:any)=>n.interfaces?.some((i:any)=>i.members.includes(id)));});
 const candidate=origin&&candidates.includes(origin)?origin:candidates.find(h=>h.getClientRects().length>0)??candidates[0];
 if(candidate&&!candidate.dataset.initialized){const button=document.createElement('button');button.textContent='图中定位信号';button.dataset.interfaceLocate=id;button.onclick=()=>{for(let p:HTMLElement|null=candidate;p;p=p.parentElement){if(p instanceof HTMLDetailsElement)p.open=true;if(p.classList.contains('tab'))p.hidden=false;}initialize(candidate);candidate.scrollIntoView({block:'center'});document.dispatchEvent(new CustomEvent('edoc-selection',{detail:{id,locate:true,holder:candidate}}));};actions.append(button);}
 document.dispatchEvent(new CustomEvent('edoc-selection',{detail:{id,holder:candidate}}));
}
function initialize(holder:HTMLElement){
 if(stopped||holder.dataset.initialized||holder.closest('details:not([open])'))return;
 if(data.scenes[holder.dataset.diagram!].interfaceModel&&interfaceRenderer){interfaceRenderer(holder,{data,select:(id,detail)=>select(id,detail,holder),signal:abort.signal,cleanup:fn=>cleanups.push(fn)});return;}
 holder.dataset.initialized='true';
 const s:Scene=data.scenes[holder.dataset.diagram!];
 const canvas=holder.querySelector<HTMLElement>('.canvas')!;
 const height=Math.min(680,Math.max(420,s.height));canvas.style.height=height+'px';
 const graph=new X6({container:canvas,width:canvas.clientWidth,height,background:{color:'#f8fafc'},panning:true,mousewheel:{enabled:true,modifiers:['ctrl','meta'],minScale:.15,maxScale:4},interacting:false});
 window.EdocGraphs.push(graph);
 const cellID=(base:string)=>{let id=base;while(graph.getCellById(id))id+='#';return id;};
 for(const n of s.nodes){
  const heading=nodeHeading(n),markup:any[]=[{tagName:'rect',selector:'body'},...heading.markup];
  const attrs:any={body:{fill:'#fff',stroke:'#93a9bd',strokeWidth:1.3,rx:10,ry:10},...heading.attrs};
  n.ports.forEach((p,i)=>{for(const [key,text,offset,size,color]of [['p',portLabel(p),-4,14,'#17324d'],['a',p.annotation,11,11,'#617487']]as const){markup.push({tagName:'text',selector:key+i});attrs[key+i]={refX:0,refY:0,text,x:p.side==='left'?13:n.width-13,y:p.y-n.y+offset,textAnchor:p.side==='left'?'start':'end',fontSize:size,fill:color,fontFamily:'Noto Sans SC',...(key==='a'?{'data-port-annotation':p.id,display:s.display.showPortAttributes?'':'none'}:{})};}});
  graph.addNode({id:n.id,zIndex:1,x:n.x,y:n.y,width:n.width,height:n.height,markup,attrs,ports:{groups:{absolute:{position:{name:'absolute'},attrs:{circle:{r:4,magnet:false,stroke:'#447599',fill:'white'}}}},items:n.ports.map(p=>({id:p.id,group:'absolute',args:{x:p.x-n.x,y:p.y-n.y}}))},data:{entityId:n.id}});
 }
 for(const n of s.nodes)if(n.parentId&&graph.getCellById(n.parentId))graph.getCellById(n.parentId).addChild(graph.getCellById(n.id));
 for(const n of s.nodes)if(s.nodes.some(child=>child.parentId===n.id)){const parent=graph.getCellById(n.id);parent.setZIndex(-1);parent.attr('body/fill','#f1f6f9');}
 const connectionCells=new Map<string,string[]>();
 addPortLeads(graph,s);
 for(const net of s.nets){
  const style=styles[net.class]??styles.other;
  const cells:string[]=[];
  for(const [i,p]of (net.junctions??(net.junction?[net.hub]:[])).entries()){const hub=graph.addNode({id:cellID('hub:'+net.id+':'+i),shape:'circle',zIndex:2,x:p.x-3,y:p.y-3,width:6,height:6,attrs:{body:{fill:style.color,stroke:'none'}},data:{entityId:net.id}});cells.push(hub.id);}
  drawnPaths(net).forEach((b,i)=>{
   // 只读画布直接消费 Scene 的完整坐标，不能让 X6 重新决定节点边界或路由。
   const edge=graph.addEdge({zIndex:0,id:cellID('branch:'+net.id+':'+i),source:b.points[0],target:b.points.at(-1)!,vertices:b.points.slice(1,-1),attrs:{line:{stroke:style.color,strokeWidth:2,strokeDasharray:style.dash,targetMarker:b.endArrow?{name:'block',width:7,height:5}:null,sourceMarker:b.arrow?{name:'block',width:7,height:5}:null}},data:{entityId:net.id}});
   cells.push(edge.id);
  });
  const box=net.labelBox,markup:any[]=[{tagName:'rect',selector:'body'}],attrs:any={body:{fill:'#f8fafc',stroke:'none',rx:4,ry:4}};
  box.lines.forEach((line,i)=>{markup.push({tagName:'text',selector:'line'+i});attrs['line'+i]={refX:0,refY:0,text:line,x:box.width/2,y:18+i*20,textAnchor:'middle',fontSize:14,fill:style.color,fontFamily:'Noto Sans SC'};});
  const label=graph.addNode({id:cellID('label:'+net.id),zIndex:2,x:box.x,y:box.y,width:box.width,height:box.height,markup,attrs,data:{entityId:net.id}});cells.push(label.id);
  connectionCells.set(net.id,cells);
 }
 function highlight(id:string){select(id);const adjacent=s.nets.filter(n=>n.id===id||n.endpoints.some(p=>p===id||s.nodes.find(n=>n.id===id)?.ports.some(port=>port.id===p))).map(n=>n.id);const owners=new Set(s.nets.filter(n=>adjacent.includes(n.id)).flatMap(n=>n.endpoints.map(p=>s.nodes.find(n=>n.id===p||n.ports.some(port=>port.id===p))?.id)));for(const cell of graph.getEdges())cell.attr('line/opacity',cell.getData()?.portLead?(cell.getData()?.entityId===id||cell.getData()?.ownerId===id?1:.18):adjacent.includes(cell.getData()?.entityId)?1:.18);for(const n of s.nodes)graph.getCellById(n.id).attr('body/stroke',owners.has(n.id)||n.id===id?'#0a8aa5':'#b9c7d3');}
 graph.on('node:click',({node,e})=>highlight((e.target as Element).closest('[port]')?.getAttribute('port')??node.getData()?.entityId??node.id));graph.on('edge:click',({edge})=>highlight(edge.getData()?.entityId??edge.id));
 let viewportMode:'readable'|'fit'|'actual'='readable';
 const viewport=()=>readableViewport(graph,s,holder,viewportMode);
 const fit=()=>{viewportMode='fit';viewport();};
 holder.querySelector('[data-action=fit]')!.addEventListener('click',fit);
 holder.querySelector('[data-action=read]')!.addEventListener('click',()=>{viewportMode='actual';viewport();});
 const expand=holder.querySelector<HTMLButtonElement>('[data-action=expand]')!;
 expand.onclick=()=>{
  const active=holder.classList.toggle('diagram-expanded');expand.setAttribute('aria-pressed',String(active));expand.textContent=active?'关闭大图':'大图查看';
  if(active){holder.setAttribute('role','dialog');holder.setAttribute('aria-modal','true');holder.setAttribute('aria-label',s.label);}
  else{holder.removeAttribute('role');holder.removeAttribute('aria-modal');holder.removeAttribute('aria-label');expand.focus();}
  requestAnimationFrame(()=>{graph.resize(holder.clientWidth,canvas.clientHeight);viewport();});
 };
 holder.addEventListener('keydown',event=>{
  if(!holder.classList.contains('diagram-expanded'))return;
  if(event.key==='Escape'){event.preventDefault();expand.click();}
  if(event.key==='Tab'){const controls=[...holder.querySelectorAll<HTMLElement>('button,input')].filter(e=>!e.hidden),index=controls.indexOf(document.activeElement as HTMLElement);if((event.shiftKey&&index===0)||(!event.shiftKey&&index===controls.length-1)){event.preventDefault();controls[event.shiftKey?controls.length-1:0].focus();}}
 });
 holder.querySelector('[data-action=plus]')!.addEventListener('click',()=>graph.zoom(.15));
 holder.querySelector('[data-action=minus]')!.addEventListener('click',()=>graph.zoom(-.15));
 holder.querySelector('[data-action=reset]')!.addEventListener('click',()=>{graph.getEdges().forEach(e=>e.attr('line/opacity',1));s.nodes.forEach(n=>graph.getCellById(n.id).attr('body/stroke','#93a9bd'));panel.textContent='选择图中对象查看工程属性';viewport();});
 holder.querySelector('[data-action=svg]')!.addEventListener('click',()=>{const clone=holder.querySelector('.static-svg svg')!.cloneNode(true) as SVGSVGElement;const style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=document.getElementById('edoc-document-style')!.textContent;clone.prepend(style);const blob=new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=s.id.replace(/[^\w.-]/g,'_')+'.svg';a.click();URL.revokeObjectURL(a.href);});
 const filtered=new Set<string>(s.visibleClasses?s.nets.filter(n=>!s.visibleClasses!.includes(n.class)).map(n=>n.class):[]),collapsed=new Set<string>();
 let showRelationLabels=s.display.showRelationLabels;
 function visibility(){for(const edge of graph.getEdges())if(edge.getData()?.portLead)edge.setVisible(graph.getCellById(edge.getData().ownerId).isVisible());for(const net of s.nets){const hide=filtered.has(net.class)||[...collapsed].some(id=>s.groups.find(g=>g.id===id)!.members.some(p=>net.endpoints.includes(p)));const cells=connectionCells.get(net.id)!;for(const [i,id]of cells.entries())graph.getCellById(id).setVisible(!hide&&(i!==cells.length-1||showRelationLabels));}}
 const staticSVG=holder.querySelector('.static-svg svg')!;
 const portAttributes=holder.querySelector<HTMLInputElement>('[data-display="port-attributes"]');
 if(portAttributes)portAttributes.onchange=()=>{
  for(const n of s.nodes)n.ports.forEach((_p,i)=>graph.getCellById(n.id).attr('a'+i+'/display',portAttributes.checked?'':'none'));
  staticSVG.querySelectorAll('[data-port-annotation]').forEach(e=>e.setAttribute('display',portAttributes.checked?'':'none'));
 };
 const relationLabels=holder.querySelector<HTMLInputElement>('[data-display="relation-labels"]');
 if(relationLabels)relationLabels.onchange=()=>{
  showRelationLabels=relationLabels.checked;visibility();
  for(const edge of graph.getEdges())edge.setLabels(edge.getLabels().map(label=>({...label,attrs:{...label.attrs,label:{...label.attrs?.label,display:showRelationLabels?'':'none'}}})));
  staticSVG.querySelectorAll('[data-relation-label]').forEach(e=>e.setAttribute('display',showRelationLabels?'':'none'));
 };
 for(const cls of new Set(s.nets.map(n=>n.class))){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!filtered.has(cls);check.dataset.class=cls;const key=document.createElement('span');key.style.cssText='display:inline-block;width:22px;border-top:2px '+((styles[cls]??styles.other).dash?'dashed':'solid')+' '+(styles[cls]??styles.other).color;label.append(check,key,document.createTextNode(cls));holder.querySelector('.filters')!.append(label);check.onchange=()=>{check.checked?filtered.delete(cls):filtered.add(cls);visibility();};}
 for(const group of s.groups.filter(g=>g.members.some(id=>s.nodes.some(n=>n.id===id||n.ports.some(p=>p.id===id))))){
  const button=document.createElement('button');button.textContent='总览 '+group.label;button.dataset.group=group.id;holder.querySelector('.groups')!.append(button);
  const related=s.nets.filter(n=>group.members.some(p=>n.endpoints.includes(p)));
  const owners=[...new Set(related.flatMap(net=>net.endpoints.map(p=>s.nodes.find(n=>n.id===p||n.ports.some(port=>port.id===p))!.id)))];
  const busIds:string[]=[];const members=s.nodes.filter(n=>group.members.includes(n.id));
  button.onclick=()=>{if(collapsed.has(group.id)){collapsed.delete(group.id);busIds.splice(0).forEach(id=>graph.removeCell(id));members.forEach(n=>graph.getCellById(n.id).show());button.textContent='总览 '+group.label;}else{collapsed.add(group.id);button.textContent='展开 '+group.label;if(members.length){members.forEach(n=>graph.getCellById(n.id).hide());const aggregate=graph.addNode({id:cellID('aggregate:'+group.id),shape:'rect',zIndex:1,x:members[0].x,y:members[0].y,width:200,height:90,attrs:{body:{fill:'#eaf3f7',stroke:'#52788e',rx:10},label:{text:group.label+'\n'+related.length+' independent nets',fontFamily:'Noto Sans SC'}},data:{entityId:group.id}});busIds.push(aggregate.id);for(const net of related){for(const endpoint of net.endpoints){const owner=s.nodes.find(n=>n.id===endpoint||n.ports.some(p=>p.id===endpoint))!;if(members.some(n=>n.id===owner.id))continue;const edge=graph.addEdge({source:{cell:aggregate.id},target:{cell:owner.id,...(endpoint!==owner.id?{port:endpoint}:{})},router:{name:'orth'},attrs:{line:{stroke:(styles[net.class]??styles.other).color,targetMarker:null}},labels:[{attrs:{label:{text:net.label,display:showRelationLabels?'':'none'}}}],data:{entityId:net.id}});busIds.push(edge.id);}}}else owners.slice(1).forEach((id,i)=>{const bus=graph.addEdge({id:cellID('bus:'+group.id+':'+i),source:{cell:owners[0]},target:{cell:id},router:{name:'orth'},attrs:{line:{stroke:'#52687d',strokeWidth:5,targetMarker:null}},labels:[{attrs:{label:{text:`${group.label} · ${related.length} independent nets`,display:showRelationLabels?'':'none'}}}],data:{entityId:group.id}});busIds.push(bus.id);});select(group.id);}visibility();};if(s.collapsedGroups.includes(group.id))button.click();
 }
 visibility();viewport();const resize=new ResizeObserver(()=>{if(!stopped){graph.resize(holder.clientWidth,canvas.clientHeight);viewport();}});resize.observe(holder);cleanups.push(()=>resize.disconnect());
}
const holders=[...document.querySelectorAll<HTMLElement>('[data-diagram]')];
const observer=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){initialize(entry.target as HTMLElement);observer.unobserve(entry.target);}},{rootMargin:'600px'});
cleanups.push(()=>observer.disconnect());
holders.forEach((holder,i)=>{if(i<2||options.initialize?.includes(i))initialize(holder);if(!holder.dataset.initialized)observer.observe(holder);});
const opened=(event:Event)=>{if(event.target instanceof HTMLDetailsElement&&event.target.open)for(const holder of holders)if(event.target.contains(holder)){initialize(holder);if(holder.dataset.initialized)observer.unobserve(holder);}};
document.addEventListener('toggle',opened,true);cleanups.push(()=>document.removeEventListener('toggle',opened,true));
for(const tabs of document.querySelectorAll<HTMLElement>('.tabs')){
 const children=[...tabs.children].filter(e=>e.classList.contains('tab')) as HTMLElement[];
 const nav=document.createElement('div');nav.className='tab-nav';tabs.prepend(nav);
 children.forEach((tab,i)=>{tab.hidden=i!==0;const b=document.createElement('button');b.textContent=tab.dataset.name!;nav.append(b);b.onclick=()=>children.forEach(t=>t.hidden=t!==tab);});
}
if(options.managed)return dispose;
const search=document.querySelector<HTMLInputElement>('#search')!;
const toc=document.querySelector<HTMLElement>('#toc')!;
const tocLinks=[...toc.querySelectorAll<HTMLAnchorElement>('a[data-outline-link]')];
const remembered=new Map<HTMLDetailsElement,boolean>();
function revealTOC(id:string){
 const current=tocLinks.find(a=>a.hash==='#'+id);
 tocLinks.forEach(a=>a.removeAttribute('aria-current'));
 if(current){current.setAttribute('aria-current','location');for(let p=current.parentElement;p&&p!==toc;p=p.parentElement)if(p instanceof HTMLDetailsElement)p.open=true;}
}
function filterTOC(term:string){
 if(term&&!remembered.size)toc.querySelectorAll('details').forEach(d=>remembered.set(d,d.open));
 for(const li of [...toc.querySelectorAll<HTMLElement>('li[data-outline-id]')].reverse()){
  const own=li.querySelector<HTMLAnchorElement>(':scope > a, :scope > details > summary > a');
  const children=[...li.querySelectorAll<HTMLElement>(':scope > details > ul > li')];
  const childMatch=children.some(child=>!child.hidden);
  li.hidden=!!term&&!own?.textContent!.toLowerCase().includes(term)&&!childMatch;
  const details=li.querySelector<HTMLDetailsElement>(':scope > details');
  if(term&&details&&childMatch)details.open=true;
 }
 if(!term){for(const [details,open]of remembered)details.open=open;remembered.clear();revealTOC(location.hash.slice(1));}
}
search.addEventListener('input',()=>{
 const term=search.value.trim().toLowerCase();filterTOC(term);
 const results=document.querySelector<HTMLElement>('#results')!;results.replaceChildren();
 if(term.length>1)for(const [id,e]of Object.entries(data.entities)as[string,any][]){
  if((id+' '+JSON.stringify(e)).toLowerCase().includes(term)){
   const a=document.createElement('a');a.href='#'+anchor(id);a.textContent=e.label??id;results.append(a);if(results.children.length>=30)break;
  }
 }
 if(term.length>1&&results.children.length<30)for(const section of document.querySelectorAll<HTMLElement>('article section[id],article details[id]')){
  if(section.textContent!.toLowerCase().includes(term)){
   const a=document.createElement('a');a.href='#'+section.id;a.textContent=section.querySelector(':scope > [data-section-title]')?.textContent??section.id;results.append(a);if(results.children.length>=30)break;
  }
 }
});
function revealTarget(id:string){
 const target=document.getElementById(id);
 if(target?.dataset.entityId)select(target.dataset.entityId);
 for(let p=target;p;p=p.parentElement){if(p instanceof HTMLDetailsElement)p.open=true;if(p.classList.contains('tab'))p.hidden=false;}
 revealTOC(id);
}
document.addEventListener('click',e=>{const a=(e.target as Element).closest('a[href^="#"]');if(a)revealTarget(a.getAttribute('href')!.slice(1));},{signal:abort.signal});
window.addEventListener('hashchange',()=>revealTarget(location.hash.slice(1)),{signal:abort.signal});
if(location.hash)revealTarget(location.hash.slice(1));
document.fonts.ready.then(()=>{if(!stopped)window.EdocReady=true;});
return dispose;

}
