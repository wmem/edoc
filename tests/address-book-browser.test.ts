import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {bookHTML} from '../packages/pack-html/book.ts';
import {html} from '../packages/pack-html/index.ts';
import {routeHash} from '../packages/core/routes.ts';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';

test('单 HTML 断网读取跨工程 UART0/1 真实实例、定义链接、返回与窄屏',{timeout:120000},async t=>{
 const fixture=addressBookFixture(t),book=await fixture.load(),file=fixture.root+'/composed.html';writeFileSync(file,await bookHTML(book));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
 const ready=()=>page.waitForFunction(()=>window.EdocReady);
 await page.goto(pathToFileURL(file).href);await ready();
 const rows=()=>page.locator('[data-register-map="soc:apb"][data-map-mode="registers"]').first().locator('tbody tr');
 assert.equal(await rows().count(),3);
 for(const [index,address]of [[1,'0x1000000000001008'],[2,'0x1000000000002008']] as const){
  assert.match(await rows().nth(index).innerText(),new RegExp(address));
  assert.equal(await rows().nth(index).locator('a').getAttribute('href'),routeHash({kind:'entity',project:'uart-ip',id:'uart:ctrl'}));
 }
 const figure=()=>page.locator('[data-engineering-figure="soc:apb"]');
 for(const [regionId,address]of [['uart0','0x1000000000001008'],['uart1','0x1000000000002008']] as const){
  const path=JSON.stringify([region(regionId),entry('ctrl')]);
  await figure().locator('[data-figure-search]').fill(path);await figure().locator('[data-figure-action="find"]').click();
  const detail=JSON.parse((await figure().locator('[data-figure-detail]').textContent())!);
  assert.equal(detail.definitionProjectId,'uart-ip');assert.equal(detail.address,address);assert.equal(detail.target.width,64);
  assert.equal(detail.location.file,'docs/ir/uart.json');assert.ok(detail.sources.some((s:any)=>s.projectId==='uart-ip'&&s.source.selector==='uart:ctrl'));
 }
 await rows().nth(1).locator('a').click();await ready();assert.match(page.url(),/uart-ip/);assert.equal(await page.locator('[data-register="uart:ctrl"]').count(),1);
 assert.match(await page.locator('#reader').innerText(),/64/);await page.goBack();await ready();assert.equal(await rows().count(),3);
 await rows().first().locator('a').click();await ready();assert.match(page.url(),/address-v2-composed/);assert.match(await page.locator('h1').innerText(),/SoC 本地同名/);await page.goBack();await ready();
 await page.setViewportSize({width:390,height:844});assert.equal(await rows().count(),3);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});

test('独立 HTML 的工程图查询也从分工程事实重建统一上下文',{timeout:120000},async t=>{
 const fixture=addressBookFixture(t),book=await fixture.load(),file=fixture.root+'/standalone.html';writeFileSync(file,await html(book.root.graph,'SoC 单页'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true}),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);
 const figure=page.locator('[data-engineering-figure="soc:apb"]');await figure.locator('[data-figure-search]').fill(JSON.stringify([region('uart1'),entry('ctrl')]));await figure.locator('[data-figure-action="find"]').click();
 const result=JSON.parse((await figure.locator('[data-figure-detail]').textContent())!);assert.equal(result.address,'0x1000000000002008');assert.equal(result.definitionProjectId,'uart-ip');assert.equal(result.target.width,64);assert.deepEqual(errors,[]);
});
