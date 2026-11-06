import type {Graph,RecordEntry} from './types.ts';
import type {LinkTarget} from './link-target.ts';
import {entitySource} from './link-target.ts';
import {validationContext} from './validation-context.ts';
export function validateTarget(graph:Graph,entry:RecordEntry,target:LinkTarget,path:string){
 const {errors,report}=validationContext(graph);if(target.project&&target.project!==graph.manifest.projectId)return errors;
 if(target.kind==='entity'||target.kind==='source'){
  if(!graph.index.has(target.id))report(entry,'LINK_TARGET',path,'本工程目标不存在：'+target.id);
  else if(target.kind==='source'&&!entitySource(graph,target.id))report(entry,'LINK_SOURCE',path,'目标没有声明可追溯的来源：'+target.id);
 }else if(target.kind==='pdf'){
  const pdf=graph.attachments?.[target.id];if(!pdf||target.target&&!Object.hasOwn(pdf.targets,target.target))report(entry,'LINK_ATTACHMENT',path,'PDF附件或位置不存在：'+target.id);
 }else if(!graph.documentPlan?.documents.some(d=>d.file.replace(/\.[^.]+$/,'')===target.id))report(entry,'LINK_PAGE',path,'本工程文章未参与发布：'+target.id);
 return errors;
}
