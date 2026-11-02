import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync,readdirSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {loadBook,projectOutline} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {repository} from './helpers.ts';

test('正式手册共享 Demo 源，渐进正文/参考/开发分组和章节读取可用',{timeout:60000},async()=>{
 const book=await loadBook(await resolveProjectConfig(join(repository,'docs/engdoc.config.js'))),graph=book.root.graph;
 assert.equal(book.projects.size,3);assert.equal(book.projects.get('manual-component')?.documents.documents.length,1);assert.ok(book.projects.has('document-first-demo'));
 const navigation=projectOutline(book),flatten=(entries:any[]):any[]=>entries.flatMap(e=>[e,...flatten(e.children)]),all=flatten(navigation.chapters);
 for(const label of ['使用文档','查询参考','开发文档','第一次生成','接口合并与展开'])assert.ok(all.some(n=>n.label===label),label);
 assert.ok(all.some(n=>n.sectionId==='ref:config-data'));assert.ok(book.root.documents.files.includes('docs/development/design/_partials/original-v1.mdoc'));
 const development=all.find(n=>n.sectionId==='dev:home')!;
 assert.deepEqual(development.children.slice(0,2).map((n:any)=>n.sectionId),['dev:architecture','dev:contributing']);
 assert.ok(development.children.findIndex((n:any)=>n.sectionId==='acceptance:home')>development.children.findIndex((n:any)=>n.sectionId==='design:home'));
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
 const data=await compileBook(book),pages=Object.values(data.pages);assert.ok(pages.some(p=>p.html.includes('data-diagram="gallery:interface-buses"')));assert.ok(pages.some(p=>p.html.includes('received frame')));assert.ok(pages.some(p=>p.html.includes('规范示意')));
 assert.ok(pages.filter(p=>p.file.includes('/usage/')&&!p.file.includes('/reference/')).every(p=>!p.html.includes('<caption>引脚与连接事实</caption>')),'全量投影留在参考');
 assert.equal(book.root.graph.attachments?.location.numPages,2);assert.deepEqual(book.root.graph.attachments?.location.targets.detail.rect,[.15,.25,.75,.65]);
 assert.ok(existsSync(join(repository,'docs/assets/location.pdf')));assert.match(readFileSync(join(repository,'README.md'),'utf8'),/正式文档/);
 const loaded=new Set([...book.projects.values()].flatMap(project=>project.documents.files.map(file=>join(project.config.root,file))));
 const walk=(directory:string):string[]=>readdirSync(directory,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()&&!entry.name.startsWith('.')&&!['output','node_modules'].includes(entry.name)?walk(join(directory,entry.name)):entry.isFile()&&/\.mdoc$/.test(entry.name)?[join(directory,entry.name)]:[]);
 const missing=['docs','examples','templates'].flatMap(directory=>walk(join(repository,directory))).filter(file=>!loaded.has(file));assert.deepEqual(missing,[],'所有作者 mdoc 必须作为页面、片段或源码接入；夹具不在扫描范围');
 assert.ok(loaded.has(join(repository,'AGENTS.md')));assert.ok(!existsSync(join(repository,'docs/V1-开发与使用.md')));
 assert.match(readDocument(graph,'regression:template').content,/book:overview/);assert.match(readDocument(graph,'guide:home',{scope:'subtree'}).content,/理解性内容与查询性内容/);
});

test('从正式正文提取的创建配方可在含 README 的用户工程连续构建，三端点 channel 明确失败',{timeout:60000},async t=>{
 const manual=await loadBook(await resolveProjectConfig(join(repository,'docs/engdoc.config.js'))),graph=manual.root.graph;
 const blocks=(id:string,language:string)=>[...readDocument(graph,id).content.matchAll(new RegExp('```'+language+'\\n([\\s\\S]*?)```','g'))].map(match=>match[1]);
 const one=(id:string,language:string)=>{const values=blocks(id,language);assert.equal(values.length,1,id);return values[0];};
 const root=mkdtempSync(join(tmpdir(),'engdoc-authoring-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,content:string)=>{mkdirSync(join(root,file,'..'),{recursive:true});writeFileSync(join(root,file),content);};
 write('README.md','# 仓库首页\n不应取代配置指定的正文。');
 write('docs/engdoc.config.js',one('use:architecture','javascript'));
 write('docs/ir/authoring/objects.json',one('use:standard-data','json'));
 const overview=one('use:architecture','text');write('docs/index.mdoc','# 创建结果\n'+overview);
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
 const build=spawnSync(process.execPath,[join(repository,'packages/cli/engdoc.ts')],{cwd:root,encoding:'utf8',timeout:30000});assert.equal(build.status,0,build.stderr);assert.ok(existsSync(join(root,'output/index.html')));
 const invalid=JSON.parse(layout[1]);invalid.views[0].layout.relationHints['system:clock'].channel='bottom';write('docs/ir/authoring/layout.json',JSON.stringify(invalid));
 await assert.rejects(()=>loadBook(book.root.config),(error:any)=>error.diagnostics?.some((d:any)=>d.code==='LAYOUT_CHANNEL'));
});
