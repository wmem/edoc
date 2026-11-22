import {anchor} from '../../core/identity.ts';

// 呈现身份来自显式名与定义身份，不使用内容 hash 或运行时 DOM 相邻关系。
export const registerPresentationId=(project:string,register:string,key='default')=>'register-presentation-'+anchor(JSON.stringify([project,register,key]));
export type RegisterPresentationRequest<T>={node:T;register:string;kind:'diagram'|'table';scope:string;name?:string};
export function planRegisterPresentations<T>(project:string,requests:RegisterPresentationRequest<T>[]){
 const groups=new Map<string,RegisterPresentationRequest<T>[]>(),result=new Map<T,string>();
 for(const request of requests){if(request.name!==undefined&&!request.name.trim())throw new Error('REGISTER_PRESENTATION '+project+'/'+request.scope+'：presentation 必须是非空稳定名称');const key=JSON.stringify([request.scope,request.register,request.name??null]);const group=groups.get(key)??[];group.push(request);groups.set(key,group);}
 for(const group of groups.values()){
  const first=group[0],diagrams=group.filter(r=>r.kind==='diagram'),tables=group.filter(r=>r.kind==='table'),ambiguous=diagrams.length>1||tables.length>1;
  if(first.name!==undefined&&ambiguous)throw new Error('REGISTER_PRESENTATION '+project+'/'+first.scope+'：同一 presentation 不能重复声明图或表：'+first.name+' / '+first.register);
  for(const [index,request]of group.entries()){
   // 默认多组没有作者配对意图：各自隔离并在点击时提示缺少配对，严禁猜测最近或第 N 张图。
   const key=JSON.stringify([request.scope,request.name??'default',...(ambiguous?[request.kind,index]:[])]);
   result.set(request.node,registerPresentationId(project,request.register,key));
  }
 }
 return result;
}
