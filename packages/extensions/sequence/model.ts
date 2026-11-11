import type {Graph} from '../../core/types.ts';
import type {Sequence,SequenceStep,Message,Occurrence} from './types.ts';
import {sequenceElements} from './types.ts';
import {figureFail} from '../../figure/errors.ts';
export type Event={id:string;message:string;end:'send'|'receive';participant:string;branch:Record<string,string>};
const key=(e:Occurrence)=>e.message+':'+e.end;
export function sequenceModel(graph:Graph,id:string):Sequence{const entry=graph.index.get(id);if(entry?.type!=='sequence')figureFail('SEQUENCE_REFERENCE',id,'交互引用不存在或类型错误：'+id);return entry.entity as Sequence;}
export function sequenceProjection(model:Sequence){
 const events:Event[]=[],edges:{from:string;to:string;reason:string}[]=[],messages=new Map<string,Message>();
 type Frontier=Map<string,string[]>;
 const add=(from:string,to:string,reason:string)=>{if(from!==to)edges.push({from,to,reason});};
 const merge=(states:Frontier[])=>{const result:Frontier=new Map();for(const state of states)for(const [p,ends]of state)result.set(p,[...new Set([...(result.get(p)??[]),...ends])]);return result;};
 const walk=(steps:SequenceStep[],front:Frontier,branch:Record<string,string>,strict=false):Frontier=>{
  let state=new Map(front),allPrevious:string[]=[];
  for(const step of steps){const firstNew=events.length;
   if(!step.kind||step.kind==='message'){
    const m=step as Message;messages.set(m.id,m);
    const send:Event={id:m.id+':send',message:m.id,end:'send',participant:m.from,branch},receive:Event={id:m.id+':receive',message:m.id,end:'receive',participant:m.to,branch};
    for(const event of [send,receive]){for(const previous of state.get(event.participant)??[])add(previous,event.id,'lifeline');events.push(event);state.set(event.participant,[event.id]);}
    add(send.id,receive.id,'message');
   }else if('branches'in step){
    const states=step.branches.map(b=>walk(b.steps,new Map(state),step.kind==='alt'?{...branch,[step.id]:b.id}:branch));state=merge(states);
   }else if('steps'in step){const end=walk(step.steps,state,step.kind==='opt'||step.kind==='loop'?{...branch,[step.id]:'body'}:branch,step.kind==='strict');state=step.kind==='opt'||step.kind==='loop'?merge([state,end]):end;}
   if(strict){const current=events.slice(firstNew).map(e=>e.id);for(const previous of allPrevious)for(const event of current)add(previous,event,'strict');if(current.length){const ids=new Set(current);allPrevious=current.filter(id=>!edges.some(e=>e.from===id&&ids.has(e.to)));}}
  }
  return state;
 };
 walk(model.steps,new Map(),{});
 const byId=new Map(events.map(e=>[e.id,e]));
 const compatible=(a:Event,b:Event)=>!Object.keys(a.branch).some(k=>b.branch[k]!==undefined&&a.branch[k]!==b.branch[k]);
 for(const c of model.constraints??[]){const a=byId.get(key(c.kind==='order'?c.before:c.from)),b=byId.get(key(c.kind==='order'?c.after:c.to));if(!a||!b)figureFail('SEQUENCE_EVENT',model.id,'约束引用未知消息事件：'+c.id);if(a.id===b.id&&(c.kind==='order'||c.kind==='duration'&&(c.min??0)>0))figureFail('SEQUENCE_ORDER_CYCLE',model.id,'同一事件不能严格先于自身或具有正时长：'+c.id);if(!compatible(a,b))figureFail('SEQUENCE_BRANCH',model.id,'约束不能跨互斥分支：'+c.id);add(a.id,b.id,c.kind==='order'?'order':'duration');}
 for(const m of messages.values())if(m.replyTo){const call=messages.get(m.replyTo);if(!call||call.from!==m.to||call.to!==m.from)figureFail('SEQUENCE_REPLY',model.id,'replyTo 需要指向反向请求：'+m.id);if(!compatible(byId.get(m.id+':send')!,byId.get(call.id+':send')!)||Object.entries(byId.get(call.id+':send')!.branch).some(([k,v])=>byId.get(m.id+':send')!.branch[k]!==v))figureFail('SEQUENCE_BRANCH',model.id,'响应必须位于请求必定已发生的分支路径：'+m.id);add(call.id+':receive',m.id+':send','reply');}
 const degree=new Map(events.map(e=>[e.id,0])),out=new Map<string,string[]>();for(const e of edges){degree.set(e.to,(degree.get(e.to)??0)+1);out.set(e.from,[...out.get(e.from)??[],e.to]);}
 const queue=[...degree].filter(([,d])=>d===0).map(([id])=>id);for(let i=0;i<queue.length;i++)for(const to of out.get(queue[i])??[]){degree.set(to,degree.get(to)!-1);if(!degree.get(to))queue.push(to);}
 if(queue.length!==events.length)figureFail('SEQUENCE_ORDER_CYCLE',model.id,'发送、生命线与显式顺序约束形成循环');

 return {interactionUses:sequenceElements(model).filter(e=>(e.element as any).kind==='ref').map(e=>e.element),eventScope:'当前模型的消息事件；ref 内部事件和约束沿 model/participants 分别查询，不冒充平铺轨迹',events,ordering:edges,topologicalOrder:queue,constraints:model.constraints??[],semantics:'weak-sequencing; par 无隐式全局屏障；纵向距离不表示耗时'};
}
export function sequenceReferences(model:Sequence){return sequenceElements(model).flatMap(({element})=>{const e=element as any;return [...e.ref?[e.ref]:[],...e.model?[e.model]:[],...e.protocol?[e.protocol]:[]];});}
