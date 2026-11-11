import {samples,norm,add} from './bezier.ts';
import {DrawingError} from './types.ts';
import type {ConnectionGeometry,DrawingPath,Point} from './types.ts';
const tolerance=.02;
type Line={a:Point;b:Point;index:number};
const cross=(a:Point,b:Point)=>a.x*b.y-a.y*b.x;
const delta=(a:Point,b:Point)=>add(a,b,-1);
const distance=(p:Point,l:Line)=>{const d=delta(l.b,l.a),k=Math.max(0,Math.min(1,((p.x-l.a.x)*d.x+(p.y-l.a.y)*d.y)/(d.x*d.x+d.y*d.y||1)));return norm(delta(p,add(l.a,d,k)));};
function intersection(a:Line,b:Line):Point|undefined{const u=delta(a.b,a.a),v=delta(b.b,b.a),det=cross(u,v);if(Math.abs(det)<1e-10)return;const w=delta(b.a,a.a),t=cross(w,v)/det,s=cross(w,u)/det;return t>=-1e-9&&t<=1+1e-9&&s>=-1e-9&&s<=1+1e-9?add(a.a,u,t):undefined;}
const near=(a:Point,b:Point)=>norm(delta(a,b))<tolerance*4;
const realVertex=(p:DrawingPath,at:Point)=>(p.curves?[p.points[0],p.points.at(-1)!]:p.points).some(p=>near(p,at));

// 细分的每一弦都有凸包误差界；相交只允许在线路内部横穿，接触或不确定情况拒绝。
export function checkCurvePaths(connections:ConnectionGeometry[],clearance:number,lastOnly=false):void{
 const paths=connections.flatMap(c=>c.paths.map(path=>{const points=samples(path,tolerance).map(s=>s.point);return {c,path,lines:points.slice(1).map((b,index)=>({a:points[index],b,index})).filter(l=>norm(delta(l.a,l.b))>1e-8)};}));
 const fail=(a:typeof paths[number],b:typeof a,message:string)=>{throw new DrawingError('DRAWING_PATH_CONTACT','geometry',[a.c.id,a.path.id,b.c.id,b.path.id],message);};
 for(const [i,a]of paths.entries())for(const b of paths.slice(i)){
  if(lastOnly&&a.c!==connections.at(-1)&&b.c!==connections.at(-1))continue;
  const same=a===b,shared=a.c.ends.flatMap(e=>b.c.ends.some(f=>e.node===f.node&&e.port===f.port&&near(e,f))?[e]:[]),crossings:Point[]=[];
  if(!same&&a.lines.every(u=>[u.a,u.b].every(p=>b.lines.some(v=>distance(p,v)<=tolerance*2)))&&b.lines.every(v=>[v.a,v.b].every(p=>a.lines.some(u=>distance(p,u)<=tolerance*2))))fail(a,b,'独立连接的曲线重合');
  const pairs:{u:Line;v:Line;d:number;angle:number}[]=[];
  for(const u of a.lines)for(const v of b.lines){
   if(same&&v.index<=u.index+1)continue;
   const pad=same?tolerance*2:clearance+tolerance*2;
   if(Math.max(u.a.x,u.b.x)+pad<Math.min(v.a.x,v.b.x)||Math.max(v.a.x,v.b.x)+pad<Math.min(u.a.x,u.b.x)||Math.max(u.a.y,u.b.y)+pad<Math.min(v.a.y,v.b.y)||Math.max(v.a.y,v.b.y)+pad<Math.min(u.a.y,u.b.y))continue;
   const du=delta(u.b,u.a),dv=delta(v.b,v.a),angle=Math.abs(cross(du,dv))/(norm(du)*norm(dv)||1),p=intersection(u,v),d=p?0:Math.min(distance(u.a,v),distance(u.b,v),distance(v.a,u),distance(v.b,u));
   if(p){
    if(same&&u.index===0&&v.index===a.lines.at(-1)!.index&&near(a.path.points[0],a.path.points.at(-1)!)&&near(p,a.path.points[0]))continue;
    if(same)fail(a,b,'同一路线出现自交');
    if(shared.some(e=>near(e,p)))continue;
    if(realVertex(a.path,p)||realVertex(b.path,p)||angle<.12)fail(a,b,'曲线在端点/折角接触或相切，形成假连接');
    crossings.push(p);
   }
   pairs.push({u,v,d,angle});
  }
  for(const {u,v,d,angle}of pairs){
   if(shared.some(e=>distance(e,u)<clearance*2&&distance(e,v)<clearance*2))continue;
   if(crossings.some(p=>distance(p,u)<clearance&&distance(p,v)<clearance))continue;
   // 同一路线相邻细分段共享邻域，只检查远离参数邻接的接触/折返。
   if(same&&Math.abs(u.index-v.index)<=2)continue;
   if(d<=tolerance*2)fail(a,b,'路线重合或存在无法安全区分的曲线接触');
   if(!same&&angle<.12&&d<clearance+tolerance*2)throw new DrawingError('DRAWING_PATH_CLEARANCE','geometry',[a.c.id,b.c.id],'曲线平行部分未满足最小间距');
  }
 }
}
