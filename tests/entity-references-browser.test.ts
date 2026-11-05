import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {specimen} from './specification-fixture.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {query} from '../packages/core/query.ts';
import {routeHash} from '../packages/core/routes.ts';

test('对象详情完整展示9项语义关联、证据范围与正反跳转，不混入硬件连接',{timeout:60000},async t=>{
 const references=Array.from({length:9},(_,i)=>({id:'ref:'+i,kind:'reference',fromId:i===8?'vp:3':'case:events',targetId:i===8?'case:events':i===0?'behavior':i===3?'run-entry':'vp:'+((i%3)+1),class:i===0?'observes-behavior':i===2?'insufficient-evidence':i===3?'run-entry':'supports-checkpoint',...(i===7?{}:{label:i===2?'仅支撑单次窄脉冲，不足以证明密集事件；<证据原文>':'范围：指定场景 '+i}),source:{file:'tests/events.test.ts',selector:'async_dense_events:'+i,line:10+i}}));
 const data={objects:[{id:'case:events',kind:'node',label:'异步密集事件',attributes:{category:'testcase'}},...[1,2,3].map(i=>({id:'vp:'+i,kind:'node',label:'验证点'+i})),{id:'A',kind:'node',label:'硬件A'},{id:'B',kind:'node',label:'硬件B'}],relations:[{id:'wire',kind:'connection',class:'data',endpoints:['A','B']}],references};
 const p=specimen(t,'{% section id="behavior" title="对应行为" %}行为正文。{% /section %}\n{% section id="run-entry" title="运行入口" %}执行命令。{% /section %}',JSON.stringify({data})),book=await p.load(),result=query(book.root.graph,'case:events');
 assert.equal(result.references.length,9);assert.equal(result.directRelations.length,0);const file=join(p.root,'references.html');writeFileSync(file,await bookHTML(book));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href+routeHash({kind:'entity',project:book.root.config.projectId,id:'case:events'}));await page.waitForFunction(()=>window.EdocReady);
 assert.equal(await page.locator('[data-semantic-references] tbody tr').count(),9);assert.match(await page.locator('[data-reference-id="ref:2"]').innerText(),/insufficient-evidence/);assert.match(await page.locator('[data-reference-id="ref:2"]').innerText(),/不足以证明密集事件；<证据原文>/);
 assert.equal(await page.locator('[data-semantic-references] img').count(),0);assert.match(await page.locator('[data-reference-id="ref:7"]').innerText(),/未声明/);assert.match(await page.locator('[data-reference-id="ref:8"]').innerText(),/验证点3/);assert.match(await page.locator('.reference-source').first().innerText(),/async_dense_events:0/);
 const hardware=page.getByRole('heading',{name:'完整直接关系（硬件连接）',exact:true});assert.equal(await hardware.locator('xpath=following-sibling::pre[1]').textContent(),'[]');assert.doesNotMatch(await page.locator('#reader').innerText(),/验证已充分/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});
 await page.locator('[data-reference-id="ref:2"]').getByRole('link',{name:'验证点3',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(await page.locator('[data-semantic-references]').innerText(),/异步密集事件/);await page.goBack();await page.waitForFunction(()=>window.EdocReady);
 await page.locator('[data-reference-id="ref:3"]').getByRole('link',{name:'运行入口',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.ok(await page.getByRole('heading',{name:'运行入口',exact:true}).isVisible());assert.deepEqual(errors,[]);
});
