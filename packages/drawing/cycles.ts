import type {Drawing,NodeGeometry,Point} from './types.ts';
import {layoutDrawing} from './layout.ts';
import {measureText,wrapText} from '../render-graph/text.ts';

// 强连通分量只决定展示分组，不建立新的状态、迁移或执行顺序。
export async function cyclicPositions(d:Drawing,measured:NodeGeometry[]):Promise<Map<string,Point>|undefined>{
 const ids=measured.map(n=>n.id).sort(),byId=new Map(measured.map(n=>[n.id,n]));
 const edges=d.connections.filter(c=>c.ends.length===2).map(c=>({a:c.ends[0].node,b:c.ends[1].node}));
 const next=(id:string,reverse=false)=>[...new Set(edges.filter(e=>(reverse?e.b:e.a)===id).map(e=>reverse?e.a:e.b))].sort();
 const seen=new Set<string>(),finished:string[]=[];
 for(const id of ids){if(seen.has(id))continue;seen.add(id);const stack=[{id,neighbors:next(id),at:0}];while(stack.length){const top=stack.at(-1)!;if(top.at===top.neighbors.length){finished.push(top.id);stack.pop();continue;}const child=top.neighbors[top.at++];if(!seen.has(child)){seen.add(child);stack.push({id:child,neighbors:next(child),at:0});}}}
 seen.clear();const groups:string[][]=[];
 for(const id of finished.reverse()){if(seen.has(id))continue;const group:string[]=[],pending=[id];seen.add(id);while(pending.length){const at=pending.pop()!;group.push(at);for(const child of next(at,true))if(!seen.has(child)){seen.add(child);pending.push(child);}}groups.push(group.sort());}
 if(!groups.some(g=>g.length>=3))return;
 const groupOf=new Map(groups.flatMap((g,i)=>g.map(id=>[id,i] as const))),local=new Map<string,Point>();
 const direction=d.layout?.direction??'LR',horizontal=direction==='LR'||direction==='RL',reverse=direction==='RL'||direction==='BT';
 const dimensions=groups.map((members,index)=>{
  if(members.length<3){let x=0;for(const id of members){local.set(id,{x,y:0});x+=byId.get(id)!.width+(d.layout?.spacing?.node??64);}return {width:x-(d.layout?.spacing?.node??64),height:Math.max(...members.map(id=>byId.get(id)!.height))};}
  const incoming=edges.filter(e=>groupOf.get(e.b)===index&&groupOf.get(e.a)!==index).map(e=>e.b).sort();
  const order:string[]=[],visited=new Set<string>(),pending=[incoming[0]??members[0]];
  while(pending.length){const id=pending.pop()!;if(visited.has(id))continue;visited.add(id);order.push(id);pending.push(...next(id).filter(id=>groupOf.get(id)===index&&!visited.has(id)).reverse());}
  const labels=d.connections.filter(c=>c.ends.every(e=>groupOf.get(e.node)===index)).flatMap(c=>(c.labels??[]).map(l=>wrapText(l.text,14,200)));
  const width=Math.max(...members.map(id=>byId.get(id)!.width)),height=Math.max(...members.map(id=>byId.get(id)!.height));
  const gapX=Math.max(d.layout?.spacing?.layer??100,100,...labels.map(lines=>Math.max(...lines.map(l=>measureText(l,14)))+80));
  const gapY=Math.max(d.layout?.spacing?.node??64,120,...labels.map(lines=>lines.length*21+80));
  // 四状态形成两行两列；更多状态按同一环的角度展开，尺寸和边标题共同决定间距。
  const radiusX=(width+gapX)*Math.max(1,members.length/4)/Math.SQRT2,radiusY=(height+gapY)*Math.max(1,members.length/4)/Math.SQRT2;
  for(const [i,id]of order.entries()){
   const angle=-3*Math.PI/4+i*2*Math.PI/order.length,n=byId.get(id)!,x=(horizontal?Math.cos(angle):Math.sin(angle))*radiusX,y=(horizontal?Math.sin(angle):Math.cos(angle))*radiusY;
   const cx=Math.round(x*1e6)/1e6,cy=Math.round(y*1e6)/1e6;
   local.set(id,{x:(horizontal&&reverse?-cx:cx)-n.width/2,y:(!horizontal&&reverse?-cy:cy)-n.height/2});
  }
  const minX=Math.min(...members.map(id=>local.get(id)!.x)),minY=Math.min(...members.map(id=>local.get(id)!.y));
  for(const id of members){const p=local.get(id)!;p.x-=minX;p.y-=minY;}
  return {width:Math.max(...members.map(id=>local.get(id)!.x+byId.get(id)!.width)),height:Math.max(...members.map(id=>local.get(id)!.y+byId.get(id)!.height))};
 });
 const key=(i:number)=>JSON.stringify(['cycle-group',groups[i]]);
 const condensed:Drawing={schemaVersion:'1.0',id:d.id,nodes:groups.map((g,i)=>({id:key(i),label:'',shape:g.length===1?byId.get(g[0])!.shape:'rectangle'})),connections:edges.filter(e=>groupOf.get(e.a)!==groupOf.get(e.b)).map((e,i)=>({id:'group-edge-'+i,ends:[{id:'a',node:key(groupOf.get(e.a)!)},{id:'b',node:key(groupOf.get(e.b)!)}]})),layout:{direction,spacing:d.layout?.spacing,constraints:dimensions.map((size,i)=>({id:'group-size-'+i,type:'size',node:key(i),...size}))}};
 const boxes=await layoutDrawing(condensed),result=new Map<string,Point>();
 for(const [i,members]of groups.entries()){const box=boxes.find(b=>b.id===key(i))!;for(const id of members){const p=local.get(id)!;result.set(id,{x:box.x+p.x,y:box.y+p.y});}}
 // 初始入口放在实际目标轴线上，不挂在整个循环分组的中心。
 for(const n of measured.filter(n=>n.shape==='initial')){const target=edges.find(e=>e.a===n.id&&e.b!==n.id)?.b;if(!target)continue;const p=result.get(n.id)!,to=result.get(target)!,other=byId.get(target)!;if(horizontal)p.y=to.y+(other.height-n.height)/2;else p.x=to.x+(other.width-n.width)/2;}
 return result;
}
