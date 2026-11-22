import type {ResourceResolver,AddressInstance} from './resolver.ts';
import type {AddressStep,AddressSpace} from './types.ts';
import {addressInteger,hex} from './numeric.ts';
import {FigureError,figureFail} from '../../figure/errors.ts';

export type AddressLeaf={instancePath:AddressStep[];label:string;definitionProjectId:string;definitionId:string;instance?:AddressInstance;status?:string;diagnostic?:unknown};
// 游标是源坐标系的 bit 下界，不是易变的列表下标，也不按数组总数建立索引。
// 每页的扫描预算限制空窗口等稀疏布局的工作量；有后续时明确返回 nextCursor。
export function addressLeaves(resolver:ResourceResolver,originProjectId:string,modelId:string,path:AddressStep[]=[],options:{limit?:number;cursor?:string}={}){
 const limit=options.limit??50;if(!Number.isInteger(limit)||limit<1||limit>100)figureFail('QUERY_LIMIT',modelId,'叶列表 limit 必须为 1..100');
 const seek=options.cursor===undefined?0n:addressInteger(options.cursor,modelId),items:AddressLeaf[]=[],budget=2000;
 type Node={project:string;id:string;translation:bigint;lo:bigint;hi:bigint;path:AddressStep[]};
 type Task={node:Node;key:bigint;family?:{step:AddressStep;start:bigint;span:bigint;stride:bigint;count:bigint;index:bigint;last:bigint;targetProject:string;targetId:string;targetBase:bigint;targetStride:bigint;window:boolean}};
 const queue:Task[]=[],max=(a:bigint,b:bigint)=>a>b?a:b,min=(a:bigint,b:bigint)=>a<b?a:b;
 const floor=(a:bigint,b:bigint)=>a>=0n?a/b:-((-a+b-1n)/b);
 const root=resolver.find(originProjectId,modelId);if(!['address-space','register-block'].includes(root.entry.type))figureFail('QUERY_TYPE',modelId,'叶列表根必须为 AddressSpace/RegisterBlock');const memo=new Map<string,boolean>();
 const hasRegisters=(project:string,id:string):boolean=>{
  const key=JSON.stringify([project,id]);if(memo.has(key))return memo.get(key)!;
  const record=resolver.find(project,id).entry;let has=record.type==='register';
  if(record.type==='register-block')has=resolver.block(project,id).entries.some(item=>hasRegisters(project,item.entry.register??item.entry.block!));
  if(record.type==='address-space')has=resolver.spaceRanges(project,id).some(item=>{if(item.region.kind==='reserved')return false;const target=resolver.resolveRegion(project,id,item.region.id).target!;return hasRegisters(target.graph.manifest.projectId,target.entry.id);});
  memo.set(key,has);return has;
 };
 const pushNode=(node:Node)=>{if(node.hi>max(node.lo,seek)&&hasRegisters(node.project,node.id))queue.push({node,key:max(node.lo,seek)});};
 if(path.length){
  const instance=resolver.resolveInstance(originProjectId,modelId,path),entity=instance.entity,pos=BigInt(instance.projectedRange.startBit),lo=BigInt(instance.visibleRange.startBit),hi=BigInt(instance.visibleRange.endExclusiveBit);
  if(entity.kind==='window'||entity.kind==='resource'){
   const sys=instance.regionCoordinateSystem!,info=resolver.resolveRegion(sys.projectId,sys.addressSpaceId,entity.id),target=info.target!,index=BigInt(path.at(-1)!.index??0);
   pushNode({project:target.graph.manifest.projectId,id:target.entry.id,translation:entity.kind==='window'?pos-info.targetBaseBits-index*info.targetStrideBits:pos-info.resourceOffsetBits,lo:max(lo,pos),hi:min(hi,pos+info.mappedBits),path});
  }else if(instance.definitionType==='register-block')pushNode({project:instance.definitionProjectId!,id:instance.definitionId!,translation:pos,lo,hi,path});
 }else if(root.entry.type==='address-space'){const space=root.entry.entity as AddressSpace,lo=BigInt(space.base)*BigInt(space.addressUnitBits);pushNode({project:originProjectId,id:modelId,translation:0n,lo,hi:lo+BigInt(space.size)*BigInt(space.addressUnitBits),path});}
 else if(root.entry.type==='register-block')pushNode({project:originProjectId,id:modelId,translation:0n,lo:0n,hi:resolver.block(originProjectId,modelId).sizeBits,path});
 const family=(node:Node,data:NonNullable<Task['family']>)=>{
  const lower=max(node.lo,seek),start=data.start+node.translation;
  const first=max(0n,floor(lower-start-data.span,data.stride)+1n),last=min(data.count-1n,floor(node.hi-1n-start,data.stride));
  if(first<=last&&hasRegisters(data.targetProject,data.targetId))queue.push({node,family:{...data,index:first,last},key:max(start+first*data.stride,lower)});
 };
 let scanned=0;
 while(queue.length&&items.length<limit&&scanned<budget){
  queue.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:JSON.stringify(a.family?.step??a.node.path).localeCompare(JSON.stringify(b.family?.step??b.node.path)));
  const task=queue.shift()!,node=task.node;scanned++;
  if(task.family){
   const f=task.family,index=f.index,pos=f.start+node.translation+index*f.stride,step={...f.step,...(f.count>1n?{index:Number(index)}:{})},nextPath=[...node.path,step];
   if(index<f.last)queue.push({node,family:{...f,index:index+1n},key:max(pos+f.stride,max(node.lo,seek))});
   const target=resolver.find(f.targetProject,f.targetId).entry;
   if(target.type==='register'){
    if(max(pos,node.lo)<seek)continue;
    try{const instance=resolver.resolveInstance(originProjectId,modelId,nextPath);items.push({instancePath:nextPath,label:instance.pathLabels.join(' / '),definitionProjectId:f.targetProject,definitionId:f.targetId,instance});}
    catch(error){if(!(error instanceof FigureError)||error.code!=='PARTIAL_REGISTER_WINDOW')throw error;items.push({instancePath:nextPath,label:nextPath.map(s=>s.kind==='entry'?s.entryId:s.regionId).join(' / '),definitionProjectId:f.targetProject,definitionId:f.targetId,status:error.code,diagnostic:error.details});}
   }else pushNode({project:f.targetProject,id:f.targetId,translation:f.window?pos-f.targetBase-index*f.targetStride:pos-f.targetBase,lo:max(node.lo,pos),hi:min(node.hi,pos+f.span),path:nextPath});
  }else{
   const record=resolver.find(node.project,node.id).entry;
   if(record.type==='address-space')for(const range of resolver.spaceRanges(node.project,node.id)){
    if(range.region.kind==='reserved')continue;const info=resolver.resolveRegion(node.project,node.id,range.region.id),target=info.target!;
    family(node,{step:{kind:'region',regionId:range.region.id},start:range.start,span:info.mappedBits,stride:range.stride,count:range.count,index:0n,last:0n,targetProject:target.graph.manifest.projectId,targetId:target.entry.id,targetBase:range.region.kind==='window'?info.targetBaseBits:info.resourceOffsetBits,targetStride:info.targetStrideBits,window:range.region.kind==='window'});
   }
   if(record.type==='register-block')for(const range of resolver.block(node.project,node.id).entries)family(node,{step:{kind:'entry',entryId:range.entry.id},start:range.start,span:range.span,stride:range.stride,count:range.count,index:0n,last:0n,targetProject:node.project,targetId:range.entry.register??range.entry.block!,targetBase:0n,targetStride:0n,window:false});
  }
 }
 const next=queue.length?queue.reduce((a,b)=>a.key<b.key?a:b).key:undefined;
 return {originProjectId,modelId,instancePath:path,addressUnitBits:root.entry.type==='address-space'?(root.entry.entity as AddressSpace).addressUnitBits:resolver.block(originProjectId,modelId).unitBits,order:'origin-bit-address' as const,items,limit,scanned,scanBudget:budget,...(options.cursor!==undefined?{cursor:options.cursor}:{}),hasMore:next!==undefined,...(next!==undefined?{nextCursor:hex(next)}:{})};
}
