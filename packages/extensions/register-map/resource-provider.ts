import type {Graph,RecordEntry,RegisterBlock,AddressSpace} from '../../core/types.ts';
import type {ResourceProvider,ResourceContext,ResourceTarget,ResourceView,ResourceChild} from '../../core/resource-types.ts';
import {addressLeaves} from './leaves.ts';
import {createAddressResolver} from './resolver.ts';
import type {AddressInstance} from './resolver.ts';
import type {AddressStep} from './types.ts';
import {instanceIndex,coordinate,hex} from './numeric.ts';
import {parseInstancePath} from './model.ts';
import {FigureError,figureFail} from '../../figure/errors.ts';

function container(context:ResourceContext,target:ResourceTarget,instance?:AddressInstance):{graph:Graph;entry:RecordEntry}|undefined{
 const graph=context.projects.get(target.project)!,resolver=createAddressResolver(graph);
 if(!instance)return resolver.find(target.project,target.kind==='definition'?target.id:target.space);
 const entity=instance.entity;
 if(entity.kind==='resource'||entity.kind==='window'){
  const system=instance.regionCoordinateSystem!,info=resolver.resolveRegion(system.projectId,system.addressSpaceId,entity.id);
  return info.target;
 }
 if(instance.definitionId)return resolver.find(instance.definitionProjectId!,instance.definitionId);
}
const rootId=(target:ResourceTarget)=>target.kind==='definition'?target.id:target.space;
function addressTarget(context:ResourceContext,target:ResourceTarget){
 const graph=context.projects.get(target.project)!,resolver=createAddressResolver(graph);
 if(target.kind==='definition')return {target,current:container(context,target)!};
 if(!target.segments.length)return {target:{kind:'definition' as const,project:target.project,id:target.space},current:container(context,target)!};
 const steps=parseInstancePath(JSON.stringify(target.segments)),segments:AddressStep[]=[];
 let current=container(context,target);
 for(const step of steps){
  if(step.kind==='region'&&current?.entry.type==='address-space'){
   const info=resolver.resolveRegion(current.graph.manifest.projectId,current.entry.id,step.regionId),index=instanceIndex(step,info.region);
   segments.push({kind:'region',regionId:step.regionId,...((info.region.count??1)>1?{index:Number(index)}:{})});current=info.target;
  }else if(step.kind==='entry'&&current?.entry.type==='register-block'){
   const item=resolver.block(current.graph.manifest.projectId,current.entry.id).entries.find(item=>item.entry.id===step.entryId);
   if(!item)figureFail('ADDRESS_PATH',current.entry.id,'Block entry 不存在：'+step.entryId);
   const index=instanceIndex(step,item.entry);segments.push({kind:'entry',entryId:step.entryId,...(item.count>1n?{index:Number(index)}:{})});
   current=resolver.target(current.graph.manifest.projectId,{id:item.entry.register??item.entry.block!},item.entry.register?['register']:['register-block']);
  }else figureFail('ADDRESS_PATH',rootId(target),'步骤类型与当前资源不匹配');
 }
 const instance=resolver.resolveInstance(target.project,target.space,segments);
 return {target:{...target,segments} as ResourceTarget,current:container(context,target,instance),instance};
}
export const addressResourceProvider:ResourceProvider={
 id:'address-resources',
 list(context,target,options){
  const normalized=addressTarget(context,target),current=normalized.current;
  if(!current||!['address-space','register-block'].includes(current.entry.type))return;
  target=normalized.target;
  const page=addressLeaves(createAddressResolver(context.projects.get(target.project)!),target.project,rootId(target),target.kind==='instance'?parseInstancePath(JSON.stringify(target.segments)):[],options);
  return {title:'可见寄存器 · 穿越所有 Window',columns:[{key:'relative',label:'所属 Region / 根块内偏移'},{key:'coordinate',label:normalized.instance?.addressSpaceId||context.projects.get(target.project)!.index.get(rootId(target))!.type==='address-space'?'源空间绝对坐标':'根 Block 相对坐标'},{key:'native',label:'声明 Block 原生偏移'},{key:'definition',label:'定义归属'},{key:'description',label:'用途 / 诊断'}],
   items:page.items.map(item=>{const instance=item.instance,diagnostic=item.diagnostic as {slot:{startBit:string;endExclusiveBit:string};visible:{startBit:string;endExclusiveBit:string}}|undefined,display=(value:import('./types.ts').AddressCoordinate|undefined)=>value?(value.address??value.unitIndex+' + '+value.subUnitBitOffset+' bit')+' × '+value.addressUnitBits+' bit':'—';return {key:JSON.stringify(item.instancePath),label:item.label,target:{kind:'instance' as const,project:target.project,space:rootId(target),segments:item.instancePath},count:'1',status:item.status,error:item.status?'完整槽位被 Window 截断；不可作为完整寄存器访问':undefined,coordinate:instance?.coordinate,values:{relative:display(instance?.regionOffset??instance?.relativeOffset),coordinate:display(instance?.coordinate??(diagnostic?coordinate(BigInt(diagnostic.visible.startBit),page.addressUnitBits):undefined)),native:instance?.nativeOffset?instance.nativeOffset.value+' × '+instance.nativeOffset.addressUnitBits+' bit':'—',definition:item.definitionProjectId+'/'+item.definitionId,description:diagnostic?'完整槽位 ['+diagnostic.slot.startBit+', '+diagnostic.slot.endExclusiveBit+') bit；仅可见 ['+diagnostic.visible.startBit+', '+diagnostic.visible.endExclusiveBit+') bit。':instance?.entity.description??'未声明'}};}),cursor:page.cursor,nextCursor:page.nextCursor,hasMore:page.hasMore,notice:'按源 bit 坐标升序，每页最多 '+page.limit+' 项。重复实例按需读取；'+(page.hasMore?'后续仍有待查看范围，可继续或输入源位坐标定位。':'已查看到本范围末尾。')};
 },
 validateContent(context,target){if(target.kind==='instance'&&context.projects.get(target.project)?.index.get(target.space)?.type!=='address-space')figureFail('RESOURCE_TARGET',target.space,'实例正文绑定的 space 必须是 AddressSpace；独立 Block 使用定义正文绑定');},
 accepts:record=>['address-space','register-block','register','memory'].includes(record.type),
 resolve(context,target,options):ResourceView{
  const normalized=addressTarget(context,target);target=normalized.target;
  const {instance,current}=normalized,origin=context.projects.get(target.project)!,resolver=createAddressResolver(origin),rootId=target.kind==='definition'?target.id:target.space;
  const initial=resolver.find(target.project,rootId),definition=instance?.definitionId?{project:instance.definitionProjectId!,id:instance.definitionId}:target.kind==='definition'?{project:target.project,id:target.id}:undefined;
  const entity=instance?.entity??initial.entry.entity,type=instance?.kind==='memory-slice'?'memory':(('kind' in entity?entity.kind:undefined)??initial.entry.type);
  const prefix=target.kind==='instance'?target.segments:[];
  const children:ResourceChild[]=[];
  const candidates=current?.entry.type==='address-space'?(current.entry.entity as AddressSpace).regions.map(region=>({key:region.id,label:region.label,count:region.count??1,start:BigInt(region.base),step:{kind:'region' as const,regionId:region.id}})):current?.entry.type==='register-block'?(current.entry.entity as RegisterBlock).entries.map(entry=>({key:entry.id,label:entry.label??current!.graph.index.get(entry.register??entry.block!)!.entity.label??entry.id,count:entry.count??1,start:BigInt(entry.offset),step:{kind:'entry' as const,entryId:entry.id}})):[];
  // Reserved 和 Memory 是终点；Window 的 children 来自目标空间而完整路径仍从源空间开始。
  if(type!=='reserved'&&type!=='memory')for(const item of candidates.sort((a,b)=>a.start<b.start?-1:a.start>b.start?1:(a.key<b.key?-1:a.key>b.key?1:0)).slice(options.offset,options.offset+options.limit)){
   let firstIndex=0n;
   // Window 可能只看见数组中段；汇总入口选择首个相交实例，不能因 index=0 不可见而丢掉整组。
   if(instance&&current&&item.count>1){
    let translation=BigInt(instance.projectedRange.startBit),lo=BigInt(instance.visibleRange.startBit),hi=BigInt(instance.visibleRange.endExclusiveBit);
    const system=instance.regionCoordinateSystem;
    if(('kind'in entity)&&(entity.kind==='window'||entity.kind==='resource')&&system){
     const info=resolver.resolveRegion(system.projectId,system.addressSpaceId,entity.id),index=BigInt(prefix.at(-1)?.index as number??0);
     translation-=entity.kind==='window'?info.targetBaseBits+index*info.targetStrideBits:info.resourceOffsetBits;
     hi=hi<BigInt(instance.projectedRange.startBit)+info.mappedBits?hi:BigInt(instance.projectedRange.startBit)+info.mappedBits;
    }
    const range=current.entry.type==='address-space'?resolver.spaceRanges(current.graph.manifest.projectId,current.entry.id).find(r=>r.region.id===item.key):resolver.block(current.graph.manifest.projectId,current.entry.id).entries.find(r=>r.entry.id===item.key);
    if(range){const start=translation+range.start,delta=lo-start-range.span,div=delta>=0n?delta/range.stride:-((-delta+range.stride-1n)/range.stride);firstIndex=div+1n;if(firstIndex<0n)firstIndex=0n;if(firstIndex>=range.count||start+firstIndex*range.stride>=hi)firstIndex=0n;}
   }
   const child:ResourceTarget={kind:'instance',project:target.project,space:rootId,segments:[...prefix,{...item.step,...(item.count>1?{index:Number(firstIndex)}:{})}]};
   try{const result=addressTarget(context,child).instance!,declared=current!.entry.entity as AddressSpace|RegisterBlock,display=(value:ReturnType<typeof coordinate>)=>value.address??value.unitIndex+' + '+value.subUnitBitOffset+' bit',values:Record<string,string>={coordinate:display(result.coordinate)+' × '+result.addressUnitBits+' bit',visibility:result.partial?'部分可见':'完整可见'};
    if(declared.kind==='address-space'){
     const region=declared.regions.find(r=>r.id===item.key)!,info=resolver.resolveRegion(current!.graph.manifest.projectId,declared.id,region.id);
     Object.assign(values,{base:region.base+' × '+declared.addressUnitBits+' bit',allocation:region.size,mapped:region.kind==='reserved'?'—':hex(info.mappedBits/BigInt(declared.addressUnitBits)),type:region.kind==='window'?'window':info.target?.entry.type??region.kind,target:info.target?info.target.graph.manifest.projectId+'/'+info.target.entry.id:'—',description:region.description??(info.target?.entry.entity as {description?:string}|undefined)?.description??'未声明',repeat:String(region.count??1)+(region.stride?' / '+region.stride:''),offset:region.kind==='resource'?(region.resourceOffset??'0')+' × '+(info.target?.entry.type==='memory'?8:(info.target?.entry.entity as RegisterBlock).addressUnitBits??8)+' bit':region.kind==='window'?region.targetBase+' × '+(info.target!.entry.entity as AddressSpace).addressUnitBits+' bit':'—'});
    }else if(declared.kind==='register-block'){
     const layout=resolver.block(current!.graph.manifest.projectId,declared.id),item=layout.entries.find(e=>e.entry.id===child.segments.at(-1)!.entryId)!,target=current!.graph.index.get(item.entry.register??item.entry.block!)!;
     Object.assign(values,{offset:item.entry.offset+' × '+layout.unitBits+' bit',span:hex(item.span/BigInt(layout.unitBits)),type:target.type,description:(target.entity as {description?:string}).description??'未声明',repeat:String(item.count)+' / '+hex(item.stride/BigInt(layout.unitBits)),width:target.type==='register'?String((target.entity as import('../register/types.ts').Register).width):'—'});
    }
    children.push({key:item.key,label:item.label,target:child,count:String(item.count),firstIndex:firstIndex.toString(),coordinate:result.coordinate,values});}
   catch(error){if(!(error instanceof FigureError))throw error;children.push({key:item.key,label:item.label,target:child,count:String(item.count),firstIndex:firstIndex.toString(),status:error.code,error:error.message});}
  }
  let facts:unknown=instance??{definition:initial.entry.entity,location:initial.entry.location};
  if(type==='register-block'&&target.kind==='definition')facts={definition:initial.entry.entity,nativeSizeBits:resolver.block(target.project,target.id).sizeBits.toString(),effectiveAccessPolicy:resolver.policy(target.project,initial.entry.entity as RegisterBlock),addressMode:'relative'};
  if(instance&&('kind'in entity)&&(entity.kind==='window'||entity.kind==='resource')){
   const system=instance.regionCoordinateSystem!,info=resolver.resolveRegion(system.projectId,system.addressSpaceId,entity.id);
   facts={...instance,...(info.target?.entry.type==='register-block'?{effectiveAccessPolicy:resolver.policy(info.target.graph.manifest.projectId,info.target.entry.entity as RegisterBlock)}:{}),mapping:info.target?{targetProject:info.target.graph.manifest.projectId,targetId:info.target.entry.id,targetType:info.target.entry.type,targetDefinition:info.target.entry.entity,targetBaseBits:info.targetBaseBits.toString(),targetStrideBits:info.targetStrideBits.toString(),mappedBits:info.mappedBits.toString()}:undefined};
  }
  if(type==='reserved')facts={...instance,access:'未声明；规划保留不赋予读写能力'};
  const registerId=instance?.definitionType==='register'?instance.definitionId:target.kind==='definition'&&type==='register'?target.id:undefined;
  const childColumns=current?.entry.type==='address-space'?[{key:'base',label:'声明基址 / 单位'},{key:'allocation',label:'每项分配 size'},{key:'mapped',label:'实际 mappedSize'},{key:'type',label:'类型'},...(instance?[{key:'coordinate',label:'源空间投影坐标'},{key:'visibility',label:'可见性'}]:[]),{key:'description',label:'用途'}]:current?.entry.type==='register-block'?[{key:'offset',label:'Block 原生相对偏移'},{key:'coordinate',label:initial.entry.type==='address-space'?'源空间绝对坐标':'根 Block 相对坐标'},{key:'type',label:'类型 / 分组'},{key:'width',label:'寄存器 bit'},{key:'description',label:'用途'}]:undefined;
  const details:{label:string;value:string}[]=[],add=(label:string,value:unknown)=>{if(value!==undefined)details.push({label,value:typeof value==='string'?value:JSON.stringify(value)});};
  const value=facts as any,declared=value.mapping?.targetDefinition??value.definition??entity;
  add('地址单位',instance?instance.addressUnitBits+' bit':initial.entry.type==='address-space'?(initial.entry.entity as AddressSpace).addressUnitBits+' bit':initial.entry.type==='register-block'?((initial.entry.entity as RegisterBlock).addressUnitBits??8)+' bit':undefined);
  if(type==='address-space'){const space=entity as AddressSpace;add('合法地址范围','['+space.base+', 0x'+(BigInt(space.base)+BigInt(space.size)).toString(16).toUpperCase()+')');}
  add('分配大小',instance?.allocationSize?instance.allocationSize+' × '+instance.regionCoordinateSystem!.addressUnitBits+' bit（'+instance.regionCoordinateSystem!.projectId+'/'+instance.regionCoordinateSystem!.addressSpaceId+'）':undefined);add('实际映射大小',instance?.mappedSize?instance.mappedSize+' × '+instance.regionCoordinateSystem!.addressUnitBits+' bit':undefined);add('资源内部偏移',instance?.resourceOffset?instance.resourceOffset.value+' × '+instance.resourceOffset.addressUnitBits+' bit':undefined);
  if(declared.kind==='register-block'){const layout=resolver.block(definition!.project,definition!.id);add('Block 原生大小',hex(layout.sizeBits/BigInt(layout.unitBits))+' × '+layout.unitBits+' bit');add('Block 原生跨度（bit）',layout.sizeBits.toString());const policy=instance?.accessPolicy??value.effectiveAccessPolicy??resolver.policy(definition!.project,declared);add('访问约定',policy&&Object.keys(policy).length?policy:'未声明');}
  if(declared.kind==='memory'){add('容量（字节）',declared.capacityBytes);add('存储类型',declared.memoryType);add('只读声明',declared.readOnly===undefined?'未声明':declared.readOnly?'是':'否');add('物理切片（bit）',instance?.memorySlice?'['+instance.memorySlice.startBit+', '+instance.memorySlice.endExclusiveBit+')':undefined);}
  if(type==='window'){add('目标空间',value.mapping.targetProject+'/'+value.mapping.targetId);add('目标地址单位',value.mapping.targetDefinition.addressUnitBits+' bit');add('targetBase',('targetBase'in entity)?entity.targetBase:undefined);add('targetStride',('targetStride'in entity)?entity.targetStride:undefined);add('来源空间',instance?.regionCoordinateSystem?.projectId+'/'+instance?.regionCoordinateSystem?.addressSpaceId);add('转换公式','targetBit = targetBase × targetUnitBits + index × targetStride × targetUnitBits + (sourceAddress − Region.base − index × stride) × sourceUnitBits；与沿途所有 mapped 位区间求交集');add('转译坐标链',instance?.coordinateChain.map(step=>step.projectId+'/'+step.addressSpaceId+': '+(step.coordinate.address??step.coordinate.unitIndex+' + '+step.coordinate.subUnitBitOffset+' bit')+' × '+step.coordinate.addressUnitBits+' bit').join(' → '));}
  if(declared.kind==='register'){add('寄存器位宽',declared.width+' bit');const policy=instance?.accessPolicy;add('访问约定',policy&&Object.keys(policy).length?policy:'未声明');}
  if(type==='reserved')add('访问属性','未声明；规划保留不赋予读写能力');
  if(instance){add('源坐标系',target.project+'/'+rootId);add('完整投影范围（bit）','['+instance.projectedRange.startBit+', '+instance.projectedRange.endExclusiveBit+')');add('实际可见范围（bit）','['+instance.visibleRange.startBit+', '+instance.visibleRange.endExclusiveBit+')');add('资源路径',instance.pathLabels.join(' → '));}add('定义说明',declared.description);add('定义来源',declared.source);add('路径来源',instance?.sources);
  return {childColumns,details,...(instance?{pathLabels:instance.pathLabels}:{}),provider:'address-resources',title:instance?.pathLabels.at(-1)??entity.label??entity.id,type,target,...(definition?{definition}:{}),facts,children:{items:children,total:String(type==='reserved'||type==='memory'?0:candidates.length),offset:options.offset,limit:options.limit,truncated:options.offset+children.length<candidates.length},...(registerId?{presentation:{kind:'register',project:definition!.project,id:registerId}}:{}),...(initial.entry.type==='address-space'?{spaceId:initial.entry.id}:{})};
 }
};
