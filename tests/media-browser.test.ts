import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {loadBook,resolveProjectConfig} from '../packages/core/index.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {repository} from './helpers.ts';
const require=createRequire(import.meta.url);

test('离线HTML中的静态SVG保留文字/foreignObject、内嵌字体/图片和内部引用，窄屏可缩放',{timeout:60000},async t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-media-browser-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'docs'));
 writeFileSync(join(root,'docs/edoc.config.js'),'export default {};');writeFileSync(join(root,'docs/index.mdoc'),'# SVG 离线展示\n\n![文档示例](overview.svg)\n\n![复杂静态内容](complex.svg)');
 const sample=readFileSync(join(repository,'docs/assets/static-overview.svg'),'utf8');writeFileSync(join(root,'overview.svg'),sample);
 const font=readFileSync(join(dirname(require.resolve('@fontsource/noto-sans-sc/400.css')),'files/noto-sans-sc-latin-400-normal.woff2')).toString('base64');
 const pixel='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1ioAAAAASUVORK5CYII=';
 const complex=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="160" viewBox="0 0 480 160"><style>@font-face{font-family:embedded;src:url(data:font/woff2;base64,${font})}text{font:24px embedded}</style><defs><linearGradient id="g"><stop stop-color="#035"/><stop offset="1" stop-color="#5df"/></linearGradient><clipPath id="clip"><circle cx="70" cy="80" r="50"/></clipPath><rect id="shape" width="140" height="160" fill="url(#g)"/></defs><use href="#shape" clip-path="url(#clip)"/><text x="150" y="80">Embedded ABC</text><image href="data:image/png;base64,${pixel}" x="150" y="100" width="20" height="20"/></svg>`;
 writeFileSync(join(root,'complex.svg'),complex);writeFileSync(join(root,'index.html'),await bookHTML(await loadBook(await resolveProjectConfig(join(root,'docs/edoc.config.js')))));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[],external:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))external.push(request.url());});
 await page.goto(pathToFileURL(join(root,'index.html')).href);await page.waitForFunction(()=>window.EdocReady);
 const images=page.locator('#reader img');assert.equal(await images.count(),2);
 for(const [i,width]of [720,480].entries()){
  const result=await images.nth(i).evaluate(async element=>{const image=element as HTMLImageElement;await image.decode();return {width:image.naturalWidth,type:image.src.split(';')[0],source:atob(image.src.split(',')[1])};});
  assert.equal(result.width,width);assert.equal(result.type,'data:image/svg+xml');assert.equal(result.source,i===0?Buffer.from(sample).toString('binary'):complex);
 }
 assert.equal(await page.locator('#reader svg').count(),0,'原SVG不进入正文DOM');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 for(const image of await images.all())assert.ok(await image.evaluate(element=>element.getBoundingClientRect().width<=innerWidth));
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
});
