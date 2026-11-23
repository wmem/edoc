import {previewSource} from './preview-source.ts';
import {restoreScenes} from '../core/scene-storage.ts';
import {resourcePage} from './resource-page.ts';
import {resourceMountNavigation,loadResourceNavigation} from '../core/resource-navigation.ts';
import {resourceRoute,routeResource,emptyResourceCatalog} from '../core/resource-pages.ts';
import type {ResourceContext} from '../core/resource-types.ts';
import {figureControls} from './figure-client.ts';
import {registerControls} from './register-client.ts';
import {registerPresentationId} from '../extensions/register/presentation.ts';
import type {RegisterController,RegisterSnapshot} from './register-client.ts';
import {registerDiagramHTML,registerFieldTableHTML,registerFieldDetails,registerSourceHTML} from '../extensions/register/render.ts';
import type {Register} from '../extensions/register/types.ts';
import {tableHTML} from '../extensions/data-table/render.ts';
import {esc as escapeHTML} from '../core/html.ts';
import {tableControls} from './table-controls.ts';
import type {TableControls,TableSnapshot} from './table-controls.ts';
import {sidebarLayout} from './sidebar-layout.ts';
import {semanticReferencesHTML} from './entity-references.ts';
import {readingControls} from './reading-controls.ts';
import {start} from './client.ts';
import type {InterfaceState} from '../render-graph/interfaces.ts';
import type {InterfaceRenderer} from './client.ts';
import type {PdfReader,PdfPosition} from './pdf-reader.ts';
import type {ReaderData,ReaderPage} from '../core/reader-model.ts';
import {routeHash,parseRoute,targetKey} from '../core/routes.ts';
import type {Route} from '../core/routes.ts';
import {anchor,resolveHTMLAnchor} from '../core/identity.ts';
import {hydrateProjectGraphs} from '../core/resource-context.ts';
import {query} from '../core/query.ts';
import type {RecordEntry} from '../core/types.ts';
import type {Navigation} from '../core/book.ts';
import {sidebarNavigation} from './navigation.ts';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const own=<T>(object:Record<string,T>,key:string):T|undefined=>Object.hasOwn(object,key)?object[key]:undefined;
type ReadingState={registers?:RegisterSnapshot[];resourceCursor?:string;resourceOffset?:number;controls?:{figure:number;state:{collapsed:string[];expandedCalls:string[]}}[];tables?:TableSnapshot[];headingNumbers?:boolean;outlineDetails?:boolean[];route:Route;scroll?:number;details?:string[];tabs?:boolean[];graphs?:{figure:number;zoom:number;translation:{tx:number;ty:number}}[];displays?:boolean[];interfaces?:{figure:number;state:InterfaceState}[];pdf?:PdfPosition};
export function startReader(interfaces?:InterfaceRenderer,pdfReader?:PdfReader){
 const data:ReaderData=JSON.parse(document.querySelector('#edoc-book')!.textContent!),reader=document.querySelector<HTMLElement>('#reader')!,toc=document.querySelector<HTMLElement>('#toc')!,pageToc=document.querySelector<HTMLElement>('#page-toc')!,notice=document.querySelector<HTMLElement>('#notice')!,breadcrumbs=document.querySelector<HTMLElement>('#breadcrumbs')!,search=document.querySelector<HTMLInputElement>('#search')!;
 for(const page of [...Object.values(data.pages),...Object.values(data.resourceBodies??{})])restoreScenes(page,data.diagramScenes??{});
 const live=data.live?previewSource(data,patchNavigation):undefined,loadedNavigation=new Set<string>();
 sidebarLayout();
 let registerViews:RegisterController[]=[];
 const home:Route={kind:'page',...data.home};let current:Route|undefined,dispose:(()=>void)|undefined,generation=0,currentPdf:PdfPosition|undefined,restoring=false,headingNumbers=true,resourceOffset=0,resourceCursor:string|undefined,resourceFailure='',tables:TableControls|undefined;
 const navigation=(nodes:Navigation[],depth=0,expandRoot=true):string=>'<ul>'+nodes.map(n=>{
  const route=n.route??(n.page?{kind:'page' as const,project:n.project,id:n.page,...(n.anchor?{anchor:n.anchor}:{})}:undefined),href=route?routeHash(route):'',link=route?'<a data-outline-link href="'+esc(href)+'">'+(n.number?'<span class="heading-number" aria-hidden="true">'+esc(n.number)+'</span>':'')+esc(n.label)+'</a>':'<span class="nav-group">'+esc(n.label)+'</span>';
  const more=!live&&n.resourceChildren?'<button type="button" class="resource-nav-more" data-resource-more="'+esc(href)+'">'+(n.resourceChildren.offset?'继续加载':'展开子项')+'（余 '+esc(n.childrenOmitted??n.resourceChildren.total)+' 项，每批 20 项）</button>':'';
  return '<li'+(n.mountId?' data-resource-mount="'+esc(n.mountId)+'"':'')+'>'+((n.children.length||more||n.previewChildren)?'<details'+(n.previewKey?' data-preview-key="'+esc(n.previewKey)+'"':'')+(depth<1&&expandRoot?' open':'')+'><summary>'+link+'</summary>'+navigation(n.children,depth+1,expandRoot)+more+(live&&n.resourceChildren&&loadedNavigation.has(n.previewKey!)?'<button data-preview-more="'+esc(n.previewKey)+'">继续加载</button>':'')+'</details>':link)+'</li>';
 }).join('')+'</ul>';
 let sidebar=sidebarNavigation(data.navigation);
 function patchNavigation(updates:{key:string;children:Navigation[];more:boolean}[]){
  const find=(key:string,nodes:Navigation[]=sidebar):Navigation|undefined=>{for(const node of nodes){if(node.previewKey===key)return node;const result=find(key,node.children);if(result)return result;}};
  for(const update of updates){const node=find(update.key);if(node){const previous=new Map(node.children.map(n=>[n.previewKey,n]));node.children=update.children.map(n=>previous.has(n.previewKey)?{...n,children:previous.get(n.previewKey)!.children}:n);loadedNavigation.add(update.key);if(!update.more)delete node.resourceChildren;}}
 }
 toc.innerHTML=navigation(sidebar,0,false);
 const tocActions=document.createElement('div');tocActions.className='toc-actions';tocActions.setAttribute('role','group');tocActions.setAttribute('aria-label','文档目录操作');
 for(const [label,open]of [['全部展开',true],['全部折叠',false]]as const){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-controls','toc');button.disabled=!toc.querySelector('details');
  button.onclick=()=>toc.querySelectorAll<HTMLDetailsElement>('details').forEach(details=>{if(!live||!open||loadedNavigation.has(details.dataset.previewKey!))details.open=open;});tocActions.append(button);
 }
 toc.before(tocActions);
 const hydrate=()=>hydrateProjectGraphs(Object.entries(data.projects).map(([projectId,project])=>({
  manifest:{projectId,irVersion:project.irVersion,requiredFeatures:project.requiredFeatures,resources:[],entryDocuments:[]},
  records:Object.entries(project.entities).map(([id,entity])=>({id,entity,...project.records[id]} as RecordEntry)),attachments:project.attachments
 })));
 let queryGraphs=hydrate();let hydratedProjects=Object.keys(data.projects).length;
 function evidence(projectId:string,id:string){const source=data.projects[projectId].entities[id]?.source?.attachment;if(!source)return '';return `<a class="source-attachment" href="${esc(routeHash({kind:'pdf',project:source.project??projectId,id:source.id,...(source.target?{target:source.target}:{})}))}">查看原始 PDF${source.target?' · '+esc(source.target):''}</a>`;}
 const graphFor=(projectId:string)=>queryGraphs.get(projectId)!;
 const resourceContext:ResourceContext={projects:queryGraphs,catalog:data.resourceCatalog??emptyResourceCatalog()};
 const facts=(projectId:string,id:string)=>query(graphFor(projectId),id);
 document.addEventListener('edoc-selection',event=>{const detail=(event as CustomEvent).detail,id=detail?.id,project=detail?.project??current?.project;if(project&&id&&Object.hasOwn(data.projects[project].entities,id)){document.querySelector('#properties')!.textContent=JSON.stringify(facts(project,id),null,2);document.querySelector('#selection-actions')!.insertAdjacentHTML('beforeend',evidence(project,id));const objectLink=document.querySelector<HTMLAnchorElement>('#object-link')!;objectLink.href=routeHash({kind:'entity',project,id});objectLink.hidden=false;}});

 function showMissing(route:Route){notice.replaceChildren(document.createTextNode(`当前生成的页面中没有此内容（${route.project} / ${route.id}${route.target?' / '+route.target:''}）`));const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>notice.hidden=true;notice.append(close);if(route.kind==='resource'&&resourceFailure)notice.append(document.createTextNode(' · '+resourceFailure));notice.hidden=false;}
 const projectOf=(route:Route)=>own(data.projects,route.project);
 function normalize(route:Route):Route{if(route.kind==='resource'){try{return routeResource(resourceContext,route).route;}catch{return route;}}if(route.kind==='entity'){const unit=projectOf(route),section=unit?own(unit.sections,route.id):undefined;if(section)return {kind:'page',project:route.project,id:section.page,anchor:section.anchor};}return route;}
 function exists(route:Route){const project=projectOf(route);if(!project)return false;if(route.kind==='resource'){try{const page=resourcePage(resourceContext,route,data.resourceBodies);if(route.anchor&&!resolveHTMLAnchor(page.html,route.anchor,page.anchorAliases))throw new Error('资源页锚点不存在：'+route.anchor);return true;}catch(error){resourceFailure=String(error);return false;}}if(route.kind==='entity')return route.id===''||Object.hasOwn(project.entities,route.id);if(route.kind==='pdf'){const a=own(project.attachments,route.id);return !!a&&(!route.target||Object.hasOwn(a.targets,route.target));}const page=own(data.pages,targetKey(route.project,route.id));return !!page&&(!route.anchor||!!resolveAnchor(page,route.anchor));}
 function resolveAnchor(page:ReaderPage,id:string){return resolveHTMLAnchor(page.html,id,page.anchorAliases);}
 const figureIndex=(holder:Element|null)=>[...reader.querySelectorAll('[data-diagram]')].indexOf(holder!);
 function save(){if(!current||restoring)return;const state:ReadingState={route:current,...(current.kind==='resource'?{resourceOffset,resourceCursor}:{}),tables:tables?.snapshot(),registers:registerViews.flatMap(view=>view.snapshot()),headingNumbers:!document.body.classList.contains('heading-numbers-hidden'),outlineDetails:[...pageToc.querySelectorAll<HTMLDetailsElement>('details')].map(d=>d.open),scroll:window.scrollY,details:[...reader.querySelectorAll<HTMLDetailsElement>('details[id]')].filter(d=>d.open).map(d=>d.id),tabs:[...reader.querySelectorAll<HTMLElement>('.tab')].map(t=>!!t.hidden),graphs:window.EdocGraphs?.map(g=>({figure:figureIndex(g.container.closest('[data-diagram]')),zoom:g.zoom(),translation:g.translate()})),displays:[...reader.querySelectorAll<HTMLInputElement>('[data-display],input[data-class]')].map(i=>i.checked),controls:window.EdocControlViews?.map(v=>({figure:figureIndex(v.holder),state:v.state})),interfaces:window.EdocInterfaceViews?.map(v=>({figure:figureIndex(v.holder),state:v.state})),pdf:currentPdf};history.replaceState(state,'');}
 function reveal(page:ReaderPage,id:string){const key=resolveAnchor(page,id),target=key?document.getElementById(key):undefined;if(!target)return;for(let parent:HTMLElement|null=target;parent&&parent!==reader;parent=parent.parentElement){if(parent instanceof HTMLDetailsElement)parent.open=true;if(parent.classList.contains('tab'))parent.hidden=false;}tables?.reveal(target);target.scrollIntoView({block:'start'});}
 async function display(route:Route,state?:ReadingState){
  const version=++generation;
  if(live){
   notice.hidden=false;notice.textContent='正在加载页面…';window.EdocReady=false;
   try{
    route=await live.ensure(route);if(version!==generation)return;
    if(hydratedProjects!==Object.keys(data.projects).length){queryGraphs=hydrate();resourceContext.projects=queryGraphs;hydratedProjects=Object.keys(data.projects).length;}
   }catch(error){if(version===generation){notice.hidden=false;notice.textContent='页面加载失败：'+String(error);const retry=document.createElement('button');retry.textContent='重试';retry.onclick=()=>void display(route,state);notice.append(retry);window.EdocReady=true;}return;}
  }
  route=normalize(route);if(!exists(route)){if(!current)await display(home);showMissing(route);return;}
  dispose?.();dispose=undefined;tables=undefined;registerViews=[];current=route;resourceOffset=state?.resourceOffset??0;resourceCursor=state?.resourceCursor;currentPdf=state?.pdf;window.EdocReady=false;notice.hidden=true;restoring=true;
  document.querySelector('#properties')!.textContent='点击图中对象查看来源与完整关系。';document.querySelector('#selection-actions')!.replaceChildren();document.querySelector<HTMLAnchorElement>('#object-link')!.hidden=true;
  const project=projectOf(route)!;document.body.dataset.readerKind=route.kind;if(route.kind==='pdf')document.title=project.attachments[route.id].title+' · '+data.title;else if(route.kind==='entity')document.title=(project.entities[route.id]?.label??'工程对象')+' · '+data.title;
  breadcrumbs.innerHTML=`<button data-reader-back>返回</button><a href="${esc(routeHash(home))}">${esc(data.title)}</a>${project.id===data.home.project?'':'<span>'+esc(project.title)+'</span>'}<a href="${esc(routeHash({kind:'entity',project:route.project,id:''}))}" data-object-index>工程对象</a>`;
  breadcrumbs.querySelector('button')!.onclick=()=>{if(history.state?.route&&history.length>1)history.back();else navigate(home);};

  if(route.kind==='page'){
   const page=data.pages[targetKey(route.project,route.id)];document.title=page.title+' · '+data.title;
   reader.innerHTML=`<header class="cover"><div class="eyebrow">ENGINEERING DOCUMENT</div><h1>${esc(page.title)}</h1><p>${esc(project.title)} · ${esc(page.file)}</p></header>`+page.html;
   const firstHeading=reader.querySelector<HTMLElement>('article [data-heading-level]');if(firstHeading?.textContent===page.title&&!firstHeading.closest('details'))firstHeading.remove();
   document.querySelector('#edoc-data')!.textContent=JSON.stringify({scenes:page.scenes,printScenes:page.printScenes,entities:project.entities});
   const outline=(nodes:typeof page.outline):Navigation[]=>nodes.map(n=>({label:n.label,project:route.project,page:route.id,anchor:n.id,number:n.number,children:outline(n.children)}));pageToc.innerHTML='<h4>本页目录</h4>'+navigation(outline(page.outline));
   if(state){pageToc.querySelectorAll<HTMLDetailsElement>('details').forEach((d,i)=>{if(state.outlineDetails?.[i]!==undefined)d.open=state.outlineDetails[i];});if(state.details)reader.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(d=>d.open=state.details?.includes(d.id)??false);reader.querySelectorAll<HTMLElement>('.tab').forEach((t,i)=>{if(state.tabs?.[i]!==undefined)t.hidden=state.tabs[i];});}
   const stopFigures=figureControls(reader,graphFor(route.project));const stopRegisters=registerControls(reader,graphFor(route.project),{reveal:target=>tables?.reveal(target),onChange:save});registerViews.push(stopRegisters);
   tables=tableControls(reader,{state:state?.tables,onChange:save});
   headingNumbers=state?.headingNumbers??headingNumbers;
   const stopGraphs=start(interfaces,{managed:true,initialize:state?.graphs?.map(g=>g.figure)}),stopControls=readingControls(reader,{numbers:headingNumbers,onChange:()=>{headingNumbers=!document.body.classList.contains('heading-numbers-hidden');save();}});
   if(state?.tabs)reader.querySelectorAll<HTMLElement>('.tab').forEach((tab,index)=>{if(state.tabs?.[index]!==undefined)tab.hidden=state.tabs[index];});
   // 关闭的规范内图表延迟创建；返回后首次展开时再恢复其已保存状态。
   const restoredControls=new Set((window.EdocControlViews??[]).map(v=>v.holder));
   const restoredInterfaces=new Set((window.EdocInterfaceViews??[]).map(v=>v.holder)),restoredGraphs=new Set(window.EdocGraphs);
   const restoreDeferred=async(event:Event)=>{
    if(!state||!(event.target instanceof HTMLDetailsElement)||!event.target.open)return;
    for(const view of window.EdocInterfaceViews??[])if(!restoredInterfaces.has(view.holder)){
     restoredInterfaces.add(view.holder);const previous=state.interfaces?.find(saved=>saved.figure===figureIndex(view.holder));if(previous)await view.restore?.(previous.state);
    }
    for(const view of window.EdocControlViews??[])if(!restoredControls.has(view.holder)){restoredControls.add(view.holder);const previous=state.controls?.find(saved=>saved.figure===figureIndex(view.holder));if(previous)await view.restore(previous.state);}
    await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(version!==generation)return;
    for(const graph of window.EdocGraphs)if(!restoredGraphs.has(graph)){restoredGraphs.add(graph);const previous=state.graphs?.find(saved=>saved.figure===figureIndex(graph.container.closest('[data-diagram]')));if(previous){graph.zoomTo(previous.zoom);graph.translate(previous.translation.tx,previous.translation.ty);}}
    save();
   };
   reader.addEventListener('toggle',restoreDeferred,true);
   dispose=()=>{reader.removeEventListener('toggle',restoreDeferred,true);stopControls();stopGraphs();stopRegisters();stopFigures();tables?.dispose();};
   if(state){
    if(state.controls)await Promise.all((window.EdocControlViews??[]).map(view=>{const previous=state.controls?.find(saved=>saved.figure===figureIndex(view.holder));return previous?view.restore(previous.state):undefined;}));
    if(state.interfaces)await Promise.all((window.EdocInterfaceViews??[]).map((v:any)=>{const previous=state.interfaces?.find(saved=>saved.figure===figureIndex(v.holder));return previous?v.restore?.(previous.state):undefined;}));
    if(version!==generation)return;
    reader.querySelectorAll<HTMLInputElement>('[data-display],input[data-class]').forEach((input,i)=>{if(state.displays?.[i]!==undefined&&input.checked!==state.displays[i]){input.checked=state.displays[i];input.dispatchEvent(new Event('change'));}});

   }
   await document.fonts.ready;if(version!==generation)return;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   window.EdocGraphs?.forEach((g,i)=>{const view=state?.graphs?.find(saved=>saved.figure===figureIndex(g.container.closest('[data-diagram]')));if(view){g.zoomTo(view.zoom);g.translate(view.translation.tx,view.translation.ty);}});
   if(state?.scroll!==undefined)window.scrollTo(0,state.scroll);else if(route.anchor)reveal(page,route.anchor);else window.scrollTo(0,0);
  }else if(route.kind==='resource'){
   const page=resourcePage(resourceContext,route,data.resourceBodies,resourceOffset,resourceCursor);document.title=page.title+' · '+data.title;reader.innerHTML=page.html;
   breadcrumbs.insertAdjacentHTML('beforeend',page.trail.map(crumb=>'<a href="'+esc(routeHash(crumb.route))+'">'+esc(crumb.label)+'</a>').join(''));
   const toNav=(nodes:typeof page.outline):Navigation[]=>nodes.map(n=>({label:n.label,number:n.number,project:route.project,page:'',route:{...route,anchor:n.id},children:toNav(n.children)}));
   pageToc.innerHTML='<h4>本页目录</h4>'+navigation(toNav(page.outline));
   window.EdocGraphs=[];window.EdocControlViews=[];if(window.EdocInterfaceViews)window.EdocInterfaceViews=[];
   if(state?.details)reader.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(d=>d.open=state.details!.includes(d.id));
   const stops:(()=>void)[]=[],areas=[{root:reader.querySelector<HTMLElement>('[data-resource-auto]')!,project:page.view.presentation?.project??route.project,scenes:{},printScenes:undefined},...page.bodyParts.map((part,index)=>({root:reader.querySelector<HTMLElement>('[data-resource-author="'+index+'"]')!,project:part.body.project,scenes:part.body.scenes,printScenes:part.body.printScenes}))];
   for(const area of areas){const graph=graphFor(area.project),registers=registerControls(area.root,graph,{reveal:target=>tables?.reveal(target),onChange:save});registerViews.push(registers);stops.push(figureControls(area.root,graph),registers,start(interfaces,{managed:true,root:area.root,initialize:state?.graphs?.map(saved=>[...area.root.querySelectorAll('[data-diagram]')].indexOf([...reader.querySelectorAll('[data-diagram]')][saved.figure])).filter(index=>index>=0),data:{projectId:area.project,scenes:area.scenes,printScenes:area.printScenes,entities:data.projects[area.project].entities}}));}
   tables=tableControls(reader,{state:state?.tables,onChange:save});stops.push(readingControls(reader,{numbers:state?.headingNumbers??headingNumbers,onChange:save}));
   if(state?.details)reader.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(d=>d.open=state.details!.includes(d.id));
   if(state?.tabs)reader.querySelectorAll<HTMLElement>('.tab').forEach((tab,index)=>{if(state.tabs?.[index]!==undefined)tab.hidden=state.tabs[index];});
   for(const form of reader.querySelectorAll<HTMLFormElement>('form[data-resource-index]'))form.onsubmit=event=>{
    event.preventDefault();const child=page.view.children.items[Number(form.dataset.resourceIndex)],raw=form.querySelector('input')!.value,index=Number(raw);
    if(!/^(0|[1-9][0-9]*)$/.test(raw)||!Number.isSafeInteger(index)||BigInt(index)>=BigInt(child.count)){resourceFailure='实例索引越界';showMissing(route);return;}
    const target=child.target;if(target.kind==='instance'){const segments=target.segments.map((step,i)=>i===target.segments.length-1?{...step,index}:step);navigate({...resourceRoute({...target,segments},route.mountId),...(page.view.spaceId?{spaceId:page.view.spaceId}:{})});}
   };
   reader.querySelectorAll<HTMLButtonElement>('[data-resource-page]').forEach(button=>button.onclick=()=>void display(route,{route,resourceOffset:Number(button.dataset.resourcePage),resourceCursor}));
   reader.querySelectorAll<HTMLButtonElement>('[data-resource-leaves-page]').forEach(button=>button.onclick=()=>void display(route,{route,resourceOffset,resourceCursor:button.dataset.resourceLeavesPage||undefined}));
   const seek=reader.querySelector<HTMLFormElement>('[data-resource-leaf-seek]');if(seek)seek.onsubmit=event=>{event.preventDefault();const cursor=seek.querySelector('input')!.value;if(/^(0[xX][0-9a-fA-F]+|[0-9]+)$/.test(cursor))void display(route,{route,resourceOffset,resourceCursor:cursor});};
   const restoredGraphs=new Set<unknown>(),restoredControls=new Set<unknown>(),restoredInterfaces=new Set<unknown>();
   const restoreVirtualViews=async()=>{
    if(!state)return;
    for(const view of window.EdocControlViews??[])if(!restoredControls.has(view)){restoredControls.add(view);const saved=state.controls?.find(s=>s.figure===figureIndex(view.holder));if(saved)await view.restore(saved.state);}
    for(const view of window.EdocInterfaceViews??[])if(!restoredInterfaces.has(view)){restoredInterfaces.add(view);const saved=state.interfaces?.find(s=>s.figure===figureIndex(view.holder));if(saved)await view.restore?.(saved.state);}
    await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(version!==generation)return;
    for(const graph of window.EdocGraphs??[])if(!restoredGraphs.has(graph)){restoredGraphs.add(graph);const saved=state.graphs?.find(s=>s.figure===figureIndex(graph.container.closest('[data-diagram]')));if(saved){graph.zoomTo(saved.zoom);graph.translate(saved.translation.tx,saved.translation.ty);}}
   };
   const reopened=(event:Event)=>{if(event.target instanceof HTMLDetailsElement&&event.target.open)void restoreVirtualViews();};reader.addEventListener('toggle',reopened,true);
   reader.querySelectorAll<HTMLInputElement>('[data-display],input[data-class]').forEach((input,index)=>{if(state?.displays?.[index]!==undefined&&input.checked!==state.displays[index]){input.checked=state.displays[index];input.dispatchEvent(new Event('change'));}});
   dispose=()=>{reader.removeEventListener('toggle',reopened,true);tables?.dispose();stops.reverse().forEach(stop=>stop());};
   await restoreVirtualViews();await document.fonts.ready;if(version!==generation)return;
   if(state?.scroll!==undefined)window.scrollTo(0,state.scroll);else if(route.anchor)reveal({html:page.html,anchorAliases:page.anchorAliases} as ReaderPage,route.anchor);else window.scrollTo(0,0);
  }else if(route.kind==='entity'){
   if(route.id===''){reader.innerHTML='<article><h1>工程对象 · '+esc(project.title)+'</h1><div class="object-index">'+Object.entries(project.entities).map(([id,e])=>`<a href="${esc(routeHash({kind:'entity',project:route.project,id}))}">${esc(e.label??id)} · ${esc(id)}</a>`).join('')+'</div></article>';pageToc.replaceChildren();window.EdocGraphs=[];restoring=false;window.EdocReady=true;save();return;}
   const entity=project.entities[route.id],detail=facts(route.project,route.id),relations=detail.directRelations;
   reader.innerHTML=`<article><h1>${esc(entity.label??route.id)}</h1><p>${esc(project.title)} · ${esc(route.id)}</p>${evidence(route.project,route.id)}${detail.target.type==='register'?`<p class="register-description">${escapeHTML((entity as Register).description??'')}</p>${registerSourceHTML(graphFor(route.project),route.id)}${registerDiagramHTML(entity as Register,route.project,registerPresentationId(route.project,route.id,'entity'))}${registerFieldTableHTML(entity as Register,graphFor(route.project),{presentationId:registerPresentationId(route.project,route.id,'entity')})}`:detail.target.type==='register-field'?registerFieldDetails(graphFor(route.project),route.id):''}${semanticReferencesHTML(route.project,detail.references,project.entities)}${['register','register-field'].includes(detail.target.type)?`<details><summary>原始定义与身份</summary><pre>${esc(JSON.stringify(detail.target,null,2))}</pre></details>`:`<h2>对象信息</h2><pre>${esc(JSON.stringify(detail.target,null,2))}</pre><h2>完整直接关系（硬件连接）</h2><pre>${esc(JSON.stringify(relations,null,2))}</pre>`}</article>`;pageToc.replaceChildren();window.EdocGraphs=[];tables=tableControls(reader,{state:state?.tables,onChange:save});const stopFigures=figureControls(reader,graphFor(route.project));const stopRegisters=registerControls(reader,graphFor(route.project),{reveal:target=>tables?.reveal(target),onChange:save});registerViews.push(stopRegisters);dispose=()=>{tables?.dispose();stopRegisters();stopFigures();};window.scrollTo(0,state?.scroll??0);
  }else{
   const attachment=project.attachments[route.id];reader.innerHTML=`<h1>${esc(attachment.title)}</h1><div id="pdf-reader"></div>`;pageToc.replaceChildren();window.EdocGraphs=[];
   if(pdfReader)dispose=pdfReader(reader.querySelector('#pdf-reader')!,attachment,route.target?attachment.targets[route.target]:undefined,data,state?.pdf,position=>{currentPdf=position;if(!restoring)save();});window.scrollTo(0,0);
  }
  if(version!==generation)return;if(state?.registers)registerViews.forEach(view=>view.restore(state.registers!));restoring=false;window.EdocReady=true;save();
  renderSidebar(true);
 }
 function renderSidebar(revealCurrent=false){
  const opened=new Set([...toc.querySelectorAll<HTMLDetailsElement>('details[open]')].map(d=>d.dataset.previewKey??d.querySelector('summary a')?.getAttribute('href')));
  const refresh=(nodes:Navigation[]):Navigation[]=>nodes.map(node=>node.id&&node.kind==='resource'&&node.mountId=== (current?.kind==='resource'?current.mountId:undefined)?resourceMountNavigation(resourceContext,resourceContext.catalog.mounts.find(m=>m.mountId===node.mountId)!,current as import('../core/routes.ts').ResourceRoute,node):({...node,children:refresh(node.children)}));
  if(!live)sidebar=refresh(sidebar);toc.innerHTML=navigation(sidebar,0,false);
  toc.querySelectorAll<HTMLDetailsElement>('details').forEach(d=>{if(opened.has(d.dataset.previewKey??d.querySelector('summary a')?.getAttribute('href')))d.open=true;});
  toc.querySelectorAll<HTMLAnchorElement>('a').forEach(a=>{const dest=parseRoute(a.hash),route=current,inPage=route?.kind==='page'&&dest?.kind==='page'&&dest.project===route.project&&dest.id===route.id||route?.kind==='resource'&&dest?.kind==='resource'&&dest.project===route.project&&dest.id===route.id&&dest.mountId===route.mountId&&dest.view===route.view&&JSON.stringify(dest.segments)===JSON.stringify(route.segments);if(inPage){a.setAttribute('aria-current','page');for(let parent=a.parentElement;parent&&parent!==toc;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;if(revealCurrent){const nav=a.closest<HTMLElement>('nav.sidebar');if(nav){const row=a.getBoundingClientRect(),box=nav.getBoundingClientRect();if(row.top<box.top)nav.scrollTop+=row.top-box.top-8;else if(row.bottom>box.bottom)nav.scrollTop+=row.bottom-box.bottom+8;}}}});
 }
 toc.addEventListener('click',event=>{
  const button=(event.target as Element).closest<HTMLButtonElement>('[data-resource-more]');if(!button)return;
  const find=(nodes:Navigation[]):Navigation|undefined=>{for(const node of nodes){if(node.route&&routeHash(node.route)===button.dataset.resourceMore)return node;const child=find(node.children);if(child)return child;}};
  const node=find(sidebar);if(node){loadResourceNavigation(resourceContext,node);renderSidebar();}
 });
 function navigate(route:Route){if(!live){route=normalize(route);if(!exists(route)){showMissing(route);return;}}save();const state:ReadingState={route,...((route.kind==='page'&&current?.kind==='page'||route.kind==='resource'&&current?.kind==='resource'&&JSON.stringify({...route,anchor:undefined})===JSON.stringify({...current,anchor:undefined}))&&route.project===current.project&&route.id===current.id?{tables:tables?.snapshot(),registers:registerViews.flatMap(view=>view.snapshot())}:{})};history.pushState(state,'',routeHash(route));void display(route,state);}
 document.addEventListener('click',event=>{const a=(event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');if(!a||event.defaultPrevented||event instanceof MouseEvent&&(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return;const href=a.getAttribute('href')!,route=parseRoute(href);if(route){event.preventDefault();navigate(route);}else if(current?.kind==='resource'){event.preventDefault();navigate({...current,anchor:decodeURIComponent(href.slice(1))});}else if(current?.kind==='page'){event.preventDefault();const project=data.projects[current.project],fragment=decodeURIComponent(href.slice(1)),id=Object.keys(project.entities).find(id=>anchor(id)===fragment);navigate(id?{kind:'entity',project:current.project,id}:{...current,anchor:fragment});}});
 window.addEventListener('popstate',()=>{const route=parseRoute(location.hash)??home;void display(route,history.state??undefined);});
 window.addEventListener('hashchange',()=>{const route=parseRoute(location.hash);if(route&&JSON.stringify(route)!==JSON.stringify(current))void display(route,history.state??undefined);});
 let scrollTimer:ReturnType<typeof setTimeout>;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(save,100);});
 search.addEventListener('input',async()=>{const term=search.value.trim().toLowerCase(),results=document.querySelector('#results')!;results.replaceChildren();if(!term)return;let count=0;const add=(label:string,route:Route)=>{const a=document.createElement('a');a.textContent=label;a.href=routeHash(route);results.append(a);count++;};
  if(live){try{const matches=await live.request('search',{term});if(search.value.trim().toLowerCase()!==term)return;for(const item of matches)add(item.label,item.route);}catch(error){results.textContent=String(error);}return;}
  for(const page of Object.values(data.pages))if(count<30&&(page.title+' '+page.file+' '+page.html.replace(/<[^>]*>/g,' ')).toLowerCase().includes(term))add(data.projects[page.project].title+' / '+page.title,{kind:'page',project:page.project,id:page.id});
  for(const project of Object.values(data.projects))for(const [id,entity]of Object.entries(project.entities))if(count<30&&(id+' '+JSON.stringify(entity)).toLowerCase().includes(term))add(project.title+' / '+(entity.label??id),{kind:'entity',project:project.id,id});
 });
 window.addEventListener('beforeprint',()=>{save();reader.querySelectorAll('details').forEach(d=>d.open=true);reader.querySelectorAll<HTMLElement>('.tab').forEach(t=>t.hidden=false);});
 window.addEventListener('afterprint',()=>{if(current)void display(current,history.state);});
 if(live){
  const findNav=(key:string,nodes:Navigation[]=sidebar):Navigation|undefined=>{for(const node of nodes){if(node.previewKey===key)return node;const found=findNav(key,node.children);if(found)return found;}};
  const navPending=new Set<string>();
  const loadNav=async(key:string,more=false)=>{
   const node=findNav(key);if(!node||navPending.has(key)||!more&&loadedNavigation.has(key))return;navPending.add(key);
   try{const result=await live.request('navigation',{key,more});node.children=result.children;loadedNavigation.add(key);if(!result.more)delete node.resourceChildren;renderSidebar();}
   catch(error){notice.hidden=false;notice.textContent='目录加载失败：'+String(error);}
   finally{navPending.delete(key);}
  };
  toc.addEventListener('toggle',event=>{const details=event.target;if(details instanceof HTMLDetailsElement&&details.open&&details.dataset.previewKey)void loadNav(details.dataset.previewKey);},true);
  toc.addEventListener('click',event=>{const button=(event.target as Element).closest<HTMLElement>('[data-preview-more]');if(button)void loadNav(button.dataset.previewMore!,true);});
  // 预览只展开已经获取的目录，避免“全部展开”隐式请求整个工程树。
  tocActions.querySelector('button')!.textContent='展开已加载目录';
  let checking=false;
  setInterval(async()=>{if(checking)return;checking=true;try{
   const status=await(await fetch('/api/status')).json();
   if(status.version!==data.live!.version){if(status.ready){save();location.reload();}else{notice.hidden=false;notice.textContent=status.error?'工程更新失败：'+status.error:'源文件已变化，正在更新工程索引…';}}
  }catch{notice.hidden=false;notice.textContent='预览服务连接已断开';}finally{checking=false;}},1000);
 }
 const initial=normalize(parseRoute(location.hash)??home);history.replaceState({...(history.state??{}),route:initial},'',routeHash(initial));void display(initial,history.state??undefined);
}
