import type {Graph} from '../core/types.ts';
import type {Register} from '../extensions/register/types.ts';
import {registerSVG} from '../extensions/register/render.ts';

export function registerControls(root:HTMLElement,graph:Graph){
 const abort=new AbortController();
 for(const holder of root.querySelectorAll<HTMLElement>('[data-register]'))holder.querySelector<HTMLButtonElement>('[data-register-export]')?.addEventListener('click',()=>{
  const register=graph.index.get(holder.dataset.register!)?.entity as Register|undefined;if(!register)return;
  const current=holder.querySelector<HTMLElement>('[data-register-bits]'),css=document.querySelector('#edoc-document-style')?.textContent??'',fontCSS=(css.match(/@font-face\s*\{[^}]*\}/g)??[]).join('\n');
  const output=registerSVG(register,{project:graph.manifest.projectId,bitsPerRow:Number(current?.dataset.registerBits??32),fontCSS,licenses:JSON.parse(document.querySelector('#edoc-licenses')?.textContent??'{}')}),url=URL.createObjectURL(new Blob([output],{type:'image/svg+xml'})),a=document.createElement('a');
  a.href=url;a.download=register.id.replace(/[^\w.-]/g,'_')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{signal:abort.signal});

 // 图和同一位置的字段表按稳定字段 ID 联动；不拦截链接，点击仍进入字段详情。
 const lastDiagram=new Map<string,HTMLElement>();
 for(const element of root.querySelectorAll<HTMLElement>('[data-register], [data-register-table]')){
  if(element.dataset.register){lastDiagram.set(element.dataset.register,element);continue;}
  const diagram=lastDiagram.get(element.dataset.registerTable??'');if(!diagram)continue;
  const targets=[...diagram.querySelectorAll<HTMLElement>('[data-register-field]'),...element.querySelectorAll<HTMLElement>('[data-register-field-row]')];
  const fieldId=(node:HTMLElement)=>node.dataset.registerField??node.dataset.registerFieldRow;
  const activate=(id:string|undefined)=>{for(const node of targets)node.classList.toggle('register-corresponding',id!==undefined&&fieldId(node)===id);};
  for(const node of targets){
   const id=fieldId(node);if(!id)continue;
   node.addEventListener('pointerenter',()=>activate(id),{signal:abort.signal});
   node.addEventListener('pointerleave',()=>activate(undefined),{signal:abort.signal});
   node.addEventListener('focusin',()=>activate(id),{signal:abort.signal});
   node.addEventListener('focusout',()=>activate(undefined),{signal:abort.signal});
  }
 }
 return ()=>abort.abort();
}
