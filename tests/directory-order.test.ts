import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname,join} from 'node:path';
import {resolveProjectConfig,loadProject} from '../packages/core/project.ts';
import {loadBook,bookNavigation,projectOutline} from '../packages/core/book.ts';
import {compileBook,bookPrintHTML} from '../packages/pack-html/book.ts';
import {readDocument} from '../packages/core/read.ts';
import {targetKey} from '../packages/core/routes.ts';

const section=(id:string,title=id,body='')=>`{% section id="${id}" title="${title}" %}\n${body}\n{% /section %}`;
const order=(items:unknown)=>`{% directory-order items=${JSON.stringify(items)} /%}`;
function project(t:{after:(fn:()=>void)=>void},files:Record<string,string>={},config='export default {};'){
 const root=mkdtempSync(join(tmpdir(),'edoc-directory-order-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,text:string)=>{mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),text);};
 write('docs/edoc.config.js',config);write('docs/index.mdoc',section('home'));for(const [file,text]of Object.entries(files))write(file,text);
 return {root,write,async load(){return loadBook(await resolveProjectConfig(undefined,root));},async validate(){return loadProject(await resolveProjectConfig(undefined,root));}};
}

test('缺省顺序保持不变，局部规则优先于 documents，未列项按原顺序追加',async t=>{
 const p=project(t,{'docs/a.mdoc':section('A'),'docs/z.mdoc':section('Z'),'docs/b.mdoc':section('B')},`export default {documents:['docs/index.mdoc','docs/b.mdoc','docs/a.mdoc','docs']};`);
 assert.deepEqual(bookNavigation(await p.load()).map(n=>n.label),['home','B','A','Z']);
 p.write('docs/index.mdoc',section('home','home',order(['z.mdoc'])));
 const loaded=await p.load();assert.deepEqual(bookNavigation(loaded).map(n=>n.label),['home','Z','B','A']);
 p.write('docs/new.mdoc',section('NEW'));assert.deepEqual(bookNavigation(await p.load()).map(n=>n.label),['home','Z','B','A','NEW']);
 p.write('docs/index.mdoc',section('home','home',order([])));assert.deepEqual(bookNavigation(await p.load()).map(n=>n.label),['home','B','A','NEW','Z']);
});

test('父层只排列直接子项，子层独立排序，无 index 的目录也可作为子项',async t=>{
 const p=project(t,{
  'docs/index.mdoc':section('home','home',order(['z.mdoc','topic/','plain/'])),
  'docs/a.mdoc':section('A'),'docs/z.mdoc':section('Z'),
  'docs/topic/index.mdoc':section('topic','主题',order(['q.mdoc'])),
  'docs/topic/p.mdoc':section('P'),'docs/topic/q.mdoc':section('Q'),
  'docs/plain/deep/r.mdoc':section('R'),
 });
 const nav=bookNavigation(await p.load());assert.deepEqual(nav.map(n=>n.label),['home','Z','主题','plain','A']);
 assert.deepEqual(nav[2].children.map(n=>n.label),['Q','P']);assert.equal(nav[3].children[0].children[0].label,'R');
});

test('index.md 同样可排序，普通标题层级与页内 section 顺序不受影响',async t=>{
 const p=project(t,{
  'docs/topic/index.md':section('topic','主题',order(['b.mdoc'])+'\n'+section('intro','说明')+'\n'+section('detail','细节')),
  'docs/topic/a.mdoc':section('A'),'docs/topic/b.mdoc':section('B'),
 });
 const nav=bookNavigation(await p.load()),topic=nav.find(n=>n.label==='主题')!;
 assert.deepEqual(topic.children.map(n=>n.label),['说明','细节','B','A']);
});

for(const [name,items]of [
 ['重复文件',['a.mdoc','a.mdoc']],['重复目录',['topic/','topic/']],['未知文件',['missing.mdoc']],
 ['未知目录',['missing/']],['目录缺少尾斜线',['topic']],['越层文件',['topic/x.mdoc']],
 ['父目录',['../']],['绝对路径',['/a.mdoc']],['自目录',['./']],['自身首页',['index.mdoc']],
 ['带锚点',['a.mdoc#section']],['非字符串',[1]],['空字符串',['']],
] as const)test(name+' 不能作为排序项',async t=>{
 const p=project(t,{'docs/index.mdoc':section('home','home',order(items)),'docs/a.mdoc':section('A'),'docs/topic/x.mdoc':section('X')});
 await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
});

test('存在但未发布的文件不能由排序标签引入，失败发生在 data 提供函数前',async t=>{
 const p=project(t,{'docs/index.mdoc':section('home','home',order(['a.mdoc'])),'docs/a.mdoc':section('A')},`export default {documents:'docs/index.mdoc',data(){throw Error('不应执行 data');}};`);
 await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
});

test('错误定位保留源文件、声明行和项目序号，缺失或非数组 items 由 Schema 拒绝',async t=>{
 const p=project(t,{'docs/index.mdoc':'# 首页\n\n'+order(['missing.mdoc'])});
 await assert.rejects(()=>p.validate(),(error:any)=>error.diagnostics.some((d:any)=>d.code==='DIRECTORY_ORDER'&&d.file==='docs/index.mdoc'&&d.path==='#L3/items/0'));
 for(const declaration of ['{% directory-order /%}','{% directory-order items="a.mdoc" /%}']){p.write('docs/index.mdoc',declaration);await assert.rejects(()=>p.validate(),/DOCUMENT_TAG/);}
});

test('同层两个 index 不能同时定义规则，显式首页选择不因子项排序而改变',async t=>{
 const p=project(t,{'docs/index.mdoc':section('home','home',order([])),'docs/index.md':section('other','other',order([]))});await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
 rmSync(join(p.root,'docs/index.md'));p.write('docs/a.mdoc',section('A'));p.write('docs/z.mdoc',section('Z'));p.write('docs/index.mdoc',section('home','home',order(['a.mdoc','z.mdoc'])));
 p.write('docs/edoc.config.js',`export default {documents:['docs/z.mdoc','docs']};`);
 const data=await compileBook(await p.load());assert.equal(data.home.id,'docs/z');assert.equal(data.navigation[0].label,'A');
});

test('普通文章、include 和 partial 不能给首页隐式注入排序，重复生效规则报错',async t=>{
 const p=project(t,{'docs/a.mdoc':section('A', 'A', order([]))});await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
 p.write('docs/a.mdoc',section('A'));p.write('docs/_partials/entry.mdoc',order([]));p.write('docs/index.mdoc',section('home','home','{% include file="docs/_partials/entry.mdoc" /%}'));await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
 p.write('docs/edoc.config.js',`export default {markdoc:{partials:{entry:'docs/_partials/entry.mdoc'}}};`);p.write('docs/index.mdoc',section('home','home','{% partial file="entry" /%}'));await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
 p.write('docs/index.mdoc',section('home','home',order([])+'\n'+order([])));await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
});

test('字面示例不参与排序，原生变量和条件使用当前上下文，隐藏分支仍检查引用',async t=>{
 const p=project(t,{
  'docs/index.mdoc':section('home','home','```text {% process=false %}\n'+order(['missing.mdoc'])+'\n```\n{% if true %}\n{% directory-order items=$sequence /%}\n{% else /%}\n'+order(['a.mdoc'])+'\n{% /if %}'),
  'docs/a.mdoc':section('A'),'docs/z.mdoc':section('Z'),
 },`export default {markdoc:{variables:{sequence:['z.mdoc']}}};`);
 assert.deepEqual(bookNavigation(await p.load()).map(n=>n.label),['home','Z','A']);
 p.write('docs/index.mdoc',section('home','home','{% if false %}\n'+order(['missing.mdoc'])+'\n{% /if %}'));await assert.rejects(()=>p.validate(),/DIRECTORY_ORDER/);
});

test('HTML、outline 与打印共用局部顺序，read 保留声明但首页不展开其他文章',async t=>{
 const p=project(t,{'docs/index.mdoc':section('home','入口',order(['z.mdoc','a.mdoc'])),'docs/a.mdoc':section('A','甲','BODY_A'),'docs/z.mdoc':section('Z','乙','BODY_Z')});
 const book=await p.load(),data=await compileBook(book),outline=projectOutline(book);
 assert.deepEqual(data.navigation.map(n=>n.label),['入口','乙','甲']);assert.deepEqual(outline.chapters.map(n=>n.label),['入口','乙','甲']);
 const home=data.pages[targetKey(book.root.config.projectId,'docs/index')];assert.ok(!home.html.includes('directory-order'));assert.ok(!home.html.includes('BODY_A'));assert.ok(!home.html.includes('BODY_Z'));
 assert.match(readDocument(book.root.graph,'home').content,/directory-order/);
 const print=await bookPrintHTML(book);assert.ok(print.indexOf('BODY_Z')<print.indexOf('BODY_A'));
});

test('子工程与父工程同名目录各自排序，局部声明不改变显式工程接入位置',async t=>{
 const p=project(t,{
  'docs/index.mdoc':section('home','父',order(['z.mdoc'])+'\n{% include project="child" /%}'),
  'docs/a.mdoc':section('A'),'docs/z.mdoc':section('Z'),
  'component/docs/edoc.config.js':`export default {projectId:'child',documents:'docs'};`,
  'component/docs/index.mdoc':section('home','子',order(['b.mdoc'])),
  'component/docs/a.mdoc':section('A'),'component/docs/b.mdoc':section('B'),
 },`export default {projectId:'parent',children:{child:'component/docs/edoc.config.js'}};`);
 const book=await p.load(),nav=bookNavigation(book);assert.deepEqual(nav.map(n=>n.label),['父','Z','A']);
 assert.deepEqual(nav[0].children[0].children.map(n=>n.label),['子','B','A']);
 const independent=await loadBook(await resolveProjectConfig('component/docs/edoc.config.js',p.root));assert.deepEqual(bookNavigation(independent).map(n=>n.label),['子','B','A']);
});
