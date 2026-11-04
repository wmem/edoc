import type {Graph,RecordEntry,Diagnostic} from './types.ts';

export function validationContext(graph:Graph){
 const errors:Diagnostic[]=[];
 const report=(entry:RecordEntry,code:string,path:string,message:string)=>errors.push({code,file:entry.location.file,path:entry.location.path+path,id:entry.id,message});
 const reference=(entry:RecordEntry,id:string,path:string,types:readonly RecordEntry['type'][])=>{
  const target=graph.index.get(id);
  if(!target)report(entry,'REFERENCE_MISSING',path,'引用不存在：'+id);
  else if(!types.includes(target.type))report(entry,'REFERENCE_TYPE',path,`引用 ${id} 需要 ${types.join('/')}，实际为 ${target.type}`);
 };
 return {errors,report,reference};
}
