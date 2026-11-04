import type {Graph,RecordEntry,Table,Row} from '../../core/types.ts';
export function tableLinks(_graph:Graph,entry:RecordEntry):string[]|undefined{
 if(entry.type==='table')return (entry.entity as Table).rows.map(row=>row.id);
 if(entry.type==='row'){const row=entry.entity as Row;return row.objectId?[row.objectId]:[];}
 return undefined;
}
