import type {View,LayoutConstraint,Connection} from '../core/types.ts';
import type {SceneNode} from './scene.ts';
import {intersects,labelBox} from './geometry.ts';

// 相对约束在同一父容器的兄弟节点间求解；容器递归包围子图，移动时整体平移。
export function constrainNodes(nodes:SceneNode[],view:View,relations:Connection[]=[]){
 const constraints=view.layout?.constraints??[],positions=new Map((view.layout?.positions??[]).map(p=>[p.objectId,p]));
 const children=(id?:string)=>nodes.filter(n=>n.parentId===id),byId=new Map(nodes.map(n=>[n.id,n]));
 const descendants=(id:string):SceneNode[]=>[byId.get(id)!,...children(id).flatMap(n=>descendants(n.id))];
 const locked=(id:string)=>descendants(id).some(n=>positions.has(n.id));
 const conflict=(detail:string):never=>{throw new Error(`视图 ${view.id} 的布局约束冲突：${detail}`);};
 const shift=(n:SceneNode,dx:number,dy:number)=>{for(const item of descendants(n.id)){item.x+=dx;item.y+=dy;item.ports.forEach(p=>{p.x+=dx;p.y+=dy;});}};
 const solve=(siblings:SceneNode[],rules:LayoutConstraint[],axis:'x'|'y')=>{
  if(!rules.some(c=>c.axis===axis))return;
  const ids=siblings.map(n=>n.id),root=new Map(ids.map(id=>[id,id]));
  const find=(id:string):string=>{let p=id;while(root.get(p)!==p)p=root.get(p)!;return p;};
  for(const c of rules)if(c.type==='align'&&c.axis===axis)for(const id of c.nodes.slice(1))root.set(find(id),find(c.nodes[0]));
  const size=(n:SceneNode)=>axis==='x'?n.width:n.height,center=(n:SceneNode)=>n[axis]+size(n)/2;
  const groups=new Map<string,SceneNode[]>();for(const n of siblings){const id=find(n.id);if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(n);}
  const values=new Map<string,number>(),edges:{a:string;b:string;weight:number}[]=[],origin='';values.set(origin,0);
  const ordered=new Set(rules.filter(c=>c.type==='order'&&c.axis===axis).flatMap(c=>c.nodes)),base=Math.min(...siblings.filter(n=>ordered.has(n.id)).map(center));
  for(const [id,members]of groups){values.set(id,members.some(n=>ordered.has(n.id))?base:members.reduce((sum,n)=>sum+center(n),0)/members.length);
   const anchors=members.filter(n=>locked(n.id));if(anchors.length&&anchors.some(n=>Math.abs(center(n)-center(anchors[0]))>.001))conflict(`align.${axis} 与固定位置不一致：${members.map(n=>n.id).join(' / ')}`);
   if(anchors.length){const value=center(anchors[0]);edges.push({a:origin,b:id,weight:value},{a:id,b:origin,weight:-value});}
  }
  for(const c of rules)if(c.type==='order'&&c.axis===axis)for(let i=1;i<c.nodes.length;i++){
   const a=byId.get(c.nodes[i-1])!,b=byId.get(c.nodes[i])!,members=(n:SceneNode)=>new Set(descendants(n.id).flatMap(item=>[item.id,...item.ports.map(p=>p.id)])),left=members(a),right=members(b);
   const connected=relations.filter(r=>r.endpoints.some(id=>left.has(id))&&r.endpoints.some(id=>right.has(id)));
   // gap 是最小空白；连线标题同样参与间距估计，避免先挤紧节点再为标题绕远。
   const readable=Math.max(0,...connected.map(r=>{const box=labelBox(r.label??r.id);return (axis==='x'?box.width:box.height)+60;}));
   edges.push({a:find(a.id),b:find(b.id),weight:size(a)/2+size(b)/2+Math.max(c.gap??80,readable)});
  }
  for(let pass=0;pass<=values.size;pass++){
   let changed=false;for(const e of edges){const needed=values.get(e.a)!+e.weight;if(values.get(e.b)!<needed-.001){values.set(e.b,needed);changed=true;}}
   if(!changed)break;if(pass===values.size)conflict(`${axis} 方向的顺序、对齐或固定位置互相矛盾：${ids.join(' / ')}`);
  }
  for(const n of siblings){const delta=values.get(find(n.id))!-values.get(origin)!-center(n);if(Math.abs(delta)>.001)shift(n,axis==='x'?delta:0,axis==='y'?delta:0);}
 };
 function arrange(parentId?:string){
  const siblings=children(parentId);for(const n of siblings)arrange(n.id);
  const selected=new Set(siblings.map(n=>n.id)),rules=constraints.filter(c=>c.nodes.every(id=>selected.has(id))).map(c=>({...c,nodes:c.nodes.slice()}));
  if(rules.length){
   solve(siblings,rules,'x');solve(siblings,rules,'y');
   // 作者约束没有涉及的轴仍自动留出空间；无法移动的重叠不能静默接受。
   for(let attempt=0;attempt<siblings.length*siblings.length;attempt++){
    const pair=siblings.flatMap((a,i)=>siblings.slice(i+1).filter(b=>intersects(a,b,16)).map(b=>[a,b])).at(0);if(!pair)break;
    const [a,b]=pair;if(locked(a.id)&&locked(b.id))conflict(`固定对象重叠：${a.id} / ${b.id}`);
    const aligned=new Set([a.id]);for(let changed=true;changed;){changed=false;for(const c of rules)if(c.type==='align'&&c.axis==='x'&&c.nodes.some(id=>aligned.has(id)))for(const id of c.nodes)if(!aligned.has(id)){aligned.add(id);changed=true;}}
    const axis=aligned.has(b.id)?'y':'x';
    const order=a[axis]<=b[axis]?[a.id,b.id]:[b.id,a.id];rules.push({type:'order',axis,nodes:order,gap:80});solve(siblings,rules,axis);
    if(attempt===siblings.length*siblings.length-1)conflict(`没有可用的节点间距：${siblings.map(n=>n.id).join(' / ')}`);
   }
  }
  if(parentId&&siblings.length){const parent=byId.get(parentId)!,portHeight=parent.ports.length?80+parent.ports.length*38:0,oldY=parent.y;
   parent.x=Math.min(...siblings.map(n=>n.x))-60;parent.y=Math.min(...siblings.map(n=>n.y))-90;
   parent.width=Math.max(240,...siblings.map(n=>n.x+n.width-parent.x+60));parent.height=Math.max(portHeight,...siblings.map(n=>n.y+n.height-parent.y+60));
   parent.ports.forEach(p=>{const row=p.y-oldY;p.x=parent.x+(p.side==='right'?parent.width:0);p.y=parent.y+row;});
   const fixed=positions.get(parentId);if(fixed){const dx=fixed.x+60-parent.x,dy=fixed.y+70-parent.y;if((Math.abs(dx)>.001||Math.abs(dy)>.001)&&siblings.some(n=>locked(n.id)))conflict(`父容器 ${parentId} 与子节点的固定位置不一致`);shift(parent,dx,dy);}
  }
 }
 arrange();
}
