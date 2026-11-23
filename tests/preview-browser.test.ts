import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {readerFixture} from './reader-fixture.ts';
import {serveProject} from '../packages/preview/server.ts';
import {routeHash} from '../packages/core/routes.ts';

test('预览按访问取页和目录，支持搜索、图形、PDF、返回与源文件刷新',{timeout:60000},async t=>{
 const f=readerFixture(t),server=await serveProject({config:join(f.root,'edoc.config.js'),port:0,pollMs:100});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage(),errors:string[]=[],routes:string[]=[];let navRequests=0;
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{const url=new URL(r.url());if(url.pathname==='/api/route')routes.push(JSON.parse(url.searchParams.get('args')!).route.id);if(url.pathname==='/api/navigation')navRequests++;});
 await page.goto(server.url);await page.waitForFunction(()=>window.EdocReady);assert.deepEqual(routes,['docs/index']);
 assert.ok(await page.locator('#toc a').count()<8);
 // 目录读取不会计算子页面。
 const summary=page.locator('#toc details summary').first();await summary.click();await page.waitForFunction(()=>document.querySelector('#toc details[open] ul li'));assert.ok(navRequests>0);assert.deepEqual(routes,['docs/index']);
 await page.locator('#search').fill('INTERFACE_PAGE_ONLY');await page.locator('#results a').first().waitFor();assert.deepEqual(routes,['docs/index']);
 await page.locator('#results a').first().click();await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader')?.textContent?.includes('INTERFACE_PAGE_ONLY'));
 await page.evaluate(hash=>{location.hash=hash;},routeHash({kind:'page',project:'fpga',id:'docs/index'}));await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader [data-diagram]'));
 const figure=page.locator('[data-diagram]').first();await figure.getByRole('button',{name:'全部展开',exact:true}).click();await page.waitForFunction(()=>window.EdocInterfaceViews[0]?.holder.dataset.busy==='false');
 const download=page.waitForEvent('download');await figure.getByRole('button',{name:'SVG（逐信号）',exact:true}).click();const svg=readFileSync((await(await download).path())!,'utf8');assert.match(svg,/device.out/);assert.match(svg,/@font-face/);assert.match(svg,/data:font/);
 await page.getByRole('link',{name:'核对电源原理图',exact:true}).click();await page.locator('[data-pdf-ready="true"]').waitFor();assert.equal(await page.locator('[data-pdf-page]').getAttribute('data-pdf-page'),'3');
 await page.goBack();await page.waitForFunction(()=>window.EdocReady&&!!document.querySelector('[data-diagram]'));
 const before=routes.length;await page.locator('#reader').getByRole('link',{name:'详细接口',exact:true}).click();await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader')?.textContent?.includes('INTERFACE_PAGE_ONLY'));assert.equal(routes.length,before,'访问过的文章使用浏览器缓存');
 f.write('fpga/docs/interfaces.mdoc','# 更新后的接口\n\n## 握手\n\n自动更新成功');await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader')?.textContent?.includes('自动更新成功'),{},{timeout:20000});
 assert.ok(decodeURIComponent(page.url()).includes('docs/interfaces'));assert.deepEqual(errors,[]);
});

test('快速切换页面时慢请求不覆盖新页面，相同页面不同锚点不串用',{timeout:30000},async t=>{
 const f=readerFixture(t);f.write('fpga/docs/anchors.mdoc','# 锚点测试\n\n## A\n\n第一节\n\n## B\n\n第二节');
 const server=await serveProject({config:join(f.root,'edoc.config.js'),port:0});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage();
 await page.goto(server.url);await page.waitForFunction(()=>window.EdocReady);
 await page.route('**/api/route?*',async r=>{const args=JSON.parse(new URL(r.request().url()).searchParams.get('args')!);if(args.route.project==='fpga')await new Promise(resolve=>setTimeout(resolve,500));await r.continue();});
 const requested=page.waitForRequest(r=>r.url().includes('/api/route'));
 await page.evaluate(hash=>{location.hash=hash;},routeHash({kind:'page',project:'fpga',id:'docs/interfaces',anchor:'握手'}));
 await requested;
 await page.evaluate(hash=>{location.hash=hash;},routeHash({kind:'page',project:'board',id:'docs/index'}));await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader')?.textContent?.includes('BOARD_ONLY'));
 await page.waitForTimeout(700);assert.match(await page.locator('#reader').innerText(),/BOARD_ONLY/);
 const pending=page.waitForRequest(r=>r.url().includes('/api/route'));
 await page.evaluate(hash=>{location.hash=hash;},routeHash({kind:'page',project:'fpga',id:'docs/anchors',anchor:'A'}));await pending;
 await page.evaluate(hash=>{location.hash=hash;},routeHash({kind:'page',project:'fpga',id:'docs/anchors',anchor:'B'}));
 await page.waitForFunction(()=>window.EdocReady&&document.querySelector('#reader')?.textContent?.includes('第二节'));assert.equal(await page.evaluate(()=>history.state.route.anchor),'B');
});

test('预览跨工程资源页按需取得绑定正文，直达导航保留当前路径',{timeout:30000},async t=>{
 const {addressBookFixture,region,entry}=await import('./address-book-fixture.ts'),f=addressBookFixture(t,true);
 const server=await serveProject({config:join(f.root,'docs/edoc.config.js'),port:0});t.after(()=>server.close());
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const route={kind:'resource' as const,project:'address-v2-composed',id:'soc:apb',spaceId:'soc:apb',view:'instance' as const,segments:[region('uart1'),entry('ctrl')],mountId:'demo:apb'};
 await page.goto(server.url+routeHash(route));await page.waitForFunction(()=>window.EdocReady);
 assert.match(await page.locator('[data-resource-auto]').innerText(),/0x1000000000002008/);assert.ok(await page.locator('[data-resource-author]').count());
 assert.ok(await page.locator('#toc a[aria-current="page"]').count());assert.deepEqual(errors,[]);
});
