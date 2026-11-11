import type {Point,Rect,ConnectionGeometry} from './types.ts';
import {crosses,simplify,distance} from '../render-graph/geometry.ts';
import {checkPaths} from './check-paths.ts';
// 固定泳道位置的常见正交通道先直接验证，避免对整张大画布建立笛卡尔搜索网格。
export function routeCandidates(a:Point,from:Point,to:Point,b:Point,obstacles:Rect[],previous:ConnectionGeometry[],base:ConnectionGeometry,clearance:number,accept:(path:Point[])=>boolean=()=>true):Point[]|undefined{
 const xs=[...new Set([from.x,to.x,(from.x+to.x)/2,...obstacles.flatMap(n=>[n.x-24,n.x+n.width+24,n.x-100,n.x+n.width+100])])];
 const ys=[...new Set([from.y,to.y,(from.y+to.y)/2,...obstacles.flatMap(n=>[n.y-24,n.y+n.height+24,n.y-100,n.y+n.height+100])])];
 const candidates:Point[][]=[[from,{x:from.x,y:to.y},to],[from,{x:to.x,y:from.y},to]];
 for(const x of xs)candidates.push([from,{x,y:from.y},{x,y:to.y},to]);
 for(const y of ys)candidates.push([from,{x:from.x,y},{x:to.x,y},to]);
 // 两个额外转角用于绕过职责列内的回退路径。
 for(const x of xs)for(const y of ys)candidates.push([from,{x,y:from.y},{x,y},{x:to.x,y},to]);
 const scored=candidates.map(p=>simplify([a,...p,b])).sort((p,q)=>{const score=(p:Point[])=>p.slice(1).reduce((s,b,i)=>s+distance(p[i],b),p.length*24);return score(p)-score(q);});
 for(const path of scored){
  const middle=path.slice();middle[0]=from;middle[middle.length-1]=to;
  if(middle.slice(1).some((b,i)=>obstacles.some(n=>crosses(middle[i],b,n))))continue;
  try{checkPaths([...previous,{...base,paths:[{id:'main',points:path}]}],clearance);if(accept(path))return path;}catch{/* 只淘汰不满足几何条件的候选。 */}
 }
 return;
}
