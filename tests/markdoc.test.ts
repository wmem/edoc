import test from 'node:test';
import assert from 'node:assert/strict';
import Markdoc from '@markdoc/markdoc';
import {writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,expectCode} from './helpers.ts';
import {resolveProjectConfig,loadProject} from '../packages/core/project.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {readDocument,outline} from '../packages/core/index.ts';
import type {MarkdocOptions} from '../packages/core/markdoc.ts';
function sample(t:any,text:string){const f=fixture(t);writeFileSync(join(f.root,'docs/native.mdoc'),text);f.edit('manifest',m=>m.entryDocuments=['docs/native.mdoc']);return f;}
async function configured(t:any,text:string,markdoc:MarkdocOptions){const f=sample(t,text),config=await resolveProjectConfig(join(f.root,'edoc.config.js'));config.markdoc=markdoc;return {f,config};}

test('原生表格、列表起始值、链接/图片 title 和全局注解属性保留',async t=>{
 const f=sample(t,'# 标题 {% #native-heading .note %}\n\n3. 三\n4. 四\n\n[链接](https://example.com "链接标题")\n\n| 左 | 右 |\n| :--- | ---: |\n| a | b |\n\n{% table %}\n- 名称 {% width="30%" %}\n- 说明\n---\n- 项目\n- 值 {% colspan=1 %}\n{% /table %}');
 const g=f.load(),html=(await renderDocument(g,'原生')).chapters;
 assert.match(html,/<ol start="3">/);assert.match(html,/title="链接标题"/);assert.match(html,/<th align="right">/);assert.match(html,/width="30%"/);assert.match(html,/colspan="1"/);
 assert.match(html,/id="native-heading" class="heading-section heading-anchor note"/);assert.equal(outline(g).chapters[0].id,'native-heading');
});
test('原生警告不被提升为错误：跨行强调、嵌套强调、图片链接',async t=>{
 const f=sample(t,'*跨行\n说明*\n\n*(*嵌套*)*\n\n[![原图](tiny.png "图片标题")](https://example.com)');
 writeFileSync(join(f.root,'tiny.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1ioAAAAASUVORK5CYII=','base64'));
 const g=f.load(),html=(await renderDocument(g,'原生')).chapters;assert.match(html,/<em>跨行 说明<\/em>/);assert.match(html,/<a[^>]*><img/);assert.match(html,/title="图片标题"/);assert.ok(g.documentPlan!.warnings!.length>=3);
});
test('原生变量、内置/自定义函数与条件在目录、read 和页面使用同一快照',async t=>{
 let calls=0;const {config}=await configured(t,'{% section id="native" title=$title %}\n# {% upper($title) %}\n\n{% if equals($mode, "full") %}\n{% section id="shown" title="已显示" %}YES {% $title %}{% /section %}\n{% else /%}\n{% section id="hidden" title="未显示" %}NO{% /section %}\n{% /if %}\n{% /section %}',{variables:{title:'hello',mode:'full'},functions:{upper:{transform:({0:value}:any)=>{calls++;return value.toUpperCase();}}}});
 const {graph:g}=await loadProject(config);assert.equal(calls,1);assert.ok(g.index.has('shown'));assert.ok(!g.index.has('hidden'));
 const entries=outline(g);assert.equal(entries.chapters[0].label,'hello');assert.equal(entries.chapters[0].children[0].label,'HELLO');
 const read=readDocument(g,'native',{scope:'subtree'});assert.match(read.content,/YES hello/);assert.ok(!read.content.includes('NO'));
 const html=(await renderDocument(g,'原生')).chapters;assert.match(html,/HELLO/);assert.ok(!html.includes('未显示'));assert.equal(calls,1);
});
test('partial 使用原生局部变量覆盖，重复引用保留独立身份和真实来源',async t=>{
 const {f,config}=await configured(t,'{% section id="parent" %}\n{% partial file="card" variables={id: "first", name: "第一"} /%}\n{% partial file="card" variables={id: "second", name: "第二"} /%}\n{% /section %}',{variables:{name:'外层'},partials:{card:'docs/_partials/card.mdoc'}});
 mkdirSync(join(f.root,'docs/_partials'));writeFileSync(join(f.root,'docs/_partials/card.mdoc'),'{% section id=$id title=$name %}\n{% $name %} 内容\n{% /section %}');
 const p=await loadProject(config);assert.equal(readDocument(p.graph,'first').content,'第一 内容');assert.equal(readDocument(p.graph,'second').content,'第二 内容');assert.equal(readDocument(p.graph,'first').source.file,'docs/_partials/card.mdoc');assert.ok(p.inputs.includes(join(f.root,'docs/_partials/card.mdoc')));
});
test('partial 可直接接入原生 AST，嵌套片段继承局部上下文',async t=>{
 const {config}=await configured(t,'{% partial file="outer" variables={name:"局部"} /%}',{partials:{outer:Markdoc.parse('{% partial file="inner" /%}'),inner:Markdoc.parse('{% section id="nested" title=$name %}{% $name %}{% /section %}')}});
 const p=await loadProject(config);assert.equal(readDocument(p.graph,'nested').content,'局部');assert.equal(p.graph.index.get('nested')!.entity.label,'局部');
});
test('围栏默认处理原生标签和变量，process=false 明确隔离',async t=>{
 const {config}=await configured(t,'{% section id="code" %}\n```text\n{% if true %}processed{% /if %} {% $value %}\n```\n\n```text {% process=false %}\n{% include file="does-not-exist.mdoc" /%}\n{% section id="fake" %}字面{% /section %}\n```\n{% /section %}',{variables:{value:42}});
 const p=await loadProject(config),html=(await renderDocument(p.graph,'围栏')).chapters;assert.match(html,/processed 42/);assert.ok(!p.graph.index.has('fake'));assert.match(html,/include file=&quot;does-not-exist.mdoc&quot;/);assert.ok(!p.documents.files.includes('does-not-exist.mdoc'));
});
test('未显示条件分支中的文件和工程引用仍必须有效',async t=>{
 const f=sample(t,'{% if false %}\n{% include file="missing.mdoc" /%}\n{% /if %}');expectCode(f.load,'FILE_MISSING');
 writeFileSync(join(f.root,'docs/native.mdoc'),'{% if false %}\n{% relation-diagram id="missing" /%}\n{% /if %}');expectCode(f.load,'DOCUMENT_REFERENCE');
});
test('partial 缺失、循环和项目越界不会绕过依赖检查',async t=>{
 const missing=await configured(t,'{% partial file="missing" /%}',{});await assert.rejects(loadProject(missing.config),/DOCUMENT_TAG/);
 const cycle=await configured(t,'{% partial file="a" /%}',{partials:{a:Markdoc.parse('{% partial file="a" /%}')}});await assert.rejects(loadProject(cycle.config),/DOCUMENT_INCLUDE_CYCLE/);
 const outside=await configured(t,'{% partial file="a" /%}',{partials:{a:'../outside.mdoc'}});await assert.rejects(loadProject(outside.config),/PATH_SCOPE/);
});
test('原生 table 与 data-table 同时存在，工程数据引用仍校验类型',async t=>{
 const f=sample(t,'{% data-table id="not-present" /%}');expectCode(f.load,'DOCUMENT_REFERENCE');
 writeFileSync(join(f.root,'docs/native.mdoc'),'{% if true %}\n正常\n{% /if %}');assert.match((await renderDocument(f.load(),'条件')).chapters,/正常/);
});
test('公共配置接受 Markdoc 上下文，拒绝拼错字段',async t=>{
 const f=sample(t,'普通正文');writeFileSync(join(f.root,'edoc.config.js'),"export default {documents:'docs/native.mdoc',markdoc:{variables:{name:'测试'},functions:{upper:{transform({0:value}){return String(value).toUpperCase();}}},partials:{card:'docs/native.mdoc'}}};");
 const c=await resolveProjectConfig(join(f.root,'edoc.config.js'));assert.equal(c.markdoc.variables!.name,'测试');assert.equal(c.markdoc.functions!.upper.transform!({0:'a'},{}),'A');
 writeFileSync(join(f.root,'edoc.config.js'),"export default {documents:'docs/native.mdoc',markdoc:{variable:{name:'错误'}}};");await assert.rejects(resolveProjectConfig(join(f.root,'edoc.config.js')),/CONFIG_FIELD/);
});


test('原生扩展 Schema、slot 和注释选项可在同一上下文使用',async t=>{
 const {config}=await configured(t,'<!-- 不展示 -->\n\n{% note label="提示" %}正文{% slot "title" %}插槽标题{% /slot %}{% /note %}',{tokenizer:{allowComments:true},parse:{slots:true},tags:{note:{render:'aside',attributes:{label:{type:String,render:'data-label'}},slots:{title:{required:true,render:false}},transform(node:any,cfg:any){return new Markdoc.Tag('aside',node.transformAttributes(cfg),[...node.slots.title.transformChildren(cfg),...node.transformChildren(cfg)]);}}}});
 const p=await loadProject(config),html=(await renderDocument(p.graph,'扩展')).chapters;assert.match(html,/<aside data-label="提示">插槽标题正文<\/aside>/);assert.ok(!html.includes('不展示'));
});
test('扩展标签不能覆盖原生或 edoc 名称，原生注解仍不能注入脚本',async t=>{
 const {config}=await configured(t,'正文',{tags:{table:{render:'div'}}});await assert.rejects(loadProject(config),/CONFIG_FIELD/);
 const f=sample(t,'# 标题 {% onclick="alert(1)" %}');expectCode(f.load,'DOCUMENT_TAG');
});

test('原生异步文本函数、Schema 校验和转换完成后才发布正文',async t=>{
 const {config}=await configured(t,'{% section id="async" %}\n{% later("快照") %}\n\n{% slow-note %}说明{% /slow-note %}\n{% /section %}',{functions:{later:{transform:async ({0:value}:any)=>value}},tags:{'slow-note':{validate:async()=>[],transform:async(node:any,cfg:any)=>new Markdoc.Tag('aside',{},node.transformChildren(cfg))}}});
 const p=await loadProject(config);assert.match(readDocument(p.graph,'async').content,/快照/);assert.match((await renderDocument(p.graph,'异步')).chapters,/<aside>说明<\/aside>/);
 config.markdoc.tags!['slow-note'].validate=async()=>[{id:'invalid-note',level:'error',message:'异步校验不通过'}];await assert.rejects(loadProject(config),/异步校验不通过/);
});
test('slot 内的真实章节同时进入索引、目录和 read，来源不丢失',async t=>{
 const {config}=await configured(t,'{% section id="slot-parent" %}\n{% content %}\n{% slot "body" %}\n{% section id="slot-child" title="插槽子节" %}插槽正文{% /section %}\n{% /slot %}\n{% /content %}\n{% /section %}',{parse:{slots:true},tags:{content:{slots:{body:{required:true,render:false}},transform(node:any,cfg:any){return new Markdoc.Tag('div',{},node.slots.body.transformChildren(cfg));}}}});
 const p=await loadProject(config),read=readDocument(p.graph,'slot-parent',{scope:'subtree'});assert.match(read.content,/插槽正文/);assert.equal(read.children[0].id,'slot-child');assert.ok(outline(p.graph).chapters[0].children.some(c=>c.sectionId==='slot-child'));assert.match((await renderDocument(p.graph,'插槽')).chapters,/插槽正文/);
});

test('read 对 JSON 数值、布尔、空值、数组和对象继承原生显示而不崩溃',async t=>{
 const {config}=await configured(t,'{% section id="json-value" %}Value {% $value %}{% /section %}',{});
 for(const value of [42,true,false,null,['a',2],{a:1}]){
  config.markdoc={variables:{value}};
  const p=await loadProject(config),expected=Markdoc.renderers.html(Markdoc.transform(Markdoc.parse('Value {% $value %}'),config.markdoc)).replace(/<[^>]*>/g,'').trim();
  assert.equal(readDocument(p.graph,'json-value').content,expected);
 }
});
