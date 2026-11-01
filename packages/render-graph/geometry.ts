// 纯几何工具同时供构建端与只读交互端使用，不引入 DOM 或工程语义。
export type Point={x:number;y:number};
export type Rect=Point&{width:number;height:number};
export type LabelBox=Rect&{lines:string[]};
export const same=(a:Point,b:Point)=>Math.abs(a.x-b.x)<.001&&Math.abs(a.y-b.y)<.001;
export const distance=(a:Point,b:Point)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y);
export function textWidth(text:string,size=12):number{return [...text].reduce((sum,c)=>sum+size*(/[MW@#%&]/.test(c)?.98:/[ilI.,:;'!| ]/.test(c)?.38:c.codePointAt(0)!<128?.72:1.04),0);}
export function labelBox(text:string):LabelBox{
 const lines:string[]=[];let line='';
 for(const c of text){if(c==='\n'||(line&&textWidth(line+c,14)>174)){lines.push(line);line=c==='\n'?'':c;}else line+=c;}
 if(line||!lines.length)lines.push(line);
 return {x:0,y:0,width:Math.max(28,...lines.map(l=>textWidth(l,14)+14)),height:lines.length*20+8,lines};
}
export function intersects(a:Rect,b:Rect,pad=0){return a.x<b.x+b.width+pad&&b.x<a.x+a.width+pad&&a.y<b.y+b.height+pad&&b.y<a.y+a.height+pad;}
export function inside(p:Point,r:Rect){return p.x>r.x+.01&&p.x<r.x+r.width-.01&&p.y>r.y+.01&&p.y<r.y+r.height-.01;}
export function crosses(a:Point,b:Point,r:Rect):boolean{
 if(same(a,b))return false;
 let lo=0,hi=1;
 for(const [key,min,max]of [['x',r.x+.01,r.x+r.width-.01],['y',r.y+.01,r.y+r.height-.01]]as const){
  const d=b[key]-a[key];if(Math.abs(d)<.0001){if(a[key]<min||a[key]>max)return false;}
  else{const v=(min-a[key])/d,w=(max-a[key])/d;lo=Math.max(lo,Math.min(v,w));hi=Math.min(hi,Math.max(v,w));if(lo>=hi)return false;}
 }
 return lo<hi;
}
export function simplify(points:Point[]):Point[]{
 const out:Point[]=[];
 for(const p of points){if(out.length&&same(out.at(-1)!,p))continue;while(out.length>1){const a=out.at(-2)!,b=out.at(-1)!;if((a.x===b.x&&b.x===p.x&&(b.y-a.y)*(p.y-b.y)>=0)||(a.y===b.y&&b.y===p.y&&(b.x-a.x)*(p.x-b.x)>=0))out.pop();else break;}out.push({...p});}
 return out;
}
export function splitPath(points:Point[]):{hub:Point;first:Point[];last:Point[]}{
 let left=points.slice(1).reduce((sum,p,i)=>sum+distance(points[i],p),0)/2;
 for(let i=1;i<points.length;i++){const a=points[i-1],b=points[i],length=distance(a,b);if(left<=length&&length){const hub={x:a.x+(b.x-a.x)*left/length,y:a.y+(b.y-a.y)*left/length};return {hub,first:simplify([...points.slice(0,i),hub]),last:simplify([hub,...points.slice(i)]).reverse()};}left-=length;}
 const hub=points[0];return {hub,first:[hub,hub],last:[hub,hub]};
}

// 固定位置/层级包围框不能复用移动前的 ELK 路径；在矩形可见网格上求带折点代价的最短路。
export function orthogonal(start:Point,end:Point,obstacles:Rect[],used:Point[][]=[],options:{contacts?:Point[]}={}):Point[]{
 const xs=[...new Set([start.x,end.x,...used.flatMap(path=>path.flatMap(p=>[p.x-12,p.x,p.x+12])),...obstacles.flatMap(r=>[r.x-24,r.x,r.x+r.width,r.x+r.width+24]),Math.min(start.x,end.x,...obstacles.map(r=>r.x))-60,Math.max(start.x,end.x,...obstacles.map(r=>r.x+r.width))+60])].sort((a,b)=>a-b);
 const ys=[...new Set([start.y,end.y,...used.flatMap(path=>path.flatMap(p=>[p.y-12,p.y,p.y+12])),...obstacles.flatMap(r=>[r.y-24,r.y,r.y+r.height,r.y+r.height+24]),Math.min(start.y,end.y,...obstacles.map(r=>r.y))-60,Math.max(start.y,end.y,...obstacles.map(r=>r.y+r.height))+60])].sort((a,b)=>a-b);
 const w=xs.length,h=ys.length,count=w*h,point=(cell:number)=>({x:xs[cell%w],y:ys[Math.floor(cell/w)]});
 const valid=new Uint8Array(count);for(let i=0;i<count;i++)valid[i]=obstacles.some(r=>inside(point(i),r))?0:1;
 const begin=ys.indexOf(start.y)*w+xs.indexOf(start.x),finish=ys.indexOf(end.y)*w+xs.indexOf(end.x);
 const costs=new Float64Array(count*3).fill(Infinity),previous=new Int32Array(count*3).fill(-1);
 const heap:{state:number;cost:number}[]=[];
 const push=(item:{state:number;cost:number})=>{heap.push(item);let i=heap.length-1;while(i){const p=(i-1)>>1;if(heap[p].cost<=item.cost)break;heap[i]=heap[p];i=p;}heap[i]=item;};
 const pop=()=>{const result=heap[0],last=heap.pop()!;if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].cost<heap[child].cost)child++;if(heap[child].cost>=last.cost)break;heap[i]=heap[child];i=child;}heap[i]=last;}return result;};
 costs[begin*3]=0;push({state:begin*3,cost:0});let found=-1;
 while(heap.length){const {state,cost}=pop();if(cost!==costs[state])continue;const cell=Math.floor(state/3),direction=state%3;if(cell===finish){found=state;break;}
  const x=cell%w,y=Math.floor(cell/w),a=point(cell);
  for(const [next,axis]of [[x?cell-1:-1,1],[x<w-1?cell+1:-1,1],[y?cell-w:-1,2],[y<h-1?cell+w:-1,2]]){
   if(next<0||!valid[next])continue;const b=point(next);if(obstacles.some(r=>crosses(a,b,r)))continue;
   let penalty=0,blocked=false;
   for(const path of used){
    // 交叉只允许穿过直线内部；不能贴上另一关系的端点或折角，造成假分叉。
    if(path.some(p=>!options.contacts?.some(c=>same(c,p))&&crosses(a,b,{x:p.x-8,y:p.y-8,width:16,height:16})))blocked=true;
    for(let i=1;i<path.length;i++){const c=path[i-1],d=path[i];
     const horizontal=a.y===b.y&&c.y===d.y,vertical=a.x===b.x&&c.x===d.x;
     const overlap=horizontal?Math.min(Math.max(a.x,b.x),Math.max(c.x,d.x))-Math.max(Math.min(a.x,b.x),Math.min(c.x,d.x)):vertical?Math.min(Math.max(a.y,b.y),Math.max(c.y,d.y))-Math.max(Math.min(a.y,b.y),Math.min(c.y,d.y)):0;
     if(overlap>.001&&((horizontal&&Math.abs(a.y-c.y)<7.99)||(vertical&&Math.abs(a.x-c.x)<7.99)))blocked=true;
     if(!horizontal&&!vertical&&crosses(a,b,{x:Math.min(c.x,d.x)-.1,y:Math.min(c.y,d.y)-.1,width:Math.abs(c.x-d.x)+.2,height:Math.abs(c.y-d.y)+.2}))penalty+=45;
    }
   }
   if(blocked)continue;
   const value=cost+distance(a,b)+(direction&&direction!==axis?34:0)+penalty,index=next*3+axis;
   if(value<costs[index]){costs[index]=value;previous[index]=state;push({state:index,cost:value});}
  }
 }
 if(found<0)throw new Error('固定位置没有可用的避障通道，请调整视图位置或拆分视图');
 const path:Point[]=[];for(let state=found;state>=0;state=previous[state])path.push(point(Math.floor(state/3)));
 return simplify(path.reverse());
}

// 标题中心直接落在所属线段上；白底只遮断本关系，不遮住其他关系。
export function placeLabel(box:LabelBox,paths:Point[][],nodes:Rect[],labels:Rect[],otherPaths:Point[][]=[],preferred?:Point):LabelBox{
 const segments=paths.flatMap(path=>path.slice(1).map((p,i)=>({a:path[i],b:p,length:distance(path[i],p)}))).sort((a,b)=>b.length-a.length);
 const available=(r:Rect)=>!nodes.some(n=>intersects(r,n,5))&&!labels.some(l=>intersects(r,l,6))&&!otherPaths.some(path=>path.slice(1).some((p,i)=>crosses(path[i],p,r)));
 for(const {a,b,length}of segments){
  if(!length)continue;
  const dx=Math.abs(b.x-a.x),dy=Math.abs(b.y-a.y);
  const margin=Math.min(dx?(box.width/2+7)/dx:Infinity,dy?(box.height/2+7)/dy:Infinity);
  if(margin>.5)continue;
  const fraction=preferred?((preferred.x-a.x)*(b.x-a.x)+(preferred.y-a.y)*(b.y-a.y))/((b.x-a.x)**2+(b.y-a.y)**2):.5;
  const fractions=[Math.max(margin,Math.min(1-margin,fraction)),.5,.25,.75];
  for(let offset=12;offset<length/2;offset+=12)fractions.push(.5-offset/length,.5+offset/length);
  for(const fraction of fractions){
   if(fraction<margin||fraction>1-margin)continue;
   const candidate={...box,x:a.x+(b.x-a.x)*fraction-box.width/2,y:a.y+(b.y-a.y)*fraction-box.height/2};
   if(available(candidate))return candidate;
  }
 }
 throw new Error('连线标题没有可读的线上位置，请增加视图间距或拆分视图');
}
