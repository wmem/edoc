import type {Drawing,Node,Connection} from '../../drawing/types.ts';
import type {ControlPresentation,ControlModel,StateMachine,Trigger,ControlView} from './types.ts';
import {isControl,elements} from './types.ts';
import type {Graph} from '../../core/types.ts';

export function presentation(graph:Graph,id:string,viewId?:string):ControlPresentation|undefined{
 const entry=graph.index.get(id)?.entity;if(!isControl(entry)&&!(entry&&'model'in entry))return;
 const view=(viewId?graph.index.get(viewId)?.entity:!isControl(entry)?entry:undefined) as ControlView|undefined;
 const model=isControl(entry)?entry:graph.index.get(view!.model)?.entity as ControlModel;
 return {projectId:graph.manifest.projectId,model,view:view??{id,kind:model.kind,model:model.id},models:[...graph.index.values()].map(e=>e.entity).filter(isControl)};
}
export function triggerText(t:Trigger|undefined):string{
 if(t===undefined)return '';
 if(typeof t==='string')return t;
 if(t.kind==='event')return t.event;
 if(t.kind==='after')return `after ${t.value} ${t.unit}${t.clock?' @'+t.clock:''}`;
 if(t.kind==='clock')return `${t.edge??'rising'} ${t.clock}`;
 if(t.kind==='change')return `change(${t.expression})`;
 return t.kind;
}
export function edgeText(e:{label?:string;trigger?:Trigger;guard?:string;otherwise?:boolean;actions?:string[];kind?:string;priority?:number}):string{
 return [e.label,triggerText(e.trigger),e.guard?`[${e.guard}]`:e.otherwise?'[else]':'',e.actions?.length?'/ '+e.actions.join('；'):'',e.kind&& !['control','external'].includes(e.kind)?`«${e.kind}»`:'',e.priority!==undefined?`#${e.priority}`:''].filter(Boolean).join('\n');
}
export function commonClock(p:ControlPresentation):Extract<Trigger,{kind:'clock'}>|undefined{
 if(p.model.kind!=='state-machine'||p.view.display?.repeatClock||!p.model.transitions.length)return;
 const first=p.model.transitions[0].trigger;
 if(!first||typeof first==='string'||first.kind!=='clock')return;
 if(p.model.transitions.every(e=>{const t=e.trigger;return t&&typeof t!=='string'&&t.kind==='clock'&&t.clock===first.clock&&(t.edge??'rising')===(first.edge??'rising');}))return first;
}
export function commonClockCaption(p:ControlPresentation):string{
 const clock=commonClock(p);return clock?`本状态机迁移在 ${clock.clock} ${clock.edge==='falling'?'下降沿':'上升沿'}判断条件`:'';
}
// 投影只建立显示身份与来源，不向全局工程索引注入伪电气对象。
export function projectControl(p:ControlPresentation,options:{collapsed?:string[];expandedCalls?:string[];focus?:string}={}):Drawing{
 const m=p.model,v=p.view,nodes:Node[]=[],connections:Connection[]=[],collapsed=new Set(options.collapsed??v.collapsed??[]);
 const used=new Set(elements(m).map(e=>e.element.id));const fresh=(kind:string,...parts:string[])=>{let at=0,id=JSON.stringify(['edoc',kind,...parts]);while(used.has(id))id=JSON.stringify(['edoc',kind,...parts,++at]);used.add(id);return id;};
 const raw=m.kind==='state-machine'?m.states:m.nodes,rawEdges=m.kind==='state-machine'?m.transitions:m.edges;
 const parents=new Map<string,string|undefined>();
 if(m.kind==='state-machine'){
  for(const r of m.regions??[])parents.set(r.id,r.owner);
  for(const s of m.states)parents.set(s.id,s.region);
 }else for(const s of m.nodes)parents.set(s.id,s.lane);
 const ancestor=(id:string,target:string)=>{const seen=new Set<string>();let at:string|undefined=id;while(at&&!seen.has(at)){if(at===target)return true;seen.add(at);at=parents.get(at);}return false;};
 const visible=(id:string)=>![...collapsed].some(c=>id!==c&&ancestor(id,c));
 const projected=(id:string)=>{let at=id;while(!visible(at))at=parents.get(at)!;return at;};
 const focus=options.focus??v.focus;
 const kept=(id:string)=>!focus||ancestor(id,focus)||ancestor(focus,id)||rawEdges.some(e=>ancestor(e.from,focus)&&e.to===id||ancestor(e.to,focus)&&e.from===id);
 const source=(id:string)=>[...new Set([m.id,id])];
 const add=(id:string,label:string,shape:Node['shape'],parentId?:string,content?:string[])=>{
  if(!visible(id)||!kept(id))return;
  nodes.push({id,label,shape,parentId:parentId&&visible(parentId)?parentId:undefined,originIds:source(id),content:content?.filter(Boolean).map((text,index)=>({id:'content-'+index,kind:'text',text}))});
 };
 if(m.kind==='state-machine')for(const r of m.regions??[])add(r.id,r.label??r.id,'region',r.owner);
 else for(const l of m.lanes??[])add(l.id,l.label??l.id,'lane');
 for(const n of raw){
  const k=n.kind??(m.kind==='state-machine'?'state':'process');
  let shape:Node['shape']=({state:'ellipse',composite:'rounded',parallel:'rounded',initial:'initial',start:'initial',final:'final',end:'final',terminate:'terminate',choice:'diamond',junction:'initial',decision:'diamond',merge:'diamond',fork:'bar',join:'bar',history:'history',entry:'connector',exit:'connector',call:'call',submachine:'call',io:'io',wait:'wait',connector:'connector',process:'rounded'} as Record<string,Node['shape']>)[k];
  const state=m.kind==='state-machine'?m.states.find(s=>s.id===n.id):undefined,step=m.kind==='flowchart'?m.nodes.find(s=>s.id===n.id):undefined;
  let label=n.label??({initial:'',start:'',junction:'',final:'',end:'',terminate:'',history:state?.history==='deep'?'H*':'H',fork:'',join:'',entry:'E',exit:'X',connector:'○'} as Record<string,string>)[k]??n.id;
  if((k==='end'||k==='final')&&label){shape='rounded';label='◉ '+label;}
  const content=state?[...(['entry','do','exit'] as const).flatMap(role=>state[role]?.length?[`${role} / ${state[role]!.join('；')}`]:[]),...Object.entries(state.bindings??{}).map(([key,value])=>`${key} = ${value}`)]:[...(step?.actions??[]),...step?.wait?[triggerText(step.wait)]:[],...[]];
  if(collapsed.has(n.id)){content.push(`＋ ${raw.filter(s=>s.id!==n.id&&ancestor(s.id,n.id)).length} 个内部节点`);}
  if(n.kind==='call'||n.kind==='submachine')content.push('↗ '+('call'in n?n.call?.model:'') );
  if(k==='join'&&step?.joinSpec&&step.joinSpec!=='all')label='join '+(typeof step.joinSpec==='string'?step.joinSpec:step.joinSpec.expression);
  if(k==='join'&&step?.joinSpec&&step.joinSpec!=='all')shape='rounded';
  if(k==='end'&&step?.scope==='branch')label='分支结束'+(label?' · '+label:'');
  add(n.id,label,shape,parents.get(n.id),content);
 }
 const edge=(id:string,from:string,to:string,label:string,originIds=source(id),style='data')=>{
  const a=projected(from),b=projected(to);
  if(!nodes.some(n=>n.id===a)||!nodes.some(n=>n.id===b)||a===b&&(a!==from||b!==to))return;
  connections.push({id,ends:[{id:'from',node:a},{id:'to',node:b,marker:'arrow'}],labels:label?[{id:'label',text:label}]:[],style,originIds});
 };
 const sharedClock=commonClock(p);
 for(const e of rawEdges)edge(e.id,e.from,e.to,edgeText(sharedClock?{...e,trigger:undefined}:e));
 if(m.kind==='state-machine'){
  const init=(target:string|undefined,region?:string)=>{if(!target||!visible(target)||!kept(target)||region&&collapsed.has(region))return;const id=fresh('initial',region??'root');nodes.push({id,label:'',shape:'initial',parentId:region,originIds:source(region??m.id)});edge(fresh('initial-edge',region??'root'),id,target,!region&&m.semantics?.reset?'初始入口':'',source(region??target));};
  init(m.initial);for(const r of m.regions??[])if(visible(r.id)&&kept(r.id)&&!collapsed.has(r.owner))init(r.initial,r.id);
  for(const s of m.states)if(s.kind==='history'&&s.default)edge(fresh('history-default',s.id),s.id,s.default,'default',source(s.id));
 }
 for(const n of m.notes??[])add(n.id,n.label??'注释','note',undefined,[n.text]);
 // 调用默认折叠，显式展开一层；递归调用只保留入口，防止无限复制。
 for(const id of options.expandedCalls??[]){
  const n=raw.find(n=>n.id===id),call=n&&'call'in n?n.call:undefined,target=call&&p.models.find(m=>m.id===call.model),host=nodes.find(n=>n.id===id);
  if(!call||!target||!host)continue;
  const child=projectControl({model:target,view:{id:target.id,kind:target.kind,model:target.id,display:{repeatClock:true}},models:p.models});
  const instanceIds=new Map<string,string>();const instance=(local:string)=>{if(!instanceIds.has(local))instanceIds.set(local,fresh('call',id,local));return instanceIds.get(local)!;};
  nodes.push(...child.nodes.map(n=>({...n,id:instance(n.id),parentId:n.parentId?instance(n.parentId):id})));
  connections.push(...child.connections.map(c=>({...c,id:instance(c.id),ends:c.ends.map(e=>({...e,node:instance(e.node)}))})));
  host.content=host.content?.filter(c=>c.kind!=='text'||!c.text.startsWith('↗'));
  if('entries'in call)for(const [from,to]of Object.entries(call.entries??{}))if(nodes.some(n=>n.id===instance(to)))connections.push({id:fresh('call-entry',id,from),ends:[{id:'from',node:projected(from)},{id:'to',node:instance(to),marker:'arrow'}],labels:[{id:'entry',text:'entry'}],style:'data',originIds:source(id)});
  for(const [exit,to]of Object.entries(call.returns??{}))if(nodes.some(n=>n.id===instance(exit))){const declared=rawEdges.find(e=>e.from===id&&e.to===to&&(!('return'in e)||!e.return||e.return===exit)),old=declared?connections.find(c=>c.id===declared.id):undefined;if(old)connections.splice(connections.indexOf(old),1);connections.push({id:fresh('call-return',id,exit),ends:[{id:'from',node:instance(exit)},{id:'to',node:projected(to),marker:'arrow'}],labels:[{id:'return',text:declared?edgeText(declared)||'return':'return'}],style:'data',originIds:declared?source(declared.id):source(id)});}
 }
 // 丢弃因聚焦缺失的显示父框，保持投影树闭合。
 for(const n of nodes)if(n.parentId&&!nodes.some(p=>p.id===n.parentId))n.parentId=undefined;
 return {schemaVersion:'1.0',id:v.id,nodes,connections,layout:{alignment:'auto',routing:m.kind==='state-machine'?'curved':'orthogonal',arrangement:m.kind==='state-machine'?'cyclic':'layered',direction:m.kind==='flowchart'?'TB':'LR',...v.layout}};
}
export function controlSelection(p:ControlPresentation,originIds:string[]){
 const model=p.models.find(m=>m.id===originIds[0])??p.model,id=originIds[1];
 const found=elements(model).find(e=>e.element.id===id);
 return {projectId:p.projectId,modelId:model.id,elementId:id,...found,source:found?.element.source??model.source};
}
