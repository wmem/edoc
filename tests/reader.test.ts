import test from 'node:test';
import assert from 'node:assert/strict';
import {rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook,bookNavigation} from '../packages/core/book.ts';
import {compileBook,bookPrintHTML,bookHTML} from '../packages/pack-html/book.ts';
import {targetKey,routeHash,parseRoute} from '../packages/core/routes.ts';
import {query} from '../packages/core/query.ts';
import {readerFixture,samplePdf} from './reader-fixture.ts';
import {sidebarNavigation} from '../packages/doc-theme/navigation.ts';
const load=async(root:string,config='edoc.config.js')=>loadBook(await resolveProjectConfig(config,root));
test('父、子、孙工程保留自身路径与同名 IR，配置只加载显式接入的工程',async t=>{
 const p=readerFixture(t),book=await load(p.root);assert.deepEqual([...book.projects.keys()],['system','fpga','core','board']);
 assert.equal(query(book.projects.get('fpga')!.graph,'device').target.entity.label,'FPGA DEVICE');assert.equal(query(book.projects.get('board')!.graph,'device').target.entity.label,'BOARD DEVICE');
 assert.ok(book.inputs.includes(join(p.root,'fpga/source/schematic.pdf')));
 const roots=bookNavigation(book);assert.equal(roots[0].page,'docs/index');const hardware=roots[0].children.find(n=>n.label==='工程组成')!;assert.deepEqual(hardware.children.map(n=>n.project),['fpga','board']);
});
test('子工程不依赖父/兄弟配置或目录，跨工程弱链接不会执行它们',async t=>{
 const p=readerFixture(t);p.write('edoc.config.js',`throw Error('不得执行父配置');`);p.write('board/edoc.config.js',`throw Error('不得执行兄弟配置');`);
 const book=await load(p.root,'fpga/edoc.config.js');assert.deepEqual([...book.projects.keys()],['fpga','core']);
 rmSync(join(p.root,'board'),{recursive:true});rmSync(join(p.root,'edoc.config.js'));
 const isolated=await load(p.root,'fpga/edoc.config.js'),data=await compileBook(isolated);assert.equal(data.projects.board,undefined);assert.ok(data.pages[targetKey('fpga','docs/index')].html.includes(encodeURIComponent('board')));assert.ok(!isolated.inputs.some(file=>file.includes('/board/')));
});
test('每个文档独立编译，普通文件链接发现同工程页面，section 接入子树不拼接正文',async t=>{
 const p=readerFixture(t),data=await compileBook(await load(p.root));const root=data.pages[targetKey('system','docs/index')],child=data.pages[targetKey('fpga','docs/index')];
 assert.ok(!root.html.includes('CHILD_LOCAL_ONLY'));assert.ok(child.html.includes('CHILD_LOCAL_ONLY'));assert.ok(!child.html.includes('INTERFACE_PAGE_ONLY'));assert.ok(child.html.includes('heading-'));assert.deepEqual(Object.keys(child.scenes),['overview']);
 assert.equal(data.projects.fpga.sections.module.page,'docs/index');assert.equal(data.projects.board.entities.device.label,'BOARD DEVICE');
});
test('附件原字节、物理页/归一化区域/命名目标映射正确',async t=>{
 const p=readerFixture(t),book=await load(p.root,'fpga/edoc.config.js'),attachment=book.root.graph.attachments!.schematic;
 assert.deepEqual(Buffer.from(attachment.data,'base64'),samplePdf());assert.equal(attachment.numPages,3);assert.equal(attachment.targets.named.page,3);assert.equal(attachment.targets.rotated.page,2);assert.deepEqual(attachment.targets.power.rect,[.15,.2,.6,.55]);
});
for(const [name,mutate,code]of [
 ['组合环',`children:{self:'edoc.config.js'}`, 'PROJECT_CYCLE'],
 ['重复 projectId',`projectId:'system'`, 'PROJECT_ID_DUPLICATE'],
] as const)test(name+' 明确报错',async t=>{
 const p=readerFixture(t);if(name==='组合环'){const file=join(p.root,'fpga/edoc.config.js');p.write('fpga/edoc.config.js',readFileSync(file,'utf8').replace(/children:\{[^}]*\}/,mutate));p.write('fpga/docs/index.mdoc','{% include project="self" /%}');}else p.write('board/edoc.config.js',`export default {${mutate},documents:'docs'};`);
 await assert.rejects(()=>load(p.root),new RegExp(code));
});
test('声明但未接入的子配置不会被弱链接触发读取',async t=>{
 const p=readerFixture(t);p.write('unused/edoc.config.js',`throw Error('不得读取未接入配置')`);p.write('edoc.config.js',`export default {projectId:'system',documents:'docs',children:{unused:'unused/edoc.config.js'}};`);p.write('docs/index.mdoc','{% reference project="unused" id="thing" /%}');
 const book=await load(p.root);assert.deepEqual([...book.projects.keys()],['system']);
});
for(const [name,target,code]of [
 ['越界页号',{page:4},'PDF_PAGE'],['无效区域',{page:1,rect:[.8,.2,.1,.4]},'PDF_RECT'],['不存在命名目标',{destination:'missing'},'PDF_DESTINATION']
] as const)test('本地 PDF '+name+' 不静默退回首页',async t=>{
 const p=readerFixture(t);p.write('fpga/edoc.config.js',`export default {projectId:'fpga',documents:'docs',children:{core:'core/edoc.config.js'},attachments:{schematic:{type:'pdf',file:'source/schematic.pdf',targets:{power:${JSON.stringify(target)},named:{page:1}}}}};`);
 await assert.rejects(()=>load(p.root,'fpga/edoc.config.js'),new RegExp(code));
});
test('本地渲染错误仍失败，外部数据不能用 diagram 加载',async t=>{
 const p=readerFixture(t);p.write('fpga/docs/index.mdoc','{% diagram id="overview" project="board" /%}');await assert.rejects(()=>load(p.root,'fpga/edoc.config.js'),/DOCUMENT_TAG/);
 p.write('fpga/docs/index.mdoc','{% diagram id="missing" /%}');await assert.rejects(()=>load(p.root,'fpga/edoc.config.js'),/DOCUMENT_REFERENCE/);
 p.write('fpga/docs/index.mdoc','{% attachment id="schematic" target="" /%}');await assert.rejects(()=>load(p.root,'fpga/edoc.config.js'),/DOCUMENT_REFERENCE_ID/);
});
test('页面重复路由与本地文档断锚点不静默接受',async t=>{
 const p=readerFixture(t);p.write('docs/index.md','# 重复首页');await assert.rejects(async()=>compileBook(await load(p.root)),/PAGE_DUPLICATE/);rmSync(join(p.root,'docs/index.md'));
 p.write('docs/index.mdoc','# 首页\n[错误锚点](architecture.mdoc#missing)');await assert.rejects(async()=>compileBook(await load(p.root)),/DOCUMENT_ANCHOR/);
});
test('同页 Markdown 中文标题链接与跨文件链接使用相同的片段身份',async t=>{
 const p=readerFixture(t);p.write('docs/index.mdoc','# 首页\n[同页标题](#职责与边界)\n[另一页标题](architecture.mdoc#职责与边界)\n## 职责与边界\n正文。');p.write('docs/architecture.mdoc','# 架构\n## 职责与边界\n说明。');
 const data=await compileBook(await load(p.root)),html=data.pages[targetKey('system','docs/index')].html;
 const routes=[...html.matchAll(/href="(#edoc=[^"]+)"/g)].map(m=>parseRoute(m[1])).filter(r=>r?.anchor);
 assert.equal(routes.length,2);assert.ok(routes.every(r=>r!.anchor==='职责与边界'));assert.ok(routes.some(r=>r!.id==='docs/index'));assert.ok(routes.some(r=>r!.id==='docs/architecture'));
});
test('稳定路由可逆且不依赖 hash 跟踪，恶意或损坏路由不能执行代码',()=>{
 const route={kind:'pdf' as const,project:'板卡:1',id:'a/b',target:'输入<&>'};assert.deepEqual(parseRoute(routeHash(route)),route);assert.equal(parseRoute('#edoc=%bad'),undefined);assert.equal(parseRoute('#edoc='+encodeURIComponent('{"kind":"js","project":"a","id":"b"}')),undefined);
});

test('页内片段的普通文档链接保留实际源文件基准，不按入口文件重定位',async t=>{
 const p=readerFixture(t);p.write('fpga/docs/_partials/links.mdoc','[接口](../interfaces.mdoc#握手)');p.write('fpga/docs/index.mdoc','{% include file="docs/_partials/links.mdoc" /%}');
 const data=await compileBook(await load(p.root,'fpga/edoc.config.js'));assert.ok(data.pages[targetKey('fpga','docs/index')].html.includes(encodeURIComponent('docs/interfaces')));
});

test('同一实际 PDF 的多别名只携带一份字节，源码保留原始附件',async t=>{
 const p=readerFixture(t),config=join(p.root,'fpga/edoc.config.js');writeFileSync(config,readFileSync(config,'utf8').replace('attachments:{schematic:',"attachments:{alias:{type:'pdf',file:'source/schematic.pdf'},schematic:"));
 const book=await load(p.root,'fpga/edoc.config.js'),data=await compileBook(book);assert.equal(Object.keys(data.pdfFiles).length,1);assert.equal(data.projects.fpga.attachments.alias.payload,data.projects.fpga.attachments.schematic.payload);assert.deepEqual(Buffer.from(book.root.graph.attachments!.schematic.data,'base64'),samplePdf());
});
test('对象原始来源与 PDF 核对链接共存，位置拼错仍严格失败',async t=>{
 const p=readerFixture(t),file=join(p.root,'fpga/docs/ir/design.json'),facts=JSON.parse(readFileSync(file,'utf8'));facts.objects[0].source.attachment.target='missing';p.write('fpga/docs/ir/design.json',facts);await assert.rejects(()=>load(p.root,'fpga/edoc.config.js'),/ATTACHMENT_REFERENCE/);
});

test('本工程多级文档目录保留文件夹层级，目录 index 作为分组首页',async t=>{
 const p=readerFixture(t);p.write('fpga/docs/protocols/index.mdoc','# 协议参考\n');p.write('fpga/docs/protocols/axi.mdoc','# AXI 接口\n');
 const book=await load(p.root,'fpga/edoc.config.js'),navigation=bookNavigation(book),group=navigation.find(n=>n.label==='协议参考')!;
 assert.equal(group.page,'docs/protocols/index');assert.ok(group.children.some(n=>n.label==='AXI 接口'&&n.page==='docs/protocols/axi'));
});
test('网页左侧仅保留文档与工程，页内包装中的子工程提升保留，完整章节与打印目录不删减',async t=>{
 const p=readerFixture(t),book=await load(p.root),full=bookNavigation(book),original=JSON.stringify(full),sidebar=sidebarNavigation(full);
 const flatten=(nodes:typeof full):typeof full=>nodes.flatMap(n=>[n,...flatten(n.children)]),entries=flatten(sidebar);
 assert.equal(JSON.stringify(full),original,'网页目录投影不能修改 CLI 与打印共用的完整目录');
 assert.ok(entries.every(n=>!n.anchor));assert.ok(!entries.some(n=>['工程组成','握手','折叠参考'].includes(n.label)));
 assert.ok(flatten(full).some(n=>n.label==='折叠参考'));
 const root=sidebar.find(n=>n.project==='system'&&n.page==='docs/index')!;
 assert.deepEqual(root.children.map(n=>n.project),['fpga','board']);
 const fpga=root.children.find(n=>n.project==='fpga')!;
 assert.ok(fpga.children.some(n=>n.project==='core'),'移除页内小节不能丢失其中接入的孙工程');
 const protocols=fpga.children.find(n=>n.page==='docs/protocols/index')!;
 assert.ok(protocols.children.some(n=>n.page==='docs/protocols/axi'),'真实子文档仍在目录下');
 const keys=entries.filter(n=>n.page).map(n=>targetKey(n.project,n.page));assert.equal(keys.length,new Set(keys).size,'工程首页不重复显示，跨工程同名页面保留独立身份');
 const printed=await bookPrintHTML(book);assert.match(printed,/class="print-toc-entry"[^>]*>[^<]*<a[^>]*>折叠参考<\/a>/);
});
test('目录发现与 file include 不跨已声明子工程边界，显式 project include 才接入',async t=>{
 const p=readerFixture(t);p.write('edoc.config.js',`export default {projectId:'system',documents:'.',children:{fpga:'fpga/edoc.config.js',board:'board/edoc.config.js'}};`);
 // 发现整个父目录也不能把子工程正文当父工程页面读取。
 const book=await load(p.root);assert.deepEqual([...book.projects.keys()],['system','fpga','core','board']);assert.ok(book.root.documents.documents.every(d=>!d.file.startsWith('fpga/')&&!d.file.startsWith('board/')));
 p.write('docs/index.mdoc','{% include file="fpga/docs/index.mdoc" /%}');await assert.rejects(()=>load(p.root),/DOCUMENT_PROJECT_SCOPE/);
});
test('多篇打印遵循 compactIndex，保留被引用对象的有效目标，全量事实仍可查询',async t=>{
 const p=readerFixture(t);
 const config=(compactIndex:boolean)=>`export default {projectId:'system',documents:['docs/index.mdoc','docs/details.mdoc'],compactIndex:${compactIndex}};`;
 p.write('edoc.config.js',config(true));p.write('docs/index.mdoc','# 正文\n[细节](details.mdoc)\n{% reference id="shown" label="查看对象" /%}');p.write('docs/details.mdoc','# 细节\n精确说明。');
 p.write('docs/ir/facts.json',{objects:[{id:'shown',kind:'node',label:'引用对象',attributes:{payload:'FACT_JSON_SENTINEL'}},{id:'unused',kind:'node',label:'不应打印的未引用对象'}]});
 const book=await load(p.root),printed=await bookPrintHTML(book);
 assert.ok(printed.includes('引用对象'));assert.ok(!printed.includes('FACT_JSON_SENTINEL'));assert.ok(!printed.includes('不应打印的未引用对象'));
 const ids=new Set([...printed.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));for(const match of printed.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(match[1]),'PDF 内部引用目标必须存在：'+match[1]);
 assert.equal((query(book.root.graph,'shown').target.entity as any).attributes.payload,'FACT_JSON_SENTINEL');assert.ok((await bookHTML(book)).includes('FACT_JSON_SENTINEL'));
 p.write('edoc.config.js',config(false));assert.ok((await bookPrintHTML(await load(p.root))).includes('FACT_JSON_SENTINEL'),'缺省完整对象附录的语义保持');
});
