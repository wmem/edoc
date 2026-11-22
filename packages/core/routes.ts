import type {ResourceStep} from './resource-types.ts';
export type ResourceRoute={kind:'resource';project:string;id:string;view:'definition'|'instance';spaceId?:string;segments?:ResourceStep[];mountId?:string;anchor?:string;definitionId?:string};
export type Route={kind:'page'|'entity'|'pdf';project:string;id:string;anchor?:string;target?:string}|(ResourceRoute&{target?:undefined});
const routePrefix='#edoc=';
export const routeHash=(route:Route)=>routePrefix+encodeURIComponent(JSON.stringify(route));
export const targetKey=(project:string,id:string)=>JSON.stringify([project,id]);
export function parseRoute(hash:string):Route|undefined{
 try{
  if(!hash.startsWith(routePrefix))return;const value=JSON.parse(decodeURIComponent(hash.slice(routePrefix.length)));
  if(!value||!['page','entity','pdf','resource'].includes(value.kind)||typeof value.project!=='string'||typeof value.id!=='string'||['anchor','target'].some(k=>value[k]!==undefined&&typeof value[k]!=='string'))return;
  if(value.kind==='resource'){
   if(!value.project.trim()||!value.id.trim()||!['definition','instance'].includes(value.view)||Object.keys(value).some(k=>!['kind','project','id','view','spaceId','segments','mountId','anchor','definitionId'].includes(k)))return;
   if(['spaceId','mountId','definitionId'].some(k=>value[k]!==undefined&&(typeof value[k]!=='string'||!value[k].trim())))return;
   if(value.view==='definition'&&(value.segments!==undefined||value.spaceId!==undefined)||value.view==='instance'&&(!Array.isArray(value.segments)||value.segments.some((s:any)=>!s||typeof s!=='object'||Array.isArray(s)||typeof s.kind!=='string')))return;
   if(value.spaceId!==undefined&&value.spaceId!==value.id)return;
  }
  return value;
 }catch{return;}
}
