import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync, readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {DOMParser} from '@xmldom/xmldom';
import {interfaceFixture} from './interface-fixture.ts';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {drawingRelationScene} from '../packages/drawing/interface-scene.ts';

test('Drawing 后端离线独立展开、来源查询、筛选、当前/完整导出与返回',{timeout:60000},async t=>{
  const f=interfaceFixture(t);
  writeFileSync(join(f.root,'docs/drawing.mdoc'),'{% section id="drawing" title="新内核接口回归" %}\n{% relation-diagram id="gallery:interface-buses" /%}\n{% relation-diagram id="gallery:interface-buses" /%}\n{% /section %}');f.edit('manifest',d=>d.entryDocuments=['docs/drawing.mdoc']);
  const file=join(f.workspace,'drawing.html');writeFileSync(file,await bookHTML(await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js'))),{scene:drawingRelationScene}));
  const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),errors:string[]=[],external:string[]=[];
  const workers:string[]=[];page.on('worker',worker=>workers.push(worker.url()));
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^https?:/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocInterfaceViews?.length===2);
  const first=page.locator('[data-diagram="gallery:interface-buses"]').first(),idle=()=>page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');
  const state=()=>page.evaluate(()=>window.EdocInterfaceViews[0]);
  assert.equal((await state()).scene.layoutEngine,'drawing');
  for(const [id,nets]of [['ifdemo:host.m_ctrl',10],['ifdemo:engine.s_ctrl',10],['ifdemo:host.m_ctrl',10],['ifdemo:engine.s_ctrl',2]] as const){await first.locator(`[data-interface-toggle="${id}"]`).click();await idle();const s=await state();assert.equal(s.scene.nets.length,nets);assert.equal(s.state.modes['ifdemo:engine.m_dma'],'collapsed');}
  assert.equal(await page.evaluate(()=>window.EdocInterfaceViews[1].scene.nets.length),2);
  await first.locator('.filters input[data-class="data"]').uncheck();await idle();
  assert.ok((await state()).scene.nets.every(n=>n.sourceRelations!.every(r=>r.class==='control')));
  for(const [action,count]of [['svg-current',2],['svg',17]] as const){const pending=page.waitForEvent('download');await first.locator(`[data-action="${action}"]`).click();const download=await pending,target=join(f.workspace,action+'.svg');await download.saveAs(target);const content=readFileSync(target,'utf8'),doc=new DOMParser().parseFromString(content,'image/svg+xml'),metadata=JSON.parse(doc.getElementsByTagName('metadata')[0].textContent!);assert.equal(metadata.nets.length,count);assert.equal(metadata.interfaceFacts.relations.length,17);assert.match(content,/data:font\/woff2;base64,/);if(action==='svg-current')assert.ok(metadata.nets.every((n:any)=>n.sourceRelations.every((r:any)=>r.class==='control')));}
  const details=first.locator('[data-display="interface-details"]');await details.evaluate(e=>{for(const value of [false,true,false]){(e as HTMLInputElement).checked=value;e.dispatchEvent(new Event('change'));}});await idle();assert.equal((await state()).state.showInterfaceDetails,false);
  await first.locator('[data-action="interfaces-expand"]').click();await idle();await first.locator('[data-action="fit"]').click();await first.locator('[data-source-port="ifdemo:engine.s_ctrl"]').click();const selected=JSON.parse(await page.locator('#properties').innerText());assert.equal(selected.target.id,'ifdemo:engine.s_ctrl');assert.equal(selected.directRelations.length,9);assert.match(await first.locator('.interface-selection').innerText(),/10\/10/);
  await page.locator('#object-link').click();await page.getByRole('button',{name:'返回',exact:true}).click();await page.waitForFunction(()=>window.EdocInterfaceViews?.length===2&&window.EdocInterfaceViews[0].holder.dataset.busy==='false');assert.equal((await state()).scene.layoutEngine,'drawing');assert.equal((await state()).state.showInterfaceDetails,false);
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.ok(workers.length>0&&workers.every(url=>url.startsWith('blob:')),'接口重算使用离线内联Worker');
});

test('新内核布局失败保持画布、开关与完整静态图',{timeout:40000},async t=>{
  const f=interfaceFixture(t);f.edit('objects',d=>d.objects=['a','b'].map((id,j)=>({id,kind:'node',label:id,ports:[{id:id+'.p',label:'DATA',width:8,direction:'unknown'}],interfaces:[{id:id+'.call',label:j?'输入组':'输出组',protocol:'打开后固定位置无法容纳的长协议说明'.repeat(4),members:[id+'.p']}]})));
  f.edit('relations',d=>d.relations=[]);f.edit('views',d=>d.views=[{id:'failure',kind:'interface',include:{objects:['a','b'],relations:[]},layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:280,y:0}]},display:{interfaceMode:'collapsed',showInterfaceDetails:false}}]);
  writeFileSync(join(f.root,'docs/failure.mdoc'),'{% relation-diagram id="failure" /%}');f.edit('manifest',d=>d.entryDocuments=['docs/failure.mdoc']);const file=join(f.workspace,'failure.html');writeFileSync(file,await bookHTML(await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js'))),{scene:drawingRelationScene}));
  const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:900}});await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocInterfaceViews?.length===1);const holder=page.locator('[data-diagram="failure"]'),checkbox=holder.locator('[data-display="interface-details"]'),before=await page.evaluate(()=>window.EdocInterfaceViews[0].scene),staticBefore=await holder.locator('.static-svg').innerHTML();
  await checkbox.click();await page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');assert.equal(await checkbox.isChecked(),false);assert.match(await holder.locator('.interface-status').innerText(),/保留上一个场景/);assert.deepEqual(await page.evaluate(()=>window.EdocInterfaceViews[0].scene),before);assert.equal(await holder.locator('.static-svg').innerHTML(),staticBefore);
});
