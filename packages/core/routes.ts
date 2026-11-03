export type Route={kind:'page'|'entity'|'pdf';project:string;id:string;anchor?:string;target?:string};
const routePrefix='#edoc=';
export const routeHash=(route:Route)=>routePrefix+encodeURIComponent(JSON.stringify(route));
export const targetKey=(project:string,id:string)=>JSON.stringify([project,id]);
export function parseRoute(hash:string):Route|undefined{
 try{if(!hash.startsWith(routePrefix))return;const value=JSON.parse(decodeURIComponent(hash.slice(routePrefix.length)));if(!value||!['page','entity','pdf'].includes(value.kind)||typeof value.project!=='string'||typeof value.id!=='string'||['anchor','target'].some(k=>value[k]!==undefined&&typeof value[k]!=='string'))return;return value;}catch{return;}
}
