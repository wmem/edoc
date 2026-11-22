import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {repository} from './helpers.ts';

test('新工程图离线可读：几何、局部身份、展开、缩放、导出、来源跳转与窄屏',{timeout:120000},async t=>{
 const build=spawnSync(process.execPath,['packages/cli/edoc.ts','build'],{cwd:repository,encoding:'utf8',timeout:60000});assert.equal(build.status,0,build.stderr);
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1600,height:1100},acceptDownloads:true}),page=await context.newPage(),errors:string[]=[],requests:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
 await page.goto(pathToFileURL(join(repository,'output/index.html')).href);await page.waitForFunction(()=>window.EdocReady);
 const go=async(id:string)=>{await page.evaluate(id=>location.hash='edoc='+encodeURIComponent(JSON.stringify({kind:'page',project:'edoc-manual',id})),id);await page.waitForFunction(()=>window.EdocReady);await page.locator('details').evaluateAll(elements=>elements.forEach(element=>(element as HTMLDetailsElement).open=true));};
 const figure=(id:string)=>page.locator('[data-engineering-figure]').filter({has:page.locator('svg metadata')}).filter({hasNot:page.locator('.never')}).locator(`xpath=self::*[@data-engineering-figure='${id}']`);
 await go('docs/charts/timing/sequences');assert.equal(await page.locator('[data-engineering-figure]').count(),3);
 const overview=figure('view:upgrade-overview');
 const outcomeVisible=await overview.locator('.engineering-viewport').evaluate(viewport=>{const frame=viewport.getBoundingClientRect();return [...viewport.querySelectorAll('text')].filter(text=>['升级成功','升级失败：停止写入'].includes(text.textContent??'')).map(text=>{const b=text.getBoundingClientRect();return b.top>=frame.top-1&&b.bottom<=frame.bottom+1;});});
 assert.deepEqual(outcomeVisible,[true,true],'概览默认视口必须同时读到成功和失败结局');
 const simple=figure('recipe:sequence');assert.ok(await simple.isVisible());
 await simple.locator('.engineering-viewport [data-local="request"] text').click();assert.match(await simple.locator('[data-figure-detail]').innerText(),/request/);
 const camera=()=>simple.locator('.engineering-viewport > svg').getAttribute('viewBox');const before=await camera();await simple.locator('[data-figure-action=in]').click();assert.notEqual(await camera(),before);await simple.locator('[data-figure-action=fit]').click();
 const panBefore=await camera(),box=await simple.locator('.engineering-viewport').boundingBox();assert.ok(box);await page.mouse.move(box.x+12,box.y+80);await page.mouse.down();await page.mouse.move(box.x+52,box.y+120,{steps:5});await page.mouse.up();assert.notEqual(await camera(),panBefore);await simple.locator('[data-figure-action=fit]').click();
 const overlaps=await page.locator('[data-engineering-figure="view:upgrade"] .engineering-viewport > svg').evaluate(svg=>{const texts=[...svg.querySelectorAll('text')].filter(e=>e.textContent?.trim()).map(e=>({text:e.textContent!,b:e.getBBox()}));const result:string[]=[];for(let i=0;i<texts.length;i++)for(const b of texts.slice(i+1)){const a=texts[i];if(Math.min(a.b.x+a.b.width,b.b.x+b.b.width)-Math.max(a.b.x,b.b.x)>2&&Math.min(a.b.y+a.b.height,b.b.y+b.b.height)-Math.max(a.b.y,b.b.y)>2)result.push(a.text+' / '+b.text);}return result;});assert.deepEqual(overlaps,[],'消息文字、片段标题和分支条件不能互相覆盖');
 const complex=figure('view:upgrade');await complex.locator('[data-figure-search]').fill('authenticate/challenge');await complex.locator('[data-figure-action=find]').click();assert.match(await complex.locator('[data-figure-detail]').innerText(),/seq:auth/);assert.equal(await complex.locator('.selected').count(),1);
 await complex.locator('[data-figure-search]').fill('write-loop');await complex.locator('[data-figure-action=find]').click();await complex.locator('[data-figure-action=fold]').click();assert.equal(await complex.locator('.engineering-viewport [data-local="write"]').count(),0);await complex.locator('[data-figure-action=expand]').click();assert.equal(await complex.locator('.engineering-viewport [data-local="write"]').count(),1);
 const downloadPromise=page.waitForEvent('download');await simple.locator('[data-figure-action=full]').click();const download=await downloadPromise,svg=readFileSync((await download.path())!,'utf8');assert.match(svg,/@font-face/);assert.match(svg,/读取状态/);assert.ok(!svg.includes('<script'));
 await go('docs/charts/data-layout/binary-layouts');const sample=figure('view:packet-sample');assert.equal(await sample.locator('.engineering-viewport [data-local-id="seqno"]').count(),1);assert.equal(await sample.locator('.engineering-viewport [data-local-id="command"]').count(),0);
 const packet=figure('view:packet-overview');await packet.locator('[data-figure-search]').fill('header');await packet.locator('[data-figure-action=find]').click();await packet.locator('[data-figure-action=fold]').click();
 const branches=await packet.locator('.engineering-viewport [data-local-id="seqno"],.engineering-viewport [data-local-id="command"]').evaluateAll(es=>es.map(e=>(e as unknown as SVGGraphicsElement).getBBox().y));assert.equal(branches.length,2);assert.ok(Math.abs(branches[0]-branches[1])>45,'互斥分支必须分开显示');
 await page.getByRole('button',{name:'控制消息：无扩展',exact:true}).click();const control=figure('view:packet-control');assert.equal(await control.locator('.engineering-viewport [data-local-id="command"]').count(),1);assert.equal(await control.locator('.engineering-viewport [data-local-id="seqno"]').count(),0);
 const repeated=figure('binary:scatter');await repeated.locator('[data-figure-search]').fill('["items","descriptor","opcode"]');await repeated.locator('[data-figure-action=find]').click();assert.match(await repeated.locator('[data-figure-detail]').innerText(),/binary:descriptor/);
 await go('docs/charts/records/plots');assert.equal(await page.locator('[data-engineering-figure]').count(),5);assert.ok(await figure('plot:distribution').locator('.engineering-viewport [role="graphics-symbol"]').count()>30);
 // clientHeight 为整数，检查实际横轴文字而非要求 SVG 高度与相机高度逐位相等。
 const axisBounds=await figure('recipe:plot').locator('.engineering-viewport').evaluate(viewport=>{const frame=viewport.getBoundingClientRect();return [...viewport.querySelectorAll('g[role="graphics-symbol"][aria-label^="X-axis"] text')].map(text=>{const b=text.getBoundingClientRect();return {top:b.top-frame.top,bottom:b.bottom-frame.top,height:frame.height};});});assert.ok(axisBounds.length>0);assert.ok(axisBounds.every(b=>b.top>=-1&&b.bottom<=b.height+1),'普通统计图默认视口不能裁掉横轴文字');
 await figure('plot:quantile').locator('[data-figure-action=data]').click();assert.match(await figure('plot:quantile').locator('[data-figure-detail]').innerText(),/linear \/ R-7/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.setViewportSize({width:1600,height:1100});
 await go('docs/charts/data-layout/registers');
 const registerList=page.locator('[data-register-map="fpga:csr"][data-map-mode="registers"]').first();
 assert.equal(await registerList.locator('tbody tr').count(),4);
 for(const [label,definition]of [['CTRL · 全局控制','control'],['VERSION · 版本标识','version'],['STATUS · 通道状态','status'],['THRESHOLD · 采样阈值','threshold']]){
  await registerList.getByRole('link',{name:label,exact:true}).click();await page.waitForFunction(()=>window.EdocReady);
  assert.equal(await page.locator('body').getAttribute('data-reader-kind'),'page');
  const section=page.locator('#ed-'+Buffer.from('handbook:fpga:'+definition).toString('hex'));
  assert.ok(await section.locator('[data-register="fpga:'+definition+'"]').count()>0);
  await section.getByRole('link',{name:'返回寄存器列表',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);
 }
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));await page.setViewportSize({width:1600,height:1100});
 await go('docs/charts/data-layout/registers');await page.evaluate(()=>location.hash='edoc='+encodeURIComponent(JSON.stringify({kind:'entity',project:'edoc-manual',id:'use:register-map-complex'})));await page.waitForFunction(()=>window.EdocReady);const map=figure('space:csr');await map.locator('[data-figure-search]').fill(JSON.stringify([{kind:'region',regionId:'device'},{kind:'entry',entryId:'ports',index:2},{kind:'entry',entryId:'ctrl'}]));await map.locator('[data-figure-action=find]').click();assert.match(await map.locator('[data-figure-detail]').innerText(),/0x1000000000000300/);
 await map.getByRole('link',{name:/端口控制/}).first().click();await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('[data-register="reg:port-ctrl"]').count(),1);assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
});
