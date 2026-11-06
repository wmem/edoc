import {tableFilter,activeTableFilter,matchesTableFilter,compareTableCells} from '../extensions/data-table/reading.ts';
import type {ColumnType,TableFilter,TableSort,TableReadingState,TableCell} from '../extensions/data-table/reading.ts';
export type TableSnapshot={table:string;instance:number;state:TableReadingState};
export type TableControls={snapshot:()=>TableSnapshot[];reveal:(target:Element)=>void;dispose:()=>void};
let serial=0;
const uniqueId=()=>{let id:string;do{id='edoc-table-control-'+(++serial);}while(document.getElementById(id));return id;};
const button=(text:string,action:()=>void)=>{const element=document.createElement('button');element.type='button';element.textContent=text;element.onclick=action;return element;};

// 只增强data-table；每个出现位置独立持有DOM行和显示状态，不改IR实体。
export function tableControls(root:HTMLElement,options:{state?:TableSnapshot[];onChange?:()=>void}={}):TableControls{
 const counts=new Map<string,number>(),controllers:{snapshot:()=>TableSnapshot;reveal:(target:Element)=>void;dispose:()=>void}[]=[];
 for(const holder of root.querySelectorAll<HTMLElement>('.data-table[data-table]')){
  const id=holder.dataset.table!,instance=counts.get(id)??0;counts.set(id,instance+1);
  const table=holder.querySelector('table'),tbody=table?.tBodies[0],headers=table?[...table.querySelectorAll<HTMLTableCellElement>('thead th')]:[],columns=[...holder.querySelectorAll<HTMLElement>('col[data-field]')].map((el,index)=>({field:el.dataset.field!,type:el.dataset.type as ColumnType,label:headers[index]?.textContent??''}));
  if(!table||!tbody||columns.length!==headers.length||!columns.length)continue;
  const sortable=holder.dataset.sortable!=='false'&&columns.some(c=>c.type!=='json'),filterable=holder.dataset.filterable!=='false';if(!sortable&&!filterable)continue;
  const rows=[...tbody.rows].map((element,index)=>{const missing=new Set((element.dataset.missing??'').split(',').filter(Boolean).map(Number));return {element,index,cells:[...element.cells].map((cell,i):TableCell=>({text:cell.textContent??'',missing:missing.has(i)}))};});
  const previous=options.state?.find(s=>s.table===id&&s.instance===instance)?.state,filters=new Map<string,TableFilter>();let sort:TableSort|undefined;
  if(filterable)for(const column of columns){const value=previous?.filters&&Object.hasOwn(previous.filters,column.field)?previous.filters[column.field]:undefined;if(value){const f=tableFilter(value,column.type);if(activeTableFilter(f)&&!(f.min!==''&&f.max!==''&&Number(f.min)>Number(f.max)))filters.set(column.field,f);}}
  if(sortable&&previous?.sort&&['asc','desc'].includes(previous.sort.direction)&&columns.some(c=>c.field===previous.sort!.field&&c.type!=='json'))sort={...previous.sort};
  const tools=document.createElement('div');tools.className='table-tools';tools.setAttribute('role','group');tools.setAttribute('aria-label',(table.caption?.textContent??id)+'显示操作');
  const status=document.createElement('span');status.className='table-status';status.setAttribute('role','status');tools.append(status);
  const note=document.createElement('p');note.className='table-note';note.setAttribute('role','status');note.hidden=true;
  const panel=document.createElement('form');panel.className='table-filter-panel';panel.hidden=true;panel.id=uniqueId();
  const empty=document.createElement('p');empty.className='table-empty';empty.textContent='没有匹配的行';empty.hidden=true;
  holder.prepend(tools,panel,note);holder.append(empty);
  const sortButtons:(HTMLButtonElement|undefined)[]=[],sortArrows:(HTMLElement|undefined)[]=[],filterButtons:(HTMLButtonElement|undefined)[]=[],originalHeaders=headers.map(th=>th.innerHTML);
  let activeColumn:number|undefined,disposed=false;
  const hidePanel=(focus=false)=>{panel.hidden=true;if(activeColumn!==undefined){filterButtons[activeColumn]?.setAttribute('aria-expanded','false');if(focus)filterButtons[activeColumn]?.focus();}activeColumn=undefined;panel.replaceChildren();};
  const snapshot=():TableSnapshot=>({table:id,instance,state:{...(sort?{sort:{...sort}}:{}),filters:Object.fromEntries([...filters].map(([key,value])=>[key,{...value}]))}});
  let order=rows;
  const update=(reorder=false,notify=true)=>{
   if(disposed)return;
   if(reorder){const index=columns.findIndex(c=>c.field===sort?.field);order=sort&&index>=0?rows.toSorted((a,b)=>compareTableCells(a.cells[index],b.cells[index],columns[index].type,sort!.direction)||a.index-b.index):rows;const fragment=document.createDocumentFragment();for(const row of order)fragment.append(row.element);tbody.append(fragment);}
   let visible=0;for(const row of order){row.element.hidden=!columns.every((c,i)=>!filters.has(c.field)||matchesTableFilter(row.cells[i],c.type,filters.get(c.field)!));if(!row.element.hidden)visible++;}
   status.textContent=`当前 ${visible} / 全部 ${rows.length} 行`;empty.hidden=visible!==0;clear.disabled=filters.size===0;reset.disabled=!sort;
   columns.forEach((column,index)=>{const direction=sort?.field===column.field?sort.direction:undefined;headers[index].setAttribute('aria-sort',direction==='asc'?'ascending':direction==='desc'?'descending':'none');if(sortArrows[index])sortArrows[index]!.textContent=direction==='asc'?'↑':direction==='desc'?'↓':'↕';if(sortButtons[index])sortButtons[index]!.setAttribute('aria-label',`${column.label}：${direction==='asc'?'降序排列':direction==='desc'?'恢复原始顺序':'升序排列'}`);const active=filters.has(column.field);filterButtons[index]?.classList.toggle('is-active',active);filterButtons[index]?.setAttribute('aria-label',`筛选 ${column.label}${active?'（已筛选）':''}`);if(filterButtons[index])filterButtons[index]!.title=`筛选 ${column.label}${active?'（已筛选）':''}`;});
   if(notify)options.onChange?.();
  };
  const clear=button('清空筛选',()=>{filters.clear();hidePanel();note.hidden=true;update();}),reset=button('恢复顺序',()=>{sort=undefined;note.hidden=true;update(true);});
  if(filterable)tools.append(clear);if(sortable)tools.append(reset);
  const showPanel=(index:number)=>{
   if(activeColumn===index&&!panel.hidden){hidePanel(true);return;}hidePanel();activeColumn=index;panel.hidden=false;filterButtons[index]!.setAttribute('aria-expanded','true');
   const column=columns[index],value=filters.get(column.field)??tableFilter({},column.type),title=document.createElement('p');title.className='table-filter-title';title.textContent='筛选：'+column.label;title.id=uniqueId();panel.setAttribute('aria-labelledby',title.id);panel.append(title);
   const fields=document.createElement('div');fields.className='table-filter-fields';panel.append(fields);
   const inputs=new Map<string,HTMLInputElement|HTMLSelectElement>();
   const input=(name:string,label:string,element:HTMLInputElement|HTMLSelectElement)=>{const wrapper=document.createElement('div');wrapper.className='table-filter-field';const caption=document.createElement('label');element.id=uniqueId();caption.htmlFor=element.id;caption.textContent=label;wrapper.append(caption,element);fields.append(wrapper);inputs.set(name,element);return element;};
   const select=(items:[string,string][],value:string)=>{const el=document.createElement('select');for(const [key,text]of items){const option=document.createElement('option');option.value=key;option.textContent=text;el.append(option);}el.value=value;return el;};
   input('mode','字段提供情况',select([['all','全部'],['known','已提供'],['missing','未提供']],value.mode));
   if(column.type==='string'||column.type==='json'){const el=document.createElement('input');el.type='search';el.value=value.text;input('text','包含文字',el);}
   if(column.type==='number')for(const [name,label]of [['min','最小值'],['max','最大值']] as const){const el=document.createElement('input');el.type='number';el.step='any';el.value=value[name];input(name,label,el);}
   if(column.type==='boolean')input('value','取值',select([['','全部'],['true','true'],['false','false']],value.value));
   const enable=()=>{for(const [key,el]of inputs)if(key!=='mode')el.disabled=inputs.get('mode')!.value==='missing';};inputs.get('mode')!.onchange=enable;enable();
   const actions=document.createElement('div');actions.className='table-filter-actions';const apply=document.createElement('button');apply.type='submit';apply.textContent='应用筛选';actions.append(apply,button('清除此列',()=>{filters.delete(column.field);note.hidden=true;hidePanel(true);update();}),button('关闭',()=>hidePanel(true)));panel.append(actions);
   const error=document.createElement('p');error.className='table-filter-error';error.setAttribute('role','alert');panel.append(error);panel.oninput=()=>{error.textContent='';};
   panel.onsubmit=event=>{event.preventDefault();if(!panel.reportValidity())return;const draft=tableFilter(Object.fromEntries([...inputs].map(([key,input])=>[key,input.value])),column.type);if(draft.mode!=='missing'&&draft.min!==''&&draft.max!==''&&Number(draft.min)>Number(draft.max)){error.textContent='最小值不能大于最大值，筛选尚未应用。';return;}if(activeTableFilter(draft))filters.set(column.field,draft);else filters.delete(column.field);note.hidden=true;hidePanel(true);update();};
   panel.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();hidePanel(true);}};(inputs.get(column.type==='number'?'min':column.type==='boolean'?'value':'text')??inputs.get('mode'))!.focus({preventScroll:false});
  };
  columns.forEach((column,index)=>{
   headers[index].dataset.columnType=column.type;
   const heading=document.createElement('div');heading.className='table-column-heading';const label=document.createElement('span');label.textContent=column.label;label.className='table-column-label';
   if(sortable&&column.type!=='json'){const control=button('',()=>{sort=sort?.field!==column.field?{field:column.field,direction:'asc'}:sort.direction==='asc'?{field:column.field,direction:'desc'}:undefined;note.hidden=true;update(true);});control.className='table-sort';const arrow=document.createElement('span');arrow.className='table-sort-arrow';arrow.setAttribute('aria-hidden','true');control.append(label,arrow);control.disabled=rows.length<2;heading.append(control);sortButtons[index]=control;sortArrows[index]=arrow;}else heading.append(label);
   if(filterable){const control=button('',()=>showPanel(index));control.className='table-filter-button';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [key,value]of Object.entries({viewBox:'0 0 16 16',width:'16',height:'16',fill:'none',stroke:'currentColor','stroke-width':'1.4','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))icon.setAttribute(key,value);const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d','M2 3h12L9.5 8.2V13l-3-1.5V8.2Z');icon.append(path);control.append(icon);control.setAttribute('aria-controls',panel.id);control.setAttribute('aria-expanded','false');filterButtons[index]=control;heading.append(control);}
   headers[index].replaceChildren(heading);
  });
  update(!!sort,false);
  controllers.push({snapshot,reveal(target){const row=target.closest('tr');if(row&&rows.some(r=>r.element===row)){if(row.hidden){filters.clear();hidePanel();note.textContent='为显示目标行，已清除本表筛选。';note.hidden=false;update();}row.style.scrollMarginTop=((table.tHead?.getBoundingClientRect().height??0)+8)+'px';}},dispose(){disposed=true;hidePanel();tools.remove();panel.remove();note.remove();empty.remove();rows.forEach(row=>{row.element.hidden=false;tbody.append(row.element);});headers.forEach((th,i)=>{th.innerHTML=originalHeaders[i];th.removeAttribute('aria-sort');delete th.dataset.columnType;});}});
 }
 return {snapshot:()=>controllers.map(c=>c.snapshot()),reveal(target){controllers.forEach(c=>c.reveal(target));},dispose(){controllers.forEach(c=>c.dispose());}};
}
