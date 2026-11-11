import type {NodeGeometry,Point,Shape} from './types.ts';
import {crosses} from '../render-graph/geometry.ts';
// 圆与菱形按真实轮廓挂线；矩形外接框只用于保守障碍和排版。
const circular=(shape?:Shape)=>['ellipse','initial','final','history','connector','terminate'].includes(shape??'');
export function shapeRay(n:NodeGeometry,d:Point):Point{
 const cx=n.x+n.width/2,cy=n.y+n.height/2,dx=d.x||0,dy=d.y||0,rx=n.width/2,ry=n.height/2;
 let k=circular(n.shape)?1/Math.sqrt((dx/rx)**2+(dy/ry)**2):n.shape==='diamond'?1/(Math.abs(dx/rx)+Math.abs(dy/ry)):1/Math.max(Math.abs(dx/rx),Math.abs(dy/ry));
 if(n.shape==='io'){
  const points=[{x:n.x+n.width*.12,y:n.y},{x:n.x+n.width,y:n.y},{x:n.x+n.width*.88,y:n.y+n.height},{x:n.x,y:n.y+n.height}],hits:number[]=[];
  for(const [i,a]of points.entries()){const b=points[(i+1)%points.length],ex=b.x-a.x,ey=b.y-a.y,det=dx*ey-dy*ex;if(Math.abs(det)<1e-12)continue;const t=((a.x-cx)*ey-(a.y-cy)*ex)/det,u=((a.x-cx)*dy-(a.y-cy)*dx)/det;if(t>=0&&u>=0&&u<=1)hits.push(t);}
  k=Math.min(...hits);
 }
 return {x:cx+dx*k,y:cy+dy*k};
}
export function shapeAnchor(n:NodeGeometry,at:Point,neighbor:Point):Point{
 const cx=n.x+n.width/2,cy=n.y+n.height/2,rx=n.width/2,ry=n.height/2;
 if(n.shape==='io'){if(Math.abs(at.y-neighbor.y)<.01){const t=(at.y-n.y)/n.height;return {x:n.x+(neighbor.x<cx?n.width*.12*(1-t):n.width*(1-.12*t)),y:at.y};}const x=(at.x-n.x)/n.width;return {x:at.x,y:n.y+n.height*(neighbor.y<cy?(x<.12?1-x/.12:0):(x>.88?(1-x)/.12:1))};}
 if(n.shape!=='diamond'&&!circular(n.shape))return at;
 if(Math.abs(at.y-neighbor.y)<.01){const ratio=Math.abs((at.y-cy)/ry),span=rx*(n.shape==='diamond'?1-ratio:Math.sqrt(Math.max(0,1-ratio*ratio)));return {x:cx+(neighbor.x<cx?-span:span),y:at.y};}
 const ratio=Math.abs((at.x-cx)/rx),span=ry*(n.shape==='diamond'?1-ratio:Math.sqrt(Math.max(0,1-ratio*ratio)));return {x:at.x,y:cy+(neighbor.y<cy?-span:span)};
}
export function onShapeBoundary(n:NodeGeometry,p:Point):boolean{
 const x=Math.abs((p.x-n.x-n.width/2)/(n.width/2)),y=Math.abs((p.y-n.y-n.height/2)/(n.height/2));
 if(n.shape==='io'){const t=(p.y-n.y)/n.height,l=n.x+n.width*.12*(1-t),r=n.x+n.width*(1-.12*t);return Math.abs(p.x-l)<.01||Math.abs(p.x-r)<.01||Math.abs(p.y-n.y)<.01&&p.x>=l&&p.x<=r||Math.abs(p.y-n.y-n.height)<.01&&p.x>=l&&p.x<=r;}
 if(n.shape==='diamond')return Math.abs(x+y-1)<.001;
 if(circular(n.shape))return Math.abs(x*x+y*y-1)<.001;
 return (Math.abs(x-1)<.001&&y<=1.001)||(Math.abs(y-1)<.001&&x<=1.001);
}
export function shapeSegmentCrosses(n:NodeGeometry,a:Point,b:Point):boolean{
 if(n.shape!=='diamond'&&n.shape!=='io'&&!circular(n.shape))return crosses(a,b,n);
 // 正交线与凸轮廓求交，允许只接触端点，拒绝穿过内部。
 const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
 const center={x:n.x+n.width/2,y:n.y+n.height/2};
 const horizontal=Math.abs(a.y-b.y)<.01,coord=horizontal?a.y:a.x;
 const probe=horizontal?{x:n.x,y:coord}:{x:coord,y:n.y};
 const lo=shapeAnchor(n,probe,horizontal?{x:n.x-1,y:coord}:{x:coord,y:n.y-1});
 const hi=shapeAnchor(n,probe,horizontal?{x:n.x+n.width+1,y:coord}:{x:coord,y:n.y+n.height+1});
 const axis=horizontal?'x':'y',other=horizontal?'y':'x',radius=horizontal?n.height/2:n.width/2;
 if(Math.abs(mid[other]-center[other])>=radius-.001)return false;
 return Math.min(a[axis],b[axis])<hi[axis]-.01&&Math.max(a[axis],b[axis])>lo[axis]+.01;
}
// SVG 与 X6 使用同一份局部轮廓路径，避免导出与网页两套形状。
export function shapePath(shape:Shape|undefined,w:number,h:number):string|undefined{
 if(shape==='call')return `M0,0H${w}V${h}H0ZM10,0V${h}M${w-10},0V${h}`;
 if(shape==='diamond')return `M${w/2},0L${w},${h/2}L${w/2},${h}L0,${h/2}Z`;
 if(shape==='terminate')return `M0,${h/2}a${w/2},${h/2} 0 1,0 ${w},0a${w/2},${h/2} 0 1,0 -${w},0ZM6,6L${w-6},${h-6}M${w-6},6L6,${h-6}`;
 if(circular(shape))return `M0,${h/2}a${w/2},${h/2} 0 1,0 ${w},0a${w/2},${h/2} 0 1,0 -${w},0Z`;

 if(shape==='io')return `M${w*.12},0H${w}L${w*.88},${h}H0Z`;
 if(shape==='note')return `M0,0H${w-14}L${w},14V${h}H0ZM${w-14},0V14H${w}`;
 return undefined;
}
export const shapeFill=(shape?:Shape)=>['initial','bar'].includes(shape??'')?'#234e68':shape==='region'?'#f6f9fc':shape==='lane'?'#f1f7f6':'#fff';
