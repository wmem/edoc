import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';
import {chromium} from 'playwright';
import {interfaceFixture} from './interface-fixture.ts';
import {repository} from './helpers.ts';
import {html} from '../packages/pack-html/index.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
test('离线双实例接口展开、连线、查询、筛选、当前/完整 SVG 与打印完整性',{timeout:60000},async t=>{
 const f=interfaceFixture(t);writeFileSync(join(f.root,'docs/interfaces.mdoc'),'{% section id="interfaces" title="接口展开" %}\n{% relation-diagram id="gallery:interface-buses" /%}\n{% relation-diagram id="gallery:interface-buses" /%}\n{% interface-table id="ifdemo:engine.s_ctrl" mode="detailed" /%}\n{% /section %}');f.edit('manifest',d=>d.entryDocuments=['docs/interfaces.mdoc']);
 const output=join(f.workspace,'outputs');mkdirSync(output);const file=join(output,'document.html');writeFileSync(file,await html(f.load(),'接口浏览器回归'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1600,height:1000}}),page=await context.newPage();const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(file).href);
 const run=runInNewContext('('+readFileSync(join(repository,'examples/gallery/interfaces.playwright.js'),'utf8')+')');const result=await run(page,{output});assert.equal(result.expandedRelations,17);assert.equal(result.singleEnd,true);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const current=readFileSync(join(output,'interfaces-current.svg'),'utf8'),full=readFileSync(join(output,'interfaces-signals.svg'),'utf8');assert.equal((current.match(/data-bundle="true"/g)??[]).length,2);assert.ok(!full.includes('data-bundle="true"'));assert.equal((full.match(/data-relation="/g)??[]).length,17);assert.ok(current.includes('ifdemo:net.ctrl_awvalid'));assert.ok(full.includes('ifdemo:engine.ctrl_optional'));
 for(const content of [current,full])assert.match(content,/data:font\/woff2;base64,/,'独立 SVG 必须携带文档字体，不误取 X6 动态样式');
});

test('首次搜索折叠章节内未初始化的接口信号，可显式定位并只展开所属接口',{timeout:40000},async t=>{
 const f=interfaceFixture(t);writeFileSync(join(f.root,'docs/locate.mdoc'),'{% relation-diagram id="gallery:interface-ctrl-signals" /%}\n{% relation-diagram id="gallery:interface-ctrl-signals" /%}\n{% section id="hidden" title="折叠的接口图" collapsed=true %}\n{% relation-diagram id="gallery:interface-buses" /%}\n{% /section %}');f.edit('manifest',d=>d.entryDocuments=['docs/locate.mdoc']);const file=join(f.workspace,'locate.html');writeFileSync(file,await html(f.load(),'首次定位'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1500,height:1000}}),page=await context.newPage();await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);
 assert.equal(await page.locator('[data-diagram="gallery:interface-buses"]').getAttribute('data-initialized'),null);
 await page.locator('#search').fill('ifdemo:engine.dma_rdata');await page.locator('#results a').getByText('dma_rdata',{exact:true}).click();await page.getByRole('button',{name:'图中定位信号',exact:true}).click();
 await page.waitForFunction(()=>window.EdocInterfaceViews.some(v=>v.holder.dataset.diagram==='gallery:interface-buses'&&v.state.modes['ifdemo:engine.m_dma']==='expanded'&&v.holder.dataset.busy==='false'));
 assert.equal(await page.locator('#ed-68696464656e').evaluate(e=>(e as HTMLDetailsElement).open),true);assert.equal(await page.evaluate(()=>window.EdocInterfaceViews.find(v=>v.holder.dataset.diagram==='gallery:interface-buses')!.state.modes['ifdemo:engine.s_ctrl']),'collapsed');
});

test('分组附注开关逐图独立，重布局、快速切换、筛选、返回与两类 SVG/打印一致',{timeout:120000},async t=>{
 const f=interfaceFixture(t);f.edit('views',d=>d.views[0].display.showInterfaceDetails=false);
 f.edit('objects',d=>{for(const n of d.objects)for(const [j,i]of (n.interfaces??[]).entries())i.label=j?'sample':'control';});
 writeFileSync(join(f.root,'docs/details.mdoc'),'{% relation-diagram id="gallery:interface-buses" /%}\n{% relation-diagram id="gallery:interface-buses" /%}');f.edit('manifest',d=>d.entryDocuments=['docs/details.mdoc']);
 const file=join(f.workspace,'details.html');writeFileSync(file,await bookHTML(await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js')))));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1600,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocInterfaceViews?.length===2);
 const figures=page.locator('[data-diagram="gallery:interface-buses"]'),first=figures.nth(0),second=figures.nth(1),details=first.getByRole('checkbox',{name:'分组附注',exact:true});
 const idle=()=>page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');
 const layout=()=>page.evaluate(()=>{const v=window.EdocInterfaceViews[0];return {nodes:v.scene.nodes,nets:v.scene.nets,state:v.state};});
 assert.equal(await details.isChecked(),false);assert.equal(await first.locator('.canvas [data-interface-annotation]').count(),0);assert.equal(await first.locator('.static-svg [data-interface-annotation]').count(),0);
 const initial=await layout();assert.ok(initial.nodes.flatMap(n=>n.ports).filter(p=>p.interfaceHeader).every(p=>['sample','control'].includes(p.label)));
 await details.check();await idle();const detailed=await layout();assert.ok(detailed.nodes.some(n=>n.height>initial.nodes.find(old=>old.id===n.id)!.height));assert.ok(await first.locator('.canvas [data-interface-annotation]').count()>0);
 assert.equal(await second.getByRole('checkbox',{name:'分组附注',exact:true}).isChecked(),false);assert.equal(await second.locator('.canvas [data-interface-annotation]').count(),0);
 await first.getByRole('checkbox',{name:'端口属性',exact:true}).check();const labels=first.getByRole('checkbox',{name:'连线标题',exact:true});await labels.uncheck();
 // 多个请求在布局完成前连续到达，最终画布和完整静态图必须只提交最后一次选择。
 await details.evaluate(e=>{const input=e as HTMLInputElement;for(const value of [false,true,false]){input.checked=value;input.dispatchEvent(new Event('change'));}});await idle();
 assert.equal((await layout()).state.showInterfaceDetails,false);assert.equal(await first.locator('.canvas [data-interface-annotation]').count(),0);assert.equal(await first.locator('.static-svg [data-interface-annotation]').count(),0);
 await first.getByRole('button',{name:'全部展开',exact:true}).click();await idle();assert.equal((await layout()).nets.length,17);assert.equal(await first.locator('.canvas [data-interface-annotation]').count(),0);
 const textOverlaps=await first.locator('.canvas [data-source-port]').evaluateAll(elements=>{const boxes=elements.map(e=>({id:e.getAttribute('data-source-port'),box:e.getBoundingClientRect()}));return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.box.left<b.box.right&&b.box.left<a.box.right&&a.box.top<b.box.bottom&&b.box.top<a.box.bottom).map(b=>[a.id,b.id]));});assert.deepEqual(textOverlaps,[],'收紧后分组名与真实端口名仍不能重叠');
 const originalLabels=(await first.locator('.canvas [data-source-port]').allTextContents()).map(text=>text.replace(/\s+/g,' '));assert.ok(originalLabels.includes('sample'));assert.ok(originalLabels.includes('control'));assert.ok(originalLabels.includes('ctrl_awaddr [31:0]'),JSON.stringify(originalLabels));
 await first.locator('.filters input[data-class="data"]').uncheck();await idle();assert.ok((await layout()).nets.length<17);assert.equal((await layout()).state.showInterfaceDetails,false);
 for(const [action,count]of [['svg-current',(await layout()).nets.length],['svg',17]]as const){
  const pending=page.waitForEvent('download');await first.locator(`[data-action="${action}"]`).click();const download=await pending,path=join(f.workspace,action+'.svg');await download.saveAs(path);const content=readFileSync(path,'utf8');
  const exported=await page.evaluate(xml=>{const doc=new DOMParser().parseFromString(xml,'image/svg+xml'),metadata=JSON.parse(doc.querySelector('metadata')!.textContent!);return {nodes:metadata.nodes,nets:metadata.nets,details:doc.querySelectorAll('[data-interface-annotation]').length,hiddenLabels:[...doc.querySelectorAll('[data-relation-label]')].every(e=>e.getAttribute('display')==='none'),visibleAttributes:[...doc.querySelectorAll('[data-port-annotation]')].every(e=>e.getAttribute('display')!=='none'),facts:metadata.interfaceFacts};},content);
  assert.equal(exported.details,0);assert.equal(exported.nets.length,count);assert.equal(exported.hiddenLabels,true);assert.equal(exported.visibleAttributes,true);assert.equal(exported.facts.relations.length,17);assert.match(content,/data:font\/woff2;base64,/);
  if(action==='svg-current')assert.deepEqual(exported.nodes,JSON.parse(JSON.stringify((await layout()).nodes)));
 }
 await page.emulateMedia({media:'print'});assert.equal(await first.locator('.static-svg svg').isVisible(),true);assert.equal(await first.locator('.static-svg [data-interface-annotation]').count(),0);assert.equal(await first.locator('.static-svg [data-relation]').count(),17);await page.emulateMedia({media:'screen'});
 await first.locator('.canvas [data-source-port="ifdemo:engine.s_ctrl"]').click();await page.locator('#object-link').click();await page.getByRole('button',{name:'返回',exact:true}).click();await page.waitForFunction(()=>window.EdocInterfaceViews?.length===2&&window.EdocInterfaceViews[0].holder.dataset.busy==='false');
 assert.equal(await details.isChecked(),false);assert.equal(await first.locator('.canvas [data-interface-annotation]').count(),0);assert.equal((await layout()).state.showInterfaceDetails,false);
 await page.setViewportSize({width:640,height:900});await first.getByRole('button',{name:'接口总览',exact:true}).click();await idle();assert.equal((await layout()).state.showInterfaceDetails,false);await details.check();await idle();assert.ok(await first.locator('.canvas [data-interface-annotation]').count()>0);assert.ok(await first.locator('.static-svg [data-interface-annotation]').count()>0);assert.deepEqual(errors,[]);
});

test('固定位置无法容纳附注时回退开关、画布和完整静态图',{timeout:40000},async t=>{
 const f=interfaceFixture(t);
 f.edit('objects',d=>d.objects=['a','b'].map((id,j)=>({id,kind:'node',label:id.toUpperCase(),ports:[{id:id+'.req',label:'REQUEST',direction:'in',width:8},{id:id+'.ready',label:'READY',direction:'out',width:1}],interfaces:[{id:id+'.call',label:j?'sample':'control',role:'target',protocol:'打开附注后无法在固定位置容纳的很长协议说明'.repeat(3),members:[id+'.req',id+'.ready']}]})));
 f.edit('relations',d=>d.relations=[]);f.edit('views',d=>d.views=[{id:'details-failure',kind:'interface',include:{objects:['a','b'],relations:[]},layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:280,y:0}]},display:{interfaceMode:'collapsed',showInterfaceDetails:false}}]);
 writeFileSync(join(f.root,'docs/details-failure.mdoc'),'{% relation-diagram id="details-failure" /%}');f.edit('manifest',d=>d.entryDocuments=['docs/details-failure.mdoc']);const file=join(f.workspace,'failure.html');writeFileSync(file,await html(f.load(),'附注失败回退'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1400,height:900}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocInterfaceViews?.length===1);
 const figure=page.locator('[data-diagram="details-failure"]'),details=figure.getByRole('checkbox',{name:'分组附注',exact:true}),before=await page.evaluate(()=>window.EdocInterfaceViews[0].scene),staticBefore=await figure.locator('.static-svg').innerHTML();
 await details.click();await page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');assert.equal(await details.isChecked(),false);assert.match(await figure.locator('.interface-status').innerText(),/保留上一个场景.*固定位置不足/);assert.deepEqual(await page.evaluate(()=>window.EdocInterfaceViews[0].scene),before);assert.equal(await figure.locator('.static-svg').innerHTML(),staticBefore);
 await figure.getByRole('button',{name:'全部展开',exact:true}).click();await page.waitForFunction(()=>window.EdocInterfaceViews[0].holder.dataset.busy==='false');assert.equal(await figure.locator('.interface-status.error').count(),0);assert.equal(await figure.locator('.canvas [data-interface-annotation]').count(),0);assert.equal((await page.evaluate(()=>window.EdocInterfaceViews[0].state)).showInterfaceDetails,false);assert.deepEqual(errors,[]);
});
