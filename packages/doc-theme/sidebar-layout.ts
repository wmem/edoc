// 侧栏宽度是阅读偏好；与项目数据、文章路由和图形状态分开保存。
export function sidebarLayout(){
 const sidebar=document.querySelector<HTMLElement>('nav.sidebar'),main=document.querySelector<HTMLElement>('main'),toc=document.querySelector<HTMLElement>('#toc');
 if(!sidebar||!main||!toc||document.querySelector('.sidebar-resizer'))return ()=>{};
 const initial=244,minimum=200,wide=matchMedia('(min-width:751px)'),key='edoc.sidebar-width:'+location.pathname;
 let preferred=initial;
 try{const saved=Number(localStorage.getItem(key));if(Number.isFinite(saved)&&saved>=minimum)preferred=saved;}catch{/* 离线环境可能禁用存储，仍可使用当前会话的宽度。 */}
 const handle=document.createElement('div');handle.className='sidebar-resizer';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-label','调整目录宽度');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-controls','toc');handle.title='拖动或按左右方向键调整目录宽度；双击恢复默认';sidebar.after(handle);
 const abort=new AbortController(),listen={signal:abort.signal};
 let drag:{pointer:number;x:number;width:number;previous:number}|undefined;
 const maximum=()=>{
  const style=getComputedStyle(main),gap=Math.max(0,parseFloat(style.marginLeft)-sidebar.getBoundingClientRect().width);
  return Math.max(minimum,Math.floor(document.documentElement.clientWidth-parseFloat(style.marginRight)-gap-360));
 };
 const width=()=>sidebar.getBoundingClientRect().width;
 const apply=()=>{
  if(!wide.matches)return;
  const max=maximum(),value=Math.round(Math.min(max,Math.max(minimum,preferred)));
  document.documentElement.style.setProperty('--sidebar-width',value+'px');
  handle.setAttribute('aria-valuemin',String(minimum));handle.setAttribute('aria-valuemax',String(max));handle.setAttribute('aria-valuenow',String(value));handle.setAttribute('aria-valuetext',`目录宽度 ${value} 像素`);
 };
 const save=()=>{try{localStorage.setItem(key,String(width()));}catch{/* 存储失败不影响拖拽和阅读。 */}};
 const finish=(commit:boolean)=>{
  if(!drag)return;const previous=drag;drag=undefined;
  document.body.classList.remove('sidebar-resizing');if(handle.hasPointerCapture(previous.pointer))handle.releasePointerCapture(previous.pointer);
  if(commit)save();else{preferred=previous.previous;apply();}
 };
 handle.addEventListener('pointerdown',event=>{
  if(event.button!==0||!wide.matches)return;event.preventDefault();handle.focus({preventScroll:true});drag={pointer:event.pointerId,x:event.clientX,width:width(),previous:preferred};handle.setPointerCapture(event.pointerId);document.body.classList.add('sidebar-resizing');
 },listen);
 handle.addEventListener('pointermove',event=>{if(drag?.pointer!==event.pointerId)return;preferred=Math.min(maximum(),Math.max(minimum,drag.width+event.clientX-drag.x));apply();},listen);
 handle.addEventListener('pointerup',event=>{if(drag?.pointer===event.pointerId)finish(true);},listen);
 handle.addEventListener('pointercancel',()=>finish(false),listen);handle.addEventListener('lostpointercapture',()=>finish(false),listen);
 handle.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&drag){event.preventDefault();finish(false);return;}
  if(!wide.matches||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
  event.preventDefault();preferred=event.key==='Home'?minimum:event.key==='End'?maximum():width()+(event.key==='ArrowRight'?1:-1)*(event.shiftKey?48:16);preferred=Math.min(maximum(),Math.max(minimum,preferred));apply();save();
 },listen);
 handle.addEventListener('dblclick',()=>{preferred=initial;apply();save();},listen);
 window.addEventListener('resize',()=>{finish(false);apply();},listen);
 const changes=new MutationObserver(apply);changes.observe(document.body,{attributes:true,attributeFilter:['data-reader-kind']});
 let viewportWidth=document.documentElement.clientWidth;const viewport=new ResizeObserver(()=>{const current=document.documentElement.clientWidth;if(current!==viewportWidth){viewportWidth=current;apply();}});viewport.observe(document.documentElement);apply();
 return ()=>{finish(false);changes.disconnect();viewport.disconnect();abort.abort();handle.remove();document.documentElement.style.removeProperty('--sidebar-width');};
}
