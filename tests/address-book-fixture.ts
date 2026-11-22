import {mkdtempSync,cpSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';

export const composedConfig=resolve('examples/address-space-v2/composed/docs/edoc.config.js');
export const region=(regionId:string)=>({kind:'region' as const,regionId});
export const entry=(entryId:string)=>({kind:'entry' as const,entryId});
export function addressBookFixture(t:{after:(fn:()=>void)=>void}, resources = false, professional = false) {
 const root=mkdtempSync(join(tmpdir(),'edoc-address-book-'));
 cpSync(resolve('examples/address-space-v2/composed'),root,{recursive:true,filter:file=>!file.split('/').includes('output')});
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 if(!professional)for(const file of ['docs/engineering.mdoc','docs/ir/engineering.json'])rmSync(join(root,file),{force:true});
 if(!resources)for(const file of ['docs/index.mdoc','ip/docs/index.mdoc']){const path=join(root,file);writeFileSync(path,readFileSync(path,'utf8').replace(/{%\s*resource-(directory|content|link)\b[\s\S]*?\/%}/g,''));}
 const edit=(file:string,change:(value:any)=>void)=>{const path=join(root,file),value=JSON.parse(readFileSync(path,'utf8'));change(value);writeFileSync(path,JSON.stringify(value,null,2));};
 return {root,edit,load:async()=>loadBook(await resolveProjectConfig(join(root,'docs/edoc.config.js')))};
}
