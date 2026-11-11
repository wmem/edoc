import type {Point,Rect,NodeGeometry,DrawingPath} from './types.ts';
export type Cubic = [Point,Point,Point,Point];
export const lerp=(a:Point,b:Point,t:number):Point=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
export const norm=(p:Point)=>Math.hypot(p.x,p.y);
export const unit=(p:Point):Point=>{const length=norm(p)||1;return {x:p.x/length,y:p.y/length};};
export const add=(a:Point,b:Point,k=1):Point=>({x:a.x+b.x*k,y:a.y+b.y*k});
export function cubic(path:DrawingPath,i:number):Cubic{const a=path.points[i],b=path.points[i+1],c=path.curves?.[i];return [a,c?.c1??lerp(a,b,1/3),c?.c2??lerp(a,b,2/3),b];}
export function point(c:Cubic,t:number):Point{const a=lerp(c[0],c[1],t),b=lerp(c[1],c[2],t),d=lerp(c[2],c[3],t);return lerp(lerp(a,b,t),lerp(b,d,t),t);}
export function tangent(c:Cubic,t:number):Point{const s=1-t;return {x:3*s*s*(c[1].x-c[0].x)+6*s*t*(c[2].x-c[1].x)+3*t*t*(c[3].x-c[2].x),y:3*s*s*(c[1].y-c[0].y)+6*s*t*(c[2].y-c[1].y)+3*t*t*(c[3].y-c[2].y)};}
export function split(c:Cubic):[Cubic,Cubic]{const a=lerp(c[0],c[1],.5),b=lerp(c[1],c[2],.5),d=lerp(c[2],c[3],.5),e=lerp(a,b,.5),f=lerp(b,d,.5),m=lerp(e,f,.5);return [[c[0],a,e,m],[m,f,d,c[3]]];}
export const coefficients=(c:Cubic,axis:'x'|'y')=>[c[0][axis],3*(c[1][axis]-c[0][axis]),3*(c[2][axis]-2*c[1][axis]+c[0][axis]),c[3][axis]-3*c[2][axis]+3*c[1][axis]-c[0][axis]];
export const evaluate=(p:number[],t:number)=>p.reduceRight((v,k)=>v*t+k,0);
export const derivative=(p:number[])=>p.slice(1).map((v,i)=>v*(i+1));
const multiply=(a:number[],b:number[])=>{const r=Array(a.length+b.length-1).fill(0);a.forEach((v,i)=>b.forEach((w,j)=>r[i+j]+=v*w));return r as number[];};
const sum=(a:number[],b:number[])=>Array.from({length:Math.max(a.length,b.length)},(_,i)=>(a[i]??0)+(b[i]??0));

// 由导数零点划分单调区间再二分；不靠固定采样猜测曲线是否穿过窄障碍。
export function roots(raw:number[]):number[]{
 const p=raw.slice(),scale=Math.max(1,...p.map(Math.abs));while(p.length>1&&Math.abs(p.at(-1)!)<scale*1e-13)p.pop();
 if(p.length===1)return [];
 if(p.length===2){const t=-p[0]/p[1];return t>=0&&t<=1?[t]:[];}
 const cuts=[0,...roots(derivative(p)).filter(t=>t>1e-10&&t<1-1e-10),1],result:number[]=[];
 for(const t of cuts)if(Math.abs(evaluate(p,t))<scale*1e-10)result.push(t);
 for(let i=1;i<cuts.length;i++){let a=cuts[i-1],b=cuts[i],fa=evaluate(p,a),fb=evaluate(p,b);if(fa*fb>=0)continue;for(let k=0;k<48;k++){const t=(a+b)/2,f=evaluate(p,t);if(fa*f<=0){b=t;fb=f;}else{a=t;fa=f;}}result.push((a+b)/2);}
 return result.sort((a,b)=>a-b).filter((t,i,a)=>!i||t-a[i-1]>1e-8);
}
export function curveBounds(c:Cubic):Rect{
 const values=(axis:'x'|'y')=>{const p=coefficients(c,axis);return [0,1,...roots(derivative(p))].map(t=>evaluate(p,t));},xs=values('x'),ys=values('y'),x=Math.min(...xs),y=Math.min(...ys);return {x,y,width:Math.max(...xs)-x,height:Math.max(...ys)-y};
}
export function pathBounds(p:DrawingPath):Rect{const boxes=p.points.slice(1).map((_,i)=>curveBounds(cubic(p,i))),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};}
type Plane={a:number;b:number;c:number};
function polygon(c:Cubic,vertices:Point[]):boolean{
 const center={x:vertices.reduce((v,p)=>v+p.x,0)/vertices.length,y:vertices.reduce((v,p)=>v+p.y,0)/vertices.length};
 const planes:Plane[]=vertices.map((p,i)=>{const q=vertices[(i+1)%vertices.length],a=q.y-p.y,b=p.x-q.x,d=-(a*p.x+b*p.y),sign=a*center.x+b*center.y+d>=0?1:-1;return {a:a*sign,b:b*sign,c:d*sign-.01*Math.hypot(a,b)};});
 const x=coefficients(c,'x'),y=coefficients(c,'y'),polys=planes.map(p=>x.map((v,i)=>p.a*v+p.b*y[i]+(i===0?p.c:0)));
 const cuts=[0,1,...polys.flatMap(roots)].sort((a,b)=>a-b),tests=[...cuts,...cuts.slice(1).map((b,i)=>(b+cuts[i])/2)];
 return tests.some(t=>polys.every(p=>evaluate(p,t)>1e-9));
}
export function hitsRect(c:Cubic,r:Rect):boolean{return r.width>.02&&r.height>.02&&polygon(c,[{x:r.x,y:r.y},{x:r.x+r.width,y:r.y},{x:r.x+r.width,y:r.y+r.height},{x:r.x,y:r.y+r.height}]);}
export function hitsNode(c:Cubic,n:NodeGeometry):boolean{
 const cx=n.x+n.width/2,cy=n.y+n.height/2;
 if(['ellipse','initial','final','history','connector','terminate'].includes(n.shape??'')){
  const x=coefficients(c,'x'),y=coefficients(c,'y');x[0]-=cx;y[0]-=cy;const r=sum(multiply(x.map(v=>v/(n.width/2-.01)),x.map(v=>v/(n.width/2-.01))),multiply(y.map(v=>v/(n.height/2-.01)),y.map(v=>v/(n.height/2-.01))));r[0]-=1;
  return [0,1,...roots(derivative(r))].some(t=>evaluate(r,t)<-1e-8);
 }
 if(n.shape==='diamond')return polygon(c,[{x:cx,y:n.y},{x:n.x+n.width,y:cy},{x:cx,y:n.y+n.height},{x:n.x,y:cy}]);
 if(n.shape==='io')return polygon(c,[{x:n.x+n.width*.12,y:n.y},{x:n.x+n.width,y:n.y},{x:n.x+n.width*.88,y:n.y+n.height},{x:n.x,y:n.y+n.height}]);
 return hitsRect(c,n);
}
export function pathHitsRect(p:DrawingPath,r:Rect):boolean{return p.points.slice(1).some((_,i)=>hitsRect(cubic(p,i),r));}
export function closest(c:Cubic,p:Point):{t:number;distance:number}{const x=coefficients(c,'x'),y=coefficients(c,'y');x[0]-=p.x;y[0]-=p.y;const square=sum(multiply(x,x),multiply(y,y)),values=[0,1,...roots(derivative(square))].map(t=>({t,distance:norm(add(point(c,t),p,-1))}));return values.reduce((a,b)=>a.distance<b.distance?a:b);}
export const pathContains=(p:DrawingPath,at:Point,tolerance=.02)=>p.points.slice(1).some((_,i)=>closest(cubic(p,i),at).distance<=tolerance);
export function length(c:Cubic,to=1):number{
 const f=(t:number)=>norm(tangent(c,t));
 function integrate(a:number,b:number,fa:number,fm:number,fb:number,whole:number,tol:number,depth:number):number{const m=(a+b)/2,l=f((a+m)/2),r=f((m+b)/2),left=(m-a)*(fa+4*l+fm)/6,right=(b-m)*(fm+4*r+fb)/6,d=left+right-whole;if(depth===0||Math.abs(d)<15*tol)return left+right+d/15;return integrate(a,m,fa,l,fm,left,tol/2,depth-1)+integrate(m,b,fm,r,fb,right,tol/2,depth-1);}
 const fa=f(0),fm=f(to/2),fb=f(to);return integrate(0,to,fa,fm,fb,to*(fa+4*fm+fb)/6,.0001,16);
}
export function pathPosition(p:DrawingPath,fraction:number):{point:Point;tangent:Point}{const cs=p.points.slice(1).map((_,i)=>cubic(p,i)),ls=cs.map(c=>length(c)),total=ls.reduce((a,b)=>a+b,0);let remain=Math.max(0,Math.min(1,fraction))*total,index=0;while(index<ls.length-1&&remain>ls[index])remain-=ls[index++];const c=cs[index];let a=0,b=1;for(let k=0;k<25;k++){const t=(a+b)/2;if(length(c,t)<remain)a=t;else b=t;}const t=(a+b)/2;return {point:point(c,t),tangent:tangent(c,t)};}
export type Sample={point:Point;t:number;segment:number};
export function samples(p:DrawingPath,error=.02):Sample[]{
 const result:Sample[]=[{point:p.points[0],t:0,segment:0}];
 for(let segment=0;segment<p.points.length-1;segment++){
  const pending=[{c:cubic(p,segment),a:0,b:1,depth:0}];
  while(pending.length){const {c,a,b,depth}=pending.pop()!,dx=c[3].x-c[0].x,dy=c[3].y-c[0].y,l=Math.hypot(dx,dy),distance=(q:Point)=>l?Math.abs(dx*(q.y-c[0].y)-dy*(q.x-c[0].x))/l:norm(add(q,c[0],-1)),projection=(q:Point)=>(q.x-c[0].x)*dx+(q.y-c[0].y)*dy;
   if(Math.max(distance(c[1]),distance(c[2]))<=error&&projection(c[1])>=-1e-9&&projection(c[2])<=l*l+1e-9&&projection(c[1])<=projection(c[2])+1e-9){result.push({point:c[3],t:b,segment});continue;}
   if(depth>=26)throw new Error('曲线细分超出精度预算');const [left,right]=split(c),m=(a+b)/2;pending.push({c:right,a:m,b,depth:depth+1},{c:left,a,b:m,depth:depth+1});
  }
 }
 return result;
}
export function pathD(p:DrawingPath):string{if(!p.curves)return 'M'+p.points.map(p=>`${p.x},${p.y}`).join('L');return `M ${p.points[0].x} ${p.points[0].y}`+p.points.slice(1).map((q,i)=>{const c=p.curves![i];return ` C ${c.c1.x} ${c.c1.y} ${c.c2.x} ${c.c2.y} ${q.x} ${q.y}`;}).join('');}
