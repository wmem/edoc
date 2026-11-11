import {cubic,hitsRect,hitsNode,pathBounds,norm,add} from './bezier.ts';
import {DrawingError} from './types.ts';
import type {DrawingPath,ConnectionGeometry,NodeGeometry} from './types.ts';

// 独立消费最终控制点；路由器的候选、经过点和 satisfiedConstraints 均不构成正确性证据。
export function verifyCurvePath(path:DrawingPath,connection:ConnectionGeometry,nodes:NodeGeometry[]):void{
 const fail=(id:string,message:string):never=>{throw new DrawingError('DRAWING_CURVE','geometry',[connection.id,path.id,id],message);};
 if(!path.curves||path.points.length<2||path.curves.length!==path.points.length-1)fail(path.id,'曲线控制点数量与结点不对应');
 for(const p of [...path.points,...path.curves!.flatMap(c=>[c.c1,c.c2])])if(!Number.isFinite(p.x)||!Number.isFinite(p.y))fail(path.id,'曲线存在非有限坐标');
 const byId=new Map(nodes.map(n=>[n.id,n])),ancestor=(a:string,b:string):boolean=>a===b||!!byId.get(b)?.parentId&&ancestor(a,byId.get(b)!.parentId!);
 const container=(n:NodeGeometry)=>nodes.some(c=>c.parentId===n.id);
 for(let i=0;i<path.points.length-1;i++){
  const c=cubic(path,i);if(norm(add(c[1],c[0],-1))<1e-7||norm(add(c[3],c[2],-1))<1e-7)fail(path.id,'曲线端点切线不可确定');
  for(const n of nodes){const related=n.shape==='lane'||container(n)&&connection.ends.some(e=>ancestor(n.id,e.node));if(related?hitsRect(c,n.title):hitsNode(c,n))fail(n.id,'曲线穿过模块或容器标题');}
  for(const n of nodes)for(const t of [n.title,...n.contents,...n.ports.flatMap(p=>[p.text,...p.annotation?[p.annotation]:[]])])if(t.width&&t.height&&hitsRect(c,t))fail(n.id,'曲线穿过框内文字');
 }
 const bounds=pathBounds(path);
 for(const n of nodes.filter(n=>container(n)&&connection.ends.every(e=>e.node!==n.id&&ancestor(n.id,e.node)))){const b=n.contentBox;if(bounds.x<b.x-.02||bounds.y<b.y-.02||bounds.x+bounds.width>b.x+b.width+.02||bounds.y+bounds.height>b.y+b.height+.02)fail(n.id,'曲线超出所属容器内容区');}
}
