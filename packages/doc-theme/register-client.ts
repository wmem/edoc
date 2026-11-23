import {documentStyle} from './style-source.ts';
import type {Graph} from '../core/types.ts';
import type {Register} from '../extensions/register/types.ts';
import {registerSVG} from '../extensions/register/render.ts';

export type RegisterSnapshot={presentationId:string;fieldId?:string;focused:boolean;scrolls:{left:number;top:number}[]};
export type RegisterController=(()=>void)&{snapshot:()=>RegisterSnapshot[];restore:(state:RegisterSnapshot[])=>void};

function revealAncestors(target:HTMLElement){
 for(let node:HTMLElement|null=target;node;node=node.parentElement){
  if(node instanceof HTMLDetailsElement)node.open=true;
  if(node.classList.contains('tab')){const siblings=[...(node.parentElement?.children??[])].filter(n=>n.classList.contains('tab'));for(const sibling of siblings)(sibling as HTMLElement).hidden=sibling!==node;}
 }
}
export function registerControls(root:HTMLElement,graph:Graph,options:{reveal?:(target:Element)=>void;onChange?:()=>void}={}):RegisterController{
 const abort=new AbortController(),signal=abort.signal,groups:{snapshot:()=>RegisterSnapshot;restore:(state:RegisterSnapshot)=>void}[]=[];
 for(const holder of root.querySelectorAll<HTMLElement>('[data-register]'))holder.querySelector<HTMLButtonElement>('[data-register-export]')?.addEventListener('click',()=>{
  const register=graph.index.get(holder.dataset.register!)?.entity as Register|undefined;if(!register)return;
  const current=holder.querySelector<HTMLElement>('[data-register-bits]'),css=documentStyle(),fontCSS=(css.match(/@font-face\s*\{[^}]*\}/g)??[]).join('\n');
  // 独立 SVG 不带 HTML 的 presentationId、按钮或页内定位链接。
  const output=registerSVG(register,{project:graph.manifest.projectId,bitsPerRow:Number(current?.dataset.registerBits??32),fontCSS,licenses:JSON.parse(document.querySelector('#edoc-licenses')?.textContent??'{}')}),url=URL.createObjectURL(new Blob([output],{type:'image/svg+xml'})),a=document.createElement('a');
  a.href=url;a.download=register.id.replace(/[^\w.-]/g,'_')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{signal});
 const presentations=new Map<string,HTMLElement[]>();
 for(const element of root.querySelectorAll<HTMLElement>('[data-register-presentation]')){const id=element.dataset.registerPresentation!,items=presentations.get(id)??[];items.push(element);presentations.set(id,items);}
 for(const [presentationId,items]of presentations){
  const diagrams=items.filter(e=>e.hasAttribute('data-register')),tables=items.filter(e=>e.hasAttribute('data-register-table'));
  const sameIdentity=items.every(e=>e.dataset.registerProject===graph.manifest.projectId&&(e.dataset.register??e.dataset.registerTable)===(diagrams[0]?.dataset.register??tables[0]?.dataset.registerTable));
  const paired=diagrams.length===1&&tables.length===1&&sameIdentity,diagram=diagrams[0],table=tables[0];
  const actions=diagrams.flatMap(e=>[...e.querySelectorAll<HTMLElement>('[data-register-field]')]),rows=paired?[...table.querySelectorAll<HTMLElement>('[data-register-field-row]')]:[],targets=[...actions,...rows];
  const fieldId=(node:HTMLElement)=>node.dataset.registerField??node.dataset.registerFieldRow;
  let selected:string|undefined,hovered:string|undefined,focused:string|undefined;
  const update=()=>{const active=hovered??focused??selected;for(const node of targets){node.classList.toggle('register-corresponding',active!==undefined&&fieldId(node)===active);node.classList.toggle('register-selected',selected!==undefined&&fieldId(node)===selected);}};
  const message=(text:string)=>{for(const holder of diagrams){const status=holder.querySelector<HTMLElement>('[data-register-status]');if(status){status.hidden=false;status.textContent=text;}}};
  const locate=(id:string)=>{
   if(!paired){message('无法定位字段：缺少唯一配对的字段表，或呈现身份冲突。重复展示请为图和表声明相同且唯一的 presentation 名称。');return;}
   const matches=rows.filter(row=>fieldId(row)===id);if(matches.length!==1){message('无法定位字段：配对表缺少唯一字段行 '+id+'。');return;}
   const row=matches[0];revealAncestors(row);options.reveal?.(row);
   if(row.hidden){message('无法定位字段：目标行仍被筛选隐藏，字段表 reveal 尚未就绪。');return;}
   selected=id;for(const holder of diagrams){const status=holder.querySelector<HTMLElement>('[data-register-status]');if(status){status.hidden=false;status.textContent='已定位本表字段：'+(row.querySelector('.register-field-name')?.textContent??id)+'。';}}
   update();row.focus({preventScroll:true});row.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});options.onChange?.();
  };
  for(const action of actions){
   const id=fieldId(action)!;
   action.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();locate(id);},{signal});
   action.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.stopPropagation();locate(id);}},{signal});
  }
  for(const node of targets){
   const id=fieldId(node);if(!id)continue;
   node.addEventListener('pointerenter',()=>{hovered=id;update();},{signal});
   node.addEventListener('pointerleave',()=>{hovered=undefined;update();},{signal});
   node.addEventListener('focusin',()=>{focused=id;hovered=undefined;update();},{signal});
   node.addEventListener('focusout',()=>{focused=undefined;update();},{signal});
  }
  const scrolls=[...(diagram?.querySelectorAll<HTMLElement>('.register-scroll')??[]),...(table?.querySelectorAll<HTMLElement>('.data-table-scroll')??[])];
  groups.push({snapshot:()=>({presentationId,...(selected?{fieldId:selected}:{}),focused:rows.some(row=>row===document.activeElement||row.contains(document.activeElement)),scrolls:scrolls.map(e=>({left:e.scrollLeft,top:e.scrollTop}))}),restore(state){
   selected=state.fieldId;update();const row=rows.find(r=>fieldId(r)===selected);
   if(row&&state.focused){revealAncestors(row);row.focus({preventScroll:true});}
   scrolls.forEach((element,index)=>{const value=state.scrolls?.[index];if(value){element.scrollLeft=value.left;element.scrollTop=value.top;}});
  }});
 }
 return Object.assign(()=>abort.abort(),{snapshot:()=>groups.map(g=>g.snapshot()),restore:(state:RegisterSnapshot[])=>{for(const group of groups){const previous=state.find(s=>s.presentationId===group.snapshot().presentationId);if(previous)group.restore(previous);}}});
}
