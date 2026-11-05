import {measureText,wrapText,fontMetrics} from '../render-graph/text.ts';
type Matrix=[number,number,number,number,number,number];
const identity:Matrix=[1,0,0,1,0,0];
const multiply=(a:Matrix,b:Matrix):Matrix=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
function transform(value=''):Matrix{
 let matrix=identity;
 for(const match of value.matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)){
  const n=match[2].trim().split(/[\s,]+/).map(Number),angle=n[0]*Math.PI/180;let next:Matrix;
  switch(match[1]){
   case 'translate':next=[1,0,0,1,n[0],n[1]??0];break;
   case 'scale':next=[n[0],0,0,n[1]??n[0],0,0];break;
   case 'rotate':{const rotation:Matrix=[Math.cos(angle),Math.sin(angle),-Math.sin(angle),Math.cos(angle),0,0];next=n.length===3?multiply(multiply([1,0,0,1,n[1],n[2]],rotation),[1,0,0,1,-n[1],-n[2]]):rotation;break;}
   case 'matrix':if(n.length!==6)throw Error('WaveDrom matrix 参数错误');next=n as Matrix;break;
   case 'skewX':next=[1,0,Math.tan(angle),1,0,0];break;
   case 'skewY':next=[1,Math.tan(angle),0,1,0,0];break;
   default:throw Error('未支持的WaveDrom文字变换：'+match[1]);
  }
  matrix=multiply(matrix,next);
 }
 return matrix;
}
const sizeOf=(value:unknown,inherited:number)=>{const v=String(value??'');return v.endsWith('pt')?parseFloat(v)*4/3:v.endsWith('em')?parseFloat(v)*inherited:parseFloat(v)||inherited;};
const styleOf=(a:any)=>({...Object.fromEntries(String(a.style??'').split(';').map(v=>v.split(':').map(s=>s.trim())).filter(p=>p.length===2)),...a});
const plain=(node:any):string=>Array.isArray(node)?node.slice(typeof node[1]==='object'?2:1).map(plain).join(''):typeof node==='string'?node:'';

// 对WaveDrom生成的ONML计算文字边界；不用浏览器，也不改波形时间坐标。
export function fitWaveText(tree:any[],data:any):any[]{
 const root=tree[1],originalWidth=Number(root.width),originalHeight=Number(root.height);
 let minX=0,minY=0,maxX=originalWidth,maxY=originalHeight;
 const include=(m:Matrix,x:number,y:number,width:number,height:number)=>{
  for(const [px,py]of [[x,y],[x+width,y],[x,y+height],[x+width,y+height]]){const tx=m[0]*px+m[2]*py+m[4],ty=m[1]*px+m[3]*py+m[5];minX=Math.min(minX,tx);maxX=Math.max(maxX,tx);minY=Math.min(minY,ty);maxY=Math.max(maxY,ty);}
 };
 const visit=(node:any,parent:Matrix,fontSize:number)=>{
  if(!Array.isArray(node))return;
  const a=node[1]??{},style=styleOf(a),size=sizeOf(style['font-size'],fontSize),matrix=multiply(parent,transform(a.transform));
  if(node[0]==='defs')return;
  if(node[0]==='text'){
   const text=plain(node),head=typeof data.head?.text==='string'&&text===data.head.text,foot=typeof data.foot?.text==='string'&&text===data.foot.text;
   if((head||foot)&&measureText(text,size)>Math.max(240,Math.min(640,originalWidth-20))){
    const limit=Math.max(240,Math.min(640,originalWidth-20)),count=Math.ceil(measureText(text,size)/limit);
    const lines=wrapText(text,size,Math.min(limit,Math.ceil(measureText(text,size)/count+size*.5))),lineHeight=Math.ceil(size*1.65),base=Number(a.y??0);
    node.splice(2,node.length-2,...lines.map((line,i)=>['tspan',{x:a.x??0,y:base+(head?i-lines.length+1:i)*lineHeight},line]));
   }
   // 原生tspan保留字体、dx/dy、上/下标；以每个文本chunk计算占位。
   const runs:{text:string;x:number;y:number;size:number;width:number;chunk:number}[]=[];let cursorX=Number(a.x??0),cursorY=Number(a.y??0),chunk=0;
   const spans=(item:any,currentSize:number,family:string,baseline=0)=>{
    if(typeof item==='string'){const width=family.includes('monospace')?[...item].reduce((sum,c)=>sum+currentSize*(c.codePointAt(0)!<128?.7:1.5),0):measureText(item,currentSize);runs.push({text:item,x:cursorX,y:cursorY+baseline,size:currentSize,width,chunk});cursorX+=width;return;}
    if(!Array.isArray(item))return;const attr=styleOf(item[1]??{}),nextSize=sizeOf(attr['font-size'],currentSize);
    if(attr.x!==undefined||attr.y!==undefined)chunk++;
    if(attr.x!==undefined)cursorX=Number(attr.x);if(attr.y!==undefined)cursorY=Number(attr.y);
    cursorX+=attr.dx===undefined?0:sizeOf(attr.dx,nextSize);cursorY+=attr.dy===undefined?0:sizeOf(attr.dy,nextSize);
    const shift=baseline+(attr['baseline-shift']==='super'?-nextSize*.5:attr['baseline-shift']==='sub'?nextSize*.5:0);
    item.slice(2).forEach((child:any)=>spans(child,nextSize,attr['font-family']??family,shift));
   };
   node.slice(2).forEach(child=>spans(child,size,style['font-family']??'Noto Sans SC'));
   // 同一行的tspan共用text-anchor；独立x/y开始新行。
   const lines=new Map<number,typeof runs>();for(const run of runs){const list=lines.get(run.chunk)??[];list.push(run);lines.set(run.chunk,list);}
   for(const line of lines.values()){
    const start=Math.min(...line.map(r=>r.x)),end=Math.max(...line.map(r=>r.x+r.width)),offset=(style['text-anchor']==='end'?1:style['text-anchor']==='middle'?.5:0)*(end-start);
    for(const run of line){const margin=(Math.max(fontMetrics.left,fontMetrics.right)+.18)*run.size;include(matrix,run.x-offset-margin,run.y-fontMetrics.ascent*run.size-2,run.width+margin*2,(fontMetrics.ascent+fontMetrics.descent)*run.size+4);}
   }
   return;
  }
  node.slice(2).forEach((child:any)=>visit(child,matrix,size));
 };
 visit(tree,identity,14);
 const dx=Math.ceil(-minX+4),dy=Math.ceil(-minY+4),width=Math.ceil(maxX-minX+8),height=Math.ceil(maxY-minY+8);
 const fixed=tree.slice(2).filter(child=>Array.isArray(child)&&['defs','title','desc','metadata'].includes(child[0]));
 const content=tree.slice(2).filter(child=>!fixed.includes(child));
 tree.splice(2,tree.length-2,...fixed,['rect',{width,height,fill:'white'}],['g',{transform:`translate(${dx},${dy})`},...content]);
 Object.assign(root,{width,height,viewBox:`0 0 ${width} ${height}`});return tree;
}
