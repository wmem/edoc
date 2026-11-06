import type {Table} from './types.ts';
export type ColumnType=Table['columns'][number]['type'];
export type TableFilter={mode:'all'|'known'|'missing';text:string;min:string;max:string;value:''|'true'|'false'};
export type TableSort={field:string;direction:'asc'|'desc'};
export type TableReadingState={sort?:TableSort;filters:Record<string,TableFilter>};
export type TableCell={text:string;missing:boolean};
const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
export function tableFilter(input:Partial<TableFilter>={},type:ColumnType):TableFilter{
 const bound=(value:unknown)=>typeof value==='string'&&value.trim()!==''&&Number.isFinite(Number(value))?value:'';
 if(input.mode==='missing')return {mode:'missing',text:'',min:'',max:'',value:''};
 return {mode:input.mode==='known'?'known':'all',text:(type==='string'||type==='json')&&typeof input.text==='string'?input.text:'',min:type==='number'?bound(input.min):'',max:type==='number'?bound(input.max):'',value:type==='boolean'&&(input.value==='true'||input.value==='false')?input.value:''};
}
export const activeTableFilter=(f:TableFilter)=>f.mode!=='all'||f.text!==''||f.min!==''||f.max!==''||f.value!=='';
export function matchesTableFilter(cell:TableCell,type:ColumnType,f:TableFilter){
 if(f.mode==='missing')return cell.missing;
 if(cell.missing)return f.mode==='all'&&!activeTableFilter(f);
 if(type==='number')return (f.min===''||Number(cell.text)>=Number(f.min))&&(f.max===''||Number(cell.text)<=Number(f.max));
 if(type==='boolean')return f.value===''||cell.text===f.value;
 return cell.text.toLocaleLowerCase().includes(f.text.toLocaleLowerCase());
}
export function compareTableCells(a:TableCell,b:TableCell,type:ColumnType,direction:'asc'|'desc'){
 // 缺失值始终放在末尾；有效空字符串、0、false、null不冒充缺失。
 if(a.missing!==b.missing)return a.missing?1:-1;
 if(a.missing)return 0;
 const value=type==='number'?Number(a.text)-Number(b.text):type==='boolean'?Number(a.text==='true')-Number(b.text==='true'):collator.compare(a.text,b.text);
 return direction==='asc'?value:-value;
}
