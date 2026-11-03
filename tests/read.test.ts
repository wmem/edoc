import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fixture,expectCode,repository} from './helpers.ts';
import {readDocument,outline} from '../packages/core/index.ts';
import {loadBook,projectOutline} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';

function sample(t:any){
 const f=fixture(t);
 writeFileSync(join(f.root,'docs/read.mdoc'),`{% section id="read:parent" title="父章节" %}
父节 **说明** 😀。

{% panel title="嵌套布局" %}
{% section id="read:child" title="子章节" %}
CHILD_ONLY
{% /section %}
{% /panel %}

{% include file="docs/part.mdoc" /%}

\`\`\`text
{% include file="missing-sample.mdoc" /%}
{% diagram id="example-only" /%}
{% section id="fake" %}代码里的标签{% /section %}
\`\`\`

{% /section %}

{% section id="read:other" title="其他文章内容" %}
UNRELATED_ONLY
{% /section %}`);
 writeFileSync(join(f.root,'docs/part.mdoc'),'片段 **原文**。\n');
 f.edit('manifest',d=>d.entryDocuments=['docs/read.mdoc']);return f;
}
test('read 默认只读当前章节，保留 Markdown、引用字面量与来源',t=>{
 const f=sample(t),result=readDocument(f.load(),'read:parent');
 assert.equal(result.scope,'self');assert.match(result.content,/父节 \*\*说明\*\* 😀/);assert.match(result.content,/片段 \*\*原文\*\*/);
 assert.ok(!result.content.includes('CHILD_ONLY'));assert.ok(!result.content.includes('UNRELATED_ONLY'));
 assert.match(result.content,/```text\n{% include file="missing-sample.mdoc"/);assert.match(result.content,/diagram id="example-only"/);
 assert.deepEqual(result.children.map(c=>c.id),['read:child']);assert.equal(result.source.file,'docs/read.mdoc');assert.equal(result.source.line,1);
 assert.ok(result.sources.some(s=>s.file==='docs/part.mdoc'));assert.ok(!result.content.includes('__edoc'));
});
test('read subtree 显式包含子章节，分页不拆开 Unicode 字符',t=>{
 const graph=sample(t).load(),full=readDocument(graph,'read:parent',{scope:'subtree'});
 assert.match(full.content,/CHILD_ONLY/);assert.ok(!full.content.includes('UNRELATED_ONLY'));
 let content='',offset=0;
 do{const part=readDocument(graph,'read:parent',{scope:'subtree',offset,maxChars:7});content+=part.content;assert.equal(part.range.returnedChars,Array.from(part.content).length);if(!part.range.truncated)break;offset=part.range.nextOffset!;}while(true);
 assert.equal(content,full.content);assert.ok(!content.includes('\uFFFD'));
 const end=readDocument(graph,'read:parent',{scope:'subtree',offset:full.range.totalChars});assert.equal(end.content,'');assert.equal(end.range.nextOffset,null);
 expectCode(()=>readDocument(graph,'read:parent',{offset:100000}),'READ_OFFSET');
});
test('read 拒绝未知 ID、非章节对象及无效范围',t=>{
 const graph=sample(t).load();expectCode(()=>readDocument(graph,'missing'),'QUERY_NOT_FOUND');expectCode(()=>readDocument(graph,'board:U1'),'READ_TYPE');
 for(const offset of [-1,1.5,NaN])expectCode(()=>readDocument(graph,'read:parent',{offset}),'READ_OFFSET');
 for(const maxChars of [0,100001,1.5])expectCode(()=>readDocument(graph,'read:parent',{maxChars}),'READ_LIMIT');
 expectCode(()=>readDocument(graph,'read:parent',{scope:'all' as any}),'READ_SCOPE');
});
test('inline section 正文与 code 围栏不会被近似源行切片误取',t=>{
 const f=sample(t);writeFileSync(join(f.root,'docs/read.mdoc'),'{% section id="inline" %}前文 **重点** {% section id="inner" %}隐含细节{% /section %} 后文{% /section %}');
 const graph=f.load();assert.match(readDocument(graph,'inline').content,/前文 \*\*重点\*\*/);assert.ok(!readDocument(graph,'inline').content.includes('隐含细节'));assert.equal(readDocument(graph,'inner').content,'隐含细节');
});
test('outline 暴露源 sectionId，代码围栏不加载资源或创建假章节',async t=>{
 const f=sample(t),graph=f.load();assert.equal(outline(graph).chapters[0].sectionId,'read:parent');assert.ok(!graph.index.has('fake'));
 const book=await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js')));assert.equal(projectOutline(book).chapters[0].sectionId,'read:parent');
 const rendered=await renderDocument(graph,'代码示例');assert.equal(Object.keys(rendered.scenes).length,0);assert.match(rendered.chapters,/<pre><code data-language="text">/);assert.match(rendered.chapters,/{% include file=&quot;missing-sample.mdoc&quot;/);
});
test('read CLI 可选择组合内项目，弱链接不执行外部配置，text 明示截断',t=>{
 const f=sample(t);mkdirSync(join(f.root,'component'));writeFileSync(join(f.root,'component/edoc.config.js'),"export default {projectId:'component',documents:'index.mdoc'};");writeFileSync(join(f.root,'component/index.mdoc'),'{% section id="same" title="独立章节" %}CHILD_CONTENT {% reference project="missing" id="unknown" /%}{% /section %}');
 writeFileSync(join(f.root,'docs/edoc.config.js'),"export default {projectId:'parent',documents:'parent.mdoc',children:{part:'component/edoc.config.js'}};");writeFileSync(join(f.root,'parent.mdoc'),'{% section id="same" title="父章节" %}\nPARENT_CONTENT\n\n{% include project="part" /%}\n{% /section %}');
 const run=(args:string[])=>spawnSync(process.execPath,[join(repository,'packages/cli/edoc.ts'),...args],{cwd:f.root,encoding:'utf8',timeout:15000});
 const child=run(['read','--project','component','--id','same']);assert.equal(child.status,0,child.stderr);assert.match(JSON.parse(child.stdout).content,/CHILD_CONTENT/);assert.ok(!child.stdout.includes('PARENT_CONTENT'));
 const parent=run(['read','--id','same','--format','text','--max-chars','4']);assert.equal(parent.status,0,parent.stderr);assert.match(parent.stdout,/正文已截断/);assert.match(parent.stdout,/--offset 4/);
 for(const args of [['read'],['read','--id','same','--scope','all'],['read','--id','same','--max-chars','0']])assert.equal(run(args).status,2);
 assert.equal(run(['read','--id','unknown']).status,3);
});

test('源码引用显示真实模板，不执行其中标签，read 保留文件来源并同步修改',async t=>{
 const f=fixture(t),file=join(f.root,'docs/example.mdoc');
 const content='# 模板\n{% section id="not-a-fact" %}\n{% include file="missing.mdoc" /%}\n<script>example()</script>\n{% /section %}\n';
 writeFileSync(file,content);writeFileSync(join(f.root,'docs/book.mdoc'),'{% section id="source:example" title="真实源码" %}\n{% code file="docs/example.mdoc" language="markdoc" /%}\n{% /section %}');
 f.edit('manifest',d=>d.entryDocuments=['docs/book.mdoc']);
 const graph=(await loadBook(await resolveProjectConfig(join(f.root,'edoc.config.js')))).root.graph,result=readDocument(graph,'source:example');assert.ok(!graph.index.has('not-a-fact'));assert.ok(graph.documentPlan?.files.includes('docs/example.mdoc'));
 assert.match(result.content,/include file="missing.mdoc"/);assert.ok(result.sources.some(s=>s.file==='docs/example.mdoc'&&s.line===1));
 const rendered=await renderDocument(graph,'源码');assert.match(rendered.chapters,/&lt;script&gt;example\(\)&lt;\/script&gt;/);assert.match(rendered.chapters,/data-language="markdoc"/);
 writeFileSync(file,content.replace('模板','修改后的模板'));assert.match(readDocument(f.load(),'source:example').content,/修改后的模板/);
});
test('源码引用拒绝越界、缺失、二进制、无效 UTF-8 和超限文本',t=>{
 const f=fixture(t);f.edit('manifest',d=>d.entryDocuments=['docs/code.mdoc']);
 const check=(source:string,code:string)=>{writeFileSync(join(f.root,'docs/code.mdoc'),'{% code file="'+source+'" /%}');expectCode(f.load,code);};
 check('../outside.js','PATH_SCOPE');check('missing.js','FILE_MISSING');
 writeFileSync(join(f.root,'nul.bin'),Buffer.from([65,0,66]));check('nul.bin','DOCUMENT_CODE_TEXT');
 writeFileSync(join(f.root,'invalid.bin'),Buffer.from([255,254,253]));check('invalid.bin','DOCUMENT_CODE_TEXT');
 writeFileSync(join(f.root,'large.txt'),'a'.repeat(128*1024+1));check('large.txt','DOCUMENT_CODE_SIZE');
});
test('源码引用参与输出保护，不覆盖作者展示的原文件',t=>{
 const f=fixture(t),file=join(f.root,'original.html'),content='<p>作者原文件</p>';writeFileSync(file,content);
 writeFileSync(join(f.root,'docs/edoc.config.js'),"export default {documents:'docs/code.mdoc',output:{html:'original.html'}};");writeFileSync(join(f.root,'docs/code.mdoc'),'{% code file="original.html" language="html" /%}');
 const result=spawnSync(process.execPath,[join(repository,'packages/cli/edoc.ts')],{cwd:f.root,encoding:'utf8',timeout:10000});assert.equal(result.status,1);assert.match(result.stderr,/OUTPUT_SOURCE/);assert.equal(readFileSync(file,'utf8'),content);
});
