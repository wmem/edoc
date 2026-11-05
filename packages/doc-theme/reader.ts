import {specificationControls} from './specification-controls.ts';
import {start} from './client.ts';
import type {InterfaceState} from '../render-graph/interfaces.ts';
import type {InterfaceRenderer} from './client.ts';
import type {PdfReader,PdfPosition} from './pdf-reader.ts';
import type {ReaderData,ReaderPage} from '../core/reader-model.ts';
import {routeHash,parseRoute,targetKey} from '../core/routes.ts';
import type {Route} from '../core/routes.ts';
import {anchor,resolveHTMLAnchor} from '../core/identity.ts';
import {query} from '../core/query.ts';
import type {Graph,RecordEntry} from '../core/types.ts';
import type {Navigation} from '../core/book.ts';
import {sidebarNavigation} from './navigation.ts';

const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const own=<T>(object:Record<string,T>,key:string):T|undefined=>Object.hasOwn(object,key)?object[key]:undefined;
type ReadingState={route:Route;scroll?:number;details?:string[];tabs?:boolean[];graphs?:{figure:number;zoom:number;translation:{tx:number;ty:number}}[];displays?:boolean[];interfaces?:{figure:number;state:InterfaceState}[];pdf?:PdfPosition};
export function startReader(interfaces?:InterfaceRenderer,pdfReader?:PdfReader){
 const data:ReaderData=JSON.parse(document.querySelector('#edoc-book')!.textContent!),reader=document.querySelector<HTMLElement>('#reader')!,toc=document.querySelector<HTMLElement>('#toc')!,pageToc=document.querySelector<HTMLElement>('#page-toc')!,notice=document.querySelector<HTMLElement>('#notice')!,breadcrumbs=document.querySelector<HTMLElement>('#breadcrumbs')!,search=document.querySelector<HTMLInputElement>('#search')!;
 const home:Route={kind:'page',...data.home};let current:Route|undefined,dispose:(()=>void)|undefined,generation=0,currentPdf:PdfPosition|undefined,restoring=false;
 const navigation=(nodes:Navigation[],depth=0):string=>'<ul>'+nodes.map(n=>{const link=n.page?`<a data-outline-link href="${esc(routeHash({kind:'page',project:n.project,id:n.page,...(n.anchor?{anchor:n.anchor}:{})}))}">${esc(n.label)}</a>`:`<span class="nav-group">${esc(n.label)}</span>`;return '<li>'+(n.children.length?'<details'+(depth<1?' open':'')+'><summary>'+link+'</summary>'+navigation(n.children,depth+1)+'</details>':link)+'</li>';}).join('')+'</ul>';
 toc.innerHTML=navigation(sidebarNavigation(data.navigation));
 const tocActions=document.createElement('div');tocActions.className='toc-actions';tocActions.setAttribute('role','group');tocActions.setAttribute('aria-label','文档目录操作');
 for(const [label,open]of [['全部展开',true],['全部折叠',false]]as const){
  const button=document.createElement('button');button.type='button';button.textContent=label;button.setAttribute('aria-controls','toc');button.disabled=!toc.querySelector('details');
  button.onclick=()=>toc.querySelectorAll<HTMLDetailsElement>('details').forEach(details=>details.open=open);tocActions.append(button);
 }
 toc.before(tocActions);
 const queryGraphs=new Map<string,Graph>();
 function evidence(projectId:string,id:string){const source=data.projects[projectId].entities[id]?.source?.attachment;if(!source)return '';return `<a class="source-attachment" href="${esc(routeHash({kind:'pdf',project:source.project??projectId,id:source.id,...(source.target?{target:source.target}:{})}))}">查看原始 PDF${source.target?' · '+esc(source.target):''}</a>`;}
 function facts(projectId:string,id:string){let graph=queryGraphs.get(projectId);if(!graph){const project=data.projects[projectId],index=new Map<string,RecordEntry>(Object.entries(project.entities).map(([key,entity])=>[key,{id:key,entity,...project.records[key]} as RecordEntry])),connections=new Map(Object.entries(project.relations)),interfaceByPort=new Map<string,string>(),adjacency=new Map<string,Set<string>>();for(const entry of index.values())if(entry.type==='interface')for(const port of (entry.entity as any).members)interfaceByPort.set(port,entry.id);for(const relation of connections.values())for(const endpoint of relation.endpoints)for(const key of [endpoint,index.get(endpoint)?.ownerId,interfaceByPort.get(endpoint)])if(key){if(!adjacency.has(key))adjacency.set(key,new Set());adjacency.get(key)!.add(relation.id);}graph={manifest:{projectId,irVersion:project.irVersion,resources:[],entryDocuments:[]},projectRoot:'',irDirectory:'',index,connections,interfaceByPort,adjacency};queryGraphs.set(projectId,graph);}return query(graph,id);}
 document.addEventListener('edoc-selection',event=>{const id=(event as CustomEvent).detail?.id;if(current&&id&&Object.hasOwn(data.projects[current.project].entities,id)){document.querySelector('#properties')!.textContent=JSON.stringify(facts(current.project,id),null,2);document.querySelector('#selection-actions')!.insertAdjacentHTML('beforeend',evidence(current.project,id));}});

 function showMissing(route:Route){notice.replaceChildren(document.createTextNode(`当前生成的页面中没有此内容（${route.project} / ${route.id}${route.target?' / '+route.target:''}）`));const close=document.createElement('button');close.textContent='关闭';close.onclick=()=>notice.hidden=true;notice.append(close);notice.hidden=false;}
 const projectOf=(route:Route)=>own(data.projects,route.project);
 function normalize(route:Route):Route{if(route.kind==='entity'){const unit=projectOf(route),section=unit?own(unit.sections,route.id):undefined;if(section)return {kind:'page',project:route.project,id:section.page,anchor:section.anchor};}return route;}
 function exists(route:Route){const project=projectOf(route);if(!project)return false;if(route.kind==='entity')return route.id===''||Object.hasOwn(project.entities,route.id);if(route.kind==='pdf'){const a=own(project.attachments,route.id);return !!a&&(!route.target||Object.hasOwn(a.targets,route.target));}const page=own(data.pages,targetKey(route.project,route.id));return !!page&&(!route.anchor||!!resolveAnchor(page,route.anchor));}
 function resolveAnchor(page:ReaderPage,id:string){return resolveHTMLAnchor(page.html,id,page.anchorAliases);}
 const figureIndex=(holder:Element|null)=>[...reader.querySelectorAll('[data-diagram]')].indexOf(holder!);
 function save(){if(!current||restoring)return;const state:ReadingState={route:current,scroll:window.scrollY,details:[...reader.querySelectorAll<HTMLDetailsElement>('details[id]')].filter(d=>d.open).map(d=>d.id),tabs:[...reader.querySelectorAll<HTMLElement>('.tab')].map(t=>!!t.hidden),graphs:window.EdocGraphs?.map(g=>({figure:figureIndex(g.container.closest('[data-diagram]')),zoom:g.zoom(),translation:g.translate()})),displays:[...reader.querySelectorAll<HTMLInputElement>('[data-display],input[data-class]')].map(i=>i.checked),interfaces:window.EdocInterfaceViews?.map(v=>({figure:figureIndex(v.holder),state:v.state})),pdf:currentPdf};history.replaceState(state,'');}
 function reveal(page:ReaderPage,id:string){const key=resolveAnchor(page,id),target=key?document.getElementById(key):undefined;if(!target)return;for(let parent:HTMLElement|null=target;parent&&parent!==reader;parent=parent.parentElement){if(parent instanceof HTMLDetailsElement)parent.open=true;if(parent.classList.contains('tab'))parent.hidden=false;}target.scrollIntoView({block:'start'});}
 async function display(route:Route,state?:ReadingState){
  route=normalize(route);if(!exists(route)){if(!current)await display(home);showMissing(route);return;}
  const version=++generation;dispose?.();dispose=undefined;current=route;currentPdf=state?.pdf;window.EdocReady=false;notice.hidden=true;restoring=true;
  document.querySelector('#properties')!.textContent='点击图中对象查看来源与完整关系。';document.querySelector('#selection-actions')!.replaceChildren();document.querySelector<HTMLAnchorElement>('#object-link')!.hidden=true;
  const project=projectOf(route)!;document.body.dataset.readerKind=route.kind;if(route.kind==='pdf')document.title=project.attachments[route.id].title+' · '+data.title;else if(route.kind==='entity')document.title=(project.entities[route.id]?.label??'工程对象')+' · '+data.title;
  breadcrumbs.innerHTML=`<button data-reader-back>返回</button><a href="${esc(routeHash(home))}">${esc(data.title)}</a>${project.id===data.home.project?'':'<span>'+esc(project.title)+'</span>'}<a href="${esc(routeHash({kind:'entity',project:route.project,id:''}))}" data-object-index>工程对象</a>`;
  breadcrumbs.querySelector('button')!.onclick=()=>{if(history.state?.route&&history.length>1)history.back();else navigate(home);};

  if(route.kind==='page'){
   const page=data.pages[targetKey(route.project,route.id)];document.title=page.title+' · '+data.title;
   reader.innerHTML=`<header class="cover"><div class="eyebrow">ENGINEERING DOCUMENT</div><h1>${esc(page.title)}</h1><p>${esc(project.title)} · ${esc(page.file)}</p></header>`+page.html;
   const firstHeading=reader.querySelector<HTMLElement>('article [data-heading-level]');if(firstHeading?.textContent===page.title&&!firstHeading.closest('details'))firstHeading.remove();
   document.querySelector('#edoc-data')!.textContent=JSON.stringify({scenes:page.scenes,entities:project.entities});
   const outline=(nodes:typeof page.outline):Navigation[]=>nodes.map(n=>({label:n.label,project:route.project,page:route.id,anchor:n.id,children:outline(n.children)}));pageToc.innerHTML='<h4>本页目录</h4>'+navigation(outline(page.outline));
   if(state){if(state.details)reader.querySelectorAll<HTMLDetailsElement>('details[id]').forEach(d=>d.open=state.details?.includes(d.id)??false);reader.querySelectorAll<HTMLElement>('.tab').forEach((t,i)=>{if(state.tabs?.[i]!==undefined)t.hidden=state.tabs[i];});}
   const stopGraphs=start(interfaces,{managed:true,initialize:state?.graphs?.map(g=>g.figure)}),stopControls=specificationControls(reader,save);
   // 关闭的规范内图表延迟创建；返回后首次展开时再恢复其已保存状态。
   const restoredInterfaces=new Set((window.EdocInterfaceViews??[]).map(v=>v.holder)),restoredGraphs=new Set(window.EdocGraphs);
   const restoreDeferred=async(event:Event)=>{
    if(!state||!(event.target instanceof HTMLDetailsElement)||!event.target.open)return;
    for(const view of window.EdocInterfaceViews??[])if(!restoredInterfaces.has(view.holder)){
     restoredInterfaces.add(view.holder);const previous=state.interfaces?.find(saved=>saved.figure===figureIndex(view.holder));if(previous)await view.restore?.(previous.state);
    }
    await document.fonts.ready;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));if(version!==generation)return;
    for(const graph of window.EdocGraphs)if(!restoredGraphs.has(graph)){restoredGraphs.add(graph);const previous=state.graphs?.find(saved=>saved.figure===figureIndex(graph.container.closest('[data-diagram]')));if(previous){graph.zoomTo(previous.zoom);graph.translate(previous.translation.tx,previous.translation.ty);}}
    save();
   };
   reader.addEventListener('toggle',restoreDeferred,true);
   dispose=()=>{reader.removeEventListener('toggle',restoreDeferred,true);stopControls();stopGraphs();};
   if(state){
    if(state.interfaces)await Promise.all((window.EdocInterfaceViews??[]).map((v:any)=>{const previous=state.interfaces?.find(saved=>saved.figure===figureIndex(v.holder));return previous?v.restore?.(previous.state):undefined;}));
    if(version!==generation)return;
    reader.querySelectorAll<HTMLInputElement>('[data-display],input[data-class]').forEach((input,i)=>{if(state.displays?.[i]!==undefined&&input.checked!==state.displays[i]){input.checked=state.displays[i];input.dispatchEvent(new Event('change'));}});

   }
   await document.fonts.ready;if(version!==generation)return;await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   window.EdocGraphs?.forEach((g,i)=>{const view=state?.graphs?.find(saved=>saved.figure===figureIndex(g.container.closest('[data-diagram]')));if(view){g.zoomTo(view.zoom);g.translate(view.translation.tx,view.translation.ty);}});
   if(state?.scroll!==undefined)window.scrollTo(0,state.scroll);else if(route.anchor)reveal(page,route.anchor);else window.scrollTo(0,0);
  }else if(route.kind==='entity'){
   if(route.id===''){reader.innerHTML='<article><h1>工程对象 · '+esc(project.title)+'</h1><div class="object-index">'+Object.entries(project.entities).map(([id,e])=>`<a href="${esc(routeHash({kind:'entity',project:route.project,id}))}">${esc(e.label??id)} · ${esc(id)}</a>`).join('')+'</div></article>';pageToc.replaceChildren();window.EdocGraphs=[];restoring=false;window.EdocReady=true;save();return;}
   const entity=project.entities[route.id],detail=facts(route.project,route.id),relations=detail.directRelations;
   reader.innerHTML=`<article><h1>${esc(entity.label??route.id)}</h1><p>${esc(project.title)} · ${esc(route.id)}</p>${evidence(route.project,route.id)}<pre>${esc(JSON.stringify(detail.target,null,2))}</pre><h2>完整直接关系</h2><pre>${esc(JSON.stringify(relations,null,2))}</pre></article>`;pageToc.replaceChildren();window.EdocGraphs=[];window.scrollTo(0,state?.scroll??0);
  }else{
   const attachment=project.attachments[route.id];reader.innerHTML=`<h1>${esc(attachment.title)}</h1><div id="pdf-reader"></div>`;pageToc.replaceChildren();window.EdocGraphs=[];
   if(pdfReader)dispose=pdfReader(reader.querySelector('#pdf-reader')!,attachment,route.target?attachment.targets[route.target]:undefined,data,state?.pdf,position=>{currentPdf=position;if(!restoring)save();});window.scrollTo(0,0);
  }
  if(version!==generation)return;restoring=false;window.EdocReady=true;save();
  document.querySelectorAll<HTMLAnchorElement>('#toc a').forEach(a=>{const dest=parseRoute(a.hash),inPage=route.kind==='page'&&dest?.project===route.project&&dest?.id===route.id;if(inPage)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');if(inPage)for(let parent=a.parentElement;parent&&parent!==toc;parent=parent.parentElement)if(parent instanceof HTMLDetailsElement)parent.open=true;});
 }
 function navigate(route:Route){route=normalize(route);if(!exists(route)){showMissing(route);return;}save();history.pushState({route},'',routeHash(route));void display(route);}
 document.addEventListener('click',event=>{const a=(event.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');if(!a||event.defaultPrevented||event instanceof MouseEvent&&(event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey))return;const href=a.getAttribute('href')!,route=parseRoute(href);if(route){event.preventDefault();navigate(route);}else if(current?.kind==='page'){event.preventDefault();const project=data.projects[current.project],fragment=decodeURIComponent(href.slice(1)),id=Object.keys(project.entities).find(id=>anchor(id)===fragment);navigate(id?{kind:'entity',project:current.project,id}:{...current,anchor:fragment});}});
 window.addEventListener('popstate',()=>{const route=parseRoute(location.hash)??home;void display(route,history.state??undefined);});
 window.addEventListener('hashchange',()=>{const route=parseRoute(location.hash);if(route&&JSON.stringify(route)!==JSON.stringify(current))void display(route,history.state??undefined);});
 let scrollTimer:ReturnType<typeof setTimeout>;window.addEventListener('scroll',()=>{clearTimeout(scrollTimer);scrollTimer=setTimeout(save,100);});
 search.addEventListener('input',()=>{const term=search.value.trim().toLowerCase(),results=document.querySelector('#results')!;results.replaceChildren();if(!term)return;let count=0;const add=(label:string,route:Route)=>{const a=document.createElement('a');a.textContent=label;a.href=routeHash(route);results.append(a);count++;};
  for(const page of Object.values(data.pages))if(count<30&&(page.title+' '+page.file+' '+page.html.replace(/<[^>]*>/g,' ')).toLowerCase().includes(term))add(data.projects[page.project].title+' / '+page.title,{kind:'page',project:page.project,id:page.id});
  for(const project of Object.values(data.projects))for(const [id,entity]of Object.entries(project.entities))if(count<30&&(id+' '+JSON.stringify(entity)).toLowerCase().includes(term))add(project.title+' / '+(entity.label??id),{kind:'entity',project:project.id,id});
 });
 window.addEventListener('beforeprint',()=>{save();reader.querySelectorAll('details').forEach(d=>d.open=true);reader.querySelectorAll<HTMLElement>('.tab').forEach(t=>t.hidden=false);});
 window.addEventListener('afterprint',()=>{if(current)void display(current,history.state);});
 const initial=normalize(parseRoute(location.hash)??home);history.replaceState({...(history.state??{}),route:initial},'',routeHash(initial));void display(initial,history.state??undefined);
}
