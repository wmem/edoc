import type {Application} from './prepare.ts';
import {failure} from '../../core/errors.ts';
export type ClauseBody={id:string;title:string;content:string;source:{file:string;line?:number};sources:{file:string;line:number}[]};
// 集合的正文只存一次；项目读取与安装手册在请求时采用相同顺序组装。
export function composeClauses(content:string,sets:Application[],lookup:(id:string)=>ClauseBody,options:{inlineIds?:string[]}={}){
 const seen=new Set<string>(),sources:{file:string;line:number}[]=[],ids=new Set<string>();
 const chunks=[content];
 if(sets.length)chunks.push('适用的引用条款：\n\n'+sets.map(set=>`- ${set.for}：${set.ids.join('、')||'无'}`).join('\n'));
 for(const set of sets)for(const id of set.ids){
  if(ids.has(id))continue;ids.add(id);
  const reading=lookup(id);
  if(!options.inlineIds?.includes(id))chunks.push(`### ${reading.title} (${id})\n\n来源：${reading.source.file}${reading.source.line?'#L'+reading.source.line:''}\n\n${reading.content}`);
  for(const source of reading.sources)if(!seen.has(source.file)){seen.add(source.file);sources.push(source);}
 }
 return {content:chunks.join('\n\n'),sources,applications:sets.map(s=>({...s,ids:[...s.ids]}))};
}
export function selectedApplications(ids:string[],applications:Application[]){
 return [...new Set(ids)].map(id=>{const set=applications.find(set=>set.for===id);if(!set)failure('CLAUSE_APPLICATION','<read>','/for','条款集合不存在：'+id);return set;});
}
