import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {specimen} from './specification-fixture.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {readDocument} from '../packages/core/read.ts';
import {repository} from './helpers.ts';
import {join} from 'node:path';
test('正文按既有标题树编号、页标题和Spec不编号，锚点及源文不变',async t=>{
 const source=readFileSync(join(repository,'docs/support/recipes/reading.mdoc'),'utf8'),p=specimen(t,source),book=await p.load(),before=readDocument(book.root.graph,'reading:demo',{scope:'subtree'}).content;
 const data=await compileBook(book),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 const entries=(nodes:typeof page.outline):typeof page.outline=>nodes.flatMap(n=>[n,...entries(n.children)]),all=entries(page.outline),number=(label:string)=>all.find(n=>n.label===label)?.number;
 assert.equal(number('标题与代码折叠（虚构示例）'),undefined);assert.equal(number('行为说明'),'1.');assert.equal(number('正常处理'),'1.1');assert.equal(number('异常处理'),'1.2');assert.equal(number('接入方法'),'2.');assert.equal(number('示例约束'),undefined);
 assert.match(page.html,/<details id="reading:snippet" class="code-block" data-code-block open>/);assert.match(page.html,/data-heading-section/);assert.match(page.html,/<code data-language="js">const result/);
 assert.equal(readDocument(book.root.graph,'reading:demo',{scope:'subtree'}).content,before);assert.ok(!before.includes('heading-number'));assert.ok(!book.root.graph.index.has('1.1'));
});
test('跳过Markdown级别仍按父子关系编号，显式section不被前一标题吞入',async t=>{
 const p=specimen(t,'{% section id="root" title="页面" %}\n## 第一节\n内容\n#### 子节\n内容\n{% section id="separate" title="独立节" %}\n独立正文\n{% /section %}\n## 第二节\n正文\n{% /section %}'),data=await compileBook(await p.load()),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 const root=page.outline[0];assert.deepEqual(root.children.map(c=>[c.label,c.number]),[['第一节','1.'],['独立节','2.'],['第二节','3.']]);assert.equal(root.children[0].children[0].number,'1.1');
 assert.match(page.html,/<details id="heading-第一节"/);assert.match(page.html,/<\/details><details id="ed-7365706172617465"/);
});

test('无标题section仍保留显式包含边界，不被前一Markdown标题折叠',async t=>{
 const p=specimen(t,'{% section id="root" title="页面" %}\n## 第一节\n正文\n\n{% section id="sibling" %}\n独立区域\n{% /section %}\n{% /section %}'),data=await compileBook(await p.load()),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 assert.match(page.html,/<\/details><section id="ed-7369626c696e67"><p>独立区域<\/p><\/section>/);
});
