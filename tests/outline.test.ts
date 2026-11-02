import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,symlinkSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,expectCode} from './helpers.ts';
import {outline,query,loadBook,resolveProjectConfig,projectOutline} from '../packages/core/index.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {renderTOC} from '../packages/doc-theme/toc.ts';
import {anchor} from '../packages/core/identity.ts';

function book(t:any,text:string){const f=fixture(t);writeFileSync(join(f.root,'docs/book.mdoc'),text);f.edit('manifest',d=>d.entryDocuments=['docs/book.mdoc']);return f;}

test('章节、Markdown 与布局共同生成父子结构和标题级别',async t=>{
 const f=book(t,'{% section id="modules" title="功能模块" %}\n{% section id="storage" title="存储与配置" %}\n{% section id="qspi" title="QSPI" %}\n## 职责 **与边界**\n\n### 选件\n\n{% panel title="布局提示" %}\n说明\n{% /panel %}\n{% /section %}\n{% /section %}\n{% /section %}');
 const g=f.load(),tree=outline(g),root=tree.chapters[0],group=root.children[0],module=group.children[0],heading=module.children[0];
 assert.equal(root.level,1);assert.equal(group.parentId,root.id);assert.equal(module.parentId,group.id);
 assert.equal(heading.label,'职责 与边界');assert.equal(heading.level,4);assert.equal(heading.children[0].level,5);
 assert.equal(heading.depth,3);assert.equal(tree.entries,5);
 const doc=await renderDocument(g,'测试');
 assert.ok(doc.chapters.includes('<h2 data-heading-level="1" data-section-title>功能模块</h2>'));
 assert.ok(doc.chapters.includes('<h4 data-heading-level="3" data-section-title>QSPI</h4>'));
 assert.match(doc.chapters,/<h5 data-heading-level="4">职责 <strong>与边界<\/strong><\/h5>/);
 assert.match(doc.chapters,/<p class="panel-title">布局提示<\/p>/);
 const sidebar=renderTOC(doc.outline),printed=renderTOC(doc.outline,false);
 assert.equal((sidebar.match(/<ul>/g)??[]).length,5);assert.ok(sidebar.includes('<details open>'));
 assert.ok(!printed.includes('<details'));assert.equal((printed.match(/data-outline-link/g)??[]).length,tree.entries);
 assert.ok(printed.includes(`data-outline-parent="${module.id}"`));assert.ok(printed.includes('padding-left:54px'));
});

test('include 保留被引用章节的原文件与行号',t=>{
 const f=book(t,'{% section id="book" title="全书" %}\n{% include file="docs/module.mdoc" /%}\n{% /section %}');
 writeFileSync(join(f.root,'docs/module.mdoc'),'\n{% section id="module" title="模块" %}\n## 小节\n{% /section %}');
 const graph=f.load(),child=outline(graph).chapters[0].children[0];
 assert.equal(child.source.file,'docs/module.mdoc');assert.equal(child.source.line,2);
 assert.equal(child.children[0].source.file,'docs/module.mdoc');assert.equal(child.children[0].source.line,3);
 assert.deepEqual(query(graph,'module').target.entity.source,{file:'docs/module.mdoc',line:2,selector:'module'});
});

test('普通 Markdown 与多入口保持相对级别及独立根',t=>{
 const f=book(t,'# 入口一\n## 二级\n#### 四级\n');
 writeFileSync(join(f.root,'docs/two.md'),'# 入口二\n## 第二小节');f.edit('manifest',d=>d.entryDocuments.push('docs/two.md'));
 const roots=outline(f.load()).chapters;
 assert.deepEqual(roots.map(n=>n.label),['入口一','入口二']);
 assert.equal(roots[0].children[0].children[0].level,4);assert.equal(roots[0].children[0].children[0].depth,2);
});

test('include 循环、重复稳定 ID、未知属性与非法附件均失败',t=>{
 const f=book(t,'{% include file="docs/cycle.mdoc" /%}');
 writeFileSync(join(f.root,'docs/cycle.mdoc'),'{% include file="docs/book.mdoc" /%}');expectCode(f.load,'DOCUMENT_INCLUDE_CYCLE');
 writeFileSync(join(f.root,'docs/book.mdoc'),'{% include file="docs/repeat.md" /%}\n{% include file="docs/repeat.md" /%}');
 writeFileSync(join(f.root,'docs/repeat.md'),'{% section id="repeat" title="重复" %}正文{% /section %}');expectCode(f.load,'DUPLICATE_ID');
 writeFileSync(join(f.root,'docs/book.mdoc'),'{% include file="docs/repeat.md" style="x" /%}');expectCode(f.load,'DOCUMENT_TAG');
 writeFileSync(join(f.root,'docs/book.mdoc'),'{% include file="ir/objects.json" /%}');expectCode(f.load,'DOCUMENT_INCLUDE');
});

test('include 禁止范围逃逸及符号链接逃逸',t=>{
 const f=book(t,'{% include file="../outside.md" /%}');expectCode(f.load,'PATH_SCOPE');
 writeFileSync(join(f.workspace,'outside.md'),'外部内容');symlinkSync(join(f.workspace,'outside.md'),join(f.root,'docs/link.md'));
 writeFileSync(join(f.root,'docs/book.mdoc'),'{% include file="docs/link.md" /%}');expectCode(f.load,'PATH_SCOPE');
});

test('深层章节不截短 outline 与查询',async t=>{
 const body=Array.from({length:8},(_,i)=>`{% section id="s${i}" title="第${i}层" %}`).join('\n')+'\n正文\n'+'{% /section %}\n'.repeat(8);
 const f=book(t,body),graph=f.load(),doc=await renderDocument(graph,'深层');
 assert.equal(doc.toc.at(-1)!.level,8);assert.equal(doc.toc.at(-1)!.depth,7);
 assert.match(doc.chapters,/aria-level="9"/);assert.equal(query(graph,'s7').target.anchor,anchor('s7'));
});

test('按稳定章节与相对深度渐进返回目录，省略数量明确且不修改完整树',async t=>{
 const f=book(t,'{% section id="root" title="根" %}\n{% section id="branch" title="分支" %}\n{% section id="leaf" title="叶" %}\n内容\n{% /section %}\n{% /section %}\n{% /section %}');
 const project=await loadBook(await resolveProjectConfig(join(f.root,'engdoc.config.js'))),short=projectOutline(project,{depth:0});
 assert.equal(short.chapters[0].sectionId,'root');assert.equal(short.chapters[0].children.length,0);assert.equal(short.chapters[0].childrenOmitted,1);
 const branch=projectOutline(project,{id:'branch',depth:1});assert.equal(branch.chapters.length,1);assert.equal(branch.chapters[0].children[0].sectionId,'leaf');
 assert.equal(projectOutline(project).chapters[0].children[0].children[0].sectionId,'leaf');
 expectCode(()=>projectOutline(project,{id:'missing'}),'QUERY_NOT_FOUND');for(const depth of [-1,1.5,11,NaN])expectCode(()=>projectOutline(project,{depth}),'OUTLINE_DEPTH');
});
test('目录按已组合工程隔离，跨项目同名 ID 必须消歧且不返回另一工程正文',async t=>{
 const f=book(t,'{% section id="same" title="父" %}\n{% include project="part" /%}\n{% /section %}');mkdirSync(join(f.root,'component'));writeFileSync(join(f.root,'component/index.mdoc'),'{% section id="same" title="子" %}子正文{% /section %}');writeFileSync(join(f.root,'component/engdoc.config.js'),"export default {projectId:'child',documents:'index.mdoc'};");
 writeFileSync(join(f.root,'engdoc.config.js'),"export default {projectId:'parent',documents:'docs/book.mdoc',children:{part:'component/engdoc.config.js'}};");
 const project=await loadBook(await resolveProjectConfig(join(f.root,'engdoc.config.js'))),flatten=(nodes:any[]):any[]=>nodes.flatMap(n=>[n,...flatten(n.children)]);
 expectCode(()=>projectOutline(project,{id:'same'}),'OUTLINE_AMBIGUOUS');expectCode(()=>projectOutline(project,{project:'outside'}),'QUERY_NOT_FOUND');
 assert.ok(flatten(projectOutline(project,{project:'parent'}).chapters).every(n=>n.project==='parent'));
 const child=projectOutline(project,{project:'child',id:'same',depth:0});assert.equal(child.chapters[0].label,'子');assert.equal(child.chapters[0].project,'child');assert.deepEqual(child.projects,['child']);
});
