import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {readerFixture} from './reader-fixture.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook} from '../packages/core/book.ts';
import {previewSession} from '../packages/preview/session.ts';
import {compileBook,createBookCompiler} from '../packages/pack-html/book.ts';
import {serveProject} from '../packages/preview/server.ts';
import {scene} from '../packages/render-graph/native.ts';
import {targetKey} from '../packages/core/routes.ts';

const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function until<T>(run:()=>Promise<T>,accept:(v:T)=>boolean){for(let i=0;i<200;i++){const value=await run();if(accept(value))return value;await pause(50);}throw Error('等待预览更新超时');}

test('单页编译只求解访问页的图，共享并发请求，结果与全量构建一致',async t=>{
 const f=readerFixture(t),book=await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js')));let calls=0;
 const compiler=createBookCompiler(book,{scene:async(...args)=>{calls++;return scene(...args);}});
 assert.equal(calls,0);await compiler.page('system','docs/index');assert.equal(calls,0);
 const [a,b]=await Promise.all([compiler.page('fpga','docs/index'),compiler.page('fpga','docs/index')]);assert.equal(a,b);assert.equal(calls,2);
 const full=await compileBook(book,{workers:2});assert.equal(a.html,full.pages[targetKey('fpga','docs/index')].html);assert.deepEqual(a.outline,full.pages[targetKey('fpga','docs/index')].outline);
 await compiler.page('fpga','docs/index');assert.equal(calls,2);
});

test('预览首页不携带页面、工程事实或附件，目录和资源按请求提供，搜索不触发页面编译',async t=>{
 const f=readerFixture(t),session=previewSession(await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js'))));
 assert.deepEqual(session.bootstrap.pages,{});assert.deepEqual(session.bootstrap.projects,{});assert.deepEqual(session.bootstrap.pdfFiles,{});
 assert.ok(session.bootstrap.navigation.every(n=>n.children.length===0));
 const node=session.bootstrap.navigation.find(n=>n.previewChildren)!,nav=await session.request('navigation',{key:node.previewKey});assert.ok('children' in nav&&nav.children!.length);
 const search=await session.request('search',{term:'INTERFACE_PAGE_ONLY'}),stats=await session.request('stats',{});assert.ok(Array.isArray(search)&&search.length);assert.ok('pages' in stats&&stats.pages===0);
 const result=await session.request('route',{route:{kind:'page',project:'fpga',id:'docs/index'},known:[]});
 assert.ok('data' in result&&result.data);assert.deepEqual(Object.keys(result.data.pages!),[targetKey('fpga','docs/index')]);const after=await session.request('stats',{});assert.ok('pages' in after&&after.pages===1);assert.ok(!result.data.pdfFiles);
 const pdf=await session.request('route',{route:{kind:'pdf',project:'fpga',id:'schematic'},known:Object.keys(result.data.projects!)});assert.ok('data' in pdf&&pdf.data);assert.ok(Object.keys(pdf.data.pdfFiles!).length===1);assert.ok(pdf.data.pdfWorker);
});

test('服务保留跨请求缓存，配置传递导入更新和新增/删除文档重载，错误修正后恢复',{timeout:40000},async t=>{
 const f=readerFixture(t),config=join(f.root,'edoc.config.js'),source=readFileSync(config,'utf8');
 f.write('label.mjs','export const title="初始标题";');f.write('edoc.config.js','import {title} from "./label.mjs";\n'+source.replace("title:'system 工程'",'title'));
 const server=await serveProject({config,port:0,workers:2,pollMs:100});t.after(()=>server.close());
 const status=()=>fetch(server.url+'api/status').then(r=>r.json());let state=await until(status,s=>s.ready);
 const api=async(method:string,args:unknown,version=state.version)=>{const r=await fetch(server.url+'api/'+method+'?'+new URLSearchParams({version:String(version),args:JSON.stringify(args)}));return {status:r.status,value:await r.json()};};
 assert.match(await(await fetch(server.url)).text(),/初始标题/);
 const args={route:{kind:'page',project:'system',id:'docs/index'}};
 const first=await api('route',args),second=await api('route',args);assert.equal(first.status,200);assert.deepEqual(first.value,second.value);
 const previous=state.version;f.write('label.mjs','export const title="修改后的标题";');state=await until(status,s=>s.ready&&s.version>previous);
 assert.match(await(await fetch(server.url)).text(),/修改后的标题/);assert.equal((await api('route',args,previous)).status,409);
 f.write('docs/new.mdoc','# 新增页面\n新内容');const before=state.version;state=await until(status,s=>s.ready&&s.version>before);
 assert.equal((await api('route',{route:{kind:'page',project:'system',id:'docs/new'}})).status,200);
 f.write('docs/new.mdoc','{% reference id="不存在" /%}');const failure=await until(status,s=>!!s.error);assert.ok(!failure.ready);
 f.write('docs/new.mdoc','# 修复后的页面');state=await until(status,s=>s.ready&&s.version>failure.version);assert.equal((await api('route',{route:{kind:'page',project:'system',id:'docs/new'}})).status,200);
 const removal=state.version;rmSync(join(f.root,'docs/new.mdoc'));state=await until(status,s=>s.ready&&s.version>removal);assert.equal((await api('route',{route:{kind:'page',project:'system',id:'docs/new'}})).status,400);
 assert.equal((await fetch(server.url+'api/status',{headers:{Origin:'http://example.invalid'}})).status,403);
 assert.equal((await fetch(server.url+'../../etc/passwd')).status,404);
});

test('首次加载配置出错时，修正同目录依赖文件可自动恢复',{timeout:15000},async t=>{
 const f=readerFixture(t),config=join(f.root,'edoc.config.js'),source=readFileSync(config,'utf8');
 f.write('helper.mjs','export const title = ;');f.write('edoc.config.js','import {title} from "./helper.mjs";\n'+source.replace("title:'system 工程'",'title'));
 const server=await serveProject({config,port:0,pollMs:100});t.after(()=>server.close());const status=()=>fetch(server.url+'api/status').then(r=>r.json());
 const failed=await until(status,s=>!!s.error);f.write('helper.mjs','export const title="已修复";');await until(status,s=>s.ready&&s.version>failed.version);
 assert.match(await(await fetch(server.url)).text(),/已修复/);
});

test('加载失败前保存的修复不会被失败快照吞掉',{timeout:15000},async t=>{
 const f=readerFixture(t),config=join(f.root,'edoc.config.js');
 f.write('edoc.config.js',`export default {documents:'docs',data:async()=>{await new Promise(resolve=>setTimeout(resolve,800));throw Error('旧版数据失败');}};`);
 // 独立工程避免夹带未声明的 project include。
 f.write('docs/index.mdoc','# 数据加载');
 const server=await serveProject({config,port:0,pollMs:100});t.after(()=>server.close());const status=()=>fetch(server.url+'api/status').then(r=>r.json());
 await pause(400);f.write('edoc.config.js',`export default {documents:'docs',title:'加载期间已修复'};`);
 const state=await until(status,s=>s.ready);assert.ok(state.version>=2);assert.match(await(await fetch(server.url)).text(),/加载期间已修复/);
});

test('默认通过网卡地址访问，校验 Host 与 Origin，并支持限制回环监听',async t=>{
 const {networkInterfaces}=await import('node:os');
 const {request}=await import('node:http');
 const f=readerFixture(t),config=join(f.root,'edoc.config.js');
 const server=await serveProject({config,port:0});t.after(()=>server.close());
 const port=new URL(server.url).port;
 const addresses=[...new Set(Object.values(networkInterfaces()).flatMap(entries=>(entries??[]).filter(entry=>entry.family==='IPv4'&&!entry.internal).map(entry=>entry.address)))];
 assert.deepEqual(server.networkUrls,addresses.map(address=>`http://${address}:${port}/`));
 for(const url of [server.url,...server.networkUrls]){
  assert.equal((await fetch(url+'api/status',{headers:{Origin:new URL(url).origin}})).status,200);
  assert.equal((await fetch(url+'api/status',{headers:{Origin:'http://example.invalid'}})).status,403);
 }
 const forged=await new Promise<number|undefined>((resolve,reject)=>{
  const req=request(server.url+'api/status',{headers:{Host:`example.invalid:${port}`,Origin:`http://example.invalid:${port}`}},res=>{res.resume();resolve(res.statusCode);});req.on('error',reject);req.end();
 });
 assert.equal(forged,403);
 const local=await serveProject({config,host:'127.0.0.1',port:0});t.after(()=>local.close());
 assert.deepEqual(local.networkUrls,[]);assert.equal((await fetch(local.url+'api/status')).status,200);
 for(const address of addresses)await assert.rejects(fetch(`http://${address}:${new URL(local.url).port}/api/status`));
 await assert.rejects(serveProject({config,host:'invalid'}),/IPv4/);
});
