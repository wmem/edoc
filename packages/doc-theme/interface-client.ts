import {nodeHeading,addPortLeads,readableViewport} from './graph-presentation.ts';
import {portLabel} from '../render-graph/ports.ts';
import {drawnPaths} from '../render-graph/net-tree.ts';
import {Graph as X6} from '@antv/x6';
import {interfaceScene,initialInterfaceState} from '../render-graph/interfaces.ts';
import type {InterfaceState} from '../render-graph/interfaces.ts';
import type {Scene} from '../render-graph/scene.ts';
import {renderSVG} from '../render-graph/svg.ts';
import {styles} from '../render-graph/styles.ts';
import {anchor} from '../core/identity.ts';
import type {InterfaceRenderer} from './client.ts';
declare global{interface Window{EdocInterfaceViews:{holder:HTMLElement;scene:Scene;state:InterfaceState;lastDurationMs:number}[];}}
export const initializeInterfaces:InterfaceRenderer=(holder,{data,select,signal,cleanup})=>{
 holder.dataset.initialized='true';holder.dataset.busy='false';
 let current:Scene=data.scenes[holder.dataset.diagram!],state=initialInterfaceState(current.interfaceModel!),desired=structuredClone(state),revision=0,committed=0,running=false,desiredFocus:string|undefined;
 const selection=document.createElement('div');selection.className='interface-selection';selection.hidden=true;
 const model=current.interfaceModel!,canvas=holder.querySelector<HTMLElement>('.canvas')!,status=holder.querySelector<HTMLElement>('.interface-status')!,actions=document.querySelector<HTMLElement>('#selection-actions')!;
 const attributes=holder.querySelector<HTMLInputElement>('[data-display="port-attributes"]')!,labels=holder.querySelector<HTMLInputElement>('[data-display="relation-labels"]');
 const relationLabelsVisible=()=>labels?.checked??current.display.showRelationLabels;
 holder.insertBefore(selection,canvas);
 const graph=new X6({container:canvas,async:false,width:holder.clientWidth,height:Math.min(680,Math.max(420,current.height)),background:{color:'#f8fafc'},panning:true,mousewheel:{enabled:true,modifiers:['ctrl','meta'],minScale:.15,maxScale:4},interacting:false});
 window.EdocGraphs.push(graph);window.EdocInterfaceViews??=[];
 const entry={holder,scene:current,state,lastDurationMs:0,restore:(next:InterfaceState)=>request(next)};window.EdocInterfaceViews.push(entry);
 const relationLabels=new Map<string,string>();
 const cellID=(base:string)=>{let id=base;while(graph.getCellById(id))id+='#';return id;};
 let viewportMode:'readable'|'fit'|'actual'='readable';
 const viewport=()=>readableViewport(graph,current,holder,viewportMode);
 const fit=()=>{viewportMode='fit';viewport();};
 const summary=()=>{status.classList.remove('error');status.textContent=`${current.nets.length} 条显示关系 · ${current.nets.reduce((n,r)=>n+(r.sourceRelations?.length??1),0)} 条可见原关系；接口箭头可独立展开，点击连线查看组成。${current.nets.flatMap(n=>n.layoutWarnings??[]).map(w=>w.message).join('；')}`;};
 function draw(){
  selection.hidden=true;selection.replaceChildren();relationLabels.clear();graph.clearCells();canvas.style.height=Math.min(680,Math.max(420,current.height))+'px';graph.resize(holder.clientWidth,canvas.clientHeight);
  for(const n of current.nodes){
   const heading=nodeHeading(n),markup:any[]=[{tagName:'rect',selector:'body'},...heading.markup],attrs:any={body:{fill:'#fff',stroke:'#93a9bd',strokeWidth:1.3,rx:10,ry:10},...heading.attrs};
   n.ports.forEach((p,i)=>{
    if(p.slot)return;
    const left=p.side==='left',x=left?13:n.width-13,align=left?'start':'end';
    const add=(key:string,text:string,y:number,size:number,color:string,extra:any={})=>{markup.push({tagName:'text',selector:key+i});attrs[key+i]={refX:0,refY:0,text,x,y,textAnchor:align,fontSize:size,fill:color,fontFamily:'Noto Sans SC',...extra};};
    if(p.interfaceHeader){
     add('toggle',p.collapsed?'▸':'▾',p.y-n.y-4,16,'#315f91',{x:left?13:n.width-13,'data-interface-toggle':p.id,role:'button',tabindex:0,'aria-label':`${p.collapsed?'展开':'合并'} ${model.nodes.flatMap(n=>n.interfaces??[]).find(i=>i.id===p.id)!.label}`,'aria-expanded':String(!p.collapsed),cursor:'pointer'});
     add('p',portLabel(p),p.y-n.y-4,14,'#315f91',{x:left?33:n.width-33,fontWeight:600,'data-source-port':p.id,cursor:'pointer'});
     add('a',p.annotation,p.y-n.y+14,11,'#60778c',{'data-interface-annotation':p.id});
    }else{
     add('p',portLabel(p),p.y-n.y-4,14,p.noConnection?'#7a8794':'#17324d',{'data-source-port':p.id,cursor:'pointer'});
     add('a',p.annotation+(p.noConnection?' · 本视图未显示连接':''),p.y-n.y+11,11,'#617487',{'data-port-annotation':p.id,display:attributes.checked?'':'none'});
    }
   });
   graph.addNode({id:n.id,zIndex:1,x:n.x,y:n.y,width:n.width,height:n.height,markup,attrs,ports:{groups:{signal:{position:{name:'absolute'},attrs:{circle:{r:4,magnet:false,fill:'white',stroke:'#447599'}}},interface:{position:{name:'absolute'},markup:[{tagName:'rect',selector:'pad'}],attrs:{pad:{x:-4,width:8,rx:2,fill:'#dbeafe',stroke:'#315f91',magnet:false}}},slot:{position:{name:'absolute'},attrs:{circle:{r:0,magnet:false}}}},items:n.ports.map(p=>({id:p.id,group:p.slot?'slot':p.interfaceHeader?'interface':'signal',args:{x:p.x-n.x,y:p.y-n.y},...(p.interfaceHeader?{attrs:{pad:{y:-(p.padHeight??14)/2,height:p.padHeight??14,display:p.collapsed?'':'none'}}}:{})}))},data:{entityId:n.id}});
  }
  for(const n of current.nodes)if(n.parentId&&graph.getCellById(n.parentId))graph.getCellById(n.parentId).addChild(graph.getCellById(n.id));
  for(const n of current.nodes)if(current.nodes.some(c=>c.parentId===n.id)){graph.getCellById(n.id).setZIndex(-1);graph.getCellById(n.id).attr('body/fill','#f1f6f9');}
  addPortLeads(graph,current);
  for(const net of current.nets){const style=styles[net.class]??styles.other;
   for(const [i,p]of (net.junctions??(net.junction?[net.hub]:[])).entries())graph.addNode({id:cellID('hub:'+net.id+':'+i),zIndex:2,shape:net.bundle?'rect':'circle',x:p.x-3,y:p.y-3,width:6,height:6,attrs:{body:{fill:style.color,stroke:'none'}},data:{relationId:net.id}});
   drawnPaths(net).forEach((b,i)=>graph.addEdge({id:cellID('branch:'+net.id+':'+i),zIndex:0,source:b.points[0],target:b.points.at(-1),vertices:b.points.slice(1,-1),attrs:{line:{stroke:style.color,strokeWidth:net.bundle?5:2,strokeDasharray:style.dash,targetMarker:b.endArrow?{name:'block',width:7,height:5}:null,sourceMarker:b.arrow?{name:'block',width:7,height:5}:null}},data:{relationId:net.id,entityId:net.id}}));
   const box=net.labelBox,markup:any[]=[{tagName:'rect',selector:'body'}],attrs:any={body:{fill:'#f8fafc',stroke:'none',rx:4,ry:4}};
   box.lines.forEach((line,i)=>{markup.push({tagName:'text',selector:'line'+i});attrs['line'+i]={refX:0,refY:0,text:line,x:box.width/2,y:18+i*20,textAnchor:'middle',fontSize:14,fill:style.color,fontFamily:'Noto Sans SC'};});
   const labelId=cellID('label:'+net.id);relationLabels.set(net.id,labelId);graph.addNode({id:labelId,zIndex:2,x:box.x,y:box.y,width:box.width,height:box.height,markup,attrs,visible:relationLabelsVisible(),data:{relationId:net.id,role:'relation-label'}});
  }
  entry.scene=current;entry.state=state;
 }
 async function request(next:InterfaceState,focus?:string){
  desired=structuredClone(next);desiredFocus=focus;revision++;
  if(running)return;
  running=true;holder.dataset.busy='true';holder.setAttribute('aria-busy','true');
  let error='';
  while(committed!==revision&&!signal?.aborted){
   const version=revision,target=structuredClone(desired),focusId=desiredFocus,old=current.nodes.find(n=>n.id===focusId),zoom=graph.zoom(),translation=graph.translate(),point=old?{x:old.x*zoom+translation.tx,y:old.y*zoom+translation.ty}:undefined,started=performance.now();
   status.textContent='正在重新布局接口与连线…';
   try{
    const result=await interfaceScene(model,target);if(signal?.aborted)return;if(version!==revision)continue;
    error='';current=result;state=target;draw();const node=current.nodes.find(n=>n.id===focusId);if(point&&node)graph.translate(point.x-node.x*zoom,point.y-node.y*zoom);else viewport();
    entry.lastDurationMs=performance.now()-started;holder.dataset.layoutMs=entry.lastDurationMs.toFixed(1);committed=version;
   }catch(e){if(signal?.aborted)return;if(version!==revision)continue;error=e instanceof Error?e.message:String(e);desired=structuredClone(state);committed=version;}
   await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  }
  running=false;holder.dataset.busy='false';holder.setAttribute('aria-busy','false');
  if(error){status.classList.add('error');status.textContent='展开未完成，保留上一个场景：'+error;}else summary();
 }
 function toggle(id:string){const next=structuredClone(desired);next.modes[id]=next.modes[id]==='collapsed'?'expanded':'collapsed';void request(next,current.interfaces!.find(i=>i.id===id)!.ownerId);}
 function expand(ids:string[]){const next=structuredClone(desired);ids.forEach(id=>next.modes[id]='expanded');void request(next,current.interfaces!.find(i=>i.id===ids[0])?.ownerId);}
 function button(label:string,run:()=>void,target:HTMLElement=selection){const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=run;target.append(b);return b;}
 function highlight(id:string){
  const iface=current.interfaces!.find(i=>i.id===id),node=model.nodes.find(n=>n.id===id),members=new Set(iface?.members??node?.ports?.map(p=>p.id)??[id]);members.add(id);const adjacent=current.nets.filter(n=>n.id===id||n.sourceRelations?.some(r=>r.id===id||r.endpoints.some(p=>members.has(p))));
  graph.getEdges().forEach(e=>e.attr('line/opacity',e.getData()?.portLead?(members.has(e.getData()?.entityId)||e.getData()?.ownerId===id?1:.18):adjacent.some(n=>n.id===e.getData()?.relationId)?1:.18));
 }
 function choose(id:string){
  const slot=current.nodes.flatMap(n=>n.ports).find(p=>p.id===id&&p.slot);if(slot)id=slot.interfaceId!;
  const net=current.nets.find(n=>n.id===id),iface=current.interfaces!.find(i=>i.id===id);
  selection.replaceChildren();selection.hidden=false;const summary=document.createElement('span'),entity=data.entities[id];summary.textContent=net?.bundle?`接口聚合 · ${net.sourceRelations!.length} 条原始连接`:iface?`${iface.label} · ${iface.visibleMembers.length}/${iface.members.length} 个成员`:[entity?.label??id,entity?.direction,entity?.width!==undefined?entity.width+'b':entity?.widthExpr].filter(Boolean).join(' · ');selection.append(summary);
  if(net?.bundle){select(id,{type:'显示聚合',interfaceIds:net.interfaceIds,sourceRelationIds:net.sourceRelations!.map(r=>r.id),relations:net.sourceRelations});button('展开两端接口',()=>expand(net.interfaceIds!));const details=document.createElement('details'),caption=document.createElement('summary');caption.textContent='组成连接与来源';details.append(caption);selection.append(details);for(const r of net.sourceRelations!){const a=document.createElement('a');a.href='#'+anchor(r.id);a.textContent=r.label??r.id;a.onclick=()=>{if(holder.classList.contains('diagram-expanded'))big.click();};details.append(a);}}
  else if(iface){select(id,{...data.entities[id],ownerId:iface.ownerId,visibleMembers:iface.visibleMembers,connectedMembers:iface.connectedMembers,relationCount:iface.relationCount,visibleRelationCount:iface.visibleRelationCount,internalRelations:iface.internalRelations});button(iface.expanded?'合并此接口':'展开此接口',()=>toggle(id));}
  else{select(id);if(net?.interfaceIds?.some(id=>desired.modes[id]==='collapsed'))button('展开两端接口',()=>expand(net.interfaceIds!));}
  highlight(id);
 }
 graph.on('node:click',({node,e})=>{const target=e.target as Element,toggleId=target.closest('[data-interface-toggle]')?.getAttribute('data-interface-toggle');if(toggleId){toggle(toggleId);return;}choose(target.closest('[data-source-port]')?.getAttribute('data-source-port')??target.closest('[port]')?.getAttribute('port')??node.getData()?.relationId??node.getData()?.entityId);});
 graph.on('edge:click',({edge})=>choose(edge.getData().relationId??edge.getData().entityId));
 document.addEventListener('edoc-selection',event=>{const detail=(event as CustomEvent).detail,id=detail.id,iface=current.interfaces!.find(i=>i.members.includes(id));if(!iface||detail.holder&&detail.holder!==holder)return;if(detail.locate){if(detail.holder===holder)expand([iface.id]);return;}if(actions.querySelector('[data-interface-locate]'))return;const b=button('图中定位信号',()=>{for(let p:HTMLElement|null=holder;p;p=p.parentElement){if(p instanceof HTMLDetailsElement)p.open=true;if(p.classList.contains('tab'))p.hidden=false;}expand([iface.id]);holder.scrollIntoView({block:'center'});},actions);b.dataset.interfaceLocate=id;},{signal});
 holder.addEventListener('keydown',e=>{const id=(e.target as Element).closest('[data-interface-toggle]')?.getAttribute('data-interface-toggle');if(id&&['Enter',' '].includes(e.key)){e.preventDefault();toggle(id);}});
 holder.querySelector('[data-action=interfaces-collapse]')!.addEventListener('click',()=>{const next=structuredClone(desired);current.interfaces!.forEach(i=>next.modes[i.id]='collapsed');void request(next,current.nodes[0]?.id);});
 holder.querySelector('[data-action=interfaces-expand]')!.addEventListener('click',()=>expand(current.interfaces!.map(i=>i.id)));
 for(const cls of new Set(model.relations.map(r=>r.class))){const label=document.createElement('label'),check=document.createElement('input');check.type='checkbox';check.dataset.class=cls;check.checked=!state.classes||state.classes.includes(cls);label.append(check,document.createTextNode(cls));holder.querySelector('.filters')!.append(label);check.onchange=()=>{const next=structuredClone(desired);next.classes=[...holder.querySelectorAll<HTMLInputElement>('.filters input:checked')].map(c=>c.dataset.class!);void request(next,current.nodes[0]?.id);};}
 const staticSVG=holder.querySelector('.static-svg svg')!;
 attributes.onchange=()=>{for(const n of current.nodes)n.ports.forEach((p,i)=>{if(!p.slot&&!p.interfaceHeader)graph.getCellById(n.id).attr('a'+i+'/display',attributes.checked?'':'none');});staticSVG.querySelectorAll('[data-port-annotation]').forEach(e=>e.setAttribute('display',attributes.checked?'':'none'));};
 if(labels)labels.onchange=()=>{for(const n of current.nets)graph.getCellById(relationLabels.get(n.id)!)?.setVisible(relationLabelsVisible());staticSVG.querySelectorAll('[data-relation-label]').forEach(e=>e.setAttribute('display',relationLabelsVisible()?'':'none'));};
 function download(svg:Element,suffix:string){const clone=svg.cloneNode(true) as SVGSVGElement,style=document.createElementNS('http://www.w3.org/2000/svg','style');style.textContent=document.getElementById('edoc-document-style')!.textContent;clone.prepend(style);const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=current.id.replace(/[^\w.-]/g,'_')+suffix+'.svg';a.click();URL.revokeObjectURL(url);}
 holder.querySelector('[data-action=svg]')!.addEventListener('click',()=>download(staticSVG,'-signals'));
 holder.querySelector('[data-action=svg-current]')!.addEventListener('click',()=>{const svg=renderSVG({...current,display:{showPortAttributes:attributes.checked,showRelationLabels:relationLabelsVisible()}},'',current.id+'-current');download(new DOMParser().parseFromString(svg,'image/svg+xml').documentElement,'-current');});
 holder.querySelector('[data-action=fit]')!.addEventListener('click',fit);
 holder.querySelector('[data-action=read]')!.addEventListener('click',()=>{viewportMode='actual';viewport();});
 holder.querySelector('[data-action=plus]')!.addEventListener('click',()=>graph.zoom(.15));holder.querySelector('[data-action=minus]')!.addEventListener('click',()=>graph.zoom(-.15));
 holder.querySelector('[data-action=reset]')!.addEventListener('click',()=>{graph.getEdges().forEach(e=>e.attr('line/opacity',1));select('');viewport();});
 const big=holder.querySelector<HTMLButtonElement>('[data-action=expand]')!;big.onclick=()=>{const active=holder.classList.toggle('diagram-expanded');big.setAttribute('aria-pressed',String(active));big.textContent=active?'关闭大图':'大图查看';if(active){holder.setAttribute('role','dialog');holder.setAttribute('aria-modal','true');holder.setAttribute('aria-label',current.label);}else{holder.removeAttribute('role');holder.removeAttribute('aria-modal');holder.removeAttribute('aria-label');big.focus();}requestAnimationFrame(()=>{graph.resize(holder.clientWidth,canvas.clientHeight);viewport();});};
 holder.addEventListener('keydown',e=>{if(!holder.classList.contains('diagram-expanded'))return;if(e.key==='Escape'){e.preventDefault();big.click();}if(e.key==='Tab'){const controls=[...holder.querySelectorAll<HTMLElement>('button,input,[data-interface-toggle]')].filter(e=>!e.hidden),at=controls.indexOf(document.activeElement as HTMLElement);if((e.shiftKey&&at===0)||(!e.shiftKey&&at===controls.length-1)){e.preventDefault();controls[e.shiftKey?controls.length-1:0].focus();}}});
 draw();summary();viewport();let lastWidth=holder.clientWidth;const resize=new ResizeObserver(()=>{graph.resize(holder.clientWidth,canvas.clientHeight);if(!running&&lastWidth!==holder.clientWidth)viewport();lastWidth=holder.clientWidth;});resize.observe(holder);resize.observe(canvas);cleanup?.(()=>resize.disconnect());
};
