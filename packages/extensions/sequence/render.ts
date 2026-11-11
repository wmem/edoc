import type {Graph} from '../../core/types.ts';
import type {Message,Sequence,SequenceStep,SequenceView} from './types.ts';
import {sequenceProjection,sequenceModel} from './model.ts';
import {escape as esc,line,rect,svg,text,textWidth} from '../../figure/svg.ts';
import {wrapText} from '../../render-graph/text.ts';
export function sequenceSVG(graph:Graph,model:Sequence,view:Partial<SequenceView>={}){
 const boxWidth=Math.max(150,...model.participants.map(p=>textWidth(p.label??p.id)+32));
 const order=view.participantOrder??model.participants.map(p=>p.id),spacing=view.spacing??Math.max(190,boxWidth+40);
 const xs=new Map(order.map((p,i)=>[p,boxWidth/2+40+i*spacing])),width=boxWidth+80+Math.max(0,order.length-1)*spacing+210;
 type Row={step:SequenceStep;y:number;depth:number;prefix:string};type Frame={step:SequenceStep;top:number;bottom:number;depth:number;label:string};
 const rows:Row[]=[],frames:Frame[]=[],collapsed=new Set(view.collapsed),projection=sequenceProjection(model);let cursor=94;
 const caption=(step:SequenceStep)=>step.kind+(step.label?' · '+step.label:'')+('guard'in step&&step.guard?' ['+step.guard+']':'');
 // 多行文字按实际换行数占位；24px 行距容纳中文字体的真实字框。
 const lineHeight=24;
 const headerHeight=(label:string,depth:number)=>wrapText(label,14,width-260-depth*14).length*lineHeight+20;
 const noteLines=(step:Extract<SequenceStep,{kind:'note'}>)=>{const targets=step.on.length?step.on:order;const span=Math.max(...targets.map(p=>xs.get(p)!))-Math.min(...targets.map(p=>xs.get(p)!))+120;return wrapText(step.text,14,span-20);};
 const messageLines=(step:Message)=>wrapText(step.label??step.id,14,step.from===step.to?spacing-65:Math.max(100,Math.abs(xs.get(step.to)!-xs.get(step.from)!)-30));
 const visit=(steps:SequenceStep[],depth=0,prefix='',mapping?:Record<string,string>,stack:string[]=[]):void=>{for(const original of steps){let step=original;
  if(mapping){step={...step} as SequenceStep;if('from'in step){step.from=mapping[step.from];step.to=mapping[step.to];}if('participant'in step)step.participant=mapping[step.participant];if('on'in step)step.on=step.on.map(p=>mapping[p]);}
  const local=prefix+step.id;
  if('branches'in step||'steps'in step){const top=cursor,label=caption(step)+(collapsed.has(local)?' · 已折叠':'');cursor+=headerHeight(label,depth);if(!collapsed.has(local)){if('branches'in step){for(const b of step.branches){const note:Extract<SequenceStep,{kind:'note'}>={id:prefix+b.id,kind:'note',on:[],text:b.otherwise?'else'+(b.label?' · '+b.label:''):b.guard??b.label??b.id};rows.push({step:note,y:cursor+22,depth:depth+1,prefix:''});cursor+=noteLines(note).length*lineHeight+12;visit(b.steps,depth+1,prefix,mapping,stack);}}else visit(step.steps,depth+1,prefix,mapping,stack);}cursor+=8;frames.push({step,top,bottom:cursor,depth,label});}
  else if(step.kind==='ref'&&!collapsed.has(local)&&view.expandedCalls?.includes(local)&&stack.length<12){const target=sequenceModel(graph,step.model),mapped=Object.fromEntries(Object.entries(step.participants).map(([k,v])=>[k,mapping?.[v]??v]));const top=cursor;cursor+=headerHeight('ref · '+(step.label??target.label??target.id),depth);visit(target.steps,depth+1,local+'/',mapped,[...stack,step.model]);cursor+=8;frames.push({step,top,bottom:cursor,depth,label:'ref · '+(step.label??target.label??target.id)});}
  else {if(!step.kind||step.kind==='message'){const lines=view.showLabels===false?0:messageLines(step as Message).length;rows.push({step,y:cursor+lines*lineHeight+8,depth,prefix});cursor+=lines*lineHeight+(step.from===step.to?52:30);}else if(step.kind==='note'){rows.push({step,y:cursor+24,depth,prefix});cursor+=noteLines(step).length*lineHeight+32;}else{rows.push({step,y:cursor+25,depth,prefix});cursor+=56;}}
 }};
 visit(model.steps);
 const positions=new Map<string,{send:number;receive:number}>();for(const r of rows)if(!r.step.kind||r.step.kind==='message')positions.set(r.prefix+r.step.id,{send:r.y,receive:r.y});
 // 显式事件约束只推动终点，不制造反向时间；接收可以低于发送。
 const eventY=new Map(projection.events.map(e=>[e.id,positions.get(e.message)?.[e.end]??110]));for(const id of projection.topologicalOrder)for(const edge of projection.ordering.filter(e=>e.from===id)){const delta=edge.reason==='message'?0:24;eventY.set(edge.to,Math.max(eventY.get(edge.to)!,eventY.get(id)!+delta));}
 for(const [id,p]of positions){p.send=eventY.get(id+':send')??p.send;p.receive=eventY.get(id+':receive')??p.receive;}
 const railHeight=110+(model.constraints??[]).reduce((h,c)=>h+wrapText(c.label??c.id,12,180).length*18+40,0);
 const height=Math.max(cursor+62,railHeight,...[...positions.values()].map(p=>Math.max(p.send,p.receive)+70));let body='';
 for(const f of [...frames].reverse()){const x=24+f.depth*14;body+=`<g data-local="${esc(f.step.id)}">${rect(x,f.top,width-x-210,f.bottom-f.top,'class="frame" rx="5"')}${wrapText(f.label,14,width-x-230).map((l,i)=>text(x+10,f.top+26+i*lineHeight,l,'font-weight="600"')).join('')}</g>`;}
 for(const p of model.participants){const x=xs.get(p.id)!,created=rows.find(r=>r.step.kind==='create'&&r.step.participant===p.id),destroyed=rows.find(r=>r.step.kind==='destroy'&&r.step.participant===p.id),top=created?created.y-22:24,bottom=destroyed?destroyed.y:height-65;body+=`<g data-local="${esc(p.id)}">${rect(x-boxWidth/2,top,boxWidth,44,'rx="6"')}${text(x,top+28,p.label??p.id,'text-anchor="middle"')}${line(x,top+46,x,bottom,'stroke-dasharray="5 5" opacity=".6"')}</g>`;}
 const active=new Map<string,number[]>();
 for(const row of rows){const e=row.step,id=row.prefix+e.id;body+=`<g data-local="${esc(id)}"><title>${esc(id)}</title>`;let y=row.y;
  if(!e.kind||e.kind==='message'){const m=e as Message,p=positions.get(id)!,x=xs.get(m.from)!,to=xs.get(m.to)!;y=p.send;const ry=p.receive,attrs=`marker-end="url(#${m.mode==='signal'?'figure-open':'figure-arrow'})"${m.mode==='return'?' stroke-dasharray="6 4"':''}`;if(x===to)body+=`<path d="M ${x} ${y} H ${x+50} V ${Math.max(ry,y+28)} H ${x}" ${attrs}/>`;else body+=line(x,y,to,ry,attrs);if(view.showLabels!==false){const lines=messageLines(m);lines.forEach((l,i)=>body+=text(x===to?x+60:(x+to)/2,Math.min(y,ry)-12-(lines.length-1-i)*lineHeight,l,x===to?'':'text-anchor="middle"'));}}
  else if(e.kind==='note'){const targets=e.on.length?e.on:order;const left=Math.min(...targets.map(p=>xs.get(p)!))-60,right=Math.max(...targets.map(p=>xs.get(p)!))+60;const lines=noteLines(e);body+=rect(left,y-22,right-left,lines.length*lineHeight+10,'style="fill:#fff9df;stroke:#c8b979" rx="3"');lines.forEach((l,i)=>body+=text(left+10,y+i*lineHeight,l));}
  else if(e.kind==='ref')body+=rect(40,y-25,width-250,48,'class="frame" rx="4"')+text(54,y+5,'ref · '+(e.label??sequenceModel(graph,e.model).label??e.model));
  else if('participant'in e){const x=xs.get(e.participant)!;if(e.kind==='activate')active.set(e.participant,[...active.get(e.participant)??[],y]);if(e.kind==='deactivate'){const start=active.get(e.participant)?.pop()??y;body+=rect(x-6,start,12,y-start,'style="fill:#d8e8fa"');}if(e.kind==='create')body+=text(x+12,y,'«create»','class="muted"');if(e.kind==='destroy')body+=line(x-8,y-8,x+8,y+8)+line(x-8,y+8,x+8,y-8);}
  body+='</g>';
 }
 let cy=105;for(const c of model.constraints??[]){const label=c.kind==='duration'?`${c.label??c.id}: ${c.min??0}…${c.max??'∞'} ${c.unit}${c.clock?' @'+c.clock:''}`:c.label??c.id;for(const l of wrapText(label,12,180)){body+=text(width-195,cy,l,'class="muted"');cy+=18;}cy+=16;}
 body+=text(24,height-25,'纵向表示事件顺序，不表示耗时；par 分支之间没有隐式屏障。','class="muted"');
 return svg(width,height,body,{id:model.id,label:model.label,view:view.id,projection,source:model.source});
}
