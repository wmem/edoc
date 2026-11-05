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
 assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),3);
 assert.equal(await page.locator('#reader details.specification[open]').count(),0);
 const duplicates=await page.locator('#reader').evaluate(root=>{const ids=[...root.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});assert.deepEqual(duplicates,[]);
 const first=page.locator('#reader [data-specification="CLOCK"]').first();await first.locator(':scope > summary').click();await page.waitForFunction(()=>window.EdocGraphs?.length>0);await first.getByRole('button',{name:'例外',exact:true}).click();assert.ok(await first.getByText('停钟例外内容',{exact:true}).isVisible());
 const second=page.locator('#reader [data-specification="CLOCK"]').nth(1);await second.locator(':scope > summary').click();assert.ok(await second.getByText('默认说明',{exact:true}).isVisible());
 await first.getByRole('link',{name:'本条示例',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-instance-1-clock-example/);
 await first.getByRole('link',{name:'内部细节',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-instance-1-ed-/);
 await first.getByRole('link',{name:'细节原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/spec-definition-/);await page.goBack();await page.waitForFunction(()=>window.EdocReady);
 await first.getByRole('link',{name:'规范原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),1);assert.match(decodeURIComponent(await page.evaluate(()=>location.hash)),/docs\/specs/);
 await page.goBack();await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader [data-specification="CLOCK"]').count(),3);
 await page.setViewportSize({width:390,height:844});await page.goto(pathToFileURL(file).href+routeHash({kind:'page',project,id:'docs/index'}));await page.waitForFunction(()=>window.EdocReady);
 assert.ok(await page.locator('#reader [data-specification="CLOCK"]').first().isVisible());
 assert.deepEqual(errors,[]);assert.deepEqual(network,[]);
});
test('规范块逐条/本页折叠、目录隔离、深链接展开、历史与390px',{timeout:60000},async t=>{
 const p=specimen(t,'{% section id="behavior" title="行为" %}\n## 适用要求\n{% spec-list for="behavior" common=["CLOCK"] specific=["REQUEST"] /%}\n## 观察结果\n正文。\n{% /section %}');
 const book=await p.load(),project=book.root.config.projectId,file=join(p.root,'fold.html');writeFileSync(file,await bookHTML(book));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const ready=()=>page.waitForFunction(()=>window.EdocReady);await page.goto(pathToFileURL(file).href);await ready();
 const first=page.locator('#reader details.specification').first(),expand=page.getByRole('button',{name:'展开 Spec',exact:true}),collapse=page.getByRole('button',{name:'折叠 Spec',exact:true});
 assert.equal(await collapse.isDisabled(),true);assert.equal(await first.getAttribute('open'),null);assert.equal(await first.locator('.specification-body').isVisible(),false);
 assert.deepEqual(await page.locator('#page-toc a').allTextContents(),['行为','适用要求','观察结果']);
 await first.locator(':scope > summary').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector<HTMLButtonElement>('.specification-controls button:last-child')!.disabled);assert.ok(await first.locator('.specification-body').isVisible());assert.ok(await collapse.isEnabled());
 await expand.click();assert.equal(await page.locator('#reader details.specification[open]').count(),2);assert.equal(await expand.isDisabled(),true);
 await first.getByRole('link',{name:'规范原文',exact:true}).click();await ready();assert.equal(await page.locator('#page-toc').getByRole('link',{name:'例子',exact:true}).count(),0);
 await page.goBack();await ready();assert.equal(await page.locator('#reader details.specification[open]').count(),2);
 await collapse.click();assert.equal(await page.locator('#reader details.specification[open]').count(),0);
 await page.goto(pathToFileURL(file).href+routeHash({kind:'page',project,id:'docs/index',anchor:'spec-instance-1-clock-example'}));await ready();assert.ok(await first.locator('.specification-body').isVisible());assert.equal(await page.locator('#reader details.specification[open]').count(),1);
 await page.setViewportSize({width:390,height:844});await expand.click();assert.ok(await first.getByText('适用条件：时钟可运行。',{exact:true}).isVisible());
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth));assert.deepEqual(errors,[]);
});
test('默认收起的规范内接口图展开后初始化，批量开关与返回保持交互状态',{timeout:60000},async t=>{
 const p=specimen(t,undefined,`{data:{objects:[{id:'U',kind:'node',label:'接口模块',ports:[{id:'req',label:'REQUEST',direction:'in',width:32},{id:'ready',label:'READY',direction:'out'}],interfaces:[{id:'call',label:'CALL',members:['req','ready'],role:'target'}]}],views:[{id:'IF',kind:'interface',include:{objects:['U'],relations:[]},display:{interfaceMode:'collapsed'}}]}}`);
 p.write('docs/specs.mdoc',definitions.replace('只在 **有效时钟**','{% relation-diagram id="IF" /%}\n\n只在 **有效时钟**'));
 const file=join(p.root,'interface-fold.html');writeFileSync(file,await bookHTML(await p.load()));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('[data-diagram][data-initialized]').count(),0);
 const first=page.locator('#reader details.specification').first();await first.locator(':scope > summary').click();await page.waitForFunction(()=>window.EdocInterfaceViews?.length===1);
 assert.ok(await first.locator('.canvas').evaluate(el=>el.clientWidth>100));await first.getByRole('checkbox',{name:'分组附注',exact:true}).uncheck();await page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');
 await page.getByRole('button',{name:'折叠 Spec',exact:true}).click();await page.getByRole('button',{name:'展开 Spec',exact:true}).click();assert.equal(await first.getByRole('checkbox',{name:'分组附注',exact:true}).isChecked(),false);
 await first.getByRole('link',{name:'规范原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);await page.goBack();await page.waitForFunction(()=>window.EdocReady&&window.EdocInterfaceViews?.length===3);assert.equal(await first.getByRole('checkbox',{name:'分组附注',exact:true}).isChecked(),false);
 await first.locator(':scope > summary').click();await first.getByRole('link',{name:'规范原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);await page.goBack();await page.waitForFunction(()=>window.EdocReady);assert.equal(await first.getAttribute('open'),null);
 await first.locator(':scope > summary').click();await page.waitForFunction(()=>{const holder=document.querySelector('#reader details.specification [data-diagram]'),view=window.EdocInterfaceViews?.find(v=>v.holder===holder);return view?.holder.dataset.busy==='false'&&view.state.showInterfaceDetails===false;});assert.equal(await first.getByRole('checkbox',{name:'分组附注',exact:true}).isChecked(),false);assert.deepEqual(errors,[]);
});
test('首次加载保留原文及collapsed=false的初始展开值，控件随屏宽移动',{timeout:60000},async t=>{
 const p=specimen(t,behavior+'\n{% spec-list for="behavior" collapsed=false /%}'),book=await p.load(),file=join(p.root,'initial.html');writeFileSync(file,await bookHTML(book));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}});
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader details.specification[open]').count(),2);assert.equal(await page.locator('aside.properties > .specification-controls').count(),1);
 await page.setViewportSize({width:390,height:844});await page.locator('#reader header.cover > .specification-controls').waitFor({state:'visible'});assert.equal(await page.locator('#reader header.cover > .specification-controls').count(),1);assert.ok(await page.getByRole('button',{name:'折叠 Spec',exact:true}).isVisible());
 await page.goto(pathToFileURL(file).href+routeHash({kind:'page',project:book.root.config.projectId,id:'docs/specs'}));await page.waitForFunction(()=>window.EdocReady);assert.equal(await page.locator('#reader details.specification[open]').count(),2);
});
test('单文档HTML也提供本页规范展开折叠控件',{timeout:60000},async t=>{
 const p=specimen(t),{html}=await import('../packages/pack-html/index.ts'),file=join(p.root,'standalone.html');writeFileSync(file,await html((await p.load()).root.graph,'单文档规范'));
 const browser=await chromium.launch({executablePath,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);
 const total=await page.locator('details.specification').count();assert.ok(total>0);await page.getByRole('button',{name:'折叠 Spec',exact:true}).click();assert.equal(await page.locator('details.specification[open]').count(),0);await page.getByRole('button',{name:'展开 Spec',exact:true}).click();assert.equal(await page.locator('details.specification[open]').count(),total);
});
