// 桌面右侧面板/窄屏页头控制本页规范块，不修改事实或其他 details 的状态。
export function specificationControls(root:HTMLElement,onChange?:()=>void){
 const blocks=()=>[...root.querySelectorAll<HTMLDetailsElement>('details.specification')];
 const cover=root.querySelector<HTMLElement>('header.cover');
 if(!cover||!blocks().length)return ()=>{};
 const toolbar=document.createElement('div');toolbar.className='specification-controls';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label','本页 Spec 显示');
 const expand=document.createElement('button'),collapse=document.createElement('button');
 expand.type=collapse.type='button';expand.textContent='展开 Spec';collapse.textContent='折叠 Spec';
 toolbar.append(expand,collapse);
 const wide=matchMedia('(min-width:1251px)'),sidebar=document.querySelector<HTMLElement>('aside.properties');
 const place=()=>{const target=wide.matches&&sidebar?sidebar:cover;target.prepend(toolbar);cover.classList.toggle('has-specifications',target===cover);};
 wide.addEventListener('change',place);place();
 const update=()=>{const specs=blocks();expand.disabled=specs.every(block=>block.open);collapse.disabled=specs.every(block=>!block.open);};
 const change=(open:boolean)=>{blocks().forEach(block=>block.open=open);update();onChange?.();};
 expand.onclick=()=>change(true);collapse.onclick=()=>change(false);
 const toggled=(event:Event)=>{if(event.target instanceof HTMLDetailsElement&&event.target.matches('.specification')){update();onChange?.();}};
 root.addEventListener('toggle',toggled,true);update();
 return ()=>{wide.removeEventListener('change',place);root.removeEventListener('toggle',toggled,true);toolbar.remove();cover.classList.remove('has-specifications');};
}
