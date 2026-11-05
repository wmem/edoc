import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {compileBook} from '../packages/pack-html/book.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileManual,manualRead,manualQuery} from '../packages/core/manual.ts';
import {targetKey} from '../packages/core/routes.ts';
import {spawnSync} from 'node:child_process';
import Markdoc from '@markdoc/markdoc';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';

import {specimen,definitions,behavior} from './specification-fixture.ts';
test('唯一规范、唯一集合、正反引用与完整聚合读取/手册分页',async t=>{
 const p=specimen(t),book=await p.load(),graph=book.root.graph;
 assert.equal(graph.index.get('CLOCK')?.type,'specification');assert.equal(graph.connections.size,0);
 assert.equal(query(graph,'CLOCK').references.length,2);assert.equal(query(graph,'behavior').references.length,2);
 const light=readDocument(graph,'behavior');assert.match(light.content,/spec-list/);assert.doesNotMatch(light.content,/时钟可运行/);
 const complete=readDocument(graph,'other',{withSpecs:true});assert.equal(complete.specifications?.length,2);assert.match(complete.content,/停钟时等待/);assert.match(complete.content,/必须携带的子章节/);assert.equal(complete.content.match(/时钟可运行/g)?.length,1);
 assert.deepEqual(complete.specifications?.[0].applications,[{for:'other',role:'common'},{for:'behavior',role:'common'}]);
 assert.match(readDocument(graph,'CLOCK',{scope:'subtree'}).content,/必须携带的子章节/);
 const manual=JSON.parse(JSON.stringify(compileManual(book)));
 assert.equal(manualRead(manual,'other',{withSpecs:true}).content,complete.content);assert.equal(manualQuery(manual,'CLOCK').references.length,2);
 let text='',offset=0;do{const part=manualRead(manual,'other',{withSpecs:true,offset,maxChars:17});text+=part.content;if(part.range.nextOffset===null)break;offset=part.range.nextOffset;}while(true);assert.equal(text,complete.content);
 const cli=spawnSync(process.execPath,['packages/cli/edoc.ts','read','--config',join(p.root,'docs/edoc.config.js'),'--id','behavior','--with-specs'],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.match(JSON.parse(cli.stdout).content,/停钟时等待/);
});
test('多处呈现隔离 DOM 锚点，原文跳转/局部锚点有效，单源修改同步',async t=>{
 const p=specimen(t);p.write('docs/index.mdoc',behavior+'\n[规范示例锚点](specs.mdoc#clock-example)');const data=await compileBook(await p.load()),page=data.pages[targetKey((await p.load()).root.config.projectId,'docs/index')];
 assert.match(page.html,/有效时钟/);assert.equal(page.html.match(/data-specification="CLOCK"/g)?.length,3);
 const ids=[...page.html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 assert.ok(page.html.includes('spec-instance-1-clock-example'));assert.match(page.html,/规范原文/);
 p.write('docs/specs.mdoc',definitions.replace('有效时钟','更新时钟'));
 const changed=await compileBook(await p.load());assert.equal(changed.pages[targetKey((await p.load()).root.config.projectId,'docs/index')].html.match(/更新时钟/g)?.length,3);
});
test('严格拒绝缺失/错类型/重复定义/集合重复/公共专属重叠/未定义集合/嵌套',async t=>{
 const cases:[string,string][]=[
  ['{% spec-list for="missing" common=["CLOCK"] /%}','SPECIFICATION_BEHAVIOR'],
  ['{% section id="b" %}{% spec-list for="b" common=["specs"] /%}{% /section %}','SPECIFICATION_REFERENCE'],
  ['{% section id="b" %}{% spec-list for="b" common=["MISSING"] /%}{% /section %}','SPECIFICATION_REFERENCE'],
  ['{% section id="b" %}{% spec-list for="b" common=["CLOCK"] specific=["CLOCK"] /%}{% /section %}','SPECIFICATION_APPLICATION'],
  ['{% section id="b" %}{% spec-list for="b" common=[] /%}{% spec-list for="b" specific=[] /%}{% /section %}','SPECIFICATION_APPLICATION'],
  ['{% section id="b" %}{% spec-list for="b" /%}{% /section %}','SPECIFICATION_APPLICATION'],
  ['{% specification id="CLOCK" title="重复" %}正文{% /specification %}','DUPLICATE_ID'],
  ['{% specification id="OUTER" title="外层" %}{% specification id="INNER" title="内层" %}正文{% /specification %}{% /specification %}','SPECIFICATION_NESTING'],
  ['{% specification id="HIDDEN" title="规范" %}正文{% if false %}{% spec-list for="missing" /%}{% /if %}{% /specification %}','SPECIFICATION_NESTING'],
 ];
 for(const [text,code]of cases){const p=specimen(t,text);await assert.rejects(p.load(),error=>String(error).includes(code),code);}
 const p=specimen(t,'{% section id="b" %}{% spec-list for="b" common=[] /%}{% spec-list for="b" /%}{% /section %}');assert.equal((await p.load()).root.graph.specifications?.applications.get('b')?.common.length,0);
});
test('机器源正文同样发现依赖/校验来源，适配器仅调用一次',async t=>{
 const p=specimen(t,'{% section id="b" %}{% spec-list for="b" specific=["MACHINE"] /%}{% /section %}',`{data(){globalThis.__specCalls=(globalThis.__specCalls??0)+1;return {specifications:[{id:'MACHINE',kind:'specification',label:'机器规范',source:{file:'contracts/source.mdoc'},body:{format:'markdoc',content:'机器正文\\n\\n{% code file="sample.ts" /%}'}}]};}}`);
 p.write('sample.ts','const value = 42;');const book=await p.load();assert.equal((globalThis as any).__specCalls,1);delete (globalThis as any).__specCalls;
 assert.ok(book.inputs.includes(join(p.root,'sample.ts')));assert.match(readDocument(book.root.graph,'b',{withSpecs:true}).content,/const value = 42/);
 const data=await compileBook(book);assert.ok(Object.keys(data.pages).some(key=>key.includes('__specifications__')));assert.match(Object.values(data.pages).find(page=>page.id.startsWith('__specifications__'))!.html,/contracts\/source.mdoc/);assert.equal(JSON.stringify(data.navigation).includes('__specifications__'),false);
 p.write('docs/edoc.config.js',`export default {data:{specifications:[{id:'MACHINE',kind:'specification',label:'错误',source:{file:'contracts/a.mdoc'},body:{format:'markdoc',content:'{% waveform id="missing" /%}'}}]}};`);await assert.rejects(p.load(),/DOCUMENT_REFERENCE/);
});
test('定义侧变量/partial/相对链接保持来源，缺失资源不被复用掩盖',async t=>{
 const p=specimen(t,undefined,`{markdoc:{variables:{name:'外层'},partials:{clause:'docs/_partials/clause.mdoc'}}}`);
 const {mkdirSync}=await import('node:fs');mkdirSync(join(p.root,'docs/_partials'));
 p.write('docs/_partials/clause.mdoc','{% specification id="CLOCK" title="局部条款" %}\n{% $name %}\n\n[规范所在页](../specs.mdoc#specs)\n{% /specification %}');
 p.write('docs/specs.mdoc','{% section id="specs" title="规范库" %}\n{% partial file="clause" variables={name:"定义侧值"} /%}\n{% specification id="REQUEST" title="请求" %}请求正文{% /specification %}\n{% /section %}');
 const book=await p.load();assert.match(readDocument(book.root.graph,'behavior',{withSpecs:true}).content,/定义侧值/);assert.ok(readDocument(book.root.graph,'CLOCK').sources.some(s=>s.file==='docs/_partials/clause.mdoc'));
 const data=await compileBook(book);assert.match(Object.values(data.pages).find(p=>p.id==='docs/index')!.html,/定义侧值/);
 p.write('docs/_partials/clause.mdoc','{% specification id="CLOCK" title="局部条款" %}\n正文。\n{% if false %}{% waveform id="missing-wave" /%}{% /if %}\n{% /specification %}');await assert.rejects(p.load(),/DOCUMENT_REFERENCE/);
 p.write('docs/_partials/clause.mdoc','{% specification id="CLOCK" title="局部条款" %}\n![缺失](missing.svg)\n{% /specification %}');await assert.rejects(p.load(),/FILE_MISSING/);
});
test('机器源异步文本准备后再注册，普通链接不会重复发现已加载文档',async t=>{
 const p=specimen(t,'{% section id="b" %}{% spec-list for="b" common=["MACHINE"] /%}{% /section %}',`{markdoc:{functions:{delayed:{async transform(){return '异步规范原文';}}}},data:{specifications:[{id:'MACHINE',kind:'specification',label:'异步条款',source:{file:'source.mdoc'},body:{format:'markdoc',content:'{% delayed() %}\\n\\n[已有规范](docs/specs.mdoc#specs)'}}]}}`);
 const book=await p.load();assert.match(readDocument(book.root.graph,'MACHINE').content,/异步规范原文/);await compileBook(book);
 assert.equal(book.root.documents.documents.filter(d=>d.file==='docs/specs.mdoc').length,1);
});
test('机器规范新增输入参加输出保护，独立工程边界保持有效',async t=>{
 const p=specimen(t,'{% section id="b" %}{% spec-list for="b" common=["MACHINE"] /%}{% /section %}',`{output:{html:'original.html'},data:{specifications:[{id:'MACHINE',kind:'specification',label:'规范',source:{file:'contracts/source.mdoc'},body:{format:'markdoc',content:'{% code file="original.html" /%}\\n{% waveform id="missing" /%}'}}]}}`);
 p.write('original.html','<p>须保留的源码</p>');
 const result=spawnSync(process.execPath,['packages/cli/edoc.ts','build','--config',join(p.root,'docs/edoc.config.js')],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/OUTPUT_SOURCE/);
 const {readFileSync,mkdirSync}=await import('node:fs');assert.equal(readFileSync(join(p.root,'original.html'),'utf8'),'<p>须保留的源码</p>');
 mkdirSync(join(p.root,'child/docs'),{recursive:true});p.write('child/docs/edoc.config.js',`throw Error('不应执行独立配置')`);
 p.write('docs/edoc.config.js',`export default {children:{lib:'child/docs/edoc.config.js'},data:{specifications:[{id:'MACHINE',kind:'specification',label:'越界规范',source:{file:'child/source.mdoc'},body:{format:'markdoc',content:'越界正文'}}]}};`);
 await assert.rejects(p.load(),/DOCUMENT_PROJECT_SCOPE/);
});
test('条款内自定义转换保留每个 partial 的局部上下文',async t=>{
 const p=specimen(t),{mkdirSync}=await import('node:fs');mkdirSync(join(p.root,'docs/_partials'));
 p.write('docs/_partials/note.mdoc','{% scope-note /%}');
 p.write('docs/specs.mdoc',definitions.replace('只在 **有效时钟**','{% partial file="note" variables={name:"条款内层"} /%}\n\n只在 **有效时钟**'));
 const config=await resolveProjectConfig(join(p.root,'docs/edoc.config.js'));
 config.markdoc={variables:{name:'宿主外层'},partials:{note:'docs/_partials/note.mdoc'},tags:{'scope-note':{selfClosing:true,transform(_node,cfg){return new Markdoc.Tag('p',{id:'scoped-note'},[String(cfg.variables!.name)]);}}}};
 const book=await loadBook(config),data=await compileBook(book),html=Object.values(data.pages).find(p=>p.id==='docs/index')!.html;
 assert.equal(html.match(/条款内层/g)?.length,3);assert.doesNotMatch(html,/宿主外层/);
 const ids=[...html.matchAll(/(?<![\w:-])id="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});
test('不同页面和重复构建不修改共享 Schema 或串用条款上下文',async t=>{
 const p=specimen(t),{mkdirSync}=await import('node:fs');mkdirSync(join(p.root,'docs/_partials'));
 p.write('docs/_partials/definition.mdoc','{% specification id=$id title=$name %}\n{% scope-note /%}\n{% /specification %}');
 p.write('docs/specs.mdoc','{% section id="specs" title="规范库" %}\n{% partial file="def" variables={id:"REQUEST",name:"请求独立正文"} /%}\n{% partial file="def" variables={id:"CLOCK",name:"时钟独立正文"} /%}\n{% /section %}');
 const config=await resolveProjectConfig(join(p.root,'docs/edoc.config.js'));
 const transform=(_node:any,cfg:any)=>new Markdoc.Tag('p',{},[cfg.variables.name]);
 config.markdoc={variables:{name:'宿主'},partials:{def:'docs/_partials/definition.mdoc'},tags:{'scope-note':{selfClosing:true,transform}}};
 const book=await loadBook(config);
 for(let iteration=0;iteration<2;iteration++){
  const data=await compileBook(book),source=Object.values(data.pages).find(p=>p.id==='docs/specs')!.html;
  for(const [id,value]of [['CLOCK','时钟独立正文'],['REQUEST','请求独立正文']])assert.match(source,new RegExp(`data-specification="${id}"[^]*?<p>${value}</p>`));
  assert.equal(config.markdoc.tags!['scope-note'].transform,transform);
 }
});
test('Markdoc 条件只选择当前适用集合，未选择的规范依赖仍严格检查',async t=>{
 const body='{% section id="b" %}\n{% if true %}\n{% spec-list for="b" common=["CLOCK"] /%}\n{% else /%}\n{% spec-list for="b" specific=["REQUEST"] /%}\n{% /if %}\n{% /section %}';
 const p=specimen(t,body),book=await p.load();assert.deepEqual(book.root.graph.specifications!.applications.get('b')!.common,['CLOCK']);assert.equal(query(book.root.graph,'REQUEST').references.length,0);
 assert.match(readDocument(book.root.graph,'b',{withSpecs:true}).content,/有效时钟/);await compileBook(book);
 p.write('docs/index.mdoc',body.replace('specific=["REQUEST"]','specific=["MISSING"]'));await assert.rejects(p.load(),/SPECIFICATION_REFERENCE/);
});
test('规范展示不增加行为目录层级，内部锚点与读取保留，折叠只影响引用位置',async t=>{
 const p=specimen(t,'{% section id="behavior" title="行为" %}\n## 适用要求\n{% spec-list for="behavior" common=["CLOCK"] specific=["REQUEST"] /%}\n## 观察结果\n{% spec-list for="behavior" collapsed=false /%}\n{% /section %}');
 const book=await p.load(),graph=book.root.graph,data=await compileBook(book),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 const flatten=(entries:typeof page.outline):string[]=>entries.flatMap(e=>[e.label,...flatten(e.children)]);
 assert.deepEqual(flatten(page.outline),['行为','适用要求','观察结果']);assert.equal(page.outline[0].children[1].level,2);
 const tags=[...page.html.matchAll(/<details class="specification"[^>]*>/g)].map(m=>m[0]);assert.equal(tags.length,4);assert.equal(tags.filter(t=>/\sopen(?:\s|>)/.test(t)).length,2);
 assert.ok(page.html.includes('id="spec-instance-1-clock-example"'));assert.match(page.html,/class="specification-heading">例子/);
 const source=Object.values(data.pages).find(p=>p.id==='docs/specs')!;assert.deepEqual(flatten(source.outline),['规范库','时钟条件','清零请求']);
 assert.match(readDocument(graph,'behavior',{withSpecs:true}).content,/必须携带的子章节/);assert.match(readDocument(graph,'CLOCK-DETAIL').content,/必须携带的子章节/);
 assert.equal(query(graph,'CLOCK').references.length,1);
 p.write('docs/index.mdoc','{% section id="b" %}{% spec-list for="b" common=["CLOCK"] collapsed="true" /%}{% /section %}');await assert.rejects(p.load(),/DOCUMENT_TAG/);
});
