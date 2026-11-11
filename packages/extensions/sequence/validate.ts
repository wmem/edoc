import {measureText} from '../../render-graph/text.ts';
import type {Graph} from '../../core/types.ts';
import type {Sequence,SequenceStep,SequenceView} from './types.ts';
import {sequenceElements} from './types.ts';
import {sequenceModel,sequenceProjection} from './model.ts';
import {validationContext} from '../../core/validation-context.ts';
import {FigureError,figureFail} from '../../figure/errors.ts';
export function validateSequences(graph:Graph){
 const {errors,report,reference}=validationContext(graph);
 const cycles=(id:string,stack:string[]=[]):void=>{if(stack.includes(id))figureFail('SEQUENCE_RECURSION',id,'交互引用成环：'+[...stack,id].join(' → '));if(stack.length>12)figureFail('SEQUENCE_LIMIT',id,'交互引用深度不能超过 12');for(const {element}of sequenceElements(sequenceModel(graph,id)))if((element as any).kind==='ref')cycles((element as any).model,[...stack,id]);};
 for(const entry of graph.index.values()){
  if(entry.type==='sequence'){
   const model=entry.entity as Sequence;
   if(!graph.manifest.requiredFeatures?.includes('sequences'))report(entry,'IR_FEATURE_REQUIRED','','需要 sequences 必需能力');
   const elements=sequenceElements(model),ids=new Set<string>(),participants=new Set(model.participants.map(p=>p.id));
   if(elements.length>3000)report(entry,'SEQUENCE_LIMIT','','单模型最多 3000 个元素；请使用 ref 分解');
   for(const {element,path}of elements){if(ids.has(element.id))report(entry,'SEQUENCE_DUPLICATE',path,'局部 ID 重复：'+element.id);ids.add(element.id);const e=element as any;
    for(const p of [e.from,e.to,e.participant,...e.on??[]].filter(p=>typeof p==='string'))if(!participants.has(p))report(entry,'SEQUENCE_PARTICIPANT',path,'未知参与者：'+p);
    if(e.ref)reference(entry,e.ref,path+'/ref',['node']);if(e.protocol)reference(entry,e.protocol,path+'/protocol',['binary-layout']);
    if(e.kind==='alt'){let fallback=0;for(const b of e.branches){if(b.otherwise)fallback++;if((b.guard===undefined)===(!b.otherwise))report(entry,'SEQUENCE_GUARD',path,'alt 分支必须声明 guard 或 otherwise 二选一');}if(fallback>1)report(entry,'SEQUENCE_GUARD',path,'alt 最多一个 otherwise');}
    if(e.kind==='par'&&e.branches.some((b:any)=>b.guard!==undefined||b.otherwise!==undefined))report(entry,'SEQUENCE_GUARD',path,'par 分支不接受互斥条件');
    if(e.kind==='opt'&&!e.guard)report(entry,'SEQUENCE_GUARD',path,'opt 需要 guard');
    if(e.kind==='loop'&&!e.guard&&e.min===undefined&&e.max===undefined)report(entry,'SEQUENCE_LOOP',path,'loop 需要 guard 或次数范围');
    if(e.min!==undefined&&e.max!==undefined&&e.min>e.max)report(entry,'SEQUENCE_RANGE',path,'min 不能大于 max');
    if(e.kind==='duration'&&e.unit==='cycles'&&!e.clock)report(entry,'SEQUENCE_CLOCK',path,'cycles 时长必须声明 clock');
    if(e.kind==='ref')try{const target=sequenceModel(graph,e.model);if(Object.keys(e.participants).length!==target.participants.length||target.participants.some(p=>!participants.has(e.participants[p.id]))||Object.keys(e.participants).some(k=>!target.participants.some(p=>p.id===k)))report(entry,'SEQUENCE_MAPPING',path,'ref 必须完整映射目标参与者到本地参与者');}catch(error){if(error instanceof FigureError)report(entry,error.code,path,error.message);else throw error;}
   }
   // 每条可行分支分别校验生命周期；并发操作同一对象的生命周期必须显式拆分。
   const futureCreates=new Set(elements.filter(({element})=>(element as any).kind==='create').map(({element})=>(element as any).participant));
   type Life=Map<string,{alive:boolean;depth:number}>;
   const life=(steps:SequenceStep[],input:Life):Life=>{const state=new Map([...input].map(([p,v])=>[p,{...v}]));for(const e of steps){if('branches'in e){const branches=e.branches.map(b=>life(b.steps,state));for(const p of participants){const variants=branches.map(b=>b.get(p)!);if(variants.some(v=>v.alive!==variants[0].alive||v.depth!==variants[0].depth))figureFail('SEQUENCE_LIFECYCLE',model.id,'分支汇合处生命周期不一致：'+p);state.set(p,{...variants[0]});}}else if('steps'in e){const result=life(e.steps,state);if(e.kind==='opt'||e.kind==='loop'){for(const [p,v]of result)if(v.alive!==state.get(p)!.alive||v.depth!==state.get(p)!.depth)figureFail('SEQUENCE_LIFECYCLE',model.id,'可选或循环片段必须保持入口生命周期：'+p);}else for(const [p,v]of result)state.set(p,v);}else if('participant'in e){const v=state.get(e.participant);if(!v)continue;if(e.kind==='create'){if(v.alive)figureFail('SEQUENCE_LIFECYCLE',model.id,'重复创建：'+e.id);v.alive=true;}else{if(!v.alive)figureFail('SEQUENCE_LIFECYCLE',model.id,'对象尚未创建或已销毁：'+e.id);if(e.kind==='activate')v.depth++;if(e.kind==='deactivate'&&--v.depth<0)figureFail('SEQUENCE_LIFECYCLE',model.id,'deactivate 没有对应 activate：'+e.id);if(e.kind==='destroy'){if(v.depth)figureFail('SEQUENCE_LIFECYCLE',model.id,'销毁前必须结束激活：'+e.id);v.alive=false;}}}else if(!e.kind||e.kind==='message'){for(const p of [e.from,e.to])if(state.has(p)&&!state.get(p)!.alive)figureFail('SEQUENCE_LIFECYCLE',model.id,'消息使用未存活对象：'+e.id);}}return state;};
   try{cycles(model.id);sequenceProjection(model);const end=life(model.steps,new Map([...participants].map(p=>[p,{alive:!futureCreates.has(p),depth:0}])));if([...end.values()].some(v=>v.depth))figureFail('SEQUENCE_LIFECYCLE',model.id,'激活区间未结束');}catch(error){if(error instanceof FigureError)report(entry,error.code,error.path,error.message);else throw error;}
  }else if(entry.type==='view'&&('kind'in entry.entity?entry.entity.kind:'')==='sequence'){
   const view=entry.entity as SequenceView;try{const model=sequenceModel(graph,view.model),ids=new Set(sequenceElements(model).map(e=>e.element.id));if(view.participantOrder&&(view.participantOrder.length!==model.participants.length||new Set(view.participantOrder).size!==model.participants.length||view.participantOrder.some(id=>!model.participants.some(p=>p.id===id))))report(entry,'SEQUENCE_VIEW','','participantOrder 必须是参与者的完整排列');for(const id of [...view.collapsed??[],...view.expandedCalls??[]])if(!ids.has(id))report(entry,'SEQUENCE_VIEW','','未知局部元素：'+id);if(view.spacing!==undefined&&view.spacing<Math.max(150,...model.participants.map(p=>measureText(p.label??p.id,14)+32))+20)report(entry,'SEQUENCE_SPACING','','spacing 不足以容纳参与者标题');for(const id of view.collapsed??[])if(!['alt','par','opt','loop','strict','ref'].includes((sequenceElements(model).find(e=>e.element.id===id)?.element as any)?.kind))report(entry,'SEQUENCE_VIEW','','collapsed 只能引用片段或 ref');for(const id of view.expandedCalls??[])if(!(sequenceElements(model).find(e=>e.element.id===id)?.element as any)?.model)report(entry,'SEQUENCE_VIEW','','expandedCalls 只能引用 ref');}catch(error){if(error instanceof FigureError)report(entry,error.code,'',error.message);else throw error;}
  }
 }
 return errors;
}
