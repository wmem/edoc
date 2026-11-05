import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,type Page} from 'playwright';
import {specimen} from './specification-fixture.ts';
import {samplePdf} from './reader-fixture.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {html} from '../packages/pack-html/index.ts';

const long='深层目录标题保持完整单行并且可以横向滚动查看所有内容而不挤压正文';
async function fixture(t:any){
 const p=specimen(t,'# 首页\n\n{% relation-diagram id="V" /%}\n\n{% attachment id="original" label="原文" /%}',JSON.stringify({attachments:{original:{type:'pdf',file:'original.pdf'}},data:{objects:[{id:'A',kind:'node',label:'发送'},{id:'B',kind:'node',label:'接收'}],relations:[{id:'NET',kind:'connection',class:'data',endpoints:['A','B']}],views:[{id:'V',kind:'architecture',include:{objects:['A','B'],relations:['NET']}}]}}));
 writeFileSync(join(p.root,'original.pdf'),samplePdf());
 const file='docs/a/b/c/d/e/long.mdoc';mkdirSync(dirname(join(p.root,file)),{recursive:true});p.write(file,'# '+long+'\n\n独立文章。');
 const book=await p.load(),files=[join(p.root,'book.html'),join(p.root,'standalone.html')];writeFileSync(files[0],await bookHTML(book));writeFileSync(files[1],await html(book.root.graph,'侧栏布局'));return {p,files};
}
const ready=(page:Page)=>page.waitForFunction(()=>window.EdocReady);
const width=(page:Page)=>page.locator('nav.sidebar').evaluate(el=>el.getBoundingClientRect().width);
async function drag(page:Page,delta:number){const box=(await page.getByRole('separator',{name:'调整目录宽度'}).boundingBox())!;await page.mouse.move(box.x+box.width/2,80);await page.mouse.down();await page.mouse.move(box.x+box.width/2+delta,80,{steps:8});await page.mouse.up();}

test('深层目录独立横向滚动，拖拽/键盘/复位、正文和图表响应、刷新与移动屏幕均可用',{timeout:60000},async t=>{
 const {files}=await fixture(t),browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const file of files){
  await page.setViewportSize({width:1440,height:1000});await page.goto(pathToFileURL(file).href);await ready(page);assert.equal(await width(page),244);
  await page.evaluate(()=>document.querySelectorAll<HTMLDetailsElement>('#toc details').forEach(d=>d.open=true));
  const label=page.locator('#toc').getByRole('link',{name:long,exact:true});assert.equal(await label.evaluate(el=>getComputedStyle(el).whiteSpace),'nowrap');
  const row=await label.evaluate(el=>{const s=getComputedStyle(el);return {height:el.getBoundingClientRect().height,line:parseFloat(s.lineHeight),padding:parseFloat(s.paddingTop)+parseFloat(s.paddingBottom)};});assert.ok(Math.abs(row.height-row.line-row.padding)<1);
  const scroll=await page.locator('#toc').evaluate(el=>({available:el.clientWidth,total:el.scrollWidth,overflow:getComputedStyle(el).overflowX}));assert.ok(scroll.total>scroll.available);assert.equal(scroll.overflow,'auto');assert.ok(await page.locator('#toc').evaluate(el=>(el as HTMLElement).offsetHeight>el.clientHeight),'应显示可拖动的原生横向滚动条');
  const scrollbox=(await page.locator('#toc').boundingBox())!;await page.mouse.move(scrollbox.x+15,scrollbox.y+scrollbox.height-5);await page.mouse.down();await page.mouse.move(scrollbox.x+100,scrollbox.y+scrollbox.height-5,{steps:8});await page.mouse.up();assert.ok(await page.locator('#toc').evaluate(el=>el.scrollLeft>0));
  const before=await page.locator('main').boundingBox();await drag(page,160);assert.equal(await width(page),404);const after=await page.locator('main').boundingBox();assert.equal(after!.x-before!.x,160);assert.equal(before!.width-after!.width,160);
  await page.waitForFunction(()=>window.EdocGraphs?.length===1&&Math.abs(window.EdocGraphs[0].options.width!-document.querySelector<HTMLElement>('[data-diagram]')!.clientWidth)<3);
  const separator=page.getByRole('separator',{name:'调整目录宽度'});await separator.focus();await page.keyboard.press('ArrowRight');assert.equal(await width(page),420);await page.keyboard.press('Home');assert.equal(await width(page),200);await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('main')!.getBoundingClientRect().width>=360);assert.ok(await width(page)>404);assert.ok((await page.locator('main').boundingBox())!.width>=360);
  await separator.dblclick();assert.equal(await width(page),244);
  const box=(await separator.boundingBox())!;await page.mouse.move(box.x+4,80);await page.mouse.down();await page.mouse.move(box.x+84,80);assert.equal(await width(page),324);await page.keyboard.press('Escape');await page.mouse.up();assert.equal(await width(page),244);assert.equal(await page.locator('body.sidebar-resizing').count(),0);
  await drag(page,160);await page.reload();await ready(page);assert.equal(await width(page),404);
  if(file===files[0]){await page.evaluate(()=>document.querySelectorAll<HTMLDetailsElement>('#toc details').forEach(d=>d.open=true));await label.click();await ready(page);assert.equal(await width(page),404);await page.goBack();await ready(page);assert.equal(await width(page),404);}
  await page.setViewportSize({width:390,height:844});assert.equal(await separator.isVisible(),false);assert.equal(await width(page),await page.evaluate(()=>document.documentElement.clientWidth));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewportSize({width:800,height:1000});await page.waitForFunction(()=>document.querySelector('nav.sidebar')!.getBoundingClientRect().width<404&&document.querySelector('main')!.getBoundingClientRect().width>=360);assert.ok(await width(page)<404);assert.ok((await page.locator('main').boundingBox())!.width>=360);await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(()=>document.querySelector('nav.sidebar')!.getBoundingClientRect().width===404);assert.equal(await width(page),404);
  if(file===files[0]){
   await page.locator('#toc').getByRole('link',{name:'首页',exact:true}).click();await ready(page);assert.equal(await width(page),404);
   await page.setViewportSize({width:1300,height:1000});await page.getByRole('link',{name:'原文',exact:true}).click();await page.waitForFunction(()=>window.EdocReady&&document.body.dataset.readerKind==='pdf');await separator.focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('main')!.getBoundingClientRect().width>=360);const pdfWidth=await width(page);assert.ok(pdfWidth>580);
   await page.goBack();await ready(page);await page.waitForFunction(previous=>document.querySelector('nav.sidebar')!.getBoundingClientRect().width<previous&&document.querySelector('main')!.getBoundingClientRect().width>=360,pdfWidth);assert.ok((await page.locator('main').boundingBox())!.width>=360);
  }
  await page.setViewportSize({width:1920,height:1000});await separator.focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('main')!.getBoundingClientRect().width>=360);const wideWidth=await width(page);assert.ok(wideWidth>1100);await page.setViewportSize({width:1440,height:1000});await page.waitForFunction(previous=>document.querySelector('nav.sidebar')!.getBoundingClientRect().width<previous&&document.querySelector('main')!.getBoundingClientRect().width>=360,wideWidth);await page.setViewportSize({width:1920,height:1000});await page.waitForFunction(expected=>document.querySelector('nav.sidebar')!.getBoundingClientRect().width===expected,wideWidth);await separator.dblclick();assert.equal(await width(page),244);
 }
 assert.deepEqual(errors,[]);
});

test('浏览器拒绝存储时仍可调宽和恢复默认，不阻断离线阅读',{timeout:60000},async t=>{
 const {files}=await fixture(t),browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox'],ignoreDefaultArgs:['--hide-scrollbars']});t.after(()=>browser.close());const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('存储不可用');}}));await page.goto(pathToFileURL(files[0]).href);await ready(page);await drag(page,100);assert.equal(await width(page),344);await page.getByRole('separator',{name:'调整目录宽度'}).dblclick();assert.equal(await width(page),244);assert.deepEqual(errors,[]);
});
