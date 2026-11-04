#!/usr/bin/env node
// 演示只编排现有数据与 Markdoc；HTML、SVG 均由正式渲染链路产生。
import {readFileSync,writeFileSync,mkdirSync,renameSync,rmSync,existsSync} from 'node:fs';
import {createServer} from 'node:http';
import {dirname,join,resolve,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadConfig,loadIR} from '../packages/core/index.ts';
import {html} from '../packages/pack-html/index.ts';
import {scene,svg} from '../packages/render-graph/index.ts';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'.edoc-build/gallery'),ir=join(output,'ir');
const flags=process.argv.slice(2);
if(flags.some(f=>!['--build'].includes(f)))throw new Error('用法：npm run demo 或 npm run demo:build');
const buildOnly=flags.includes('--build');
mkdirSync(ir,{recursive:true});
for(const file of ['demo.html','demo.pdf','architecture.svg','wiring.svg','states.svg','layout.svg'])rmSync(join(output,file),{force:true});
const resources:Record<string,any[]>={};
for(const name of ['board-flash','fpga-mac']){
 const config=loadConfig(join(root,'examples',name,'edoc.config.json'));
 const manifest=JSON.parse(readFileSync(join(config.irDirectory,'manifest.json'),'utf8'));
 const prefix=relative(root,config.projectRoot).split('\\').join('/');
 function relocate(value:any):any{
  if(Array.isArray(value))return value.map(relocate);
  if(value&&typeof value==='object'){
   const copy=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,relocate(v)]));
   if(typeof copy.source?.file==='string')copy.source.file=prefix+'/'+copy.source.file;
   return copy;
  }
  return value;
 }
 for(const resource of manifest.resources){
  const data=relocate(JSON.parse(readFileSync(join(config.irDirectory,resource.path),'utf8')));
  (resources[resource.type]??=[]).push(...data[resource.type]);
 }
}
const layoutSource='examples/gallery/layouts.json',layouts=JSON.parse(readFileSync(join(root,layoutSource),'utf8'));
for(const type of ['objects','relations'])resources[type].push(...layouts[type].map((e:any)=>({...e,source:{file:layoutSource,selector:e.id}})));
for(const direction of layouts.directions)resources.views.push({id:'gallery:layout-'+direction,kind:'architecture',label:'同一组关系 · '+direction,include:{objects:layouts.objects.slice(0,5).map((n:any)=>n.id),relations:layouts.relations.slice(0,5).map((n:any)=>n.id)},layout:{direction,routing:'orthogonal'},source:{file:layoutSource,selector:'directions'}});
resources.views.push({id:'gallery:fixed',kind:'architecture',label:'固定位置 · 障碍绕行',include:{objects:layouts.objects.slice(5).map((n:any)=>n.id),relations:['gallery:bypass']},layout:{direction:'LR',routing:'orthogonal',positions:layouts.fixedPositions},source:{file:layoutSource,selector:'fixedPositions'}});
const interfaceData=JSON.parse(readFileSync(join(root,'examples/gallery/interfaces.json'),'utf8'));
for(const type of ['objects','relations','views'])resources[type].push(...interfaceData[type]);
const constraintSource='examples/gallery/constraints.json',constraintData=JSON.parse(readFileSync(join(root,constraintSource),'utf8'));
resources.views.push(...constraintData.views.map((v:any)=>({...v,source:{file:constraintSource,selector:v.id}})));
function json(file:string,data:unknown){writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
for(const [type,items]of Object.entries(resources))json(join(ir,type+'.json'),{[type]:items});
json(join(ir,'manifest.json'),{irVersion:'1.2',requiredFeatures:['interface-groups','layout-intent'],projectId:'edoc-graphics-demo',adapterVersion:'gallery-1.0',resources:Object.keys(resources).map(type=>({type,path:type+'.json'})),entryDocuments:['docs/development/regression/graphics.mdoc','examples/fpga-mac/docs/SPEC.mdoc','examples/fpga-mac/docs/VERIFY.mdoc']});
const graph=loadIR(ir,{projectRoot:root});
const target=join(output,'demo.html'),pending=target+'.pending';
try{writeFileSync(pending,await html(graph,'edoc · 图形能力 Demo',{compactIndex:true}));renameSync(pending,target);}catch(error){rmSync(target,{force:true});throw error;}finally{rmSync(pending,{force:true});}
console.log('已生成 '+target);
const exports:Record<string,string>={'wiring.svg':'board:flash-wiring','architecture.svg':'mac:overview','states.svg':'mac:tx-state','layout.svg':'gallery:layout-TB','architecture-intent.svg':'gallery:architecture-intent','wiring-intent.svg':'gallery:wiring-intent'};
for(const [file,id]of Object.entries(exports))writeFileSync(join(output,file),svg(await scene(graph,id)));
// 开发浏览器验证的配置与 HTML/SVG 构建分开，不启动或下载浏览器。
const candidates=[process.env.EDOC_CHROMIUM,process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,process.env.HOME?join(process.env.HOME,'work/software/playwright-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'):undefined];
const executable=candidates.find(p=>p&&existsSync(p));
json(join(output,'playwright.config.json'),{browser:{browserName:'chromium',launchOptions:{headless:true,...(executable?{executablePath:executable}:{}),args:['--no-sandbox']}}});
if(!buildOnly){
 const port=Number(process.env.DEMO_PORT??5174);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('DEMO_PORT 范围 1–65535');
 const allowed:Record<string,[string,string]>={'/':[target,'text/html; charset=utf-8'],'/demo.html':[target,'text/html; charset=utf-8'],...Object.fromEntries(Object.keys(exports).map(file=>['/'+file,[join(output,file),'image/svg+xml']]))};
 const server=createServer((request,response)=>{
  const path=new URL(request.url??'/','http://localhost').pathname;
  if(path==='/favicon.ico'){response.writeHead(204);response.end();return;}
  const resource=allowed[path];if(!resource||!existsSync(resource[0])){response.writeHead(404);response.end('Not found');return;}
  response.writeHead(200,{'Content-Type':resource[1],'Cache-Control':'no-store'});response.end(readFileSync(resource[0]));
 });
 server.on('error',error=>{console.error(error.message);process.exitCode=1;});
 server.listen(port,'127.0.0.1',()=>console.log(`Demo 已就绪：http://127.0.0.1:${port}/`));
 process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
}
