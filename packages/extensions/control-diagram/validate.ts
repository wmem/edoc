import type {Graph,Diagnostic} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
import {isControl,elements} from './types.ts';
import type {StateMachine,State,ControlModel,Trigger,ControlView} from './types.ts';

// 结构与语义检查不执行自然语言守卫，也不从数组顺序推导执行优先级。
export function validateControlData(graph:Graph):Diagnostic[]{
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values()){
  const model=entry.entity;
  if(entry.type==='view'&&'model' in model&&['state-machine','flowchart'].includes(model.kind)){
   const v=model as ControlView,m=graph.index.get(v.model)?.entity;
   if(!isControl(m)||m.kind!==v.kind){report(entry,'CONTROL_MODEL','/model','视图必须引用同种语义模型');continue;}
   const ids=new Set(elements(m).map(e=>e.element.id));
   for(const id of [...v.collapsed??[],...v.focus?[v.focus]:[]])if(!ids.has(id))report(entry,'CONTROL_REFERENCE','/collapsed','局部元素不存在：'+id);
   continue;
  }
  if(!isControl(model))continue;
  const feature=model.kind==='state-machine'?'state-machines':'flowcharts';if(!graph.manifest.requiredFeatures?.includes(feature))report(entry,'IR_FEATURE_REQUIRED','','专用模型需要声明 requiredFeatures: '+feature);
  const m=model,all=elements(m),map=new Map<string,typeof all[number]>();
  const error=(code:string,path:string,msg:string)=>report(entry,code,path,msg);
  for(const e of all){if(map.has(e.element.id))error('CONTROL_DUPLICATE',e.path+'/id','同一模型局部 ID 重复：'+e.element.id);map.set(e.element.id,e);}
  const local=(id:string|undefined,path:string,allowed:Set<string>)=>{if(id!==undefined&&!allowed.has(id))error('CONTROL_REFERENCE',path,'局部引用不存在或类型不匹配：'+id);};
  for(const e of all){if(e.element.source){const s=e.element.source;if(s.file.startsWith('/')||s.file.split('/').includes('..'))error('SOURCE_PATH',e.path+'/source/file','来源必须位于工程内');}if('for' in e.element)for(const id of (e.element as {for?:string[]}).for??[])local(id,e.path+'/for',new Set(map.keys()));}
  const nodes=m.kind==='state-machine'?m.states:m.nodes,edges=m.kind==='state-machine'?m.transitions:m.edges,ids=new Set(nodes.map(n=>n.id));
  if(m.kind==='flowchart'&&m.completeness!=='partial'&&!m.nodes.some(n=>n.kind==='start'))error('CONTROL_INITIAL','/nodes','完整流程必须有显式 start');
  const incoming=(id:string)=>edges.filter(e=>e.to===id),outgoing=(id:string)=>edges.filter(e=>e.from===id);
  const trigger=(t:Trigger|undefined,path:string)=>{if(typeof t==='object'&&t.kind==='after'&&t.unit==='cycles'&&!t.clock)error('CONTROL_CLOCK',path,'周期延时必须显式引用 clock');};
  for(const [i,e]of edges.entries()){
   const path=`/${m.kind==='state-machine'?'transitions':'edges'}/${i}`;
   local(e.from,path+'/from',ids);local(e.to,path+'/to',ids);
   if(e.otherwise&&e.guard)error('CONTROL_DEFAULT',path,'otherwise 与 guard 不可同时声明');
   if(m.kind==='flowchart'&&'return'in e&&e.return){const caller=m.nodes.find(n=>n.id===e.from)?.call,target=caller?graph.index.get(caller.model)?.entity:undefined;if(!isControl(target)||target.kind!=='flowchart'||!target.nodes.some(n=>n.id===e.return&&n.kind==='end'))error('CONTROL_RETURN',path+'/return','return 必须引用源调用流程的 end');}
   if('trigger'in e)trigger(e.trigger,path+'/trigger');
  }
  for(const n of nodes){
   const path=map.get(n.id)!.path,outs=outgoing(n.id),ins=incoming(n.id),k=n.kind??(m.kind==='state-machine'?'state':'process');
   if(outs.filter(e=>e.otherwise).length>1)error('CONTROL_DEFAULT',path,'同一节点只能有一个 otherwise 出口');
   const selection=m.kind==='state-machine'?m.semantics?.selection:m.selection;
   if(selection==='priority'&&outs.length>1&&(outs.some(e=>e.priority===undefined)||new Set(outs.map(e=>e.priority)).size!==outs.length))error('CONTROL_PRIORITY',path,'priority 选择需要全部出口显式且不重复的 priority');
   if(['initial','start'].includes(k)&&(ins.length||outs.length!==1))error('CONTROL_DEGREE',path,'初始节点无入口，且必须只有一个出口');
   if(['final','terminate','end'].includes(k)&&outs.length)error('CONTROL_DEGREE',path,'结束节点不能有出口');
   if(['choice','junction','decision'].includes(k)){
    if(outs.length<(k==='junction'?1:2))error('CONTROL_DEGREE',path,'choice/decision 至少两个出口，junction 至少一个出口');
    if((k!=='junction'||outs.length>1)&&outs.some(e=>!e.guard&&!e.otherwise))error('CONTROL_GUARD',path,'判断出口必须声明 guard 或 otherwise');
   }
   if(k==='fork'&&(ins.length!==1||outs.length<2))error('CONTROL_DEGREE',path,'fork 需要一个入口、至少两个出口');
   if(k==='join'&&(ins.length<2||outs.length!==1))error('CONTROL_DEGREE',path,'join 需要至少两个入口、一个出口');
   if(k==='merge'&&(ins.length<2||outs.length!==1))error('CONTROL_DEGREE',path,'merge 需要至少两个入口、一个出口');
   if(m.kind==='flowchart'){
    const step=m.nodes.find(s=>s.id===n.id)!;
    local(step.lane,path+'/lane',new Set(m.lanes?.map(l=>l.id)));
    if(k==='wait'){if(!step.wait)error('CONTROL_WAIT',path,'wait 需要声明等待事件或时间');trigger(step.wait,path+'/wait');}else if(step.wait)error('CONTROL_KIND',path+'/wait','只有 wait 节点可声明 wait');
    if(k!=='join'&&step.joinSpec!==undefined)error('CONTROL_KIND',path+'/joinSpec','只有 join 可声明 joinSpec');
    if(k!=='end'&&step.scope)error('CONTROL_KIND',path+'/scope','只有 end 可声明结束作用域');
    if(m.completeness!=='partial'&&!['decision','fork','end'].includes(k)&&outs.filter(e=>!e.kind||e.kind==='control').length>1)error('CONTROL_GATEWAY',path,'多个正常出口必须经显式 decision 或 fork 分支');
   }
   const call='call'in n?n.call:undefined;
   if(['call','submachine'].includes(k)){
    const target=call?graph.index.get(call.model)?.entity:undefined;
    if(!isControl(target)||target.kind!==m.kind)error('CONTROL_CALL',path+'/call/model','调用目标必须是同种模型');
    else if(call){const targetNodes=target.kind==='state-machine'?target.states:target.nodes;for(const [from,to]of Object.entries(call.returns??{})){if(!targetNodes.some(x=>x.id===from&&['end','final','exit'].includes(x.kind??'')))error('CONTROL_RETURN',path+'/call/returns','返回源必须是调用目标的结束/出口：'+from);local(to,path+'/call/returns',ids);}if('entries'in call)for(const [from,to]of Object.entries(call.entries??{})){local(from,path+'/call/entries',ids);if(!targetNodes.some(x=>x.id===to&&['entry','initial'].includes(x.kind??'')))error('CONTROL_ENTRY',path+'/call/entries','调用入口不存在：'+to);}}
   }else if(call)error('CONTROL_KIND',path+'/call','call 只能声明于调用节点');
  }
  if(m.kind==='state-machine'){
   const regions=new Map(m.regions?.map(r=>[r.id,r])),states=new Map(m.states.map(s=>[s.id,s]));
   const parent=(s:State)=>s.region?regions.get(s.region)?.owner:undefined;
   const descendant=(child:string,owner:string)=>{const seen=new Set<string>();let n=states.get(child);while(n&&!seen.has(n.id)){if(n.id===owner)return true;seen.add(n.id);n=states.get(parent(n)??'');}return false;};
   const initials=(region:string|undefined,initial:string|undefined,path:string)=>{
    const members=m.states.filter(s=>s.region===region),pseudo=members.filter(s=>s.kind==='initial');
    if(initial){if(!members.some(s=>s.id===initial&&!['initial','history','join','exit'].includes(s.kind??'')))error('CONTROL_INITIAL',path,'initial 必须引用本区域可进入的状态');if(pseudo.length)error('CONTROL_INITIAL',path,'同一区域不可同时声明 initial 简写与初始伪状态');}
    if(pseudo.length>1)error('CONTROL_INITIAL',path,'同一区域有多个初始伪状态');
    if(!initial&&!pseudo.length&&m.completeness!=='partial')error('CONTROL_INITIAL',path,'完整状态机的每个区域必须声明初始入口');
   };
   initials(undefined,m.initial,'/initial');
   for(const [i,r]of (m.regions??[]).entries()){const owner=states.get(r.owner);if(!owner||!['composite','parallel'].includes(owner.kind??''))error('CONTROL_REGION',`/regions/${i}/owner`,'区域 owner 必须是 composite 或 parallel');initials(r.id,r.initial,`/regions/${i}/initial`);}
   for(const s of m.states){
    const path=map.get(s.id)!.path;local(s.region,path+'/region',new Set(regions.keys()));
    if(s.region&&descendant(parent(s)??'',s.id))error('CONTROL_CYCLE',path,'状态/区域包含关系成环');
    const count=(m.regions??[]).filter(r=>r.owner===s.id).length;
    if(s.kind==='composite'&&count!==1||s.kind==='parallel'&&count<2)error('CONTROL_REGION',path,'composite 必须有一个区域，parallel 必须有至少两个区域');
    if(s.kind==='initial'&&outgoing(s.id).some(t=>('trigger'in t&&t.trigger)||t.guard||t.otherwise))error('CONTROL_INITIAL',path,'初始迁移不能声明事件、守卫或 otherwise');
    if(s.kind==='fork'&&outgoing(s.id).some(t=>('trigger'in t&&t.trigger)||t.guard||t.otherwise))error('CONTROL_FORK',path,'同步 fork 出口不能是条件或事件选择');
    if(s.kind==='history'){if(outgoing(s.id).length>1||s.default&&outgoing(s.id).length)error('CONTROL_HISTORY',path,'history 只能有一个默认出口声明');if(!s.region||!s.history)error('CONTROL_HISTORY',path,'history 必须指定所属区域与 shallow/deep');if(s.default&&!m.states.some(n=>n.id===s.default&&n.region===s.region))error('CONTROL_HISTORY',path+'/default','history 默认目标必须属于同一区域');}
    else if(s.default||s.history)error('CONTROL_KIND',path,'history/default 只适用于历史伪状态');
    if(['initial','final','choice','junction','history','fork','join','entry','exit','terminate'].includes(s.kind??'')&&(s.entry?.length||s.do?.length||s.exit?.length))error('CONTROL_ACTION',path,'伪状态不承载 entry/do/exit 动作');
   }
   for(const [i,t]of m.transitions.entries()){
    const a=states.get(t.from),b=states.get(t.to);if(!a||!b)continue;
    if(t.kind==='internal'&&t.from!==t.to)error('CONTROL_INTERNAL',`/transitions/${i}`,'internal 必须保持在源状态');
    if(t.kind==='local'&&(!['composite','parallel'].includes(a.kind??'')||!descendant(t.to,t.from)||t.from===t.to))error('CONTROL_LOCAL',`/transitions/${i}`,'local 必须从复合状态进入其后代');
    const chain=(s:State)=>{const list:string[]=[];let at:State|undefined=s;while(at&&!list.includes(at.id)){list.push(at.id);at=states.get(parent(at)??'');}return list;};
    const common=chain(a).find(id=>chain(b).includes(id));
    const orthogonalRegion=(s:State)=>{const child=chain(s).map(id=>states.get(id)!).find(n=>parent(n)===common);return child?.region;};
    if(common&&common!==a.id&&common!==b.id&&states.get(common)?.kind==='parallel'&&orthogonalRegion(a)!==orthogonalRegion(b)&&!['fork','join','entry','exit'].includes(a.kind??'')&&!['fork','join','entry','exit'].includes(b.kind??''))error('CONTROL_ORTHOGONAL',`/transitions/${i}`,'正交区域之间不可直接迁移；使用同步节点或共同祖先');
   }
  }
 }
 return errors;
}
