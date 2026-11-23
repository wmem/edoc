import {namespacePendingSVG} from './deferred-svg.ts';
import type {SceneStorage} from './scene-storage.ts';
import type {OutlineEntry} from './outline.ts';
import type {Scene} from '../render-graph/scene.ts';
import type {ResourceBinding} from './resource-types.ts';
import type {ResourceRoute} from './routes.ts';
import {routeHash,parseRoute} from './routes.ts';
import {anchor,anchorCandidates} from './identity.ts';
import {failure} from './errors.ts';
export type ResourceBody=SceneStorage&{project:string;page:string;sectionId:string;sourceAnchor?:string;html:string;outline:OutlineEntry[];scenes:Record<string,Scene>;anchorAliases?:Record<string,string>;links?:Record<string,string>};
export const resourceBodyKey=(project:string,sectionId:string)=>JSON.stringify([project,sectionId]);
export function namespaceResourceBody(body:ResourceBody,binding:ResourceBinding,route:ResourceRoute,index:number){
 const prefix=`resource-author-${index}-${anchor(body.project+'/'+body.sectionId)}-`,ids=new Map<string,string>();
 const live=body.html.replace(/<template\b[\s\S]*?<\/template>/g,'');
 for(const match of live.matchAll(/\sid="([^"]+)"/g)){if(ids.has(match[1]))failure('RESOURCE_ANCHOR',binding.source.file,`#L${binding.source.line}`,'绑定正文存在重复锚点：'+match[1]);ids.set(match[1],prefix+match[1]);}
 const local=(id:string)=>anchorCandidates(id).map(key=>ids.get(key)??(body.anchorAliases?.[key]?ids.get(body.anchorAliases[key]):undefined)).find(Boolean);
 let html=namespacePendingSVG(body.html,prefix).replace(/\sid="([^"]+)"/g,(_all,id)=>` id="${prefix+id}"`);
 html=html.replace(/\bdata-register-presentation="([^"]+)"/g,(_all,id)=>`data-register-presentation="${prefix+id}"`).replace(/\bdata-table="(register-field-table:[^"]+)"/g,(_all,id)=>`data-table="${prefix+id}"`);
 html=html.replace(/(<a\b[^>]*\bhref=")([^"]+)(")/g,(all,before,href,after)=>{
  const decoded=href.replace(/&amp;/g,'&').replace(/&quot;/g,'"');let fragment:string|undefined;
  if(decoded.startsWith('#')&&!parseRoute(decoded))try{fragment=decodeURIComponent(decoded.slice(1));}catch{}
  const destination=fragment?local(fragment):undefined;
  if(destination)return before+routeHash({...route,anchor:destination})+after;
  if(fragment&&body.links?.[fragment])return before+body.links[fragment]+after;
  return all;
 });
 // SVG 的内部引用是图形定义引用，不能改写成页面导航路由。
 html=html.replace(/(<(?:use|textPath|image)\b[^>]*\b(?:href|xlink:href)=")#([^"]+)(")/g,(_all,before,id,after)=>before+'#'+prefix+id+after);
 html=html.replace(/<[^>]+>/g,tag=>tag.replace(/url\(#([^)]+)\)/g,(_all,id)=>`url(#${prefix+id})`).replace(/\b(aria-labelledby|aria-controls|for)="([^"]+)"/g,(_all,key,value)=>`${key}="${value.split(' ').map((id:string)=>ids.get(id)??id).join(' ')}"`));
 const outline=(nodes:OutlineEntry[]):OutlineEntry[]=>nodes.map(node=>({...node,id:prefix+node.id,parentId:node.parentId?prefix+node.parentId:undefined,children:outline(node.children)}));
 return {html,outline:outline(body.outline),aliases:Object.fromEntries([...ids].flatMap(([id,value])=>[[id,value]]))};
}
