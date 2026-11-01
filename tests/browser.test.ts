import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {repository} from './helpers.ts';
import {anchor} from '../packages/core/identity.ts';
const executable=process.env.ENGDOC_CHROMIUM;
test('两个项目单文件 file:// 断网、交互、引用、窄屏与打印完整性',{timeout:60000},async t=>{
 const temp=mkdtempSync(join(tmpdir(),'engdoc-browser-'));t.after(()=>rmSync(temp,{recursive:true,force:true}));
 const browser=await chromium.launch({executablePath:executable,args:['--no-sandbox']});t.after(()=>browser.close());
 for(const name of ['board-flash','fpga-mac']){
  const output=join(temp,name+'.html');const result=spawnSync(process.execPath,['packages/cli/engdoc.ts','build','--config',`examples/${name}/engdoc.config.json`,'--format','html','--output',output],{cwd:repository,encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);
  const context=await browser.newContext({offline:true,viewport:{width:1500,height:1000}});const page=await context.newPage();const errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(output).href);await page.waitForFunction(()=>window.EngDocReady,{timeout:15000});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const anchors=await page.evaluate(()=>[...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(a=>!document.getElementById(a.getAttribute('href')!.slice(1))).map(a=>a.getAttribute('href')));assert.deepEqual(anchors,[]);
  const first=page.locator('[data-diagram]').first();await first.scrollIntoViewIfNeeded();
  const zoom=await page.evaluate(()=>window.EngDocGraphs[0].zoom());await first.locator('[data-action=plus]').click();assert.ok(await page.evaluate(()=>window.EngDocGraphs[0].zoom())>zoom);
  await first.locator('[data-action=fit]').click();
  await first.locator('.x6-node rect').first().click();await page.locator('#properties').getByText(/./).count();assert.match(await page.locator('#properties').innerText(),/id/);
  if(name==='board-flash'){
   await first.locator('input[data-class="clock"]').uncheck();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('branch:board:net.FLASH_SCK:0').isVisible()),false);
   await first.locator('input[data-class="clock"]').check();
   await first.locator('[data-group="board:qspi"]').click();assert.ok(await page.evaluate(()=>window.EngDocGraphs[0].getEdges().some(e=>e.id.startsWith('bus:'))));
   await first.locator('[data-group="board:qspi"]').click();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('branch:board:net.FLASH_SCK:0').isVisible()),true);
   const data=await page.locator('#engdoc-data').textContent();assert.equal(JSON.parse(data!).scenes['board:flash-wiring'].nets[0].endpoints.length,3);
   const download=page.waitForEvent('download');await first.locator('[data-action=svg]').click();assert.ok((await download).suggestedFilename().endsWith('.svg'));
  }else{
   await page.getByRole('button',{name:'RX',exact:true}).click();assert.equal(await page.locator('.tab[data-name="RX"]').isVisible(),true);
   await page.getByRole('button',{name:'APB4',exact:true}).click();assert.equal(await page.locator('.tab[data-name="APB4"]').isVisible(),true);
   assert.match(await page.locator('.wave').innerText(),/规范示意/);
  }
  await page.locator('#search').fill(name==='board-flash'?'A12':'MAC-TX-001');assert.ok(await page.locator('#results a').count()>0);
  await page.locator('#results a').first().click();assert.ok((await page.evaluate(()=>location.hash)).startsWith('#ed-'));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.canvas').first().isVisible(),false);assert.equal(await page.locator('.static-svg').first().isVisible(),true);if(name==='fpga-mac')assert.equal(await page.locator('.tab:visible').count(),3);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
 }
});
