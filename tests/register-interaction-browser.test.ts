import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import type {Page,Locator} from 'playwright';
import {bookHTML} from '../packages/pack-html/book.ts';
import {routeHash,parseRoute} from '../packages/core/routes.ts';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';
import {registerFixture,registerData} from './register-fixture.ts';
import {samplePdf} from './reader-fixture.ts';
const executablePath=process.env.EDOC_CHROMIUM;
const ready=(page:Page)=>page.waitForFunction(()=>window.EdocReady);
async function filter(holder:Locator,label:string,value:string){await holder.getByRole('button',{name:new RegExp('^筛选 '+label)}).click();await holder.getByLabel('包含文字',{exact:true}).fill(value);await holder.getByRole('button',{name:'应用筛选',exact:true}).click();}
async function localAction(page:Page,action:()=>Promise<unknown>,row:Locator){const before={url:page.url(),length:await page.evaluate(()=>history.length)};await action();assert.equal(page.url(),before.url);assert.equal(await page.evaluate(()=>history.length),before.length);assert.ok(await row.evaluate(e=>e===document.activeElement));assert.ok(await row.evaluate(e=>e.classList.contains('register-selected')));assert.ok(await row.evaluate(e=>{const b=e.getBoundingClientRect();return b.top>=0&&b.bottom<=innerHeight;}));}
const pairedTable=async(page:Page,diagram:Locator)=>page.locator('[data-register-table][data-register-presentation="'+await diagram.getAttribute('data-register-presentation')+'"]');

test('虚拟 64-bit Register：图/图例只定位本页、筛选精准 reveal、排序/跨带/详情返回和390px',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true,true),file=f.root+'/fields.html';writeFileSync(file,await bookHTML(await f.load()));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const route={kind:'resource' as const,project:'address-v2-composed',id:'soc:engineering',view:'instance' as const,mountId:'demo:engineering-address',segments:[region('bank'),entry('r63')]};
 await page.goto(pathToFileURL(file).href+routeHash(route));await ready(page);const diagram=page.locator('[data-register="bank:r63"]'),table=page.locator('[data-register-table="bank:r63"]'),mode=table.locator('[data-register-field-row="bank:r63.mode"]'),en=table.locator('[data-register-field-row="bank:r63.en"]');
 assert.equal(await diagram.getAttribute('data-register-presentation'),await table.getAttribute('data-register-presentation'));assert.equal(await diagram.locator('svg [data-register-field="bank:r63.mode"]').count(),2);
 await table.locator('th').first().locator('.table-sort').click();await table.locator('th').first().locator('.table-sort').click();await filter(table,'访问','RW');await filter(table,'字段与位段','EN');assert.equal(await mode.isHidden(),true);
 await localAction(page,()=>diagram.locator('svg [data-register-field="bank:r63.mode"]').last().click(),mode);
 assert.match(await table.locator('.table-note').innerText(),/已清除影响目标行/);assert.equal(await table.locator('th').first().getAttribute('aria-sort'),'descending');assert.equal(await table.getByRole('button',{name:/^筛选 访问（已筛选）/}).count(),1);assert.equal(await diagram.locator('svg .register-corresponding').count(),2);
 await en.hover();assert.ok(await diagram.locator('svg [data-register-field="bank:r63.en"]').evaluate(e=>e.classList.contains('register-corresponding')));
 await localAction(page,()=>diagram.locator('.register-legend [data-register-field="bank:r63.en"]').click(),en);
 await localAction(page,()=>diagram.locator('svg [data-register-field="bank:r63.mode"]').first().press('Enter'),mode);
 await table.getByRole('link',{name:'MODE 查看详情',exact:true}).click();await ready(page);assert.equal(parseRoute(new URL(page.url()).hash)?.kind,'entity');assert.match(await page.locator('.register-field-detail').innerText(),/MODE|63:16/);
 await page.goBack();await ready(page);assert.ok(await mode.evaluate(e=>document.activeElement===e));assert.equal(await table.locator('th').first().getAttribute('aria-sort'),'descending');assert.equal(await table.getByRole('button',{name:/^筛选 访问（已筛选）/}).count(),1);
 await page.reload();await ready(page);assert.ok(await mode.evaluate(e=>document.activeElement===e));
 await page.setViewportSize({width:390,height:844});await localAction(page,()=>diagram.locator('.register-legend [data-register-field="bank:r63.en"]').press('Space'),en);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});

test('作者逆序非相邻多图/多表、隐藏 Tab/Section、同页跨项目同名字段和 PDF 返回',{timeout:120000},async t=>{
 const f=addressBookFixture(t,true),ipFile=f.root+'/ip/docs/index.mdoc',socFile=f.root+'/docs/index.mdoc';
 writeFileSync(f.root+'/ip/docs/edoc.config.js',`export default {projectId:'uart-ip',title:'独立 UART IP',attachments:{spec:{type:'pdf',file:'spec.pdf',title:'IP 原始说明',targets:{detail:{page:2}}}}};`);writeFileSync(f.root+'/ip/spec.pdf',samplePdf());
 f.edit('ip/docs/ir/uart.json',d=>{d.registers[0].fields.push({id:'uart:mode',label:'MODE',msb:35,lsb:28,access:'RW'});d.registers[0].source.attachment={id:'spec',target:'detail'};});
 const groups=`{% register-diagram id="uart:ctrl" presentation="A" /%}\n{% register-diagram id="uart:ctrl" presentation="B" /%}\n{% tabs %}\n{% tab name="简述" %}\n图与表不相邻。\n{% /tab %}\n{% tab name="字段页" %}\n{% section id="ip:paired-fields" title="成对字段表" collapsed=true %}\n{% register-field-table id="uart:ctrl" presentation="B" /%}\n{% register-field-table id="uart:ctrl" presentation="A" /%}\n{% /section %}\n{% /tab %}\n{% /tabs %}\n`;
 writeFileSync(ipFile,readFileSync(ipFile,'utf8').replace('### 使用前提',groups+'\n### 使用前提'));
 writeFileSync(socFile,readFileSync(socFile,'utf8').replace('UART0 是本项目',`{% register-diagram id="uart:ctrl" presentation="A" /%}\n{% register-field-table id="uart:ctrl" presentation="A" /%}\n\nUART0 是本项目`));
 const file=f.root+'/authors.html';writeFileSync(file,await bookHTML(await f.load()));const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,viewport:{width:1440,height:1000}}),errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 const route={kind:'resource' as const,project:'address-v2-composed',id:'soc:apb',view:'instance' as const,mountId:'demo:apb',segments:[region('uart0'),entry('ctrl')]};await page.goto(pathToFileURL(file).href+routeHash(route));await ready(page);
 const ip=page.locator('[data-resource-author][data-source-project="uart-ip"]'),soc=page.locator('[data-resource-author][data-source-project="address-v2-composed"]'),a=ip.locator('[data-register]').nth(0),b=ip.locator('[data-register]').nth(1),local=soc.locator('[data-register]'),tableA=await pairedTable(page,a),tableB=await pairedTable(page,b),tableLocal=await pairedTable(page,local),modeA=tableA.locator('[data-register-field-row="uart:mode"]'),enB=tableB.locator('[data-register-field-row="uart:enable"]'),enLocal=tableLocal.locator('[data-register-field-row="uart:enable"]');
 assert.equal(await page.locator('[data-register]').count(),4);const ids=await page.locator('[data-register]').evaluateAll(es=>es.map(e=>e.getAttribute('data-register-presentation')));assert.equal(new Set(ids).size,4);
 // 先在隐藏表中设置筛选，再折叠、切回另一 Tab，由图操作负责揭示全部祖先。
 await ip.getByRole('button',{name:'字段页',exact:true}).click();await ip.locator('summary').filter({hasText:'成对字段表'}).click();await filter(tableA,'字段与位段','EN');assert.equal(await modeA.isHidden(),true);await ip.locator('summary').filter({hasText:'成对字段表'}).click();await ip.getByRole('button',{name:'简述',exact:true}).click();
 await localAction(page,()=>a.locator('.register-legend [data-register-field="uart:mode"]').click(),modeA);assert.ok(await tableA.isVisible());assert.equal(await tableB.locator('.register-selected').count(),0);assert.equal(await tableLocal.locator('.register-selected').count(),0);
 await localAction(page,()=>b.locator('svg [data-register-field="uart:enable"]').press('Enter'),enB);assert.equal(await tableLocal.locator('.register-selected').count(),0);
 await enB.evaluate(e=>(e as HTMLElement).blur());await enB.hover();assert.ok(await b.locator('[data-register-field="uart:enable"]').first().evaluate(e=>e.classList.contains('register-corresponding')));assert.equal(await local.locator('.register-corresponding').count(),0);
 await localAction(page,()=>local.locator('.register-legend [data-register-field="uart:enable"]').click(),enLocal);assert.equal(await tableLocal.getAttribute('data-register-project'),'address-v2-composed');
 await tableLocal.getByRole('link',{name:'EN 查看详情',exact:true}).click();await ready(page);assert.equal(parseRoute(new URL(page.url()).hash)?.project,'address-v2-composed');await page.goBack();await ready(page);assert.ok(await enLocal.evaluate(e=>e===document.activeElement));
 await localAction(page,()=>b.locator('.register-legend [data-register-field="uart:enable"]').press('Space'),enB);
 await tableB.getByRole('link',{name:'EN 查看详情',exact:true}).click();await ready(page);assert.equal(parseRoute(new URL(page.url()).hash)?.project,'uart-ip');await page.getByRole('link',{name:'查看原始 PDF',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('data-pdf-ready')==='true');assert.equal(parseRoute(new URL(page.url()).hash)?.project,'uart-ip');
 await page.goBack();await ready(page);await page.goBack();await ready(page);assert.ok(await enB.evaluate(e=>document.activeElement===e));assert.equal(await tableA.locator('.register-selected').count(),1);
 await page.setViewportSize({width:390,height:844});await localAction(page,()=>a.locator('.register-legend [data-register-field="uart:mode"]').press('Enter'),modeA);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});

test('默认重复和缺失字段表明确提示，不回退字段详情；独立 SVG 下载无 HTML 页内链接',{timeout:120000},async t=>{
 const p=registerFixture(t,{...registerData,tables:[]},`{% register-diagram id="reg:CTRL" /%}\n{% register-diagram id="reg:CTRL" /%}\n{% register-field-table id="reg:CTRL" /%}`),file=p.root+'/missing.html';writeFileSync(file,await bookHTML(await p.load()));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({offline:true,acceptDownloads:true});await page.goto(pathToFileURL(file).href);await ready(page);const before=page.url();
 const diagrams=page.locator('[data-register]');await diagrams.first().locator('.register-legend [data-register-field="reg:CTRL.MODE"]').click();assert.equal(page.url(),before);assert.match(await diagrams.first().locator('[data-register-status]').innerText(),/缺少唯一配对/);assert.equal(await page.locator('.register-field-detail').count(),0);
 const download=page.waitForEvent('download');await diagrams.first().getByRole('button',{name:'导出 SVG',exact:true}).click();const svg=readFileSync((await (await download).path())!,'utf8');assert.match(svg,/reg:CTRL.MODE/);assert.match(svg,/contract.txt/);assert.match(svg,/@font-face/);assert.doesNotMatch(svg,/href=|role="button"|register-presentation/);
});
