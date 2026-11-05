import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook} from '../packages/core/book.ts';
import {preflightBook} from '../packages/core/document-preflight.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {loadImageAsset,validateSVG} from '../packages/core/media.ts';
import {repository} from './helpers.ts';
const require=createRequire(import.meta.url);
function project(t:{after:(fn:()=>void)=>void}){
 const root=mkdtempSync(join(tmpdir(),'edoc-preflight-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'docs'));
 const write=(file:string,value:string)=>writeFileSync(join(root,file),value);
 write('docs/edoc.config.js',"export default {projectId:'test'};");write('docs/index.mdoc','# 首页');
 const load=async()=>loadBook(await resolveProjectConfig(join(root,'docs/edoc.config.js')));
 const run=(args:string[])=>spawnSync(process.execPath,[join(repository,'packages/cli/edoc.ts'),...args],{cwd:root,encoding:'utf8',timeout:15000});
 return {root,write,load,run};
}
test('validate 与 build 提前拒绝相同的普通断锚点、错误格式图片，并给出正文位置',async t=>{
 const p=project(t);p.write('docs/target.mdoc','# 目标');p.write('bad.gif','GIF89a');
 p.write('docs/index.mdoc','# 首页\n\n[断锚点](target.mdoc#missing)\n\n![错误格式](bad.gif)');
 for(const command of ['validate','build']){
  const result=p.run([command,...(command==='validate'?['--format','json']:[])]);assert.equal(result.status,1,result.stderr);
  assert.match(result.stderr,/DOCUMENT_ANCHOR/);assert.match(result.stderr,/DOCUMENT_IMAGE_FORMAT/);assert.match(result.stderr,/#L3/);assert.match(result.stderr,/#L5/);
 }
 assert.ok(!existsSync(join(p.root,'output/index.html')));
});
test('预检覆盖中文/重复标题、显式属性、片段、表行和跨页section，忽略未选择的断锚点',async t=>{
 const p=project(t);
 p.write('docs/edoc.config.js',`export default {projectId:'test',tables:[{id:'rows',kind:'table',label:'条目',columns:[{field:'name',label:'名称',type:'string'}],rows:[{id:'row:one',values:{name:'一'}}]}]};`);
 p.write('docs/target.mdoc','{% section id="target:section" title="目标" %}\n## 中文标题\n## 中文标题\n{% panel id="box" %}面板{% /panel %}\n{% data-table id="rows" /%}\n{% /section %}');
 p.write('docs/index.mdoc','{% section id="intro" %}\n[一](target.mdoc#中文标题) [二](target.mdoc#heading-中文标题-2) [三](target.mdoc#box) [四](target.mdoc#row:one) [五](#target:section)\n{% if false %}[不参与显示](#absent){% /if %}\n{% include file="docs/_fragment.mdoc" /%}\n{% /section %}');
 p.write('docs/_fragment.mdoc','[片段来源](target.mdoc#target:section)');
 const book=await p.load();assert.deepEqual(preflightBook(book).deferredAnchors,[]);await compileBook(book);
 // 普通页内锚点不能借用另一页的标题；每页的重复标题编号独立计算。
 p.write('docs/index.mdoc','# 首页\n[未在本页](#中文标题)');assert.doesNotThrow(()=>preflightBook(book)); // 重新加载才反映源文变更。
 const changed=await p.load();assert.throws(()=>preflightBook(changed),/DOCUMENT_ANCHOR/);
});
test('动态自定义转换的ID留待构建核验，跨工程弱跳转不变',async t=>{
 const p=project(t),markdocURL=require.resolve('@markdoc/markdoc');
 p.write('docs/edoc.config.js',`import Markdoc from ${JSON.stringify(markdocURL)};export default {projectId:'test',markdoc:{tags:{dynamic:{transform(){return new Markdoc.Tag('span',{id:'dynamic-id'},['动态内容']);}}}}};`);
 p.write('docs/index.mdoc','# 首页\n[动态](#dynamic-id)\n{% dynamic /%}\n{% page project="unknown" id="absent" anchor="anything" /%}');
 const book=await p.load();assert.equal(preflightBook(book).deferredAnchors.length,1);await compileBook(book);
 p.write('docs/index.mdoc','[动态错误](#missing)\n{% dynamic /%}');const bad=await p.load();assert.equal(preflightBook(bad).deferredAnchors.length,1);await assert.rejects(()=>compileBook(bad),/DOCUMENT_ANCHOR/);
});
test('本地SVG原字节和矢量通过共享图片层内嵌，扩展名不区分大小写',async t=>{
 const p=project(t),svg=readFileSync(join(repository,'docs/assets/static-overview.svg'),'utf8');p.write('overview.SVG',svg);p.write('docs/index.mdoc','![静态 SVG](overview.SVG "保留矢量")');
 const asset=loadImageAsset(p.root,'overview.SVG');assert.equal(asset.mime,'image/svg+xml');assert.equal(Buffer.from(asset.data,'base64').toString(),svg);
 const book=await p.load();preflightBook(book);const data=await compileBook(book);const html=Object.values(data.pages)[0].html;
 assert.match(html,/<img[^>]*title="保留矢量"/);assert.ok(html.includes('data:image/svg+xml;base64,'+asset.data));assert.ok(!html.includes('<svg'));
});
test('SVG 允许标准绘图器DOCTYPE、defs/use、内嵌栅格和字体，拒绝外部资源和主动内容',()=>{
 const svg=(body:string)=>`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">${body}</svg>`;
 const accepted=[
  '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">'+svg('<text>Graphviz</text>'),
  svg('<defs><path id="shape" d="M0 0h5"/></defs><use xlink:href="#shape"/>'),
  svg('<image href="data:image/png;base64,iVBORw0KGgo="/>'),
  svg('<style>@font-face{font-family:embedded;src:url(data:font/woff2;base64,AA==)}</style>'),
 ];
 for(const text of accepted)assert.doesNotThrow(()=>validateSVG(text,'accepted.svg'));
 const rejected=[
  svg('<script>alert(1)</script>'),svg('<rect onload="alert(1)"/>'),svg('<animate attributeName="href" to="https://bad"/>'),
  svg('<image href="https://example.invalid/p.png"/>'),svg('<use xlink:href="other.svg#shape"/>'),
  svg('<rect style="fill:url(https://example.invalid/x)"/>'),svg('<style>@import "https://example.invalid/style.css";</style>'),
  svg('<rect fill="url(\\68ttps://example.invalid/x)"/>'),svg('<style>.a{background:image-set("https://bad" 1x)}</style>'),
  svg('<foreignObject><img xmlns="http://www.w3.org/1999/xhtml" src="https://bad"/></foreignObject>'),
  '<?xml-stylesheet href="style.css"?>'+svg(''),'<svg xmlns="http://www.w3.org/2000/svg"><path></svg>',
  '<!DOCTYPE svg [<!ENTITY custom "unsafe">]>'+svg('<text>&custom;</text>'),
 ];
 for(const text of rejected)assert.throws(()=>validateSVG(text,'rejected.svg'),/DOCUMENT_SVG_/);
});
