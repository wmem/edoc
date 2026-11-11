import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {repository} from './helpers.ts';

test('正式手册离线按任务阅读：代码样例、接口、波形、PDF、子工程及窄屏',{timeout:120000},async t=>{
 const build=spawnSync(process.execPath,['packages/cli/edoc.ts'],{cwd:repository,encoding:'utf8',timeout:60000});assert.equal(build.status,0,build.stderr);
 const child=spawnSync(process.execPath,['packages/cli/edoc.ts','--config','docs/component/docs/edoc.config.js'],{cwd:repository,encoding:'utf8',timeout:30000});assert.equal(child.status,0,child.stderr);
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
 const ready=()=>page.waitForFunction(()=>window.EdocReady),go=async(label:string)=>{const target=page.locator('#toc').getByRole('link',{name:label,exact:true}).first();if(!await target.isVisible())await page.getByRole('button',{name:'全部展开',exact:true}).click();await target.click();await ready();};
 await page.goto(pathToFileURL(join(repository,'output/index.html')).href);await ready();assert.equal(await page.locator('#reader article').count(),1);
 assert.equal(await page.locator('#toc [aria-current]').count(),1);assert.equal(await page.locator('#toc').getByRole('link',{name:'声明接口身份与成员',exact:true}).count(),0,'页内小节只出现在右侧');
 assert.equal(await page.locator('#reader pre code').count(),0,'先认识能力，不先读JSON配置');assert.equal(await page.locator('#reader [data-diagram]').count(),1);assert.ok(await page.locator('#reader .columns').isVisible());
 await page.locator('#reader').getByRole('link',{name:'快速开始',exact:true}).click();await ready();await page.locator('#reader').getByRole('link',{name:'生成第一份文档',exact:true}).click();await ready();
 assert.match(await page.locator('#reader').innerText(),/export default/);assert.equal(await page.locator('[data-diagram]').count(),0);assert.ok(!(await page.locator('#reader').innerText()).includes('控制接口逐信号'));
 await go('Markdown 支持范围');await page.locator('#reader').getByRole('link',{name:'回到本段标题',exact:true}).click();await ready();assert.ok(await page.getByRole('heading',{name:'普通 Markdown 示例',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=-1&&r.bottom<=innerHeight+1;}),'中文Markdown同页标题链接应实际定位');
 await go('组织多篇文档');assert.match(await page.locator('#reader pre').allTextContents().then(text=>text.join('\n')),/include file="docs\/_partials\/warnings.mdoc"/);assert.equal(await page.locator('#reader article').count(),1);
 await go('接口合并与展开');await page.waitForFunction(()=>window.EdocInterfaceViews?.length>=2);assert.deepEqual(await page.locator('[data-diagram]').evaluateAll(figures=>figures.map(f=>f.getAttribute('data-diagram'))),['simple:stream','simple:component-overview','simple:component-compact']);
 assert.equal(await page.locator('#toc').getByRole('link',{name:'接口合并与展开',exact:true}).evaluate(a=>a.closest('li')?.parentElement?.closest('li')?.querySelector(':scope > details > summary > a')?.textContent),'框图、接线与接口','接口展开的左侧父目录必须是框图分组');
 await page.locator('[data-diagram="simple:stream"] [data-action=interfaces-expand]').click();await page.waitForFunction(()=>document.querySelector('[data-diagram]')?.getAttribute('data-busy')==='false');assert.ok(await page.evaluate(()=>Object.values(window.EdocInterfaceViews[0].state.modes).every(mode=>mode==='expanded')));
 await go('时序图');assert.ok(await page.locator('.wave svg').first().isVisible());assert.match(await page.locator('.wave figcaption').first().innerText(),/规范示意/);
 await go('需要时调整布局');await page.getByRole('button',{name:'相对顺序与反馈通道',exact:true}).click();assert.ok(await page.locator('.tab:not([hidden]) [data-diagram]').isVisible());
 await go('引用与原文证据');await page.getByRole('link',{name:'打开第 2 页的示例区域',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('data-pdf-ready')==='true');assert.equal(await page.locator('#pdf-reader').getAttribute('data-pdf-page'),'2');assert.ok(await page.locator('.pdf-region').isVisible());
 const dark=await page.locator('#pdf-reader canvas').evaluate(canvas=>{const c=canvas as HTMLCanvasElement,pixels=c.getContext('2d')!.getImageData(Math.round(c.width*.17),Math.round(c.height*.27),Math.round(c.width*.56),Math.round(c.height*.36)).data;let count=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]<100&&pixels[i+1]<100&&pixels[i+2]<100)count++;return count;});assert.ok(dark>200,'引用区域内实际绘出深色说明文字');
 await page.goBack();await ready();await page.getByRole('link',{name:'通过命名目标 DETAIL 打开',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('data-pdf-ready')==='true');assert.equal(await page.locator('#pdf-reader').getAttribute('data-pdf-page'),'2');
 await page.goBack();await ready();await page.getByRole('link',{name:'示例文件对象',exact:true}).click();await ready();await page.locator('#reader .source-attachment').click();await page.waitForFunction(()=>document.querySelector('#pdf-reader')?.getAttribute('data-pdf-ready')==='true');assert.equal(await page.locator('#pdf-reader').getAttribute('data-pdf-page'),'2');await page.goBack();await ready();await page.goBack();await ready();
 await go('多工程组合');await page.getByRole('link',{name:'进入 组合示例：独立子工程',exact:true}).click();await ready();assert.match(await page.locator('#reader').innerText(),/配置、正文和 ID 都属于子工程/);
 await page.getByRole('link',{name:'返回父手册的组合用法',exact:true}).click();await ready();assert.match(await page.locator('#reader').innerText(),/父子都是完整工程/);
 await page.getByRole('link',{name:'未包含目标的示例',exact:true}).click();assert.match(await page.locator('#notice').innerText(),/当前生成的页面中没有此内容/);await page.locator('#notice button').click();
 await go('配置参考');assert.match(await page.locator('#reader').innerText(),/context.references/);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 await page.goto(pathToFileURL(join(repository,'docs/component/output/index.html')).href);await ready();await page.getByRole('link',{name:'返回父手册的组合用法',exact:true}).click();assert.match(await page.locator('#notice').innerText(),/当前生成的页面中没有此内容/);assert.match(await page.locator('#reader').innerText(),/独立子产物/);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});

test('开发分支完整接入设计原文、历史证据、回归图集和真实源码，离线链接可追溯',{timeout:120000},async t=>{
 const build=spawnSync(process.execPath,['packages/cli/edoc.ts'],{cwd:repository,encoding:'utf8',timeout:60000});assert.equal(build.status,0,build.stderr);
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({offline:true,viewport:{width:1500,height:1000}}),page=await context.newPage(),errors:string[]=[],external:string[]=[];page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
 const ready=()=>page.waitForFunction(()=>window.EdocReady),article=async(name:string)=>{await page.locator('#reader').getByRole('link',{name,exact:true}).first().click();await ready();},development=async()=>{await page.locator('#toc').getByRole('link',{name:'edoc 开发',exact:true}).first().click();await ready();};
 await page.goto(pathToFileURL(join(repository,'output/index.html')).href);await ready();await article('edoc 开发');await article('设计依据与历史记录');await article('设计与需求');await article('原始 V1 方案');assert.match(await page.locator('#reader').innerText(),/目标与边界/);assert.equal(await page.locator('#reader [data-diagram]').count(),0,'原文的围栏只是代码，不引用不存在的项目视图');
 await development();await article('设计依据与历史记录');await article('样例与开发回归');await article('完整图形回归集');assert.equal(await page.locator('#reader [data-diagram]').count(),16);await page.getByRole('button',{name:'从下到上 BT',exact:true}).click();await page.waitForFunction(()=>document.querySelector('[data-diagram="gallery:layout-BT"]')?.getAttribute('data-initialized')==='true');
 await page.goBack();await ready();await article('正文模板与配置源码');assert.equal(await page.locator('#reader [data-diagram]').count(),0);assert.match(await page.locator('#reader pre').allTextContents().then(parts=>parts.join('\n')),/book:overview/);assert.match(await page.locator('#reader pre').allTextContents().then(parts=>parts.join('\n')),/demo:unused/);
 await development();await article('设计依据与历史记录');await article('验收记录');await article('布局约束');assert.match(await page.locator('#reader').innerText(),/历史记录/);await article('布局参考');assert.match(await page.locator('#reader').innerText(),/relationHints/);assert.equal(await page.locator('#toc [aria-current]').count(),1);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});


test('首页主栏目、当前路径与读者目录选择互不覆盖，直达与390px保持可用',{timeout:60000},async t=>{
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),file=pathToFileURL(join(repository,'output/index.html')).href;
 const ready=()=>page.waitForFunction(()=>window.EdocReady);
 await page.goto(file);await ready();
 assert.equal(await page.locator('#toc details[open]').count(),0,'首页不展开使用或开发的全部后代');
 assert.deepEqual(await page.locator('#toc > ul > li').evaluateAll(items=>items.map(item=>item.querySelector(':scope > a,:scope > details > summary > a')!.textContent)),['edoc 文档','快速开始','编写与组织文档','图表','工程数据与多工程组合','阅读、查询与发布','查询参考','edoc 开发']);
 const item=(name:string)=>page.locator('#toc').getByRole('link',{name,exact:true}).locator('..').locator('..');
 const writing=item('编写与组织文档'),charts=item('图表'),development=item('edoc 开发');
 await writing.locator(':scope > summary').click({position:{x:4,y:12}});
 await page.locator('#toc').getByRole('link',{name:'能力、行为与条款',exact:true}).click();await ready();
 assert.equal(await writing.evaluate(el=>(el as HTMLDetailsElement).open),true);assert.equal(await development.evaluate(el=>(el as HTMLDetailsElement).open),false);
 await charts.locator(':scope > summary').click({position:{x:4,y:12}});
 await page.locator('#toc').getByRole('link',{name:'数据表格',exact:true}).click();await ready();
 assert.equal(await writing.evaluate(el=>(el as HTMLDetailsElement).open),true,'切换文章保留读者主动展开的其他分支');
 await page.goBack();await ready();assert.equal(await charts.evaluate(el=>(el as HTMLDetailsElement).open),true);
 await page.getByRole('button',{name:'全部折叠',exact:true}).click();assert.equal(await page.locator('#toc details[open]').count(),0);
 await page.getByRole('button',{name:'全部展开',exact:true}).click();assert.equal(await page.locator('#toc details:not([open])').count(),0);
 const route={kind:'page',project:'edoc-manual',id:'docs/charts/diagrams/drawing'};
 await page.goto('about:blank');await page.goto(file+'#edoc='+encodeURIComponent(JSON.stringify(route)));await ready();
 assert.equal(await charts.evaluate(el=>(el as HTMLDetailsElement).open),true);assert.equal(await development.evaluate(el=>(el as HTMLDetailsElement).open),false);
 assert.equal(await writing.evaluate(el=>(el as HTMLDetailsElement).open),false,'新加载直达页只展开其所属路径');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
});
