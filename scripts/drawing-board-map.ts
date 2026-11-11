import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import type {Drawing, Constraint, Side} from '../packages/drawing/types.ts';
import type {ProjectDrawing} from './drawing-projects.ts';

// 只读显示投影：显示坐标与几何不进入电气事实；通道必须能从项目来源解析。
export function hardwareBoardMap(root: string): ProjectDrawing {
  const file='board/v01/definition/architecture.json', policyFile='board/v01/definition/board-map.json',portsFile='board/v01/definition/ports.json';
  const read=(file:string)=>JSON.parse(readFileSync(join(root,file),'utf8'));
  const facts=read(file),policy=read(policyFile),panels=read(portsFile).ports;
  if(policy.schemaVersion!=='board-map-1')throw Error('未知模块地图版本');
  const constraints:Constraint[]=[],nodes:Drawing['nodes']=[],resolved:any[]=[];
  for(const b of policy.boards){
    if(!facts.boards.some((n:any)=>n.key===b.id))throw Error('板卡来源不存在：'+b.id);
    nodes.push({id:b.id,label:b.label,originIds:[file+'#boards/'+b.id]});
    constraints.push({id:b.id+'/place',type:'place',node:b.id,x:b.x,y:b.y});
  }
  for(const m of policy.modules){
    const members=m.members.map((key:string)=>facts.nodes.find((n:any)=>n.key===key));
    if(members.some((n:any)=>!n||n.board!==m.board))throw Error('模块成员缺少来源或跨板：'+m.id);
    const origins=members.map((n:any)=>file+'#nodes/'+n.key),scope:any={id:m.id,members:m.members};
    if(m.panel){
      const p=panels.find((p:any)=>p.panel===m.panel&&p.board===m.board);
      if(!p||!members.some((n:any)=>n.modules.includes(p.module)))throw Error('模块面板无法解析：'+m.id);
      origins.push(portsFile+'#ports/'+p.panel);scope.panel=p;
      const raw=read('board/v01/derived/boards/'+m.board.toLowerCase()+'.json');
      const refs=String(p.device).split('/');
      if(refs.every((ref:string)=>raw.parts[ref]))scope.devices=refs.map((ref:string)=>({ref,value:raw.parts[ref].value,source:raw.parts[ref].source}));
    }
    if(m.channel){
      const member=members.find((n:any)=>n.key===m.channel.member),boardFile='board/v01/derived/boards/'+m.board.toLowerCase()+'.json',raw=read(boardFile);
      const matches=(member?.refs[m.board]??[]).filter((ref:string)=>raw.parts[ref]?.pins.some((p:any)=>p.net===m.channel.net));
      if(matches.length!==1)throw Error('内部通道器件选择不唯一：'+m.id);
      scope.channel={...m.channel,ref:matches[0],value:raw.parts[matches[0]].value};origins.push(boardFile+'#parts/'+matches[0]);
    }
    resolved.push(scope);
    nodes.push({id:m.id,label:m.label,parentId:m.board,originIds:origins,ports:[]});
    const [x,y,width,height]=m.rect;
    constraints.push({id:m.id+'/place',type:'place',node:m.id,x,y},{id:m.id+'/size',type:'size',node:m.id,width,height});
  }
  const pairs=new Set<string>();
  const connections:Drawing['connections']=policy.relations.map((r:any)=>{
    const sources=r.sources.map((key:string)=>facts.interactions.find((e:any)=>e.key===key));
    if(sources.some((e:any)=>!e||e.class==='power'))throw Error('地图关系缺少来源或混入供电：'+r.id);
    const members = new Set(r.ends.flatMap((e:any)=>policy.modules.find((m:any)=>m.id===e.node)?.members??[]));
    if(sources.some((e:any)=>!members.has(e.from)||!members.has(e.to)))throw Error('关系来源超出显示模块成员：'+r.id);
    const pair=r.ends.map((e:any)=>e.node).sort().join('/');if(pairs.has(pair))throw Error('同对模块重复关系：'+pair);pairs.add(pair);
    const origins=sources.map((e:any)=>file+'#interactions/'+e.key);
    const ends=r.ends.map((e:any,i:number)=>{
      const n=nodes.find(n=>n.id===e.node);if(!n?.parentId)throw Error('关系端点缺少模块：'+r.id);
      if(r.frame&&n.parentId!==r.frame)throw Error('关系超出板内坐标系：'+r.id);
      const port=r.id+'/'+i;n.ports!.push({id:port,label:'',appearance:'slot',originIds:origins});
      constraints.push({id:port+'/anchor',type:'port',node:n.id,port,side:e.side as Side,offset:e.offset});
      return {id:String(i),node:n.id,port};
    });
    if(nodes.find(n=>n.id===ends[0].node)!.parentId!==nodes.find(n=>n.id===ends[1].node)!.parentId&&ends.some((e:any)=>!e.node.startsWith('interboard-')))throw Error('跨板关系绕过BTB');
    constraints.push({id:r.id+'/route',type:'fixedRoute',connection:r.id,...r.frame?{frame:r.frame}:{},paths:[{id:'path',from:{end:'0'},to:{end:'1'},via:r.via.map(([x,y]:number[])=>({x,y}))}]});
    return {id:r.id,ends,originIds:origins,labels:[{id:'name',text:r.label}],style:sources.every((e:any)=>['control','event'].includes(e.class))?'control':'data'};
  });
  return {name:'hardware-system',title:policy.title,page:'hardware',description:policy.description,
    drawing:{schemaVersion:'1.0',id:'hardware-system',nodes,connections,layout:{direction:'TB',spacing:{node:32,layer:64,edge:16,port:24,padding:28},constraints}},
    sources:{root,file,policyFile,portsFile,policy,resolved,interactions:facts.interactions}};
}
