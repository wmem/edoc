import type {Application} from './prepare.ts';
import {failure} from '../../core/errors.ts';
export type SpecReading={id:string;title:string;content:string;source:{file:string;line?:number};sources:{file:string;line:number}[]};
// 集合的正文只存一次；项目读取与安装手册在请求时采用相同顺序组装。
export function composeSpecifications(content:string,sets:Application[],lookup:(id:string)=>SpecReading){
 const seen=new Set<string>(),sources:{file:string;line:number}[]=[],specifications:{id:string;title:string;source:SpecReading['source'];applications:{for:string;role:'common'|'specific'}[]}[]=[];
 const chunks=[content];
 if(sets.length)chunks.push('适用规范（公共与专属无覆盖关系）：\n\n'+sets.map(set=>`- ${set.for}：公共 ${set.common.join('、')||'无'}；专属 ${set.specific.join('、')||'无'}`).join('\n'));
 for(const set of sets)for(const role of ['common','specific'] as const)for(const id of set[role]){
  let spec=specifications.find(s=>s.id===id);
  if(!spec){const reading=lookup(id);spec={id,title:reading.title,source:reading.source,applications:[]};specifications.push(spec);
   chunks.push(`### ${reading.title} (${id})\n\n来源：${reading.source.file}${reading.source.line?'#L'+reading.source.line:''}\n\n${reading.content}`);
   for(const source of reading.sources)if(!seen.has(source.file)){seen.add(source.file);sources.push(source);}
  }
  if(!spec.applications.some(a=>a.for===set.for&&a.role===role))spec.applications.push({for:set.for,role});
 }
 return {content:chunks.join('\n\n'),specifications,sources,applications:sets.map(s=>({...s,common:[...s.common],specific:[...s.specific]}))};
}
export function selectedApplications(ids:string[],applications:Application[]){
 return [...new Set(ids)].map(id=>{const set=applications.find(set=>set.for===id);if(!set)failure('SPECIFICATION_APPLICATION','<read>','/for','约束集合不存在：'+id);return set;});
}
