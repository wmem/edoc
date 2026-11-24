import {createServer} from 'node:http';
import {networkInterfaces} from 'node:os';
import {isIPv4} from 'node:net';
import {Worker} from 'node:worker_threads';
import {statSync,existsSync,readdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {readerHTML,readerAssets} from '../pack-html/book.ts';
import {drawingConcurrency} from '../drawing/pool.ts';
import type {ReaderData} from '../core/reader-model.ts';

const stamp=(file:string)=>{try{const s=statSync(file,{bigint:true});if(s.isDirectory())return JSON.stringify(readdirSync(file).filter(name=>!name.includes('.bundled_')).sort().map(name=>{try{const entry=statSync(resolve(file,name),{bigint:true});return entry.isDirectory()?[name,'directory']:[name,String(entry.mtimeNs),String(entry.ctimeNs),String(entry.size),String(entry.ino)];}catch{return [name,'missing'];}}));return `${s.mtimeNs}:${s.ctimeNs}:${s.size}:${s.ino}`;}catch{return 'missing';}};
const loading='<!doctype html><meta charset="utf-8"><title>edoc 预览</title><p id="status">正在加载工程索引…</p><script>setInterval(async()=>{try{const s=await(await fetch("/api/status")).json();if(s.ready)location.reload();else document.getElementById("status").textContent=s.error||"正在加载工程索引…";}catch{document.getElementById("status").textContent="预览服务连接已断开";}},1000)</script>';

export async function serveProject(options:{config?:string;host?:string;port?:number;workers?:number;pollMs?:number}={}){
 const config=resolve(options.config??'docs/edoc.config.js'),workers=drawingConcurrency(options.workers),port=options.port??5175,host=options.host??'0.0.0.0';
 if(!isIPv4(host))throw Error('--host 必须是 IPv4 地址，例如 0.0.0.0 或 127.0.0.1');
 if(!Number.isInteger(port)||port<0||port>65535)throw Error('端口必须在 0–65535 范围内');
 if(!existsSync(config))throw Error('指定的配置文件不存在：'+config);
 const assetVersion=String(Date.now());let assets:ReturnType<typeof readerAssets>|undefined;
 let worker:Worker,version=0,ready=false,error='',closed=false,sequence=0,shell:Promise<string>|undefined;
 const inputs=new Set<string>([config,dirname(config)]),stamps=new Map<string,string>();
 const pending=new Map<number,{resolve:(value:any)=>void;reject:(reason:Error)=>void}>();
 const addInputs=(files:string[])=>{for(const file of files){inputs.add(file);inputs.add(dirname(file));}};
 const snapshot=()=>{for(const file of inputs)stamps.set(file,stamp(file));};snapshot();
 const rejectPending=()=>{for(const task of pending.values())task.reject(Error('工程已更新，请重新请求'));pending.clear();};
 function reload(){
  if(closed)return;version++;ready=false;error='';shell=undefined;rejectPending();if(worker)void worker.terminate();
  const current=new Worker(new URL(import.meta.url.endsWith('.ts')?'./worker.ts':'./worker.js',import.meta.url),{execArgv:[],workerData:{config,workers}});worker=current;
  current.on('message',message=>{
   if(current!==worker||closed)return;
   if(message.inputs){addInputs(message.inputs);for(const file of inputs)if(!stamps.has(file))stamps.set(file,stamp(file));}
   if(message.ready){if([...inputs].some(file=>stamps.get(file)!==stamp(file))){snapshot();reload();return;}const data=message.ready as ReaderData;data.live={version};shell=readerHTML(data,{hasPdf:true,hasInterfaces:true,live:true,assetVersion});void shell.catch(fail);ready=true;snapshot();}
   if(message.failed)fail(Error(message.failed));
   if(message.id){const task=pending.get(message.id);if(!task)return;pending.delete(message.id);message.error?task.reject(Error(message.error)):task.resolve(message.value);}
  });
  const fail=(cause:Error)=>{if(current!==worker||closed)return;if([...inputs].some(file=>stamps.has(file)&&stamps.get(file)!==stamp(file))){snapshot();reload();return;}ready=false;error=cause.message;rejectPending();snapshot();};
  // failed 消息已记录输入状态；随后的 exit 不能吞掉用户刚保存的修复。
  current.on('error',fail);current.on('exit',code=>{if(current===worker&&!closed&&!error)fail(Error('工程加载线程退出：'+code));});
 }
 const request=(method:string,arg:unknown)=>new Promise<any>((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});worker.postMessage({id,method,arg});});
 const server=createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const json=(code:number,value:unknown)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try{
   const address=server.address(),actual=typeof address==='object'&&address?address.port:port;
   const hosts=[`127.0.0.1:${actual}`,`localhost:${actual}`,`${req.socket.localAddress}:${actual}`];
   if(!hosts.includes(req.headers.host??'')||req.headers.origin&&!hosts.some(host=>req.headers.origin==='http://'+host)){json(403,{error:'仅接受当前预览服务来源'});return;}
   if(req.method!=='GET'){json(405,{error:'仅支持读取'});return;}
   const url=new URL(req.url??'/','http://127.0.0.1');
   if(['/assets/reader.js','/assets/reader.css'].includes(url.pathname)){
    if(url.searchParams.get('v')!==assetVersion){json(404,{error:'资源版本已更新'});return;}
    if(!assets){assets=readerAssets(true,true);void assets.catch(()=>{assets=undefined;});}
    const value=await assets,css=url.pathname.endsWith('.css');
    res.writeHead(200,{'Content-Type':css?'text/css; charset=utf-8':'text/javascript; charset=utf-8','Cache-Control':'public, max-age=31536000, immutable'});res.end(css?value.css:value.script);return;
   }
   if(url.pathname==='/api/status'){json(200,{version,ready,error});return;}
   if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
   if(url.pathname==='/'||url.pathname==='/index.html'){
    const html=ready&&shell?await shell:loading;res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
   }
   if(!['/api/route','/api/navigation','/api/search'].includes(url.pathname)){json(404,{error:'页面不存在'});return;}
   if(!ready){json(503,{error:error||'工程索引正在更新'});return;}
   if(Number(url.searchParams.get('version'))!==version){json(409,{error:'工程版本已更新'});return;}
   const generation=version,arg=JSON.parse(url.searchParams.get('args')??'{}');
   const value=await request(url.pathname.slice(5),arg);
   if(generation!==version){json(409,{error:'工程版本已更新'});return;}
   json(200,value);
  }catch(cause){if(!res.headersSent)json(400,{error:String(cause)});else res.end();}
 });
 await new Promise<void>((resolve,reject)=>{server.once('error',reject);server.listen(port,host,()=>{server.removeListener('error',reject);resolve();});});
 reload();
 // 同时检查文件和父目录：替换写入、删除、新增正文/子目录均会失效。不递归扫描整个仓库。
 const timer=setInterval(()=>{
  if(closed||!ready&&!error)return;
  if([...inputs].some(file=>stamps.has(file)&&stamps.get(file)!==stamp(file))){snapshot();reload();}
 },options.pollMs??1000);
 const address=server.address() as {port:number};
 const url=`http://${host==='0.0.0.0'?'127.0.0.1':host}:${address.port}/`;
 const networkUrls=host==='0.0.0.0'?[...new Set(Object.values(networkInterfaces()).flatMap(entries=>(entries??[]).filter(entry=>entry.family==='IPv4'&&!entry.internal).map(entry=>`http://${entry.address}:${address.port}/`)))]:[];
 return {url,networkUrls,async close(){if(closed)return;closed=true;clearInterval(timer);rejectPending();await worker.terminate();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}};
}
