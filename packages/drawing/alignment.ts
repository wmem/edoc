import type {Drawing,NodeGeometry,Point,Constraint} from './types.ts';
import {measureText,wrapText} from '../render-graph/text.ts';
import {layoutDrawing} from './layout.ts';
import {cyclicPositions} from './cycles.ts';

export function automaticConstraintID(used:Set<string>,...parts:string[]):string{let count=0,id=JSON.stringify(['auto-layout',...parts]);while(used.has(id))id=JSON.stringify(['auto-layout',...parts,++count]);used.add(id);return id;}
export const hasPositionIntent=(d:Drawing)=>(d.layout?.constraints??[]).some(r=>['place','align','order','route','fixedRoute'].includes(r.type));
// 布局关系只用于显示：从入口识别反馈边，前向DAG决定层次；布局不改变语义与迁移优先级。
export function alignedPositions(d:Drawing,measured:NodeGeometry[]):Map<string,Point>{
 measured=measured.map(n=>({...n,parentId:d.nodes.find(source=>source.id===n.id)?.parentId}));
 const direction=d.layout?.direction??'LR',axis=direction==='LR'||direction==='RL'?'x':'y',cross=axis==='x'?'y':'x',size=axis==='x'?'width':'height',crossSize=axis==='x'?'height':'width',sign=direction==='RL'||direction==='BT'?-1:1;
 const nodes=new Map(measured.map(n=>[n.id,n])),at=(n:NodeGeometry)=>(n[axis]+n[size]/2)*sign;
 const allEdges=d.connections.filter(c=>c.ends.length===2&&c.ends[0].node!==c.ends[1].node).map(c=>({c,a:nodes.get(c.ends[0].node)!,b:nodes.get(c.ends[1].node)!})).filter(e=>e.a&&e.b);
 const outgoing=new Map(measured.map(n=>[n.id,allEdges.filter(e=>e.a.id===n.id)])),color=new Map<string,number>(),feedback=new Set<string>();
 const roots=measured.slice().sort((a,b)=>Number(allEdges.some(e=>e.b.id===a.id))-Number(allEdges.some(e=>e.b.id===b.id))||at(a)-at(b));
 // 入口开始的迭代DFS只把指向当前祖先的边列为反馈；跨分支汇合仍是前向关系。
 for(const first of roots){if(color.has(first.id))continue;color.set(first.id,1);const stack=[{id:first.id,next:0}];while(stack.length){const top=stack.at(-1)!,edges=outgoing.get(top.id)!;if(top.next===edges.length){color.set(top.id,2);stack.pop();continue;}const edge=edges[top.next++],state=color.get(edge.b.id);if(state===1){feedback.add(edge.c.id);continue;}if(state!==2){color.set(edge.b.id,1);stack.push({id:edge.b.id,next:0});}}}
 const edges=allEdges.filter(e=>!feedback.has(e.c.id)),rank=new Map(measured.map(n=>[n.id,0])),incoming=new Map(measured.map(n=>[n.id,edges.filter(e=>e.b.id===n.id).length])),pending=measured.filter(n=>incoming.get(n.id)===0).map(n=>n.id);
 for(let i=0;i<pending.length;i++)for(const e of edges.filter(e=>e.a.id===pending[i])){rank.set(e.b.id,Math.max(rank.get(e.b.id)!,rank.get(e.a.id)!+1));incoming.set(e.b.id,incoming.get(e.b.id)!-1);if(incoming.get(e.b.id)===0)pending.push(e.b.id);}
 const parent=new Map(measured.map(n=>[n.id,n.id]));
 const root=(id:string):string=>{let at=id;while(parent.get(at)!==at)at=parent.get(at)!;return at;};
 for(const e of edges)if(e.a.parentId===e.b.parentId&&edges.filter(other=>other.a.id===e.a.id).length===1&&edges.filter(other=>other.b.id===e.b.id).length===1){parent.set(root(e.b.id),root(e.a.id));}
 const groups=new Map<string,NodeGeometry[]>();for(const n of measured){const id=root(n.id);if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(n);}
 const gap=d.layout?.spacing?.node??64,centers=new Map<string,number>();
 for(const owner of new Set(measured.map(n=>n.parentId))){
  const assigned:{min:number;max:number;column:number}[]=[],local=[...groups.values()].filter(g=>g[0].parentId===owner).map(g=>({g,min:Math.min(...g.map(n=>rank.get(n.id)!)),max:Math.max(...g.map(n=>rank.get(n.id)!)),old:g.reduce((sum,n)=>sum+n[cross]+n[crossSize]/2,0)/g.length})).sort((a,b)=>a.min-b.min||a.old-b.old);
  const pitch=Math.max(100,...measured.filter(n=>n.parentId===owner).map(n=>n[crossSize]))+gap;
  for(const group of local){let column=0;while(assigned.some(other=>other.column===column&&other.min<=group.max&&other.max>=group.min))column++;assigned.push({...group,column});for(const n of group.g)centers.set(n.id,column*pitch);}
 }
 const count=Math.max(0,...rank.values())+1,levels:number[]=[],sizes:number[]=[],gaps:number[]=[];
 for(let i=0;i<count;i++){
  sizes[i]=Math.max(28,...measured.filter(n=>rank.get(n.id)===i).map(n=>n[size]));
  const labels=edges.filter(e=>rank.get(e.a.id)===i&&rank.get(e.b.id)===i+1).flatMap(e=>(e.c.labels??[]).map(l=>{const lines=wrapText(l.text,14,200);return axis==='x'?Math.max(...lines.map(line=>measureText(line,14)))+16:lines.length*21+8;}));
  const parallel=new Map<string,number>();for(const e of edges.filter(e=>rank.get(e.a.id)===i&&rank.get(e.b.id)===i+1)){const key=JSON.stringify([e.a.id,e.b.id]),length=(e.c.labels??[]).reduce((sum,l)=>{const lines=wrapText(l.text,14,200);return sum+(axis==='x'?Math.max(...lines.map(line=>measureText(line,14)))+16:lines.length*21+8);},0);parallel.set(key,(parallel.get(key)??0)+length+20);}
  gaps[i]=Math.max(d.layout?.spacing?.layer??100,...labels.map(s=>s+56),...[...parallel.values()].map(size=>size+36));levels[i]=i?levels[i-1]+sizes[i-1]+gaps[i-1]:0;
 }
 const result=new Map<string,Point>();
 for(const n of measured){const level=rank.get(n.id)!,primary=sign>0?levels[level]+(sizes[level]-n[size])/2:-levels[level]-(sizes[level]+n[size])/2;result.set(n.id,{[axis]:primary,[cross]:centers.get(n.id)!-n[crossSize]/2} as Point);}
 return result;
}
export async function prepareAlignment(input:Drawing):Promise<Drawing>{
 if(input.layout?.alignment!=='auto'||hasPositionIntent(input)||input.nodes.some(n=>n.parentId||n.ports?.length))return input;
 const measured=await layoutDrawing(input),positions=(input.layout?.arrangement==='cyclic'?await cyclicPositions(input,measured):undefined)??alignedPositions(input,measured),minX=Math.min(...[...positions.values()].map(p=>p.x)),minY=Math.min(...[...positions.values()].map(p=>p.y));
 const used=new Set((input.layout?.constraints??[]).map(r=>r.id));
 const rules:Constraint[]=[...input.layout?.constraints??[],...input.nodes.map(n=>({id:automaticConstraintID(used,'align',n.id),type:'place' as const,node:n.id,x:positions.get(n.id)!.x-minX,y:positions.get(n.id)!.y-minY}))];
 return {...input,layout:{...input.layout,constraints:rules}};
}
