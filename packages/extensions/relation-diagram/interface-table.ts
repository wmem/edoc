import type {Graph,Port,Node,Group,Interface} from '../../core/types.ts';
import {esc,anchor} from '../../render-graph/index.ts';
export function interfaceTableHTML(graph:Graph,id:string,mode:string):string{
 const entry=graph.index.get(id)!;let ids:string[]=[];
 if(entry.type==='node')ids=(entry.entity as Node).ports?.map(p=>p.id)??[];
 if(entry.type==='group')ids=(entry.entity as Group).members;
 if(entry.type==='interface')ids=(entry.entity as Interface).members;
 const ports=ids.map(id=>graph.index.get(id)!).filter(e=>e.type==='port');
 if(mode==='overview'){
  const sets:{id:string;label:string;ports:Port[]}[]=[];
  if(entry.type==='group'||entry.type==='interface')sets.push({id,label:entry.entity.label??id,ports:ports.map(e=>e.entity as Port)});
  else if(entry.type==='node'&&(entry.entity as Node).interfaces?.length){const covered=new Set<string>();for(const i of (entry.entity as Node).interfaces!){sets.push({id:i.id,label:i.label,ports:i.members.map(id=>graph.index.get(id)!.entity as Port)});i.members.forEach(id=>covered.add(id));}const remaining=ports.filter(p=>!covered.has(p.id));if(remaining.length)sets.push({id,label:'独立信号',ports:remaining.map(p=>p.entity as Port)});}
  else{const covered=new Set<string>();for(const e of graph.index.values())if(e.type==='group'){const members=(e.entity as Group).members.filter(id=>ports.some(p=>p.id===id));if(members.length){sets.push({id:e.id,label:e.entity.label??e.id,ports:members.map(id=>graph.index.get(id)!.entity as Port)});members.forEach(id=>covered.add(id));}}const remaining=ports.filter(e=>!covered.has(e.id));if(remaining.length)sets.push({id,label:'未分组信号',ports:remaining.map(e=>e.entity as Port)});}
  return `<table class="interface-overview"><caption>${esc(entry.entity.label??id)} · overview</caption><thead><tr><th>接口组</th><th>信号数</th><th>方向</th><th>位宽集合</th></tr></thead><tbody>${sets.map(set=>`<tr><td><a href="#${anchor(set.id)}">${esc(set.label)}</a></td><td>${set.ports.length}</td><td>${esc([...new Set(set.ports.map(p=>p.direction))].join('/'))}</td><td>${esc([...new Set(set.ports.map(p=>p.width??p.widthExpr??'unknown'))].join('/'))}</td></tr>`).join('')}</tbody></table>`;
 }

 return `<table><caption>${esc(entry.entity.label??id)} · ${esc(mode)}</caption><thead><tr><th>信号</th><th>方向</th><th>位宽</th><th>时钟域</th><th>属性 / 来源</th></tr></thead><tbody>${ports.map(e=>{const p=e.entity as Port;return `<tr><td><a href="#${anchor(e.id)}">${esc(p.label)}</a></td><td>${esc(p.direction)}</td><td>${esc(p.width??p.widthExpr??'unknown')}</td><td>${esc(p.clockDomainId??'unknown')}</td><td>${esc(JSON.stringify(p.attributes??{}))}<br>${esc(p.source?.file??'')}</td></tr>`}).join('')}</tbody></table>`;
}
