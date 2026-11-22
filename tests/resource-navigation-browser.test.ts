import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {bookHTML} from '../packages/pack-html/book.ts';
import {routeHash,parseRoute} from '../packages/core/routes.ts';
import type {ResourceRoute} from '../packages/core/routes.ts';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';
const route=(segments:any[],mountId='demo:apb',id='soc:apb'):ResourceRoute=>({kind:'resource',project:'address-v2-composed',id,spaceId:id,view:'instance',segments,mountId});

test('离线虚拟页、双 UART/Window/Memory/Reserved、挂载定位、真实正文 TOC、直达刷新和返回',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true),b=await f.load(),file=f.root+'/book.html';writeFileSync(file,await bookHTML(b));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const ready=()=>page.waitForFunction(()=>window.EdocReady);
 await page.goto(pathToFileURL(file).href);await ready();const tocCount=await page.locator('#toc [data-resource-mount]').count();
 await page.getByRole('button',{name:'备用入口',exact:true}).click();assert.equal(await page.locator('#toc [data-resource-mount]').count(),tocCount);assert.equal(await page.locator('#toc [data-resource-mount="demo:inactive"]').count(),0);
 await page.getByRole('link',{name:'直接进入 UART0 CTRL 实例',exact:true}).click();await ready();
 assert.equal(parseRoute(new URL(page.url()).hash)?.kind,'resource');assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000000000001008/);
 assert.deepEqual(await page.locator('[data-resource-author]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-source-project'))),['uart-ip','address-v2-composed']);
 assert.ok(await page.locator('#toc a[aria-current="page"]').count());assert.match(await page.locator('#breadcrumbs').innerText(),/UART0/);assert.match(await page.locator('#page-toc').innerText(),/使用前提/);
 const self=page.locator('[data-resource-author]').first().getByRole('link',{name:'本节',exact:true});await self.click();await ready();assert.match(new URL(page.url()).hash,/resource-author/);
 await page.reload();await ready();assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000000000001008/);
 await page.locator('[data-resource-author]').first().getByRole('link',{name:'IP 首页',exact:true}).click();await ready();assert.match(page.url(),/uart-ip/);await page.goBack();await ready();assert.equal(parseRoute(new URL(page.url()).hash)?.kind,'resource');
 const go=async(r:ResourceRoute)=>{await page.evaluate(hash=>{const a=document.createElement('a');a.href=hash;document.querySelector('#reader')!.append(a);a.click();a.remove();},routeHash(r));await ready();};
 await go(route([region('uart1'),entry('ctrl')],'demo:apb-secondary'));assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000000000002008/);assert.ok(await page.locator('#toc [data-resource-mount="demo:apb-secondary"] a[aria-current="page"]').count());
 await go(route([region('apb'),region('ip-window'),region('csr'),entry('ctrl')],'demo:cpu','soc:cpu'));assert.match(await page.locator('[data-resource-auto]').innerText(),/0x4802/);assert.match(await page.locator('#breadcrumbs').innerText(),/IP Window/);
 await go(route([region('reserved')]));assert.match(await page.locator('[data-resource-auto]').innerText(),/规划保留|reserved/);assert.equal(await page.locator('[data-register]').count(),0);
 await go(route([region('ram')]));assert.match(await page.locator('[data-resource-auto]').innerText(),/memory/);assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.goBack();await ready();assert.match(await page.locator('#reader').innerText(),/规划保留/);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});

test('十亿数组符号导航、按索引进入末项、直达重载和全部展开有界',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true);f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.push({id:'billion',kind:'resource',label:'十亿 UART',base:'0x1000000',size:'0x1000',count:1000000000,stride:'0x1000',target:{project:'uart-ip',id:'uart:csr'}}));
 const b=await f.load(),file=f.root+'/large.html';writeFileSync(file,await bookHTML(b));const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const start={kind:'resource' as const,project:'address-v2-composed',id:'soc:apb',view:'definition' as const,mountId:'demo:apb'},ready=()=>page.waitForFunction(()=>window.EdocReady);
 await page.goto(pathToFileURL(file).href+routeHash(start));await ready();assert.match(await page.locator('#toc').innerText(),/999999999/);const nodes=await page.locator('#toc li').count();
 await page.getByRole('button',{name:'全部展开',exact:true}).click();assert.equal(await page.locator('#toc li').count(),nodes);
 const form=page.locator('form[data-resource-index]').filter({has:page.getByLabel('十亿 UART 实例索引')});await form.locator('..').locator('a[data-resource-child]').click();await ready();assert.equal(await page.locator('#toc a[aria-current="page"]').count(),1);await page.goBack();await ready();await form.locator('input').fill('999999999');await form.getByRole('button',{name:'按索引进入'}).click();await ready();
 assert.match(await page.locator('h1').innerText(),/999999999/);assert.match(await page.locator('#breadcrumbs').innerText(),/999999999/);await page.reload();await ready();assert.match(await page.locator('#toc a[aria-current="page"]').innerText(),/999999999/);
 await page.locator('[data-resource-child]').first().click();await ready();const expected='0x'+(0x1000000n+999999999n*0x1000n+8n).toString(16).toUpperCase();assert.match(await page.locator('[data-resource-auto]').innerText(),new RegExp(expected));
 assert.ok(await page.locator('#toc li').count()<600);assert.ok(await page.locator('*').count()<5000);assert.deepEqual(errors,[]);
});

test('虚拟页复用原项目图表与 PDF 来源，PDF 返回保留挂载/路径/锚点',{timeout:120000},async t=>{
 const {samplePdf}=await import('./reader-fixture.ts');const f=addressBookFixture(t,true);
 writeFileSync(f.root+'/ip/docs/edoc.config.js',`export default {projectId:'uart-ip',title:'独立 UART IP',attachments:{spec:{type:'pdf',file:'spec.pdf',title:'UART 原始说明',targets:{detail:{page:2}}}}};`);writeFileSync(f.root+'/ip/spec.pdf',samplePdf());
 f.edit('ip/docs/ir/uart.json',d=>{d.registers[0].source.attachment={id:'spec',target:'detail'};d.objects=[{id:'ip:node',kind:'node',label:'IP 原生节点',ports:[]}];d.views=[{id:'ip:view',kind:'architecture',label:'IP 原生结构',include:{objects:['ip:node'],relations:[]}}];});
 const doc=f.root+'/ip/docs/index.mdoc';writeFileSync(doc,readFileSync(doc,'utf8').replace('### 使用前提','{% relation-diagram id="ip:view" /%}\n\n### 使用前提'));
 const b=await f.load(),file=f.root+'/source.html';writeFileSync(file,await bookHTML(b));const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const selected={...route([region('uart0'),entry('ctrl')]),anchor:'resource-auto-bit-layout'},ready=async()=>{try{await page.waitForFunction(()=>window.EdocReady,{},{timeout:8000});}catch(error){throw new Error(String(error)+'; 浏览器错误：'+JSON.stringify(errors));}};
 await page.goto(pathToFileURL(file).href+routeHash(selected));await ready();await page.waitForFunction(()=>window.EdocGraphs?.length===1);
 assert.equal(await page.locator('[data-resource-author] [data-diagram="ip:view"][data-initialized]').count(),1);
 await page.evaluate(()=>{(window as any).resourcePopStates=[];window.addEventListener('popstate',event=>(window as any).resourcePopStates.push(event.state));window.EdocGraphs[0].zoomTo(.7);window.EdocGraphs[0].translate(13,17);});
 await page.getByRole('link',{name:'查看原始 PDF',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('data-pdf-ready')==='true');
 assert.match(page.url(),/uart-ip/);await page.goBack();await ready();await page.waitForFunction(()=>window.EdocGraphs?.length===1);
 t.diagnostic(JSON.stringify(await page.evaluate(()=>(window as any).resourcePopStates.at(-1)?.graphs)));assert.equal(await page.evaluate(()=>window.EdocGraphs[0].zoom()),.7);assert.deepEqual(await page.evaluate(()=>window.EdocGraphs[0].translate()),{tx:13,ty:17});
 const returned=parseRoute(new URL(page.url()).hash);assert.deepEqual(returned,selected);assert.equal(await page.locator('#toc a[aria-current="page"]').count(),1);assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000000000001008/);assert.deepEqual(errors,[]);
});
