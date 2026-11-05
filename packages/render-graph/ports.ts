import type {Scene,ScenePort} from './scene.ts';
import type {Port} from '../core/types.ts';
export const portLabel=(port:ScenePort)=>port.displayLabel??port.label;
export const unconnectedNote=' · 本视图未显示连接';
export function portAnnotation(port:Port,domain='',keys:string[]=[]):string{
 const attrs=keys.map(key=>port.attributes?.[key]===undefined||(key==='function'&&port.attributes[key]===port.label)?'':key+' '+port.attributes[key]).filter(Boolean);
 return [port.direction,port.width!==undefined?port.width+'b':port.widthExpr??'',domain?'@'+domain:'',...attrs].filter(Boolean).join(' · ');
}
export function widthRange(port:Port):string{
 return port.width!==undefined?(port.width>1?`[${port.width-1}:0]`:''):port.widthExpr?`[(${port.widthExpr})-1:0]`:'';
}
// 引线只表达接口边界，既不是新Net，也不表示图外有一个虚构模块。
export function decoratePortLeads(scene:Scene):Scene{
 if(scene.kind!=='interface')return scene;
 const connected=new Set(scene.nets.flatMap(net=>net.endpoints));
 for(const node of scene.nodes)for(const port of node.ports){
  delete port.lead;
  if(port.slot||port.interfaceHeader&&!port.collapsed||connected.has(port.id))continue;
  let incoming=port.direction==='in'||port.direction==='inout',outgoing=port.direction==='out'||port.direction==='inout';
  if(port.interfaceHeader){const iface=scene.interfaces?.find(i=>i.id===port.id),owner=scene.interfaceModel?.nodes.find(n=>n.id===node.id);const members=owner?.ports?.filter(p=>iface?.visibleMembers.includes(p.id))??[];incoming=members.some(p=>p.direction==='in'||p.direction==='inout');outgoing=members.some(p=>p.direction==='out'||p.direction==='inout');}
  const sign=port.side==='left'?-1:1;
  port.lead={points:[{x:port.x+sign*28,y:port.y},{x:port.x+sign*6,y:port.y}],startArrow:outgoing,endArrow:incoming,aggregate:!!port.interfaceHeader};
 }
 return scene;
}
