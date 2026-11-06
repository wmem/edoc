import {validateTarget} from '../../core/link-validation.ts';
import type {Graph} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateTableData(graph:Graph){
 const {errors,report,reference}=validationContext(graph);
 for(const entry of graph.index.values()){
    if(entry.type==='row' && (entry.entity as any).objectId) reference(entry,(entry.entity as any).objectId,'/objectId',['node','port','connection','document','group','interface','register','register-field']);
    if(entry.type==='table') { const table=entry.entity as any;
      for(const row of table.rows){const data=row.objectId?graph.index.get(row.objectId)?.entity:row.values;if(!data)continue;for(const [field,target]of Object.entries(row.links??{})){if(!table.columns.some((c:any)=>c.field===field))report(entry,'TABLE_LINK_COLUMN','/rows','链接没有对应的列字段：'+field);errors.push(...validateTarget(graph,entry,target as import('../../core/link-target.ts').LinkTarget,'/rows/'+row.id+'/links/'+field));}for(const column of table.columns){const value=column.field.split('.').reduce((v:any,k:string)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);if(value!==undefined&&column.type!=='json'&&typeof value!==column.type)report(entry,'TABLE_VALUE','/rows',`行 ${row.id} 的 ${column.field} 与列类型不符`);}}
    }
    if(entry.type==='table') { const cols=(entry.entity as any).columns.map((c:any)=>c.field);if(new Set(cols).size!==cols.length)report(entry,'TABLE_COLUMN','/columns','表格列字段重复'); }
 }
 return errors;
}
