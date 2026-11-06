import type {Graph,Source} from './types.ts';
import type {Route} from './routes.ts';
export type LinkTarget={kind:'entity';id:string;project?:string}|{kind:'source';id:string;project?:string}|{kind:'page';id:string;anchor?:string;project?:string}|{kind:'pdf';id:string;target?:string;project?:string};
export function entitySource(graph:Graph,id:string):{source:Source;ownerId:string}|undefined{
 const seen=new Set<string>();let current:string|undefined=id;
 while(current&&!seen.has(current)){seen.add(current);const entry=graph.index.get(current);if(entry?.entity.source)return {source:entry.entity.source,ownerId:current};current=entry?.ownerId;}
}
// CLI与浏览器只消费同一声明，不读取HTML或文件系统解析跳转。
export function resolveLinkTarget(graph:Graph,target:LinkTarget):{target:LinkTarget;route:Route;source?:Source;sourceOwnerId?:string}{
 const project=target.project??graph.manifest.projectId;
 if(target.kind!=='source')return {target,route:{...target,project}};
 const value=project===graph.manifest.projectId?entitySource(graph,target.id):undefined;
 const pdf=value?.source.attachment;
 return {target,route:pdf?{kind:'pdf',project:pdf.project??project,id:pdf.id,...(pdf.target?{target:pdf.target}:{})}:{kind:'entity',project,id:value?.ownerId??target.id},...(value?{source:value.source,sourceOwnerId:value.ownerId}:{})};
}
