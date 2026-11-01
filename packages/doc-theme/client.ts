import {anchor} from '../core/identity.ts';
import {Graph as X6} from '@antv/x6';
import type {Scene} from '../render-graph/index.ts';
import {styles} from '../render-graph/styles.ts';
// 构建时注入纯数据，浏览器不读取旁路 JSON、不使用动态 import。
declare global {interface Window {EngDocReady:boolean; EngDocGraphs:X6[];}}
const data=JSON.parse(document.querySelector('#engdoc-data')!.textContent!);
window.EngDocGraphs=[];
const panel=document.querySelector<HTMLElement>('#properties')!;
function select(id:string){panel.textContent=JSON.stringify(data.entities[id]??{id},null,2);const a=document.querySelector<HTMLAnchorElement>('#object-link')!;a.href='#'+anchor(id);a.hidden=false;}
for(const holder of document.querySelectorAll<HTMLElement>('[data-diagram]')){
 const s:Scene=data.scenes[holder.dataset.diagram!];
 const canvas=holder.querySelector<HTMLElement>('.canvas')!;
 const height=Math.min(680,Math.max(420,s.height));canvas.style.height=height+'px';
 const graph=new X6({container:canvas,width:canvas.clientWidth,height,background:{color:'#f8fafc'},panning:true,mousewheel:{enabled:true,modifiers:['ctrl','meta'],minScale:.15,maxScale:4},interacting:false});
 window.EngDocGraphs.push(graph);
 for(const n of s.nodes){
  const markup:any[]=[{tagName:'rect',selector:'body'},{tagName:'text',selector:'title'}];
  const attrs:any={body:{fill:'#fff',stroke:'#93a9bd',strokeWidth:1.3,rx:10,ry:10},title:{refX:0,refY:0,textAnchor:'start',text:n.label,x:16,y:25,fontSize:17,fontWeight:600,fill:'#17324d',fontFamily:'Noto Sans SC'}};
  n.ports.forEach((p,i)=>{markup.push({tagName:'text',selector:'p'+i});attrs['p'+i]={refX:0,refY:0,text:p.label+'\n'+p.annotation,x:p.side==='left'?14:n.width-14,y:p.y-n.y-3,textAnchor:p.side==='left'?'start':'end',fontSize:11,lineHeight:14,fill:'#36516b',fontFamily:'Noto Sans SC'};});
  graph.addNode({id:n.id,x:n.x,y:n.y,width:n.width,height:n.height,markup,attrs,ports:{groups:{absolute:{position:{name:'absolute'},attrs:{circle:{r:4,magnet:false,stroke:'#447599',fill:'white'}}}},items:n.ports.map(p=>({id:p.id,group:'absolute',args:{x:p.x-n.x,y:p.y-n.y}}))},data:{entityId:n.id}});
 }
 for(const n of s.nodes)if(n.parentId&&graph.getCellById(n.parentId))graph.getCellById(n.parentId).addChild(graph.getCellById(n.id));
 for(const n of s.nodes)if(s.nodes.some(child=>child.parentId===n.id)){const parent=graph.getCellById(n.id);parent.toBack({deep:false});parent.attr('body/fill','#f1f6f9');}
 const connectionCells=new Map<string,string[]>();
 for(const net of s.nets){
  const style=styles[net.class]??styles.other;
  const hub=graph.addNode({id:'hub:'+net.id,shape:'circle',x:net.hub.x-3,y:net.hub.y-3,width:6,height:6,attrs:{body:{fill:style.color,stroke:'none'}},data:{entityId:net.id}});
  const cells=[hub.id];
  net.branches.forEach((b,i)=>{
   const node=s.nodes.find(n=>n.id===b.endpoint||n.ports.some(p=>p.id===b.endpoint))!;
   const edge=graph.addEdge({id:'branch:'+net.id+':'+i,source:{cell:node.id,...(node.id!==b.endpoint?{port:b.endpoint}:{})},target:{cell:hub.id},vertices:b.points.slice(1,-1),attrs:{line:{stroke:style.color,strokeWidth:2,strokeDasharray:style.dash,targetMarker:null,sourceMarker:b.arrow?{name:'block',width:7,height:5}:null}},labels:i===0?[{position:.65,attrs:{label:{text:`${net.label} [${net.class}]`,fill:style.color,fontSize:11,fontFamily:'Noto Sans SC'},body:{fill:'#f8fafc',stroke:'none'}}}]:[],data:{entityId:net.id}});
   cells.push(edge.id);
  });connectionCells.set(net.id,cells);
 }
 function highlight(id:string){select(id);const adjacent=s.nets.filter(n=>n.id===id||n.endpoints.some(p=>p===id||s.nodes.find(n=>n.id===id)?.ports.some(port=>port.id===p))).map(n=>n.id);const owners=new Set(s.nets.filter(n=>adjacent.includes(n.id)).flatMap(n=>n.endpoints.map(p=>s.nodes.find(n=>n.id===p||n.ports.some(port=>port.id===p))?.id)));for(const cell of graph.getEdges())cell.attr('line/opacity',adjacent.includes(cell.getData()?.entityId)?1:.18);for(const n of s.nodes)graph.getCellById(n.id).attr('body/stroke',owners.has(n.id)||n.id===id?'#0a8aa5':'#b9c7d3');}
 graph.on('node:click',({node,e})=>highlight((e.target as Element).closest('[port]')?.getAttribute('port')??node.getData()?.entityId??node.id));graph.on('edge:click',({edge})=>highlight(edge.getData()?.entityId??edge.id));
 const fit=()=>graph.zoomToFit({padding:26,maxScale:1});
 holder.querySelector('[data-action=fit]')!.addEventListener('click',fit);
 holder.querySelector('[data-action=plus]')!.addEventListener('click',()=>graph.zoom(.15));
 holder.querySelector('[data-action=minus]')!.addEventListener('click',()=>graph.zoom(-.15));
 holder.querySelector('[data-action=reset]')!.addEventListener('click',()=>{graph.getEdges().forEach(e=>e.attr('line/opacity',1));s.nodes.forEach(n=>graph.getCellById(n.id).attr('body/stroke','#93a9bd'));panel.textContent='选择图中对象查看工程属性';fit();});
 holder.querySelector('[data-action=svg]')!.addEventListener('click',()=>{const blob=new Blob([holder.querySelector('.static-svg')!.innerHTML.replace('<defs>', '<style>'+document.head.querySelector('style')!.textContent+'</style><defs>')],{type:'image/svg+xml'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=s.id.replace(/[^\w.-]/g,'_')+'.svg';a.click();URL.revokeObjectURL(a.href);});
 const filtered=new Set<string>(s.visibleClasses?s.nets.filter(n=>!s.visibleClasses!.includes(n.class)).map(n=>n.class):[]),collapsed=new Set<string>();
 function visibility(){for(const net of s.nets){const hide=filtered.has(net.class)||[...collapsed].some(id=>s.groups.find(g=>g.id===id)!.members.some(p=>net.endpoints.includes(p)));for(const id of connectionCells.get(net.id)!)graph.getCellById(id).setVisible(!hide);}}
 for(const cls of new Set(s.nets.map(n=>n.class))){const label=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=!filtered.has(cls);check.dataset.class=cls;label.append(check,document.createTextNode(cls));holder.querySelector('.filters')!.append(label);check.onchange=()=>{check.checked?filtered.delete(cls):filtered.add(cls);visibility();};}
 for(const group of s.groups.filter(g=>g.members.some(id=>s.nodes.some(n=>n.id===id||n.ports.some(p=>p.id===id))))){
  const button=document.createElement('button');button.textContent='总览 '+group.label;button.dataset.group=group.id;holder.querySelector('.groups')!.append(button);
  const related=s.nets.filter(n=>group.members.some(p=>n.endpoints.includes(p)));
  const owners=[...new Set(related.flatMap(net=>net.endpoints.map(p=>s.nodes.find(n=>n.id===p||n.ports.some(port=>port.id===p))!.id)))];
  const busIds:string[]=[];const members=s.nodes.filter(n=>group.members.includes(n.id));
  button.onclick=()=>{if(collapsed.has(group.id)){collapsed.delete(group.id);busIds.splice(0).forEach(id=>graph.removeCell(id));members.forEach(n=>graph.getCellById(n.id).show());button.textContent='总览 '+group.label;}else{collapsed.add(group.id);button.textContent='展开 '+group.label;if(members.length){members.forEach(n=>graph.getCellById(n.id).hide());const aggregate=graph.addNode({id:'aggregate:'+group.id,shape:'rect',x:members[0].x,y:members[0].y,width:200,height:90,attrs:{body:{fill:'#eaf3f7',stroke:'#52788e',rx:10},label:{text:group.label+'\n'+related.length+' independent nets',fontFamily:'Noto Sans SC'}},data:{entityId:group.id}});busIds.push(aggregate.id);for(const net of related){for(const endpoint of net.endpoints){const owner=s.nodes.find(n=>n.id===endpoint||n.ports.some(p=>p.id===endpoint))!;if(members.some(n=>n.id===owner.id))continue;const edge=graph.addEdge({source:{cell:aggregate.id},target:{cell:owner.id,...(endpoint!==owner.id?{port:endpoint}:{})},router:{name:'orth'},attrs:{line:{stroke:(styles[net.class]??styles.other).color,targetMarker:null}},labels:[{attrs:{label:{text:net.label}}}],data:{entityId:net.id}});busIds.push(edge.id);}}}else owners.slice(1).forEach((id,i)=>{const bus=graph.addEdge({id:'bus:'+group.id+':'+i,source:{cell:owners[0]},target:{cell:id},router:{name:'orth'},attrs:{line:{stroke:'#52687d',strokeWidth:5,targetMarker:null}},labels:[{attrs:{label:{text:`${group.label} · ${related.length} independent nets`}}}],data:{entityId:group.id}});busIds.push(bus.id);});select(group.id);}visibility();};if(s.collapsedGroups.includes(group.id))button.click();
 }
 visibility();fit();new ResizeObserver(()=>{graph.resize(canvas.clientWidth,height);fit();}).observe(canvas);
}
for(const tabs of document.querySelectorAll<HTMLElement>('.tabs')){
 const children=[...tabs.children].filter(e=>e.classList.contains('tab')) as HTMLElement[];
 const nav=document.createElement('div');nav.className='tab-nav';tabs.prepend(nav);
 children.forEach((tab,i)=>{tab.hidden=i!==0;const b=document.createElement('button');b.textContent=tab.dataset.name!;nav.append(b);b.onclick=()=>children.forEach(t=>t.hidden=t!==tab);});
}
const search=document.querySelector<HTMLInputElement>('#search')!;
search.addEventListener('input',()=>{const term=search.value.trim().toLowerCase();for(const a of document.querySelectorAll<HTMLElement>('#toc a'))a.hidden=!!term&&!a.textContent!.toLowerCase().includes(term);const results=document.querySelector<HTMLElement>('#results')!;results.replaceChildren();if(term.length>1)for(const [id,e] of Object.entries(data.entities) as [string,any][]){if((id+' '+JSON.stringify(e)).toLowerCase().includes(term)){const a=document.createElement('a');a.href='#'+anchor(id);a.textContent=e.label??id;results.append(a);if(results.children.length>=30)break;}}if(term.length>1&&results.children.length<30)for(const section of document.querySelectorAll<HTMLElement>('article section[id]')){if(section.textContent!.toLowerCase().includes(term)){const a=document.createElement('a');a.href='#'+section.id;a.textContent=section.querySelector('h2')?.textContent??section.id;results.append(a);if(results.children.length>=30)break;}}});
document.addEventListener('click',e=>{const a=(e.target as Element).closest('a[href^="#"]');if(a){const id=a.getAttribute('href')!.slice(1);const target=document.getElementById(id);for(let p=target?.parentElement;p;p=p.parentElement){if(p instanceof HTMLDetailsElement)p.open=true;if(p.classList.contains('tab'))p.hidden=false;}}});
document.fonts.ready.then(()=>{window.EngDocReady=true;});
