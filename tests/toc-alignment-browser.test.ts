import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium,type Page} from 'playwright';
import {specimen} from './specification-fixture.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {html} from '../packages/pack-html/index.ts';

// 对照真实字形/行盒与计算样式，不能只以DOM层级相同判定视觉层级相同。
async function alignment(page:Page,selector:string){
 return page.locator(selector).evaluate(root=>[...root.querySelectorAll('ul')].flatMap(ul=>{
  const rows=[...ul.children].map(li=>{
   const label=li.querySelector<HTMLElement>(':scope > details > summary > a,:scope > details > summary > .nav-group,:scope > a,:scope > .nav-group');
   if(!label||!label.getClientRects().length)return undefined;
   const style=getComputedStyle(label),rect=label.getBoundingClientRect();
   return {branch:!!li.querySelector(':scope > details'),label:label.textContent,x:rect.x+parseFloat(style.paddingLeft),font:style.fontSize,weight:style.fontWeight,line:style.lineHeight,color:style.color,height:rect.height,current:label.hasAttribute('aria-current')};
  }).filter(row=>row!==undefined);
  return rows.some(row=>row.branch)&&rows.some(row=>!row.branch)?[rows]:[];
 }));
}

test('目录同级分支/叶子统一文字起点与样式，选中、折叠、多行和窄屏不改变层级感',{timeout:60000},async t=>{
 const long='同级较长的目录标题用于验证自动换行后文字仍然保持同一个层级和相同样式';
 const p=specimen(t,`# 首页\n\n## 同级父项${long}\n\n### 次级父项\n\n#### 深层内容\n\n### 次级叶项\n\n## 同级叶项${long}\n\n正文。\n`);
 mkdirSync(join(p.root,'docs/branch/deeper'),{recursive:true});mkdirSync(join(p.root,'docs/group'),{recursive:true});
 p.write('docs/branch/index.mdoc','# 分支文章'+long+'\n');p.write('docs/branch/deeper/index.mdoc','# 次级分支\n');p.write('docs/branch/deeper/child.mdoc','# 最深文章\n');p.write('docs/branch/leaf.mdoc','# 次级独立文章\n');p.write('docs/leaf.mdoc','# 独立文章'+long+'\n');p.write('docs/group/item.mdoc','# 无首页目录的子文章\n');
 const book=await p.load(),files=[join(p.root,'book.html'),join(p.root,'standalone.html')];writeFileSync(files[0],await bookHTML(book));writeFileSync(files[1],await html(book.root.graph,'目录样式'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const check=async(selector:string)=>{const groups=await alignment(page,selector);assert.ok(groups.length>=1,selector+' 必须覆盖同级分支与叶子');for(const rows of groups){const expected=rows[0];for(const row of rows){assert.ok(Math.abs(row.x-expected.x)<.5,selector+' 同级文字起点：'+JSON.stringify(rows));assert.equal(row.font,expected.font);assert.equal(row.weight,expected.weight);assert.equal(row.line,expected.line);}const normal=rows.filter(row=>!row.current);if(normal.length>1)assert.ok(normal.every(row=>row.color===normal[0].color),selector+' 非选中同级项颜色一致');}};
 for(const file of files){
  await page.setViewportSize({width:1440,height:1000});await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EdocReady);await page.evaluate(()=>document.querySelectorAll<HTMLDetailsElement>('#toc details,#page-toc details').forEach(d=>d.open=true));
  await check('#toc');if(file===files[0])await check('#page-toc');
  const summary=page.locator('#toc summary').first(),before=await alignment(page,'#toc');await summary.click({position:{x:5,y:12}});await summary.click({position:{x:5,y:12}});assert.deepEqual(await alignment(page,'#toc'),before);
  if(file===files[0]){
   await page.locator('#toc').getByRole('link',{name:'独立文章'+long,exact:true}).click();await page.waitForFunction(()=>window.EdocReady);await check('#toc');
   await page.locator('#toc').getByRole('link',{name:'分支文章'+long,exact:true}).click();await page.waitForFunction(()=>window.EdocReady);await check('#toc');
   await page.locator('#toc').getByRole('link',{name:'首页',exact:true}).click();await page.waitForFunction(()=>window.EdocReady);await page.getByRole('button',{name:'展开页内目录',exact:true}).click();await check('#page-toc');
  }
  await page.setViewportSize({width:390,height:844});await check('#toc');if(file===files[0])await check('#page-toc');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 assert.deepEqual(errors,[]);
});
