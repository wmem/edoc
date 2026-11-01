import {fontCSS} from './font.ts';
import ELKModule from 'elkjs/lib/elk.bundled.js';
import type { ElkNode } from 'elkjs/lib/elk-api.js';
import type { Graph, Node, Port, View, Group, Connection, Source } from '../core/types.ts';
import { failure } from '../core/errors.ts';

export const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export {anchor} from '../core/identity.ts';
import {anchor} from '../core/identity.ts';
export {styles} from './styles.ts';
import {styles} from './styles.ts';
export type ScenePort = {id:string;label:string;annotation:string; x:number;y:number;side:'left'|'right';source?:Source};
export type SceneNode = {id:string;label:string;x:number;y:number;width:number;height:number;parentId?:string;source?:Source;ports:ScenePort[]};
export type SceneNet = {id:string;label:string;class:string;endpoints:string[];source?:Source;labelBelow:boolean;hub:{x:number;y:number};branches:{endpoint:string;points:{x:number;y:number}[];arrow:boolean}[]};
export type Scene = {id:string;label:string;kind:string;width:number;height:number;visibleClasses?:string[];nodes:SceneNode[];nets:SceneNet[];collapsedGroups:string[];groups:{id:string;label:string;members:string[]}[]};

export async function scene(graph:Graph, id:string):Promise<Scene> {
 const entry=graph.index.get(id);
 if(entry?.type!=='view') failure('VIEW_NOT_FOUND','<view>','',`视图不存在：${id}`);
 const view=entry.entity as View;
 const chosen=new Set<string>(),fullNodes=new Set<string>(),selectedPorts=new Set<string>();
 const add=(id:string)=>{const e=graph.index.get(id)!;if(e.type==='group'){(e.entity as Group).members.forEach(add);}else {chosen.add(e.ownerId??id);if(e.type==='port')selectedPorts.add(id);if(e.type==='node')fullNodes.add(id);}};
 view.include.objects.forEach(add);
 // 端点被视图过滤时保留边界上下文，不把 Net 截成错误的两点关系。
 const relations=view.include.relations.map(id=>graph.connections.get(id)!);
 relations.forEach(r=>r.endpoints.forEach(add));
 for(const id of [...chosen]){let parent=(graph.index.get(id)?.entity as Node)?.parentId;while(parent){chosen.add(parent);fullNodes.add(parent);parent=(graph.index.get(parent)?.entity as Node)?.parentId;}}
 const nodes=[...chosen].map(id=>graph.index.get(id)!).filter(e=>e.type==='node').map(e=>e.entity as Node);
 const order=view.layout?.portOrder??[];
 const ports=(node:Node)=>(node.ports??[]).filter(p=>fullNodes.has(node.id)||selectedPorts.has(p.id)).slice().sort((a,b)=>{
  const rank=(id:string)=>order.includes(id)?order.indexOf(id):order.length+(node.ports??[]).findIndex(p=>p.id===id);
  return rank(a.id)-rank(b.id);
 });
 const dimensions=nodes.map(n=>({id:n.id,width:ports(n).length?340:240,height:Math.max(110,80+ports(n).length*38)}));
 const owner=(id:string)=>graph.index.get(id)?.ownerId??id;
 const edges=relations.flatMap(r=>r.endpoints.slice(1).filter(id=>owner(id)!==owner(r.endpoints[0])).map((id,i)=>({id:r.id+':layout:'+i,sources:[owner(r.endpoints[0])],targets:[owner(id)]})));
 const ELK = ELKModule as unknown as new () => { layout: (graph: ElkNode) => Promise<ElkNode> };
 const elk=new ELK();
 const layout=await elk.layout({id:'root',layoutOptions:{'elk.algorithm':'layered','elk.direction':({LR:'RIGHT',RL:'LEFT',TB:'DOWN',BT:'UP'}[view.layout?.direction??'LR']),'elk.edgeRouting':'ORTHOGONAL','elk.spacing.nodeNode':'80','elk.layered.spacing.nodeNodeBetweenLayers':view.kind==='wiring'?'300':'120'},children:dimensions,edges});
 const positions=new Map<string,{x:number;y:number}>((layout.children??[]).map(n=>[n.id,{x:(n.x??0)+60,y:(n.y??0)+70}]));
 for(const pos of view.layout?.positions??[]) if(chosen.has(pos.objectId)) positions.set(pos.objectId,{x:pos.x+60,y:pos.y+70});
 const result:SceneNode[]=nodes.map(node=>{
  const pos=positions.get(node.id)!; const size=dimensions.find(n=>n.id===node.id)!;
  return {id:node.id,label:node.label,parentId:node.parentId,source:node.source,...pos,width:size.width,height:size.height,ports:ports(node).map((p,i)=>{
   const neighbors=relations.filter(r=>r.endpoints.includes(p.id)).flatMap(r=>r.endpoints.filter(id=>owner(id)!==node.id).map(id=>positions.get(owner(id))?.x??pos.x));
   const avg=neighbors.length?neighbors.reduce((a,b)=>a+b,0)/neighbors.length:pos.x;
   const side: 'left'|'right'=view.kind==='interface'?(p.direction==='in'?'left':'right'):(avg===pos.x?(p.direction==='in'?'left':'right'):avg<pos.x?'left':'right');
   const attrs=(view.display?.portAttributes??[]).map(key=>p.attributes?.[key]===undefined?'':`${key} ${p.attributes[key]}`).filter(Boolean);
   const width=p.width!==undefined?`${p.width}b`:p.widthExpr??'';
   const domain=p.clockDomainId?`@${graph.index.get(p.clockDomainId)?.entity.label??p.clockDomainId}`:'';
   return {id:p.id,label:p.label,source:p.source,annotation:[p.direction,width,domain,...attrs].filter(Boolean).join(' · '),x:pos.x+(side==='right'?size.width:0),y:pos.y+66+i*38,side};
  })};
 });
 // 父节点以包围框表达层级，逻辑 Group 不参与该层级计算。
 const resized=new Set<string>();
 const enclose=(id:string)=>{if(resized.has(id))return;const parent=result.find(n=>n.id===id)!;const children=result.filter(n=>n.parentId===id);children.forEach(c=>enclose(c.id));if(children.length){parent.x=Math.min(...children.map(n=>n.x))-35;parent.y=Math.min(...children.map(n=>n.y))-65;parent.width=Math.max(...children.map(n=>n.x+n.width))-parent.x+35;parent.height=Math.max(Math.max(...children.map(n=>n.y+n.height))-parent.y+35,80+parent.ports.length*38);parent.width=Math.max(parent.width,parent.ports.length?340:240);parent.ports.forEach((p,i)=>{p.x=parent.x+(p.side==='right'?parent.width:0);p.y=parent.y+66+i*38;});}resized.add(id);};
 result.forEach(n=>enclose(n.id));
 const shiftX=Math.max(0,35-Math.min(35,...result.map(n=>n.x))),shiftY=Math.max(0,65-Math.min(65,...result.map(n=>n.y)));
 result.forEach(n=>{n.x+=shiftX;n.y+=shiftY;n.ports.forEach(p=>{p.x+=shiftX;p.y+=shiftY;});});
 const point=(id:string,neighbors:string[])=>{
  const p=result.flatMap(n=>n.ports).find(p=>p.id===id);if(p)return {x:p.x,y:p.y};
  const n=result.find(n=>n.id===id)!;const others=neighbors.map(id=>result.find(node=>node.id===(graph.index.get(id)?.ownerId??id))!).filter(Boolean);const avg=others.length?others.reduce((v,e)=>v+e.x+e.width/2,0)/others.length:n.x+n.width;return {x:avg<n.x+n.width/2?n.x:n.x+n.width,y:n.y+n.height/2};
 };
 const pairCount=new Map<string,number>(),pairSeen=new Map<string,number>();for(const r of relations){const key=r.endpoints.slice().sort().join('|');pairCount.set(key,(pairCount.get(key)??0)+1);}
 const nets:SceneNet[]=relations.map((r,i)=>{
  const points=r.endpoints.map(id=>point(id,r.endpoints.filter(other=>other!==id)));const first=points[0];
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x));
  const key=r.endpoints.slice().sort().join('|'),total=pairCount.get(key)!,parallel=total>1&&r.endpoints.every(id=>graph.index.get(id)?.type==='node');const seen=pairSeen.get(key)??0;pairSeen.set(key,seen+1);
  const hub={x:minX===maxX?maxX+45+i*18:(minX+maxX)/2+(i-relations.length/2)*14,y:parallel?Math.min(...points.map(p=>p.y))+(seen-(total-1)/2)*44:first.y};
  return {id:r.id,label:r.label??r.id,class:r.class,source:r.source,endpoints:r.endpoints.slice(),labelBelow:parallel&&seen>=total/2,hub,branches:r.endpoints.map((id,j)=>({endpoint:id,points:view.layout?.routing==='polyline'?[points[j],hub]:parallel?[points[j],{x:points[j].x+(hub.x>points[j].x?24:-24),y:points[j].y},{x:points[j].x+(hub.x>points[j].x?24:-24),y:hub.y},hub]:[points[j],{x:hub.x,y:points[j].y},hub],arrow:!!r.direction?.targets.includes(id)}))};
 });
 const groupMembers=(id:string):string[]=>{const e=graph.index.get(id)!;if(e.type==='group')return [...new Set((e.entity as Group).members.flatMap(groupMembers))];if(e.type==='node')return [id,...((e.entity as Node).ports??[]).map(p=>p.id)];return [id];};
 const maxX=Math.max(400,...result.map(n=>n.x+n.width),...nets.map(n=>n.hub.x));
 const maxY=Math.max(200,...result.map(n=>n.y+n.height));
 return {id,label:view.label??id,kind:view.kind,width:maxX+70,height:maxY+65,visibleClasses:view.display?.classes,nodes:result,nets,collapsedGroups:view.display?.collapsedGroups??[],groups:[...graph.index.values()].filter(e=>e.type==='group').map(e=>({id:e.id,label:e.entity.label??e.id,members:groupMembers(e.id)}))};
}

export function svg(s:Scene,embedFont=true,instance=s.id):string {
 const title=esc(s.label);
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s.width} ${s.height}" role="img" aria-label="${title}" style="background:#f8fafc;font-family:'Noto Sans SC',Arial,sans-serif"><title>${title}</title><metadata>${esc(JSON.stringify({format:"EngDoc scene 1.0",view:s.id,nodes:s.nodes,nets:s.nets}))}</metadata>${embedFont?`<style>${esc(fontCSS())}</style>`:""}<defs><marker id="${anchor(instance)}-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M10 0L0 5L10 10" fill="#536477"/></marker></defs><text x="30" y="32" font-size="19" font-weight="700" fill="#17324d">${title}</text>${s.nets.map(net=>{const style=styles[net.class]??styles.other;return `<g data-relation="${esc(net.id)}" data-class="${esc(net.class)}"><title>${esc(net.id)} · ${net.endpoints.map(esc).join(' / ')}</title>${net.branches.map(b=>`<path d="M${b.points.map(p=>`${p.x},${p.y}`).join('L')}" fill="none" stroke="${style.color}" stroke-width="2" stroke-dasharray="${style.dash}" ${b.arrow?'marker-start="url(#${anchor(instance)}-arrow)"':''}/>`).join('')}<circle cx="${net.hub.x}" cy="${net.hub.y}" r="3" fill="${style.color}"/><text x="${net.hub.x}" y="${net.labelBelow?net.hub.y+18:net.hub.y-9}" text-anchor="middle" font-size="11" fill="${style.color}">${esc(net.label)} [${esc(net.class)}]</text></g>`}).join('')}${s.nodes.slice().sort((a,b)=>a.parentId===b.id?1:b.parentId===a.id?-1:0).map(n=>`<g data-object="${esc(n.id)}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="10" fill="${s.nodes.some(child=>child.parentId===n.id)?'none':'white'}" stroke="#94a9bc"/><path d="M${n.x},${n.y+42}H${n.x+n.width}" stroke="#dce5ed"/><text x="${n.x+16}" y="${n.y+27}" fill="#17324d" font-size="17" font-weight="700">${esc(n.label)}</text>${n.ports.map(p=>`<g data-port="${esc(p.id)}"><circle cx="${p.x}" cy="${p.y}" r="4" fill="#fff" stroke="#3a688a"/><text x="${p.side==='left'?n.x+13:n.x+n.width-13}" y="${p.y-4}" text-anchor="${p.side==='left'?'start':'end'}" fill="#17324d" font-size="14">${esc(p.label)}</text><text x="${p.side==='left'?n.x+13:n.x+n.width-13}" y="${p.y+11}" text-anchor="${p.side==='left'?'start':'end'}" fill="#617487" font-size="11">${esc(p.annotation)}</text></g>`).join('')}</g>`).join('')}<text x="30" y="${s.height-20}" font-size="11" fill="#617487">${s.nets.length} connections · ${s.nodes.reduce((n,e)=>n+e.ports.length,0)} ports · multi-endpoint identities retained</text></svg>`;
}
