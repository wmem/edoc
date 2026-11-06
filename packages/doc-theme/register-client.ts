import type {Graph} from '../core/types.ts';
import type {Register} from '../extensions/register/types.ts';
import {registerSVG} from '../extensions/register/render.ts';
export function registerControls(root:HTMLElement,graph:Graph){
 const abort=new AbortController();
 for(const holder of root.querySelectorAll<HTMLElement>('[data-register]'))holder.querySelector<HTMLButtonElement>('[data-register-export]')?.addEventListener('click',()=>{
  const register=graph.index.get(holder.dataset.register!)?.entity as Register|undefined;if(!register)return;
  const current=[...holder.querySelectorAll<HTMLElement>('[data-register-bits]')].find(e=>e.getClientRects().length),css=document.querySelector('#edoc-document-style')?.textContent??'',fontCSS=(css.match(/@font-face\s*\{[^}]*\}/g)??[]).join('\n');
  const output=registerSVG(register,{project:graph.manifest.projectId,bitsPerRow:Number(current?.dataset.registerBits??16),fontCSS,licenses:JSON.parse(document.querySelector('#edoc-licenses')?.textContent??'{}')}),url=URL.createObjectURL(new Blob([output],{type:'image/svg+xml'})),a=document.createElement('a');a.href=url;a.download=register.id.replace(/[^\w.-]/g,'_')+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 },{signal:abort.signal});
 return ()=>abort.abort();
}
