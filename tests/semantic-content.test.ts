import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook} from '../packages/core/book.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {readDocument} from '../packages/core/read.ts';
import {query} from '../packages/core/query.ts';
import {compileManual,manualRead,manualQuery} from '../packages/core/manual.ts';

const body=`{% capability id="cap:send" title="异步发送" %}
发送能力提供可获知最终结果的异步请求。
{% behavior id="beh:timeout" title="超时结束" %}
请求超过完成时限后报告超时。
{% section id="timeout:details" title="完整条件" collapsed=true %}
{% clause id="clause:terminal" title="最终结果唯一" %}
超时报告后 MUST 不再报告成功。
{% /clause %}
{% /section %}
{% clause-list ids=["clause:errors"] /%}
{% /behavior %}
{% behavior id="beh:cancel" title="取消请求" %}
取消成功后不再报告发送成功。
{% clause-list ids=["clause:errors"] /%}
{% /behavior %}
{% /capability %}`;
const shared=`{% section id="interface:send" title="发送接口约定" %}
{% clause id="clause:errors" title="结果编码" %}
结果使用负 errno，超时为 -ETIMEDOUT。
{% /clause %}
{% /section %}`;

function specimen(t:any,content=body){
 const root=mkdtempSync(join(tmpdir(),'edoc-semantic-'));
 mkdirSync(join(root,'docs'));
 writeFileSync(join(root,'docs/edoc.config.js'),'export default {projectId:"semantic-test"};');
 writeFileSync(join(root,'docs/index.mdoc'),content);
 writeFileSync(join(root,'docs/interface.mdoc'),shared);
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return {root,load:async()=>loadBook(await resolveProjectConfig(join(root,'docs/edoc.config.js')))};
}

test('语义身份与归属从原文产生，行为默认读取全部本地与引用条款',async t=>{
 const p=specimen(t),book=await p.load(),graph=book.root.graph;
 assert.equal(query(graph,'cap:send').target.semanticKind,'capability');
 assert.equal(query(graph,'beh:timeout').target.semanticKind,'behavior');
 assert.equal(query(graph,'beh:timeout').target.ownerId,'cap:send');
 assert.deepEqual(query(graph,'cap:send').children?.map(item=>item.id),['beh:timeout','beh:cancel']);
 assert.equal(query(graph,'clause:terminal').target.semanticKind,'clause');
 assert.equal(query(graph,'clause:terminal').target.ownerId,'beh:timeout');
 const result=readDocument(graph,'beh:timeout');
 assert.equal(result.scope,'subtree');
 assert.match(result.content,/MUST 不再报告成功/);
 assert.match(result.content,/-ETIMEDOUT/);
 assert.equal(result.content.match(/结果使用负 errno/g)?.length,1);
 assert.deepEqual(result.clauses?.map(item=>item.id),['clause:terminal','clause:errors']);
 assert.ok(!result.content.includes('取消成功'));
 assert.match(result.content,/{% clause id="clause:terminal"/);
 const capability=readDocument(graph,'cap:send');
 assert.equal(capability.scope,'self');assert.ok(!capability.content.includes('超时报告后'));
 assert.equal(query(graph,'clause:errors').references.length,2);
});

test('便携手册与项目读取一致，页面条款复用不复制身份',async t=>{
 const p=specimen(t);
 writeFileSync(join(p.root,'docs/review.mdoc'),'{% section id="review" title="审阅" %}\n{% clause-list for="beh:timeout" /%}\n{% /section %}');
 const book=await p.load(),manual=compileManual(book);
 const live=readDocument(book.root.graph,'beh:timeout'),portable=manualRead(manual,'beh:timeout');
 assert.equal(portable.content,live.content);
 assert.deepEqual(portable.clauses,live.clauses);
 assert.deepEqual(manualQuery(manual,'cap:send').children,query(book.root.graph,'cap:send').children);
 let content='',offset=0;
 do{const part=readDocument(book.root.graph,'beh:timeout',{offset,maxChars:37}),saved=manualRead(manual,'beh:timeout',{offset,maxChars:37});assert.equal(saved.content,part.content);content+=part.content;offset=part.range.nextOffset??-1;}while(offset!==-1);
 assert.equal(content,live.content,'聚合后统一分页，不丢失也不重复条款');
 for(const options of [{},{withClauses:true},{withClauses:false},{withSpecs:true}]){
  const project=readDocument(book.root.graph,'review',options),saved=manualRead(manual,'review',options);
  assert.equal(saved.content,project.content);assert.deepEqual(saved.clauses,project.clauses,'普通审阅页的聚合元数据一致');
 }
 const compiled=await compileBook(book),page=Object.values(compiled.pages).find(item=>item.id==='docs/index')!;
 assert.match(page.html,/data-content-kind="capability"/);
 assert.match(page.html,/data-content-kind="behavior"/);
 assert.match(page.html,/data-clause="clause:terminal"/);
 assert.equal(page.html.match(/data-clause="clause:errors"/g)?.length,2);
 const ids=[...page.html.matchAll(/(?<![\w:-])id="([^"]+)"/g)].map(match=>match[1]);
 assert.equal(new Set(ids).size,ids.length);
 assert.equal([...book.root.graph.index.values()].filter(item=>item.id==='clause:errors').length,1);
});

test('显式局部读取保留未展开提示，引用不接受缺失身份或隐含行为',async t=>{
 const p=specimen(t),book=await p.load();
 const partial=readDocument(book.root.graph,'beh:timeout',{scope:'self',withClauses:false});
 assert.equal(partial.scope,'self');assert.equal(partial.children[0].id,'timeout:details');
 assert.ok(!partial.content.includes('MUST 不再报告成功'));
 const missing=specimen(t,body.replace('ids=["clause:errors"]','ids=["missing"]'));
 await assert.rejects(missing.load(),/SPECIFICATION_REFERENCE|CLAUSE_REFERENCE/);
 const orphan=specimen(t,'{% clause-list ids=["clause:errors"] /%}');
 await assert.rejects(orphan.load(),/CLAUSE_APPLICATION/);
 const duplicate=specimen(t,body.replace('ids=["clause:errors"]','ids=["clause:terminal"]'));
 await assert.rejects(duplicate.load(),/CLAUSE_APPLICATION/);
});

test('隐藏分支依赖仍被校验，变量与片段中的语义归属保持',async t=>{
 const p=specimen(t,body.replace('{% clause-list ids=["clause:errors"] /%}','{% if false %}{% clause-list ids=["missing"] /%}{% /if %}'));
 await assert.rejects(p.load(),/SPECIFICATION_REFERENCE|CLAUSE_REFERENCE/);
 const variable=specimen(t,'{% capability id="cap:v" title="变量示例" %}\n{% partial file="behavior" variables={id:"beh:v"} /%}\n{% /capability %}');
 mkdirSync(join(variable.root,'docs/_partials'));
 writeFileSync(join(variable.root,'docs/_partials/behavior.mdoc'),'{% behavior id=$id title="变量行为" %}变量来源。{% clause-list ids=["clause:errors"] /%}{% /behavior %}');
 writeFileSync(join(variable.root,'docs/edoc.config.js'),'export default {projectId:"semantic-test",markdoc:{partials:{behavior:"docs/_partials/behavior.mdoc"}}};');
 const book=await variable.load();
 assert.equal(query(book.root.graph,'beh:v').target.ownerId,'cap:v');
 assert.match(readDocument(book.root.graph,'beh:v').content,/-ETIMEDOUT/);
 assert.equal(readDocument(book.root.graph,'beh:v').source.file,'docs/_partials/behavior.mdoc');
});
