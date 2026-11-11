import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {compileBook} from '../packages/pack-html/book.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileManual,manualRead,manualQuery} from '../packages/core/manual.ts';
import {targetKey} from '../packages/core/routes.ts';
import {readFileSync} from 'node:fs';
import {graphFromResources} from '../packages/core/graph.ts';
import {spawnSync} from 'node:child_process';
import Markdoc from '@markdoc/markdoc';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';

import {specimen,definitions,behavior} from './clause-fixture.ts';
test('唯一规范、唯一集合、正反引用与完整聚合读取/手册分页',async t=>{
 const p=specimen(t),book=await p.load(),graph=book.root.graph;
 assert.equal(graph.index.get('CLOCK')?.type,'clause');assert.equal(graph.connections.size,0);
 assert.equal(query(graph,'CLOCK').references.length,2);assert.equal(query(graph,'behavior').references.length,2);
 const light=readDocument(graph,'behavior');assert.match(light.content,/clause-list/);assert.doesNotMatch(light.content,/时钟可运行/);
 const complete=readDocument(graph,'other',{withClauses:true});assert.equal(complete.clauses?.length,2);assert.match(complete.content,/停钟时等待/);assert.match(complete.content,/必须携带的子章节/);assert.equal(complete.content.match(/时钟可运行/g)?.length,1);
 assert.deepEqual(complete.applications.map(set=>({for:set.for,ids:set.ids})),[{for:'other',ids:['CLOCK']},{for:'behavior',ids:['CLOCK','REQUEST']}]);
 assert.match(readDocument(graph,'CLOCK',{scope:'subtree'}).content,/必须携带的子章节/);
 const manual=JSON.parse(JSON.stringify(compileManual(book)));
 assert.equal(manualRead(manual,'other',{withClauses:true}).content,complete.content);assert.equal(manualQuery(manual,'CLOCK').references.length,2);
 let text='',offset=0;do{const part=manualRead(manual,'other',{withClauses:true,offset,maxChars:17});text+=part.content;if(part.range.nextOffset===null)break;offset=part.range.nextOffset;}while(true);assert.equal(text,complete.content);
 const cli=spawnSync(process.execPath,['packages/cli/edoc.ts','read','--config',join(p.root,'docs/edoc.config.js'),'--id','behavior','--with-clauses'],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);assert.match(JSON.parse(cli.stdout).content,/停钟时等待/);
});
test('多处呈现隔离 DOM 锚点，原文跳转/局部锚点有效，单源修改同步',async t=>{
 const p=specimen(t);p.write('docs/index.mdoc',behavior+'\n[规范示例锚点](specs.mdoc#clock-example)');const data=await compileBook(await p.load()),page=data.pages[targetKey((await p.load()).root.config.projectId,'docs/index')];
 assert.match(page.html,/有效时钟/);assert.equal(page.html.match(/data-clause="CLOCK"/g)?.length,3);
 const ids=[...page.html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 assert.ok(page.html.includes('clause-instance-1-clock-example'));assert.match(page.html,/条款原文/);
 p.write('docs/specs.mdoc',definitions.replace('有效时钟','更新时钟'));
 const changed=await compileBook(await p.load());assert.equal(changed.pages[targetKey((await p.load()).root.config.projectId,'docs/index')].html.match(/更新时钟/g)?.length,3);
});
test('严格拒绝缺失/错类型/重复定义/集合重复/集合元素重复/未定义集合/嵌套',async t=>{
 const cases:[string,string][]=[
  ['{% clause-list for="missing" ids=["CLOCK"] /%}','CLAUSE_BEHAVIOR'],
  ['{% section id="b" %}{% clause-list for="b" ids=["specs"] /%}{% /section %}','CLAUSE_REFERENCE'],
  ['{% section id="b" %}{% clause-list for="b" ids=["MISSING"] /%}{% /section %}','CLAUSE_REFERENCE'],
  ['{% section id="b" %}{% clause-list for="b" ids=["CLOCK","CLOCK"] /%}{% /section %}','CLAUSE_APPLICATION'],
  ['{% section id="b" %}{% clause-list for="b" ids=[] /%}{% clause-list for="b" ids=[] /%}{% /section %}','CLAUSE_APPLICATION'],
  ['{% section id="b" %}{% clause-list for="b" /%}{% /section %}','CLAUSE_APPLICATION'],
  ['{% clause id="CLOCK" title="重复" %}正文{% /clause %}','DUPLICATE_ID'],
  ['{% clause id="OUTER" title="外层" %}{% clause id="INNER" title="内层" %}正文{% /clause %}{% /clause %}','CLAUSE_NESTING'],
  ['{% clause id="HIDDEN" title="规范" %}正文{% if false %}{% clause-list for="missing" /%}{% /if %}{% /clause %}','CLAUSE_NESTING'],
 ];
 for(const [text,code]of cases){const p=specimen(t,text);await assert.rejects(p.load(),error=>String(error).includes(code),code);}
 const p=specimen(t,'{% section id="b" %}{% clause-list for="b" ids=[] /%}{% clause-list for="b" /%}{% /section %}');assert.equal((await p.load()).root.graph.clauses?.applications.get('b')?.ids.length,0);
});
test('机器源正文同样发现依赖/校验来源，适配器仅调用一次',async t=>{
 const p=specimen(t,'{% section id="b" %}{% clause-list for="b" ids=["MACHINE"] /%}{% /section %}',`{data(){globalThis.__specCalls=(globalThis.__specCalls??0)+1;return {clauses:[{id:'MACHINE',kind:'clause',label:'机器规范',source:{file:'contracts/source.mdoc'},body:{format:'markdoc',content:'机器正文\\n\\n{% code file="sample.ts" /%}'}}]};}}`);
 p.write('sample.ts','const value = 42;');const book=await p.load();assert.equal((globalThis as any).__specCalls,1);delete (globalThis as any).__specCalls;
 assert.ok(book.inputs.includes(join(p.root,'sample.ts')));assert.match(readDocument(book.root.graph,'b',{withClauses:true}).content,/const value = 42/);
 const data=await compileBook(book);assert.ok(Object.keys(data.pages).some(key=>key.includes('__clauses__')));assert.match(Object.values(data.pages).find(page=>page.id.startsWith('__clauses__'))!.html,/contracts\/source.mdoc/);assert.equal(JSON.stringify(data.navigation).includes('__clauses__'),false);
 p.write('docs/edoc.config.js',`export default {data:{clauses:[{id:'MACHINE',kind:'clause',label:'错误',source:{file:'contracts/a.mdoc'},body:{format:'markdoc',content:'{% waveform id="missing" /%}'}}]}};`);await assert.rejects(p.load(),/DOCUMENT_REFERENCE/);
});
test('定义侧变量/partial/相对链接保持来源，缺失资源不被复用掩盖',async t=>{
 const p=specimen(t,undefined,`{markdoc:{variables:{name:'外层'},partials:{clause:'docs/_partials/clause.mdoc'}}}`);
 const {mkdirSync}=await import('node:fs');mkdirSync(join(p.root,'docs/_partials'));
 p.write('docs/_partials/clause.mdoc','{% clause id="CLOCK" title="局部条款" %}\n{% $name %}\n\n[规范所在页](../specs.mdoc#specs)\n{% /clause %}');
 p.write('docs/specs.mdoc','{% section id="specs" title="规范库" %}\n{% partial file="clause" variables={name:"定义侧值"} /%}\n{% clause id="REQUEST" title="请求" %}请求正文{% /clause %}\n{% /section %}');
 const book=await p.load();assert.match(readDocument(book.root.graph,'behavior',{withClauses:true}).content,/定义侧值/);assert.ok(readDocument(book.root.graph,'CLOCK').sources.some(s=>s.file==='docs/_partials/clause.mdoc'));
 const data=await compileBook(book);assert.match(Object.values(data.pages).find(p=>p.id==='docs/index')!.html,/定义侧值/);
 p.write('docs/_partials/clause.mdoc','{% clause id="CLOCK" title="局部条款" %}\n正文。\n{% if false %}{% waveform id="missing-wave" /%}{% /if %}\n{% /clause %}');await assert.rejects(p.load(),/DOCUMENT_REFERENCE/);
 p.write('docs/_partials/clause.mdoc','{% clause id="CLOCK" title="局部条款" %}\n![缺失](missing.svg)\n{% /clause %}');await assert.rejects(p.load(),/FILE_MISSING/);
});
test('机器源异步文本准备后再注册，普通链接不会重复发现已加载文档',async t=>{
 const p=specimen(t,'{% section id="b" %}{% clause-list for="b" ids=["MACHINE"] /%}{% /section %}',`{markdoc:{functions:{delayed:{async transform(){return '异步条款原文';}}}},data:{clauses:[{id:'MACHINE',kind:'clause',label:'异步条款',source:{file:'source.mdoc'},body:{format:'markdoc',content:'{% delayed() %}\\n\\n[已有规范](docs/specs.mdoc#specs)'}}]}}`);
 const book=await p.load();assert.match(readDocument(book.root.graph,'MACHINE').content,/异步条款原文/);await compileBook(book);
 assert.equal(book.root.documents.documents.filter(d=>d.file==='docs/specs.mdoc').length,1);
});
test('机器规范新增输入参加输出保护，独立工程边界保持有效',async t=>{
 const p=specimen(t,'{% section id="b" %}{% clause-list for="b" ids=["MACHINE"] /%}{% /section %}',`{output:{html:'original.html'},data:{clauses:[{id:'MACHINE',kind:'clause',label:'规范',source:{file:'contracts/source.mdoc'},body:{format:'markdoc',content:'{% code file="original.html" /%}\\n{% waveform id="missing" /%}'}}]}}`);
 p.write('original.html','<p>须保留的源码</p>');
 const result=spawnSync(process.execPath,['packages/cli/edoc.ts','build','--config',join(p.root,'docs/edoc.config.js')],{encoding:'utf8'});
 assert.equal(result.status,1);assert.match(result.stderr,/OUTPUT_SOURCE/);
 const {readFileSync,mkdirSync}=await import('node:fs');assert.equal(readFileSync(join(p.root,'original.html'),'utf8'),'<p>须保留的源码</p>');
 mkdirSync(join(p.root,'child/docs'),{recursive:true});p.write('child/docs/edoc.config.js',`throw Error('不应执行独立配置')`);
 p.write('docs/edoc.config.js',`export default {children:{lib:'child/docs/edoc.config.js'},data:{clauses:[{id:'MACHINE',kind:'clause',label:'越界规范',source:{file:'child/source.mdoc'},body:{format:'markdoc',content:'越界正文'}}]}};`);
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
 p.write('docs/_partials/definition.mdoc','{% clause id=$id title=$name %}\n{% scope-note /%}\n{% /clause %}');
 p.write('docs/specs.mdoc','{% section id="specs" title="规范库" %}\n{% partial file="def" variables={id:"REQUEST",name:"请求独立正文"} /%}\n{% partial file="def" variables={id:"CLOCK",name:"时钟独立正文"} /%}\n{% /section %}');
 const config=await resolveProjectConfig(join(p.root,'docs/edoc.config.js'));
 const transform=(_node:any,cfg:any)=>new Markdoc.Tag('p',{},[cfg.variables.name]);
 config.markdoc={variables:{name:'宿主'},partials:{def:'docs/_partials/definition.mdoc'},tags:{'scope-note':{selfClosing:true,transform}}};
 const book=await loadBook(config);
 for(let iteration=0;iteration<2;iteration++){
  const data=await compileBook(book),source=Object.values(data.pages).find(p=>p.id==='docs/specs')!.html;
  for(const [id,value]of [['CLOCK','时钟独立正文'],['REQUEST','请求独立正文']])assert.match(source,new RegExp(`data-clause="${id}"[^]*?<p>${value}</p>`));
  assert.equal(config.markdoc.tags!['scope-note'].transform,transform);
 }
});
test('Markdoc 条件只选择当前适用集合，未选择的规范依赖仍严格检查',async t=>{
 const body='{% section id="b" %}\n{% if true %}\n{% clause-list for="b" ids=["CLOCK"] /%}\n{% else /%}\n{% clause-list for="b" ids=["REQUEST"] /%}\n{% /if %}\n{% /section %}';
 const p=specimen(t,body),book=await p.load();assert.deepEqual(book.root.graph.clauses!.applications.get('b')!.ids,['CLOCK']);assert.equal(query(book.root.graph,'REQUEST').references.length,0);
 assert.match(readDocument(book.root.graph,'b',{withClauses:true}).content,/有效时钟/);await compileBook(book);
 p.write('docs/index.mdoc',body.replace('ids=["REQUEST"]','ids=["MISSING"]'));await assert.rejects(p.load(),/CLAUSE_REFERENCE/);
});
test('规范展示不增加行为目录层级，内部锚点与读取保留，折叠只影响引用位置',async t=>{
 const p=specimen(t,'{% section id="behavior" title="行为" %}\n## 适用要求\n{% clause-list for="behavior" ids=["CLOCK","REQUEST"] /%}\n## 观察结果\n{% clause-list for="behavior" collapsed=false /%}\n{% /section %}');
 const book=await p.load(),graph=book.root.graph,data=await compileBook(book),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 const flatten=(entries:typeof page.outline):string[]=>entries.flatMap(e=>[e.label,...flatten(e.children)]);
 assert.deepEqual(flatten(page.outline),['行为','适用要求','观察结果']);assert.equal(page.outline[0].children[1].level,2);
 const tags=[...page.html.matchAll(/<details class="clause"[^>]*>/g)].map(m=>m[0]);assert.equal(tags.length,4);assert.equal(tags.filter(t=>/\sopen(?:\s|>)/.test(t)).length,2);
 assert.ok(page.html.includes('id="clause-instance-1-clock-example"'));assert.match(page.html,/class="clause-heading">例子/);
 const source=Object.values(data.pages).find(p=>p.id==='docs/specs')!;assert.deepEqual(flatten(source.outline),['规范库','时钟条件','清零请求']);
 assert.match(readDocument(graph,'behavior',{withClauses:true}).content,/必须携带的子章节/);assert.match(readDocument(graph,'CLOCK-DETAIL').content,/必须携带的子章节/);
 assert.equal(query(graph,'CLOCK').references.length,1);
 p.write('docs/index.mdoc','{% section id="b" %}{% clause-list for="b" ids=["CLOCK"] collapsed="true" /%}{% /section %}');await assert.rejects(p.load(),/DOCUMENT_TAG/);
});

test('移除旧写法：源码、隐藏分支、配置、机器数据与读取入口明确拒绝，字面示例仍可阅读',async t=>{
 for(const text of [
  '{% specification id="old" title="旧条款" %}原文{% /specification %}',
  '{% spec-list for="behavior" common=["CLOCK"] /%}',
  '{% if false %}{% specification id="old" title="旧条款" %}原文{% /specification %}{% /if %}',
 ])await assert.rejects(specimen(t,text).load(),/REMOVED_SYNTAX/);
 for(const fields of ['common=["CLOCK"]','specific=["CLOCK"]','ids=["CLOCK"] common=[]']){
  await assert.rejects(specimen(t,`{% section id="b" %}{% clause-list for="b" ${fields} /%}{% /section %}`).load(),/DOCUMENT_TAG/);
 }
 const override=specimen(t,undefined,`{markdoc:{tags:{'spec-list':{selfClosing:true}}}}`);
 await assert.rejects(override.load(),/CONFIG_FIELD/);
 const oldData={specifications:[{id:'MACHINE',kind:'specification',label:'旧条款',body:{format:'markdoc',content:'正文'},source:{file:'source.mdoc'}}]};
 await assert.rejects(specimen(t,undefined,`{data:${JSON.stringify(oldData)}}`).load(),/REMOVED_RESOURCE/);
 const scanned=specimen(t),{mkdirSync}=await import('node:fs');mkdirSync(join(scanned.root,'docs/ir'));scanned.write('docs/ir/old.json',JSON.stringify(oldData));
 await assert.rejects(scanned.load(),/REMOVED_RESOURCE/);
 const feature=specimen(t,undefined,`{data:{clauses:[],requiredFeatures:['specifications']}}`);
 await assert.rejects(feature.load(),/IR_FEATURE/);
 const wrongKind=specimen(t,undefined,`{data:{clauses:${JSON.stringify(oldData.specifications)}}}`);
 await assert.rejects(wrongKind.load(),/SCHEMA/);
 const literal=specimen(t,'```markdoc {% process=false %}\n{% specification id="literal" title="原写法" %}示意{% /specification %}\n{% spec-list for="old" /%}\n```');
 const book=await literal.load(),manual=compileManual(book);
 assert.equal(book.root.graph.index.has('literal'),false);assert.match(Object.values((await compileBook(book)).pages).find(p=>p.id==='docs/index')!.html,/specification/);
 assert.throws(()=>readDocument(book.root.graph,'CLOCK',{withSpecs:true} as any),/READ_OPTION/);
 assert.throws(()=>manualRead(manual,'CLOCK',{withSpecs:true} as any),/READ_OPTION/);
 const cli=spawnSync(process.execPath,['packages/cli/edoc.ts','read','--config',join(literal.root,'docs/edoc.config.js'),'--id','CLOCK','--with-specs'],{encoding:'utf8'});
 assert.notEqual(cli.status,0);assert.match(cli.stderr,/未知选项/);
});


test('公开条款IR要求1.6与clauses能力，机器定义保留语义身份，最小模板可独立使用',async t=>{
 const p=specimen(t),entity={id:'M',kind:'clause',label:'机器要求',body:{format:'markdoc',content:'必须保留完整前提。'},source:{file:'source.mdoc'}};
 const parts:any=[{type:'clauses',data:{clauses:[entity]},file:'machine.json'}];
 const metadata={projectId:'machine',irVersion:'1.6',requiredFeatures:['clauses'],resources:[{type:'clauses' as const,path:'machine.json'}],entryDocuments:[]};
 assert.throws(()=>graphFromResources(parts,{...metadata,irVersion:'1.5'},{root:p.root,strict:true}),/IR_VERSION/);
 assert.throws(()=>graphFromResources(parts,{...metadata,requiredFeatures:[]},{root:p.root,strict:true}),/IR_FEATURE_REQUIRED/);
 const graph=graphFromResources(parts,metadata,{root:p.root,strict:true});
 assert.equal(query(graph,'M').target.semanticKind,'clause');
 assert.equal(query(graph,'M').target.type,'clause');assert.equal(readDocument(graph,'M').clauses[0].id,'M');
 const template=specimen(t,readFileSync('templates/clauses/docs/index.mdoc','utf8'));
 const book=await template.load(),reading=readDocument(book.root.graph,'behavior:timeout');
 assert.match(reading.content,/迟到事件/);assert.match(reading.content,/截止时刻/);
 assert.deepEqual(reading.clauses.map(c=>c.id),['clause:timeout','clause:deadline']);
});
