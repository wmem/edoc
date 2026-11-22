import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {bookHTML} from '../packages/pack-html/book.ts';
import {routeHash,parseRoute} from '../packages/core/routes.ts';
import type {ResourceRoute} from '../packages/core/routes.ts';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';
const project='address-v2-composed';
const route=(segments:any[]=[],id='soc:engineering',mountId='demo:engineering-address'):ResourceRoute=>({kind:'resource',project,id,view:segments.length?'instance':'definition',...(segments.length?{spaceId:id,segments}:{}),mountId});

test('离线工程手册：左树逐批浏览到 R63，32/64位图、Channel、来源、文章目录和 390px',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true,true),file=f.root+'/professional.html';writeFileSync(file,await bookHTML(await f.load()));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const ready=()=>page.waitForFunction(()=>window.EdocReady),go=async(r:ResourceRoute)=>{await page.evaluate(hash=>{const a=document.createElement('a');a.href=hash;document.querySelector('#reader')!.append(a);a.click();a.remove();},routeHash(r));await ready();};
 await page.goto(pathToFileURL(file).href+routeHash(route([region('bank')])));await ready();
 const bank=page.locator('#toc a[aria-current="page"]').locator('..').locator('..');
 assert.equal(await bank.locator('a').filter({hasText:/^R\d\d$/}).count(),20);
 for(let i=0;i<3;i++)await bank.getByRole('button',{name:/继续加载/}).click();
 assert.equal(await bank.locator('a').filter({hasText:/^R\d\d$/}).count(),64);
 await bank.getByRole('link',{name:'R63',exact:true}).click();await ready();assert.match(await page.locator('h1').innerText(),/R63/);assert.ok(await page.locator('#toc a[aria-current=page]').evaluate(e=>{const r=e.getBoundingClientRect(),nav=e.closest('nav')!.getBoundingClientRect();return r.top>=nav.top&&r.bottom<=nav.bottom;}));assert.match(await page.locator('#reader').innerText(),/0x101F8/);
 assert.equal(await page.locator('[data-register-bits="32"] svg').count(),1);assert.match(await page.locator('[data-register-bits="32"] svg').getAttribute('aria-label')??'',/64位/);assert.equal(await page.locator('[data-register-field-row]').count(),2);
 assert.match(await page.locator('#page-toc').innerText(),/位域图/);assert.match(await page.locator('#page-toc').innerText(),/字段表/);assert.match(await page.locator('#page-toc').innerText(),/访问约定/);
 await page.reload();await ready();assert.match(await page.locator('#toc a[aria-current="page"]').innerText(),/R63/);await page.goBack();await ready();assert.match(await page.locator('h1').innerText(),/64 寄存器/);
 // R20 也是普通侧栏条目，不依赖资源页表格、搜索或手输 URL。
 const currentBank=page.locator('#toc a[aria-current="page"]').locator('..').locator('..');await currentBank.getByRole('button',{name:/继续加载/}).click();await currentBank.getByRole('link',{name:'R20',exact:true}).click();await ready();assert.match(await page.locator('[data-register-bits="32"] svg').getAttribute('aria-label')??'',/32位/);
 await go(route([region('dma'),{kind:'entry',entryId:'channels',index:7},entry('counter')]));assert.match(await page.locator('#reader').innerText(),/0x200E8/);assert.match(await page.locator('#reader').innerText(),/whole-register/);assert.match(await page.locator('#breadcrumbs').innerText(),/Channel\[7\]/);
 await go(route([region('uart0')],'soc:apb','demo:apb'));assert.deepEqual(await page.locator('[data-resource-author]').evaluateAll(ns=>ns.map(n=>n.getAttribute('data-source-project'))),['uart-ip',project]);
 await go(route([],'soc:apb','demo:apb'));const uart0=page.locator('[data-resource-table] tr').filter({hasText:'UART0'});assert.match(await uart0.innerText(),/0x1000/);assert.match(await uart0.innerText(),/0x100\s/);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.ok(await page.locator('.register-map-scroll').first().evaluate(e=>e.scrollWidth>e.clientWidth));
 await go({...route([region('bank'),entry('r63')]),anchor:'resource-auto-bit-layout'});assert.ok(await page.locator('#resource-auto-bit-layout').evaluate(e=>{const y=e.getBoundingClientRect().top;return y>=0&&y<80;}));
 await go(route([region('memory')]));assert.match(await page.locator('#reader').innerText(),/0x1000/);assert.match(await page.locator('#reader').innerText(),/memory/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await go(route([region('reserved')]));assert.match(await page.locator('#reader').innerText(),/规划保留不赋予读写能力/);assert.equal(await page.locator('[data-register]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});

test('多跳 Window 全叶列表、部分 Register 诊断、叶分页历史与十亿 Channel 末项离线直达',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true,true),file=f.root+'/windows.html';writeFileSync(file,await bookHTML(await f.load()));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.EdocReady),go=async(r:ResourceRoute)=>{await page.evaluate(hash=>{const a=document.createElement('a');a.href=hash;document.querySelector('#reader')!.append(a);a.click();a.remove();},routeHash(r));await ready();};
 await page.goto(pathToFileURL(file).href+routeHash(route([region('multihop')])));await ready();assert.equal(await page.locator('[data-resource-leaf]').count(),3);assert.match(await page.locator('[data-resource-leaves]').innerText(),/0x42008/);
 await page.locator('[data-resource-leaf]').last().click();await ready();assert.deepEqual((parseRoute(new URL(page.url()).hash) as ResourceRoute).segments?.map(s=>s.kind),['region','region','region','region','entry']);assert.match(await page.locator('#reader').innerText(),/0x42008/);
 await page.goBack();await ready();await go(route([region('partial')]));assert.match(await page.locator('[data-resource-leaves]').innerText(),/PARTIAL_REGISTER_WINDOW/);assert.equal(await page.locator('[data-resource-leaf]').count(),0);assert.equal(await page.locator('[data-register]').count(),0);
 await go(route([region('bank')]));assert.equal(await page.locator('[data-resource-leaf]').count(),50);await page.getByRole('button',{name:'继续查看寄存器',exact:true}).click();await ready();assert.equal(await page.locator('[data-resource-leaf]').count(),14);assert.match(await page.locator('[data-resource-leaf]').first().innerText(),/R50/);
 await page.locator('[data-resource-leaf]').last().click();await ready();await page.goBack();await ready();assert.equal(await page.locator('[data-resource-leaf]').count(),14);await page.reload();await ready();assert.equal(await page.locator('[data-resource-leaf]').count(),14);
 await go(route([region('large')]));assert.match(await page.locator('#toc').innerText(),/999999999/);const nodes=await page.locator('#toc li').count();await page.getByRole('button',{name:'全部展开',exact:true}).click();assert.equal(await page.locator('#toc li').count(),nodes);
 const form=page.locator('form[data-resource-index]').first();await form.locator('input').fill('999999999');await form.getByRole('button',{name:'按索引进入'}).click();await ready();await page.locator('[data-resource-child]').last().click();await ready();const expected='0x'+(0x100000000n+999999999n*32n+8n).toString(16).toUpperCase();assert.match(await page.locator('#reader').innerText(),new RegExp(expected));
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.reload();await ready();assert.ok(await page.locator('#toc li').count()<400);assert.ok(await page.locator('*').count()<8000);assert.deepEqual(errors,[]);
});
