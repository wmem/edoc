import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {loadBook,projectOutline} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {repository} from './helpers.ts';

test('正式手册共享 Demo 源，渐进正文/参考/开发分组和章节读取可用',{timeout:60000},async()=>{
 const book=await loadBook(await resolveProjectConfig(join(repository,'engdoc.config.js'))),graph=book.root.graph;
 assert.equal(book.projects.size,2);assert.equal(book.projects.get('manual-component')?.documents.documents.length,1);
 const navigation=projectOutline(book),flatten=(entries:any[]):any[]=>entries.flatMap(e=>[e,...flatten(e.children)]),all=flatten(navigation.chapters);
 for(const label of ['使用文档','查询参考','开发文档','第一次生成','接口合并与展开'])assert.ok(all.some(n=>n.label===label),label);
 assert.ok(all.some(n=>n.sectionId==='ref:config-data'));assert.ok(!book.root.documents.files.some(p=>p==='docs/design/EngDoc-V1-完整设计方案.md'));
 assert.ok(readDocument(graph,'use:start').content.length<1500);assert.ok(!readDocument(graph,'use:start').content.includes('npm install'));assert.match(readDocument(graph,'use:first-build').content,/export default/);
 const short=readDocument(graph,'ref:config-data');assert.match(short.content,/context.references/);assert.ok(short.range.totalChars<2500);assert.ok(!short.content.includes('layout.constraints'));
 assert.equal((query(graph,'board:U1.QSPI_CLK').target.entity as any).source.file,'examples/board-flash/board/pins.csv');
 assert.equal((query(graph,'mac:top.s_axis_tdata').target.entity as any).source.file,'examples/fpga-mac/rtl/mac_example.sv');
 assert.equal((query(graph,'ifdemo:engine.s_ctrl').target.entity as any).source.file,'examples/gallery/interfaces.json');
 const data=await compileBook(book),pages=Object.values(data.pages);assert.ok(pages.some(p=>p.html.includes('data-diagram="gallery:interface-buses"')));assert.ok(pages.some(p=>p.html.includes('received frame')));assert.ok(pages.some(p=>p.html.includes('规范示意')));
 assert.ok(pages.filter(p=>p.file.includes('/usage/')&&!p.file.includes('/reference/')).every(p=>!p.html.includes('<caption>引脚与连接事实</caption>')),'全量投影留在参考');
 assert.equal(book.root.graph.attachments?.location.numPages,2);assert.deepEqual(book.root.graph.attachments?.location.targets.detail.rect,[.15,.25,.75,.65]);
 assert.ok(existsSync(join(repository,'docs/manual/assets/location.pdf')));assert.match(readFileSync(join(repository,'README.md'),'utf8'),/正式文档/);
});
