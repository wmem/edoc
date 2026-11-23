import Markdoc from '@markdoc/markdoc';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {localDocumentLink} from '../packages/core/documents.ts';
import {loadBook,projectOutline} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {repository} from './helpers.ts';

test('正式手册共享 Demo 源，渐进正文/参考/开发分组和章节读取可用',{timeout:60000},async()=>{
 const book=await loadBook(await resolveProjectConfig(join(repository,'docs/edoc.config.js'))),graph=book.root.graph;
 assert.equal(book.projects.size,6);assert.equal(book.projects.get('manual-component')?.documents.documents.length,1);assert.ok(book.projects.has('document-first-demo'));assert.ok(book.projects.has('behavior-contract-demo'));assert.ok(book.projects.has('address-v2-composed'));assert.ok(book.projects.has('uart-ip'));
 const navigation=projectOutline(book),flatten=(entries:any[]):any[]=>entries.flatMap(e=>[e,...flatten(e.children)]),all=flatten(navigation.chapters);
 for(const label of ['查询参考','edoc 开发','生成第一份文档','接口合并与展开'])assert.ok(all.some(n=>n.label===label),label);
 const home=all.find(n=>n.sectionId==='manual:home')!,branches=navigation.chapters.filter((n:any)=>n.page!==home.page);
 assert.deepEqual(branches.map((n:any)=>n.label),['快速开始','编写与组织文档','图表','工程数据与多工程组合','阅读、查询与发布','查询参考','edoc 开发'],'主目录按读者任务组织，首页统一认识与起步路线');
 assert.equal(all.find(n=>n.sectionId==='use:overview')!.page,home.page,'整体认识与实际效果合入首页');
 assert.equal(all.find(n=>n.sectionId==='use:home')!.page,home.page,'源文和CLI入门指向唯一首页');
 const branch=(id:string)=>branches.find((n:any)=>n.sectionId===id)!;
 assert.deepEqual(branch('use:quickstart').children.map((n:any)=>n.label),['安装与运行环境','生成第一份文档']);
 assert.deepEqual(branch('use:writing').children.map((n:any)=>n.sectionId),['guide:agent','use:organize','use:markdown','use:markdoc','use:markdoc-reuse','use:page-layout','use:semantic-content','use:references','guide:home']);
 assert.deepEqual(branch('use:engineering').children.map((n:any)=>n.sectionId),['use:data','use:projects-pdf']);
 assert.deepEqual(branch('use:publishing').children.map((n:any)=>n.sectionId),['use:reading','use:reading-folding','use:query','use:preview','use:publish']);
 const domains=branch('use:rendering').children.filter((n:any)=>n.page!==branch('use:rendering').page);
 assert.deepEqual(domains.map((n:any)=>[n.sectionId,n.label]),[['use:diagrams','结构与连接'],['use:behavior-charts','行为与控制'],['use:timing-charts','时间与交互'],['use:data-layout-charts','数据布局'],['use:record-charts','记录与结果']],'图表只按工程含义设五领域，不把模型、用途和标签平铺');
 const domain=(id:string)=>domains.find((n:any)=>n.sectionId===id)!;
 const domainPages=(id:string)=>domain(id).children.filter((n:any)=>n.page!==domain(id).page).map((n:any)=>n.sectionId);
 assert.deepEqual(domainPages('use:behavior-charts'),['use:state','use:state-advanced','use:flowchart']);
 assert.deepEqual(domainPages('use:timing-charts'),['use:waveform','use:sequences']);
 assert.deepEqual(domainPages('use:data-layout-charts'),['use:registers','use:binary-layouts']);
 assert.deepEqual(domainPages('use:record-charts'),['use:tables','use:plots']);
 assert.match(readDocument(graph,'use:chart-choice').content,/表达领域/);
 assert.match(readDocument(graph,'use:chart-models').content,/承载层/);
 const tables=domain('use:record-charts').children.find((n:any)=>n.sectionId==='use:tables');
 assert.ok(tables,'数据表格有正文入口');
 const tableReading=tables.children.find((n:any)=>n.sectionId==='use:table-reading');
 assert.ok(tableReading,'筛选与排序归数据表格');
 assert.equal(tableReading.page,tables.page,'筛选与排序是数据表格页内小节，不是独立页面');
 assert.equal(tables.page,'docs/charts/records/tables');
 assert.ok(!branch('use:rendering').children.some((n:any)=>n.sectionId==='use:table-reading'),'表格操作不与数据表格平级');
 const semantic=branch('use:writing').children.find((n:any)=>n.sectionId==='use:semantic-content')!;
 assert.equal(semantic.page,'docs/writing/semantic-content');
 assert.deepEqual(semantic.children.map((n:any)=>n.sectionId),['use:semantic-content-concepts','use:semantic-content-organize','use:semantic-content-local-shared','use:semantic-content-reference','use:semantic-content-authoring','use:semantic-content-query','use:semantic-content-config']);
 assert.ok(!all.some((n:any)=>n.sectionId==='use:specifications'),'撤下旧教程，不保留重复入口');
 const rendering=branch('use:rendering'),diagrams=rendering.children.find((n:any)=>n.sectionId==='use:diagrams');
 assert.ok(diagrams,'关系图是一个有总览页的文档分组');
 assert.deepEqual(diagrams.children.filter((n:any)=>n.page!==diagrams.page).map((n:any)=>n.sectionId),['use:drawing','use:architecture','use:wiring','use:interfaces','use:graph-options','use:diagram-details','use:layout'],'接口展开及显示设置属于结构与连接，分成独立短篇');
 assert.ok(!rendering.children.some((n:any)=>n.sectionId==='use:interfaces'),'接口展开不与关系图平级');
 assert.ok(branch('ref:home').children.some((n:any)=>n.sectionId==='use:capabilities'));assert.ok(!branches.some((n:any)=>n.sectionId==='use:capabilities'),'字段索引不冒充入门');
 for(const id of ['use:install','use:state-wave','use:state','use:waveform','use:projects-pdf','use:composition','use:pdf','use:publish','use:table','guide:agent','guide:home'])assert.equal(graph.index.get(id)?.type,'document',id+' 的稳定入口保留');
 const introduction=readDocument(graph,'use:home');assert.ok(introduction.range.totalChars<2000);assert.ok(!/```(?:json|javascript)/.test(introduction.content));
 for(const name of ['Markdown','页面编排','行为合同','图表','原文证据','阅读、查询与发布','不需要工程数据'])assert.ok(introduction.content.includes(name),name+' 必须在概念总览中直接可读');
 assert.ok(all.some(n=>n.sectionId==='ref:config-data'));assert.ok(book.root.documents.files.includes('docs/development/records/design/_partials/original-v1.mdoc'));
 const development=all.find(n=>n.sectionId==='dev:home')!;
 assert.deepEqual(development.children.slice(0,2).map((n:any)=>n.sectionId),['dev:architecture','dev:contributing']);
 const records=development.children.find((n:any)=>n.sectionId==='dev:history');assert.ok(records,'开发历史归入独立记录入口');
 assert.deepEqual(records.children.filter((n:any)=>n.page!==records.page).map((n:any)=>n.sectionId),['design:home','review:home','acceptance:home','regression:home','history:home']);
 assert.equal(all.find(n=>n.sectionId==='design:home').children[0].sectionId,'design:requirements','需求基线先于设计细节');
 for(const name of ['interfaces','layout','pdf','projects','presentation']){
  const sections=[...graph.index.keys()].filter(id=>id.startsWith(`design:${name}:part-`));assert.ok(sections.length);
  for(const id of sections){const result=readDocument(graph,id);assert.match(result.content,/历史设计：|设计与规划：/,id);assert.match(result.content,/现行/,id);}
 }
 assert.match(readDocument(graph,'ref:relation-hints').content,/恰好两个/);
 assert.ok(readDocument(graph,'use:start').content.length<1500);assert.ok(!readDocument(graph,'use:start').content.includes('npm install'));assert.match(readDocument(graph,'use:first-build').content,/export default/);
 const short=readDocument(graph,'ref:config-data');assert.match(short.content,/context.references/);assert.ok(short.range.totalChars<2500);assert.ok(!short.content.includes('layout.constraints'));
 assert.equal((query(graph,'board:U1.QSPI_CLK').target.entity as any).source.file,'examples/board-flash/board/pins.csv');
 assert.equal((query(graph,'mac:top.s_axis_tdata').target.entity as any).source.file,'examples/fpga-mac/rtl/mac_example.sv');
 assert.equal((query(graph,'ifdemo:engine.s_ctrl').target.entity as any).source.file,'examples/gallery/interfaces.json');
 assert.equal((query(graph,'system:producer').target.entity as any).source.file,'docs/ir/authoring/objects.json');

 for(const document of book.root.documents.documents.filter(d=>d.file.endsWith('/index.mdoc'))){
  const page=document.file.slice(0,-5),entry=all.find(n=>n.page===page),children=document.file==='docs/index.mdoc'?navigation.chapters.filter(n=>n.page!==page):entry?.children.filter((n:any)=>n.page!==page)??[];
  const expected=children.map((n:any)=>n.page).filter(Boolean),observed:string[]=[];
  for(const node of document.ast.walk())if(node.type==='link'){
   const target=localDocumentLink(book.root.config.root,document.locations.get(node)?.file??document.file,node.attributes.href);
   const id=target?.file.slice(0,-5);if(id&&expected.includes(id)&&!observed.includes(id))observed.push(id);
  }
  assert.deepEqual(observed,expected,document.file+' 的正文阅读顺序与导航必须一致');
 }
 assert.match(readDocument(graph,'use:chart-input').content,/Drawing/);assert.match(readDocument(graph,'use:chart-input').content,/Node/);
 assert.match(readDocument(graph,'use:capabilities:graphs').content,/use:drawing/,'新框图能力进入正式索引');

 const data=await compileBook(book),pages=Object.values(data.pages);assert.ok(pages.some(p=>p.html.includes('data-diagram="gallery:interface-buses"')));assert.ok(pages.some(p=>p.html.includes('received frame')));assert.ok(pages.some(p=>p.html.includes('规范示意')));
 const overview=pages.find(p=>p.file==='docs/index.mdoc')!;assert.deepEqual(Object.keys(overview.scenes),['system:overview']);assert.match(overview.html,/<caption>模块名称查询<\/caption>/);assert.match(overview.html,/class="columns"/);
 assert.ok(pages.filter(p=>!p.file.includes('/reference/')&&!p.file.includes('/development/')).every(p=>!p.html.includes('<caption>引脚与连接事实</caption>')),'全量投影留在参考');
 assert.equal(book.root.graph.attachments?.location.numPages,2);assert.deepEqual(book.root.graph.attachments?.location.targets.detail.rect,[.15,.25,.75,.65]);
 assert.ok(existsSync(join(repository,'docs/assets/location.pdf')));assert.match(readFileSync(join(repository,'README.md'),'utf8'),/正式文档/);
 const loaded=new Set([...book.projects.values()].flatMap(project=>project.documents.files.map(file=>join(project.config.root,file))));
 const walk=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!entry.name.startsWith('.')&&!['output','node_modules'].includes(entry.name)?walk(join(directory,entry.name)):entry.isFile()&&/\.mdoc$/.test(entry.name)?[join(directory,entry.name)]:[]);
 const missing=['docs','examples','templates'].flatMap(directory=>walk(join(repository,directory))).filter(file=>!loaded.has(file));assert.deepEqual(missing,[],'所有作者 mdoc 必须作为页面、片段或源码接入；夹具不在扫描范围');
 assert.ok(loaded.has(join(repository,'AGENTS.md')));assert.ok(!existsSync(join(repository,'docs/V1-开发与使用.md')));
 assert.match(readDocument(graph,'regression:template').content,/book:overview/);assert.match(readDocument(graph,'guide:home',{scope:'subtree'}).content,/理解性内容与查询性内容/);
});

test('从正式正文提取的创建配方可在含 README 的用户工程连续构建，三端点 channel 明确失败',{timeout:60000},async t=>{
 const manual=await loadBook(await resolveProjectConfig(join(repository,'docs/edoc.config.js'))),graph=manual.root.graph;
 const blocks=(id:string,language:string)=>[...Markdoc.parse(readDocument(graph,id,{}).content).walk()].filter(node=>node.type==='fence'&&node.attributes.language===language).map(node=>node.attributes.content);
 const one=(id:string,language:string)=>{const values=blocks(id,language);assert.equal(values.length,1,id);return values[0];};
 const root=mkdtempSync(join(tmpdir(),'edoc-authoring-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,content:string)=>{mkdirSync(join(root,file,'..'),{recursive:true});writeFileSync(join(root,file),content);};
 write('README.md','# 仓库首页\n不应取代配置指定的正文。');
 write('docs/edoc.config.js',one('use:architecture-minimal','javascript'));
 write('docs/ir/authoring/objects.json',one('use:standard-data','json'));
 const overview=one('use:architecture-minimal','text');write('docs/index.mdoc','# 创建结果\n'+overview);
 const initial=await loadBook(await resolveProjectConfig(undefined,root));assert.deepEqual(initial.root.documents.documents.map(d=>d.file),['docs/index.mdoc']);
 const initialData=await compileBook(initial);assert.ok(Object.values(initialData.pages)[0].html.includes('data-diagram="system:overview"'));
 write('docs/ir/authoring/tables.json',one('ref:table-example','json'));
 write('docs/ir/authoring/waveforms.json',one('ref:waveform-example','json'));
 const layout=blocks('ref:layout-example','json');assert.equal(layout.length,2);
 write('docs/ir/authoring/topology.json',layout[0]);write('docs/ir/authoring/layout.json',layout[1]);
 write('docs/index.mdoc','# 创建结果\n'+[overview,one('ref:table-example','text'),one('ref:waveform-example','text'),one('ref:layout-example','text')].join('\n\n'));
 const book=await loadBook(await resolveProjectConfig(undefined,root));
 assert.deepEqual((query(book.root.graph,'system:clock').target.entity as any).endpoints,['system:producer','system:consumer','system:probe']);

 const data=await compileBook(book),page=Object.values(data.pages)[0];assert.match(page.html,/<caption>模块名称查询<\/caption>/);assert.match(page.html,/生产者/);assert.match(page.html,/最小握手示意/);assert.ok(page.scenes['system:routing']);
 const build=spawnSync(process.execPath,[join(repository,'packages/cli/edoc.ts')],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(build.status,0,build.stderr);assert.ok(existsSync(join(root,'output/index.html')));
 const invalid=JSON.parse(layout[1]);invalid.views[0].layout.relationHints['system:clock'].channel='bottom';write('docs/ir/authoring/layout.json',JSON.stringify(invalid));
 await assert.rejects(()=>loadBook(book.root.config),(error:any)=>error.diagnostics?.some((d:any)=>d.code==='LAYOUT_CHANNEL'));
});
