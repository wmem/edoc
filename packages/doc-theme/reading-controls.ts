type Options={numbers?:boolean;onChange?:()=>void};
// 同一面板按作用范围排列操作；目录、正文、规范和代码互不改写折叠状态。
export function readingControls(root:HTMLElement,options:Options={}){
 const cover=root.querySelector<HTMLElement>('header.cover');if(!cover)return ()=>{};
 const panel=document.createElement('details');panel.className='reading-controls';panel.setAttribute('aria-label','本页阅读设置');
 const title=document.createElement('summary');title.textContent='本页阅读';panel.append(title);
 const controls=document.createElement('div');controls.className='reading-control-content';panel.append(controls);
 const groups:{elements:()=>HTMLDetailsElement[];expand:HTMLButtonElement;collapse:HTMLButtonElement}[]=[];
 const add=(label:string,scope:string,elements:()=>HTMLDetailsElement[])=>{
  if(!elements().length)return;
  const row=document.createElement('div');row.className='reading-control-row';row.dataset.readingScope=scope;row.setAttribute('role','group');row.setAttribute('aria-label',label+'显示');
  const name=document.createElement('span');name.textContent=label;row.append(name);
  const expand=document.createElement('button'),collapse=document.createElement('button');expand.type=collapse.type='button';expand.textContent='展开';collapse.textContent='折叠';
  expand.setAttribute('aria-label','展开'+(scope==='spec'?' Spec':label));collapse.setAttribute('aria-label','折叠'+(scope==='spec'?' Spec':label));
  const change=(open:boolean)=>{elements().forEach(element=>element.open=open);update();options.onChange?.();};
  expand.onclick=()=>change(true);collapse.onclick=()=>change(false);row.append(expand,collapse);controls.append(row);groups.push({elements,expand,collapse});
 };
 add('正文','body',()=>[...root.querySelectorAll<HTMLDetailsElement>('details[data-heading-section]')]);
 add('Spec','spec',()=>[...root.querySelectorAll<HTMLDetailsElement>('details.specification')]);
 add('代码','code',()=>[...root.querySelectorAll<HTMLDetailsElement>('details[data-code-block]')]);
 const toc=document.querySelector<HTMLElement>('#page-toc');
 add('页内目录','outline',()=>[...toc?.querySelectorAll<HTMLDetailsElement>('details')??[]]);
 const hasNumbers=!!root.querySelector('.heading-number');
 if(!groups.length&&!hasNumbers)return ()=>{};
 const numbers=document.createElement('input');numbers.type='checkbox';numbers.checked=options.numbers??true;
 const numbering=document.createElement('label');numbering.className='reading-numbering';numbering.append(numbers,document.createTextNode('显示标题编号'));
 if(hasNumbers)controls.append(numbering);
 const showNumbers=()=>document.body.classList.toggle('heading-numbers-hidden',!numbers.checked);showNumbers();
 numbers.onchange=()=>{showNumbers();options.onChange?.();};
 const wide=matchMedia('(min-width:1251px)'),sidebar=document.querySelector<HTMLElement>('aside.properties');panel.open=wide.matches;
 const place=()=>{const target=wide.matches&&sidebar?sidebar:cover;target.prepend(panel);cover.classList.toggle('has-reading-controls',target===cover);};
 const resized=()=>{panel.open=wide.matches;place();};wide.addEventListener('change',resized);place();
 function update(){for(const group of groups){const nodes=group.elements();group.expand.disabled=nodes.every(node=>node.open);group.collapse.disabled=nodes.every(node=>!node.open);}}
 const toggled=(event:Event)=>{if(event.target instanceof HTMLDetailsElement&&event.target!==panel){update();options.onChange?.();}};
 root.addEventListener('toggle',toggled,true);toc?.addEventListener('toggle',toggled,true);update();
 return ()=>{wide.removeEventListener('change',resized);root.removeEventListener('toggle',toggled,true);toc?.removeEventListener('toggle',toggled,true);panel.remove();cover.classList.remove('has-reading-controls');};
}
