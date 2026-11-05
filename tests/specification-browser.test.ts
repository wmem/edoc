import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {specimen,definitions,behavior} from './specification-fixture.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {routeHash} from '../packages/core/routes.ts';
const executablePath=process.env.EDOC_CHROMIUM;
test('离线规范聚合、独立局部锚点/来源返回、Tabs/波形/重复表行与窄屏',{timeout:60000},async t=>{
 const p=specimen(t,behavior,`{data:{objects:[{id:'N1',kind:'node',label:'来源'},{id:'N2',kind:'node',label:'接收'}],relations:[{id:'NET',kind:'connection',class:'data',endpoints:['N1','N2']}],views:[{id:'VIEW',kind:'architecture',label:'规范示意图',include:{objects:['N1','N2'],relations:['NET']}}],tables:[{id:'TABLE',kind:'table',label:'规则表',columns:[{field:'rule',label:'要求',type:'string'}],rows:[{id:'ROW',values:{rule:'保持请求'}}]}],waveforms:[{id:'WAVE',kind:'waveform',label:'规范示意',data:{signal:[{name:'req',wave:'01..0'}]},format:'wavejson',semantic:'specification',source:{file:'docs/specs.mdoc'}}]}}`);
 p.write('docs/specs.mdoc',definitions.replace('只在 **有效时钟**',`{% tabs %}
{% tab name="说明" %}
默认说明
{% /tab %}
{% tab name="例外" %}
停钟例外内容
{% /tab %}
{% /tabs %}

{% data-table id="TABLE" /%}
{% relation-diagram id="VIEW" /%}
{% waveform id="WAVE" /%}

只在 **有效时钟**`));
 const book=await p.load(),project=book.root.config.projectId,file=join(p.root,'index.html');writeFileSync(file,await bookHTML(book));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage();
 const errors:string[]=[],network:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))network.push(r.url());});
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);
 assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),3);await page.waitForFunction(()=>window.EdocGraphs?.length>0);
 const duplicates=await page.locator('#reader').evaluate(root=>{const ids=[...root.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});assert.deepEqual(duplicates,[]);
 const first=page.locator('#reader [data-specification="CLOCK"]').first();await first.getByRole('button',{name:'例外',exact:true}).click();assert.ok(await first.getByText('停钟例外内容',{exact:true}).isVisible());
 const second=page.locator('#reader [data-specification="CLOCK"]').nth(1);assert.ok(await second.getByText('默认说明',{exact:true}).isVisible());
 await first.getByRole('link',{name:'本条示例',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-instance-1-clock-example/);
 await first.getByRole('link',{name:'内部细节',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-instance-1-ed-/);
 await first.getByRole('link',{name:'细节原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-definition-/);await page.goBack();await page.waitForFunction(()=>window.EdocReady);
 await first.getByRole('link',{name:'规范原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),1);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/docs\/specs/);
 await page.goBack();await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),3);
 await page.setViewportSize({width:390,height:844});await page.goto(pathToFileURL(file).href+routeHash({kind:'page',project,id:'docs/index'}));await page.waitForFunction(()=>window.EdocReady);
 assert.ok(await page.locator('#reader [data-specification="CLOCK"]').first().isVisible());
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
});
