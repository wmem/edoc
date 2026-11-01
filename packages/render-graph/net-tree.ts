// 一条原始关系的路径联合图：共享段只画一次，圆点来自实际分叉而非布局器虚拟 hub。
import type {SceneNet} from './scene.ts';
import {same,simplify} from './geometry.ts';
import type {Point} from './geometry.ts';

export const drawnPaths=(net:SceneNet):NonNullable<SceneNet['paths']>=>net.paths??net.branches;
export function normalizeNet(net:SceneNet):SceneNet{
 if(!net.junction)return net;
 const paths=net.branches.map(b=>b.points),segments=paths.flatMap(path=>path.slice(1).map((b,i)=>({a:path[i],b})));
 const key=(p:Point)=>`${Math.round(p.x*1e6)/1e6},${Math.round(p.y*1e6)/1e6}`;
 const points=new Map<string,Point>(),adj=new Map<string,Set<string>>();
 const all=paths.flat();
 for(const s of segments)for(const t of segments){
  if(s.a.y===s.b.y&&t.a.x===t.b.x){const p={x:t.a.x,y:s.a.y};if(on(p,s.a,s.b)&&on(p,t.a,t.b))all.push(p);}
 }
 const add=(p:Point)=>{const id=key(p);points.set(id,{...p});if(!adj.has(id))adj.set(id,new Set());return id;};
 for(const {a,b}of segments){
  const split=[...new Map(all.filter(p=>on(p,a,b)).map(p=>[key(p),p])).values()].sort((p,q)=>a.x===b.x?p.y-q.y:p.x-q.x);
  for(let i=1;i<split.length;i++){const u=add(split[i-1]),v=add(split[i]);if(u!==v){adj.get(u)!.add(v);adj.get(v)!.add(u);}}
 }
 const endpoints=net.branches.map(b=>key(b.points[0])),root=key(net.hub);
 if(!adj.has(root))throw new Error(`关系 ${net.id} 的路径不包含汇合点`);
 const parent=new Map<string,string|undefined>([[root,undefined]]),queue=[root];
 for(let i=0;i<queue.length;i++)for(const next of adj.get(queue[i])!)if(!parent.has(next)){parent.set(next,queue[i]);queue.push(next);}
 // 选取连接全部真实端点的树，去掉虚拟 hub 形成的无端点尾巴及重复路径。
 const used=new Map<string,Set<string>>();
 const connect=(a:string,b:string)=>{if(!used.has(a))used.set(a,new Set());if(!used.has(b))used.set(b,new Set());used.get(a)!.add(b);used.get(b)!.add(a);};
 for(const id of endpoints){if(!parent.has(id))throw new Error(`关系 ${net.id} 的端点没有连入渲染树：${id}`);let p=id;while(parent.get(p)!==undefined){const next=parent.get(p)!;connect(p,next);p=next;}}
 const terminalSet=new Set(endpoints);
 for(let changed=true;changed;){changed=false;for(const [id,neighbors]of used)if(neighbors.size===1&&!terminalSet.has(id)){used.get([...neighbors][0])!.delete(id);used.delete(id);changed=true;}}
 const junctions=[...used].filter(([,neighbors])=>neighbors.size>=3).map(([id])=>points.get(id)!);
 const hub=junctions[0]??points.get([...used.keys()][0])!;
 const hubKey=key(hub),fromHub=new Map<string,string|undefined>([[hubKey,undefined]]),visit=[hubKey];
 for(let i=0;i<visit.length;i++)for(const next of used.get(visit[i])??[])if(!fromHub.has(next)){fromHub.set(next,visit[i]);visit.push(next);}
 net.branches.forEach((b,i)=>{const route:Point[]=[];let p:string|undefined=endpoints[i];while(p!==undefined){route.push(points.get(p)!);p=fromHub.get(p);}b.points=simplify(route);});
 const drawn:NonNullable<SceneNet['paths']>=[],seen=new Set<string>();
 const edgeKey=(a:string,b:string)=>JSON.stringify([a,b].sort());
 const critical=(id:string)=>terminalSet.has(id)||used.get(id)!.size!==2;
 for(const [id,neighbors]of used)if(critical(id))for(const neighbor of neighbors){
  if(seen.has(edgeKey(id,neighbor)))continue;
  const route=[points.get(id)!];let prev=id,current=neighbor;seen.add(edgeKey(prev,current));
  while(true){route.push(points.get(current)!);if(critical(current))break;const next=[...used.get(current)!].find(p=>p!==prev)!;prev=current;current=next;seen.add(edgeKey(prev,current));}
  let endpoint=net.branches.find(b=>same(b.points[0],route[0]));const lastEndpoint=net.branches.find(b=>same(b.points[0],route.at(-1)!));
  if(!endpoint&&lastEndpoint){route.reverse();endpoint=lastEndpoint;}
  const endArrow=net.branches.some(b=>b.arrow&&same(b.points[0],route.at(-1)!));
  drawn.push({points:simplify(route),arrow:!!endpoint?.arrow,...(endpoint?{endpoint:endpoint.endpoint}:{}),...(endArrow?{endArrow:true}:{})});
 }
 net.hub={...hub};net.junctions=junctions.map(p=>({...p}));net.paths=drawn;return net;
}
function on(p:Point,a:Point,b:Point){return Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))<.001&&p.x>=Math.min(a.x,b.x)-.001&&p.x<=Math.max(a.x,b.x)+.001&&p.y>=Math.min(a.y,b.y)-.001&&p.y<=Math.max(a.y,b.y)+.001;}
