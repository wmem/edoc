import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {readerFixture} from './reader-fixture.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook} from '../packages/core/book.ts';
import {compileBook,bookHTML} from '../packages/pack-html/book.ts';
import {scene} from '../packages/render-graph/native.ts';
import {cachedScene} from '../packages/pack-html/scene-cache.ts';
import {restoreScenes} from '../packages/core/scene-storage.ts';
import {DrawingPool} from '../packages/drawing/pool.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import {forEachConcurrent} from '../packages/pack-html/concurrent.ts';

test('跨文章只计算同一工程每种图形模式一次，布局共享不混淆子工程同名图',async t=>{
 const p=readerFixture(t);
 for(const name of ['a','b'])p.write(`fpga/docs/${name}.mdoc`,'# 重复引用\n{% relation-diagram id="overview" /%}');
 const book=await loadBook(await resolveProjectConfig(join(p.root,'edoc.config.js'))),calls:string[]=[];
 const render:typeof scene=async(graph,id,options)=>{calls.push(JSON.stringify([graph.manifest.projectId,id,options]));return scene(graph,id,options);};
 await compileBook(book,{scene:render});assert.equal(calls.length,4);assert.equal(new Set(calls).size,4);
 const html=await bookHTML(book),data=JSON.parse(html.match(/<script id="edoc-book" type="application\/json">([\s\S]*?)<\/script>/)![1]);
 const pages=Object.values(data.pages) as any[];
 assert.equal(Object.keys(data.diagramScenes).length,4);
 for(const page of pages){assert.doesNotMatch(page.html,/<div class="static-svg"><svg/);restoreScenes(page,data.diagramScenes);}
 const fpga=pages.filter(p=>p.project==='fpga'&&p.scenes.overview),board=pages.find(p=>p.project==='board');
 assert.equal(fpga.length,3);assert.equal(fpga[0].scenes.overview,fpga[1].scenes.overview);
 assert.notEqual(fpga[0].scenes.overview,board.scenes.overview);
 assert.ok(fpga[0].printScenes.overview.nodes.some((n:any)=>n.ports.some((p:any)=>!p.interfaceHeader&&!p.slot)));
});

test('失败图形不会占住缓存，重试仍可计算',async t=>{
 const p=readerFixture(t),book=await loadBook(await resolveProjectConfig(join(p.root,'edoc.config.js'))),graph=book.projects.get('fpga')!.graph;
 let calls=0;const cached=cachedScene(async(...args)=>{if(++calls===1)throw new Error('第一次失败');return scene(...args);});
 await assert.rejects(cached(graph,'overview'),/第一次失败/);
 await cached(graph,'overview');assert.equal(calls,2);
});

test('线程池取消排队任务、超时后替换线程，不影响后续求解与独立几何校验',async()=>{
 const input=JSON.parse(readFileSync(new URL('../docs/support/proposals/drawing/fixed-route.json',import.meta.url),'utf8'));
 const pool=new DrawingPool(1);
 try{
  const first=pool.solve(input,15000),cancel=new AbortController(),queued=pool.solve(input,15000,cancel.signal);
  cancel.abort();await assert.rejects(queued,{code:'DRAWING_CANCELLED'});verifyDrawingScene(input,await first);
  const timed=pool.solve(input,.001);await assert.rejects(timed,{code:'DRAWING_BUDGET'});
  verifyDrawingScene(input,await pool.solve(input,15000));
  const active=new AbortController(),pending=pool.solve(input,15000,active.signal);active.abort();await assert.rejects(pending,{code:'DRAWING_CANCELLED'});
  verifyDrawingScene(input,await pool.solve(input,15000));
 }finally{pool.close();}
 await assert.rejects(pool.solve(input,15000),{code:'DRAWING_WORKER'});
});

test('并行文章失败时等待已经启动的任务，不继续分配未启动任务',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve),started:number[]=[],finished:number[]=[];
 const run=forEachConcurrent([0,1,2,3],2,async index=>{started.push(index);if(index===0)throw new Error('渲染失败');await gate;finished.push(index);});
 await Promise.resolve();release();await assert.rejects(run,/渲染失败/);
 assert.deepEqual(started,[0,1]);assert.deepEqual(finished,[1]);
});

test('默认使用4个工作线程，显式值优先于环境变量且不受旧64线程上限限制',async t=>{
 const {drawingConcurrency}=await import('../packages/drawing/pool.ts');
 const original=process.env.EDOC_WORKERS;t.after(()=>{if(original===undefined)delete process.env.EDOC_WORKERS;else process.env.EDOC_WORKERS=original;});
 delete process.env.EDOC_WORKERS;assert.equal(drawingConcurrency(),4);
 process.env.EDOC_WORKERS='3';assert.equal(drawingConcurrency(),3);assert.equal(drawingConcurrency(2),2);assert.equal(drawingConcurrency(65),65);
 process.env.EDOC_WORKERS='invalid';assert.equal(drawingConcurrency(1),1);assert.throws(()=>drawingConcurrency(),/EDOC_WORKERS/);
 for(const workers of [0,-1,1.5,Infinity,NaN,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>drawingConcurrency(workers),/正安全整数/);
});

test('同一进程中的并发构建分别遵循自己的线程参数',async t=>{
 const p=readerFixture(t),book=await loadBook(await resolveProjectConfig(join(p.root,'edoc.config.js')));
 const measure=async(workers:number)=>{let active=0,peak=0;await compileBook(book,{workers,scene:async(...args)=>{active++;peak=Math.max(peak,active);try{await new Promise(resolve=>setTimeout(resolve,10));return await scene(...args);}finally{active--;}}});return peak;};
 assert.deepEqual(await Promise.all([measure(1),measure(2)]),[1,2]);
});

test('工程图在线程内保持多端点几何、来源诊断，且与 Drawing 共用工作线程',async t=>{
 const {fixture}=await import('./helpers.ts'),{layoutScene}=await import('../packages/render-graph/scene.ts'),{EdocError}=await import('../packages/core/errors.ts');
 const graph=fixture(t).load(),input=JSON.parse(readFileSync(new URL('../docs/support/proposals/drawing/fixed-route.json',import.meta.url),'utf8'));
 const expected=await layoutScene(graph,'board:flash-wiring'),pool=new DrawingPool(1),projection={index:graph.index,connections:graph.connections};
 try{
  const [actual,drawing]=await Promise.all([pool.layout(projection,'board:flash-wiring'),pool.solve(input,15000)]);
  assert.deepEqual(actual,expected);verifyDrawingScene(input,drawing);
  let diagnostic:unknown;try{await layoutScene(graph,'absent');}catch(e){diagnostic=e;}
  await assert.rejects(pool.layout(projection,'absent'),error=>{assert.ok(error instanceof EdocError);assert.deepEqual(error,diagnostic);return true;});
  assert.deepEqual(await pool.layout(projection,'board:flash-wiring'),expected);
 }finally{pool.close();}
});

test('关闭线程池会取消运行中和排队的工程图',async t=>{
 const {fixture}=await import('./helpers.ts'),graph=fixture(t).load(),pool=new DrawingPool(1),projection={index:graph.index,connections:graph.connections};
 const results=Promise.allSettled([pool.layout(projection,'board:flash-wiring'),pool.layout(projection,'board:flash-wiring')]);
 pool.close();
 for(const result of await results){assert.equal(result.status,'rejected');assert.equal((result as PromiseRejectedResult).reason.code,'DRAWING_CANCELLED');}
});

test('共享锚点索引保持中文、已编码片段优先级和工程隔离，重建不保留旧索引',async t=>{
 const {anchor}=await import('../packages/core/identity.ts'),{parseRoute,targetKey}=await import('../packages/core/routes.ts');
 const p=readerFixture(t);
 // 原片段和再次编码的片段同时命中时，仍按章节声明顺序选择。
 p.write('fpga/docs/anchors.mdoc',`{% section id="${anchor('章节')}" title="先声明" /%}\n{% section id="章节" title="后声明" /%}\n[中文](#章节)\n[已编码](#${anchor('章节')})\n{% reference id="device" /%}`);
 const book=await loadBook(await resolveProjectConfig(join(p.root,'edoc.config.js')));
 const data=await compileBook(book,{workers:2}),html=data.pages[targetKey('fpga','docs/anchors')].html;
 const links=[...html.matchAll(/href="(#edoc=[^"]+)"/g)].map(m=>parseRoute(m[1]));
 assert.equal(links[0]!.anchor,anchor('章节'));assert.equal(links[1]!.anchor,anchor(anchor('章节')));
 assert.ok(links.some(r=>r?.kind==='entity'&&r.project==='fpga'&&r.id==='device'));
 const file=join(p.root,'fpga/docs/ir/design.json'),facts=JSON.parse(readFileSync(file,'utf8'));facts.objects.push({id:'新增对象',kind:'node',label:'新增'});p.write('fpga/docs/ir/design.json',facts);p.write('fpga/docs/new.mdoc','{% reference id="新增对象" /%}');
 const next=await compileBook(await loadBook(await resolveProjectConfig(join(p.root,'edoc.config.js'))),{workers:2});
 assert.ok([...next.pages[targetKey('fpga','docs/new')].html.matchAll(/href="(#edoc=[^"]+)"/g)].some(m=>{const r=parseRoute(m[1]);return r?.kind==='entity'&&r.id==='新增对象'&&r.project==='fpga';}));assert.ok(!data.projects.fpga.entities['新增对象']);
});

test('反向锚点索引保留 UTF-8 替代字符发生编码碰撞时的首匹配',async()=>{
 const {anchor,anchorIndex}=await import('../packages/core/identity.ts');
 const ids=['\ud800','\ufffd','中文'];
 const index=anchorIndex(ids);
 for(const id of ids)assert.equal(index.entities.get(anchor(id)),ids.find(candidate=>anchor(candidate)===anchor(id)));
});
