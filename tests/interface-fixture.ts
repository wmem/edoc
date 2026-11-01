import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,repository} from './helpers.ts';
export function interfaceFixture(t:{after:(fn:()=>void)=>void}){
 const f=fixture(t),data=JSON.parse(JSON.stringify(JSON.parse(readFileSync(join(repository,'examples/gallery/interfaces.json'),'utf8')),(key,value)=>key==='source'?undefined:value));
 f.edit('objects',d=>d.objects=data.objects);f.edit('relations',d=>d.relations=data.relations);f.edit('views',d=>d.views=data.views);
 f.edit('manifest',d=>{d.irVersion='1.1';d.requiredFeatures=['interface-groups'];d.entryDocuments=[];});
 return f;
}
