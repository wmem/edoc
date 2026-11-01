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
test('离线双实例接口展开、连线、查询、筛选、当前/完整 SVG 与打印完整性',{timeout:60000},async t=>{
 const f=interfaceFixture(t);writeFileSync(join(f.root,'docs/interfaces.mdoc'),'{% section id="interfaces" title="接口展开" %}\n{% diagram id="gallery:interface-buses" /%}\n{% diagram id="gallery:interface-buses" /%}\n{% interface id="ifdemo:engine.s_ctrl" mode="detailed" /%}\n{% /section %}');f.edit('manifest',d=>d.entryDocuments=['docs/interfaces.mdoc']);
 const output=join(f.workspace,'outputs');mkdirSync(output);const file=join(output,'document.html');writeFileSync(file,await html(f.load(),'接口浏览器回归'));
 const browser=await chromium.launch({executablePath:process.env.ENGDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1600,height:1000}}),page=await context.newPage();const errors:string[]=[],external:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
 await page.goto(pathToFileURL(file).href);
 const run=runInNewContext('('+readFileSync(join(repository,'examples/gallery/interfaces.playwright.js'),'utf8')+')');const result=await run(page,{output});assert.equal(result.expandedRelations,17);assert.equal(result.singleEnd,true);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 const current=readFileSync(join(output,'interfaces-current.svg'),'utf8'),full=readFileSync(join(output,'interfaces-signals.svg'),'utf8');assert.equal((current.match(/data-bundle="true"/g)??[]).length,2);assert.ok(!full.includes('data-bundle="true"'));assert.equal((full.match(/data-relation="/g)??[]).length,17);assert.ok(current.includes('ifdemo:net.ctrl_awvalid'));assert.ok(full.includes('ifdemo:engine.ctrl_optional'));
});

test('首次搜索折叠章节内未初始化的接口信号，可显式定位并只展开所属接口',{timeout:40000},async t=>{
 const f=interfaceFixture(t);writeFileSync(join(f.root,'docs/locate.mdoc'),'{% diagram id="gallery:interface-ctrl-signals" /%}\n{% diagram id="gallery:interface-ctrl-signals" /%}\n{% section id="hidden" title="折叠的接口图" collapsed=true %}\n{% diagram id="gallery:interface-buses" /%}\n{% /section %}');f.edit('manifest',d=>d.entryDocuments=['docs/locate.mdoc']);const file=join(f.workspace,'locate.html');writeFileSync(file,await html(f.load(),'首次定位'));
 const browser=await chromium.launch({executablePath:process.env.ENGDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1500,height:1000}}),page=await context.newPage();await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EngDocReady);
 assert.equal(await page.locator('[data-diagram="gallery:interface-buses"]').getAttribute('data-initialized'),null);
 await page.locator('#search').fill('ifdemo:engine.dma_rdata');await page.locator('#results a').getByText('dma_rdata',{exact:true}).click();await page.getByRole('button',{name:'图中定位信号',exact:true}).click();
 await page.waitForFunction(()=>window.EngDocInterfaceViews.some(v=>v.holder.dataset.diagram==='gallery:interface-buses'&&v.state.modes['ifdemo:engine.m_dma']==='expanded'&&v.holder.dataset.busy==='false'));
 assert.equal(await page.locator('#ed-68696464656e').evaluate(e=>(e as HTMLDetailsElement).open),true);assert.equal(await page.evaluate(()=>window.EngDocInterfaceViews.find(v=>v.holder.dataset.diagram==='gallery:interface-buses')!.state.modes['ifdemo:engine.s_ctrl']),'collapsed');
});
