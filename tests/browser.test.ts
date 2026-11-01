import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
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
  const project=join(temp,'project-'+name);cpSync(join(repository,'examples',name),project,{recursive:true,filter:p=>!p.includes('.engdoc-build')});if(name==='board-flash'){const devices=join(project,'board/devices.csv');writeFileSync(devices,readFileSync(devices,'utf8')+'hub:board:net.FLASH_SCK,Collision probe,pin\n');const file=join(project,'docs/views.json');const data=JSON.parse(readFileSync(file,'utf8'));data.views[0].include.objects.push('hub:board:net.FLASH_SCK');writeFileSync(file,JSON.stringify(data));}
  const output=join(temp,name+'.html');const result=spawnSync(process.execPath,['packages/cli/engdoc.ts','build','--config',join(project,'engdoc.config.json'),'--format','html','--output',output],{cwd:repository,encoding:'utf8',timeout:20000});assert.equal(result.status,0,result.stderr);
  const context=await browser.newContext({offline:true,viewport:{width:1500,height:1000}});const page=await context.newPage();const errors:string[]=[],external:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
  await page.goto(pathToFileURL(output).href);await page.waitForFunction(()=>window.EngDocReady,{timeout:15000});
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  const anchors=await page.evaluate(()=>[...document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')].filter(a=>!document.getElementById(a.getAttribute('href')!.slice(1))).map(a=>a.getAttribute('href')));assert.deepEqual(anchors,[]);
  const first=page.locator('[data-diagram]').first();await first.scrollIntoViewIfNeeded();
  const consistent=await page.evaluate(()=>{
   const graph=window.EngDocGraphs[0],id=graph.container.closest<HTMLElement>('[data-diagram]')!.dataset.diagram!;
   const scene=JSON.parse(document.querySelector('#engdoc-data')!.textContent!).scenes[id];
   return scene.nets.every((net:any)=>{
    const label=graph.getCellById('label:'+net.id) as any;
    if(!label||label.position().x!==net.labelBox.x||label.position().y!==net.labelBox.y)return false;
    const view=graph.findViewByCell(label);if(!view)return false;const box=(view.container as SVGGraphicsElement).getBBox();if(box.x<-.5||box.y<-.5||box.x+box.width>net.labelBox.width+.5||box.y+box.height>net.labelBox.height+.5)return false;
    return (net.paths??net.branches).every((b:any,i:number)=>{
     const edge=graph.getCellById('branch:'+net.id+':'+i) as any;
     return JSON.stringify(edge.getSource())===JSON.stringify(b.points[0])&&JSON.stringify(edge.getTarget())===JSON.stringify(b.points.at(-1))&&JSON.stringify(edge.getVertices())===JSON.stringify(b.points.slice(1,-1));
    });
   });
  });assert.ok(consistent,'网页路径、端点和标签直接消费同一 Scene 几何');
  const zoom=await page.evaluate(()=>window.EngDocGraphs[0].zoom());await first.locator('[data-action=plus]').click();assert.ok(await page.evaluate(()=>window.EngDocGraphs[0].zoom())>zoom);
  await first.locator('[data-action=fit]').click();
  await first.locator('[data-action=read]').click();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].zoom()),1);
  await first.locator('[data-action=expand]').click();await page.waitForTimeout(50);
  assert.equal(await first.getAttribute('role'),'dialog');assert.ok((await first.boundingBox())!.width>1200);assert.ok(await first.locator('.canvas').evaluate(e=>e.clientWidth>1200));
  await page.keyboard.press('Escape');assert.equal(await first.locator('[data-action=expand]').getAttribute('aria-pressed'),'false');
  await first.locator('[data-action=fit]').click();
  await first.locator(name==='fpga-mac'?'.x6-node[data-cell-id="mac:tx"]':'.x6-node[data-cell-id="board:U1"]').click();await page.locator('#properties').getByText(/./).count();assert.match(await page.locator('#properties').innerText(),/id/);
  if(name==='board-flash'){
   const portAttributes=first.locator('[data-display="port-attributes"]'),relationLabels=first.locator('[data-display="relation-labels"]');
   assert.equal(await portAttributes.isChecked(),false);assert.equal(await relationLabels.isChecked(),true);
   assert.equal(await first.locator('.canvas [data-port-annotation="board:U1.QSPI_CLK"]').isVisible(),false);
   await portAttributes.check();await first.locator('.canvas [data-port-annotation="board:U1.QSPI_CLK"]').waitFor({state:'visible'});assert.equal(await first.locator('.canvas [data-port-annotation="board:U1.QSPI_CLK"]').isVisible(),true);
   await page.emulateMedia({media:'print'});assert.equal(await first.locator('.static-svg [data-port-annotation="board:U1.QSPI_CLK"]').isVisible(),true);await page.emulateMedia({media:'screen'});
   await portAttributes.uncheck();await relationLabels.uncheck();
   assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('hub:board:net.FLASH_SCK').getData().entityId),'hub:board:net.FLASH_SCK');
   await first.locator('input[data-class="clock"]').uncheck();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('branch:board:net.FLASH_SCK:0').isVisible()),false);
   await first.locator('input[data-class="clock"]').check();
   assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('label:board:net.FLASH_SCK').isVisible()),false,'重新勾选分类不能恢复已隐藏的标题');
   assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('branch:board:net.FLASH_SCK:0').isVisible()),true,'隐藏标题不能隐藏路径');
   await first.locator('[data-group="board:qspi"]').click();assert.ok(await page.evaluate(()=>window.EngDocGraphs[0].getEdges().some(e=>e.id.startsWith('bus:'))));
   await first.locator('[data-group="board:qspi"]').click();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('branch:board:net.FLASH_SCK:0').isVisible()),true);
   assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('label:board:net.FLASH_SCK').isVisible()),false,'分组展开不能恢复已隐藏的标题');
   const data=await page.locator('#engdoc-data').textContent();assert.equal(JSON.parse(data!).scenes['board:flash-wiring'].nets[0].endpoints.length,3);
   const download=page.waitForEvent('download');await first.locator('[data-action=svg]').click();const file=await download;assert.ok(file.suggestedFilename().endsWith('.svg'));const path=join(temp,'downloaded.svg');await file.saveAs(path);assert.equal(await page.evaluate(text=>!!new DOMParser().parseFromString(text,'image/svg+xml').querySelector('parsererror'),readFileSync(path,'utf8')),false);
   assert.match(readFileSync(path,'utf8'),/data-relation-label="board:net.FLASH_SCK" display="none"/);assert.match(readFileSync(path,'utf8'),/data-port-annotation="board:U1.QSPI_CLK" display="none"/);
   await page.emulateMedia({media:'print'});assert.equal(await first.locator('.static-svg [data-relation-label="board:net.FLASH_SCK"]').isVisible(),false);assert.equal(await first.locator('.static-svg [data-port-annotation="board:U1.QSPI_CLK"]').isVisible(),false);await page.emulateMedia({media:'screen'});
   await first.locator('[port="board:U1.QSPI_CLK"]').first().click();assert.match(await page.locator('#properties').innerText(),/A12/);
   await relationLabels.check();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('label:board:net.FLASH_SCK').isVisible()),true);
  }else{
   await first.locator('[data-group="mac:pipeline-group"]').click();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('mac:tx').isVisible()),false);await first.locator('[data-group="mac:pipeline-group"]').click();assert.equal(await page.evaluate(()=>window.EngDocGraphs[0].getCellById('mac:tx').isVisible()),true);
   await page.getByRole('button',{name:'RX',exact:true}).click();assert.equal(await page.locator('.tab[data-name="RX"]').isVisible(),true);
   await page.getByRole('button',{name:'APB4',exact:true}).click();assert.equal(await page.locator('.tab[data-name="APB4"]').isVisible(),true);
   assert.match(await page.locator('.wave').innerText(),/规范示意/);assert.match(await page.locator('.static-svg text').first().evaluate(e=>getComputedStyle(e).fontFamily),/Noto Sans SC/);await page.locator('#search').fill('接收接口');assert.ok(await page.locator('#results a').count()>0);
  }
  await page.locator('#search').fill(name==='board-flash'?'A12':'MAC-TX-001');assert.ok(await page.locator('#results a').count()>0);
  await page.locator('#results a').first().click();assert.ok((await page.evaluate(()=>location.hash)).startsWith('#ed-'));
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2));
  await page.emulateMedia({media:'print'});assert.equal(await page.locator('.canvas').first().isVisible(),false);assert.equal(await page.locator('.static-svg').first().isVisible(),true);if(name==='fpga-mac')assert.equal(await page.locator('.tab:visible').count(),3);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);await context.close();
 }
});
