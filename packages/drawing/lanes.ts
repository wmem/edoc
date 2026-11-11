import type {Drawing,Constraint} from './types.ts';
import {alignedPositions,automaticConstraintID} from './alignment.ts';
import {layoutDrawing} from './layout.ts';
import {DrawingError} from './types.ts';

// 泳道是职责列：先求全局控制顺序，再约束各列中的位置，不能逐泳道排完整流程。
export async function prepareLanes(input:Drawing):Promise<Drawing>{
 const lanes=input.nodes.filter(n=>n.shape==='lane');if(!lanes.length)return input;
 if((input.layout?.constraints??[]).some(r=>r.type==='place'||r.type==='order'||r.type==='align'))return input;
 const direction=input.layout?.direction??'TB';
 if(direction!=='TB')throw new DrawingError('DRAWING_CAPABILITY','layout',lanes.map(n=>n.id),'自动泳道目前使用 TB；其他方向请显式给出位置和对齐约束');
 const flat:Drawing={...input,nodes:input.nodes.filter(n=>n.shape!=='lane').map(n=>({...n,parentId:undefined})),layout:{...input.layout,constraints:(input.layout?.constraints??[]).filter(r=>!('node'in r)||!lanes.some(n=>n.id===r.node))}};
 const measured=await layoutDrawing(flat),rules:Constraint[]=[...input.layout?.constraints??[]];
 const positions=input.layout?.alignment==='auto'?alignedPositions(input,measured):new Map(measured.map(n=>[n.id,{x:n.x,y:n.y}]));
 const bottom=Math.max(...measured.map(n=>positions.get(n.id)!.y+n.height)),top=Math.min(0,...[...positions.values()].map(p=>p.y)),padding=80;
 const used=new Set(rules.map(r=>r.id));
 let left=0;
 for(const lane of lanes){
  const members=measured.filter(n=>input.nodes.find(s=>s.id===n.id)?.parentId===lane.id);
  const minX=Math.min(0,...members.map(n=>positions.get(n.id)!.x)),maxX=Math.max(160,...members.map(n=>positions.get(n.id)!.x+n.width)),width=maxX-minX+padding*2;
  rules.push({id:automaticConstraintID(used,'lane-place',lane.id),type:'place',node:lane.id,x:left,y:0},{id:automaticConstraintID(used,'lane-size',lane.id),type:'size',node:lane.id,width,height:bottom-top+padding*2+80});
  for(const n of members)rules.push({id:automaticConstraintID(used,'lane-node',n.id),type:'place',node:n.id,x:positions.get(n.id)!.x-minX+40,y:positions.get(n.id)!.y-top+40});
  left+=width+100;
 }
 return {...input,layout:{...input.layout,spacing:{...input.layout?.spacing,padding:40},constraints:rules}};
}
