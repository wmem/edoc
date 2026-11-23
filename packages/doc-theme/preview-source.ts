import type {ReaderData} from '../core/reader-model.ts';
import type {Route} from '../core/routes.ts';

// 只负责传输和请求合并；页面展示、交互及离线读取仍由同一阅读器完成。
export function previewSource(data:ReaderData,onNavigation:(updates:{key:string;children:import('../core/book.ts').Navigation[];more:boolean}[])=>void){
 const version=data.live!.version,pending=new Map<string,Promise<any>>(),loaded=new Set<string>();
 async function request(method:string,args:unknown){
  const response=await fetch('/api/'+method+'?'+new URLSearchParams({version:String(version),args:JSON.stringify(args)}));
  const value=await response.json();if(!response.ok)throw Error(value.error??'预览请求失败');return value;
 }
 return {request,async ensure(route:Route){
  const key=JSON.stringify({...route,anchor:undefined});
  if(loaded.has(key))return route;
  let task=pending.get(key);
  if(!task){task=request('route',{route,known:Object.keys(data.projects)}).then(value=>{
   for(const field of ['pages','projects','resourceBodies','pdfFiles'] as const)if(value.data[field])Object.assign(data[field]??=(Object.create(null)),value.data[field]);
   if(value.data.pdfWorker)data.pdfWorker=value.data.pdfWorker;if(value.data.pdfSupport)data.pdfSupport=value.data.pdfSupport;
   onNavigation(value.navigationTrail??[]);
   loaded.add(key);return value.route as Route;
  });pending.set(key,task);void task.finally(()=>pending.delete(key)).catch(()=>{});}
  return task.then(resolved=>route.kind==='entity'?resolved:route);
 }};
}
