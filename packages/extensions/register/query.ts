import type {Graph,RecordEntry} from '../../core/types.ts';
import type {Register} from './types.ts';
export function registerLinks(_graph:Graph,entry:RecordEntry):string[]|undefined{
 if(entry.type==='register')return (entry.entity as Register).fields.map(f=>f.id);
 if(entry.type==='register-field')return entry.ownerId?[entry.ownerId]:[];
}
