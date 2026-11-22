import {outlineResource} from '../packages/core/resource-navigation.ts';
import {namespaceResourceBody} from '../packages/core/resource-body.ts';
import {query,summary} from '../packages/core/query.ts';
import {loadProject} from '../packages/core/project.ts';
import {html} from '../packages/pack-html/index.ts';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {loadBook,bookNavigation,projectOutline} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {resourceContext,resourceRoute,routeResource} from '../packages/core/resource-pages.ts';
import {queryResource,readResource} from '../packages/core/resource-reading.ts';
import {parseRoute,routeHash} from '../packages/core/routes.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {resourcePage} from '../packages/doc-theme/resource-page.ts';
import {sidebarNavigation} from '../packages/doc-theme/navigation.ts';
import {addressBookFixture,composedConfig,region,entry} from './address-book-fixture.ts';
import {compileManual,manualResource} from '../packages/core/manual.ts';
import {readDocument} from '../packages/core/read.ts';
import type {ResourceRoute} from '../packages/core/routes.ts';
const route=(segments:any[],mountId='demo:apb',id='soc:apb'):ResourceRoute=>({kind:'resource',project:'address-v2-composed',id,spaceId:id,view:'instance',segments,mountId});
const flatten=(nodes:any[]):any[]=>nodes.flatMap(n=>[n,...flatten(n.children??[])]);

test('显式挂载处于原 AST Section，Tab 挂载固定、条件分支不激活、真实目录结构保留',async()=>{
 const b=await loadBook(await resolveProjectConfig(composedConfig)),nodes=bookNavigation(b),all=flatten(nodes),mounts=b.resourceCatalog.mounts;
 assert.deepEqual(mounts.map(m=>m.mountId),['demo:apb','demo:cpu','demo:apb-secondary','demo:large','demo:engineering-address']);
 const parent=all.find(n=>n.sectionId==='demo:composed-addresses');assert.equal(parent.children.filter((n:any)=>n.kind==='resource').length,3);
 for(const mount of mounts){const node=all.find(n=>n.id===mount.mountId);assert.equal(node.page,'');assert.equal(node.route.kind,'resource');assert.equal(node.kind,'resource');assert.equal(b.root.graph.index.has(mount.mountId),false);}
 assert.equal(projectOutline(b,{id:'demo:apb'}).chapters[0].route?.kind,'resource');
 assert.ok(flatten(sidebarNavigation(nodes)).some(n=>n.kind==='resource'&&n.route));assert.ok(all.some(n=>n.sectionId==='demo:uart-ip-home'));
});

test('完整实例路由、两个 UART、跨 Window、Reserved/Memory 与相对定义各保留语义',async()=>{
 const b=await loadBook(await resolveProjectConfig(composedConfig)),context=resourceContext(b.root.graph);
 const empty=queryResource(context,route([]));assert.equal(empty.route.view,'definition');assert.equal(empty.route.segments,undefined);
 const a=queryResource(context,route([region('uart0'),entry('ctrl')])),other=queryResource(context,route([region('uart1'),entry('ctrl')]));
 assert.notEqual(routeHash(a.route),routeHash(other.route));assert.equal((a.view.facts as any).address,'0x1000000000001008');assert.equal((other.view.facts as any).address,'0x1000000000002008');
 assert.equal(a.view.definition?.project,'uart-ip');assert.equal(a.trail.at(-2)!.label,'UART0');
 assert.equal(queryResource(context,{kind:'resource',project:'uart-ip',id:'uart:csr',view:'definition'}).view.facts && (queryResource(context,{kind:'resource',project:'uart-ip',id:'uart:csr',view:'definition'}).view.facts as any).address,undefined);
 const reserved=queryResource(context,route([region('reserved')]));assert.equal(reserved.view.type,'reserved');assert.equal(reserved.view.definition,undefined);
 const memory=queryResource(context,route([region('ram')]));assert.equal(memory.view.type,'memory');assert.equal((memory.view.facts as any).memorySlice.startBit,'0x1000');
 const window=queryResource(context,route([region('apb'),region('ip-window')],'demo:cpu','soc:cpu'));assert.equal(window.view.type,'window');assert.equal((window.view.facts as any).mapping.targetProject,'uart-ip');
 const full=queryResource(context,route([region('apb'),region('ip-window'),region('csr'),entry('ctrl')],'demo:cpu','soc:cpu'));assert.equal((full.view.facts as any).address,'0x4802');
 assert.throws(()=>queryResource(context,{...a.route,definitionId:'wrong'}),/RESOURCE_ROUTE/);assert.throws(()=>queryResource(context,{...a.route,mountId:'demo:cpu'}),/RESOURCE_MOUNT/);
 assert.equal(parseRoute(routeHash({...a.route,segments:[{kind:'entry',entryId:'ctrl',index:-1}]}))?.kind,'resource');assert.throws(()=>queryResource(context,{...a.route,segments:[{kind:'region',regionId:'uart0',index:1}]}),/ADDRESS_INDEX/);
});

test('作者 Section 唯一维护，定义在前实例追加；局部锚点和跨工程原文链接分别定位',async()=>{
 const b=await loadBook(await resolveProjectConfig(composedConfig)),before=[...b.resourceResolver.projects.values()].map(g=>g.index.size),data=await compileBook(b),context=resourceContext(b.root.graph);
 const page=resourcePage(context,route([region('uart0'),entry('ctrl')]),data.resourceBodies);
 assert.deepEqual(page.bodyParts.map(p=>p.body.project),['uart-ip','address-v2-composed']);
 assert.ok(page.html.indexOf('IP 通用使用约定')<page.html.indexOf('UART0 的项目接线'));
 assert.ok(flatten(page.outline).some(n=>n.label==='使用前提'));assert.ok(page.outline.some(n=>n.id==='resource-auto-field-table'));
 const local=[...page.html.matchAll(/href="(#edoc=[^"]+)"/g)].map(m=>parseRoute(m[1])).filter(Boolean);
 assert.ok(local.some(r=>r?.kind==='resource'&&r.anchor?.startsWith('resource-author-')&&r.mountId==='demo:apb'));
 assert.ok(local.some(r=>r?.kind==='page'&&r.project==='uart-ip'&&r.id==='docs/index'));
 assert.deepEqual([...b.resourceResolver.projects.values()].map(g=>g.index.size),before);assert.equal(Object.keys(data.resourceBodies!).length,2);
 assert.ok(!Object.values(data.pages).some(p=>p.id.includes('uart0')));
});

test('挂载/绑定重复、未选中条件里的错误引用和错误来源 Section 严格失败',async t=>{
 const f=addressBookFixture(t,true),file=f.root+'/docs/index.mdoc',original=readFileSync(file,'utf8');
 for(const [extra,code]of [[`{% resource-directory id="soc:apb" mount="demo:apb" /%}`,'RESOURCE_MOUNT_DUPLICATE'],[`{% resource-content target={"kind":"definition","id":"soc:apb"} section="uart:usage" /%}`,'RESOURCE_DECLARATION'],[`{% if false %}{% resource-directory id="missing" mount="hidden:bad" /%}{% /if %}`,'RESOURCE_REFERENCE'],[`{% resource-link target={"kind":"definition","id":"soc:apb"} mount="missing" /%}`,'RESOURCE_MOUNT']] as const){
  writeFileSync(file,original+'\n'+extra);await assert.rejects(f.load,new RegExp(code));
 }
 writeFileSync(file,original+'\n{% resource-content target={"kind":"instance","space":"soc:apb","segments":[{"kind":"region","regionId":"uart0"}]} section="demo:uart0-use" /%}');await assert.rejects(f.load,/RESOURCE_CONTENT_DUPLICATE/);
});

test('复用正文中的挂载不二次登记，原生词法作用域、排版和来源链接保留',async t=>{
 const f=addressBookFixture(t,true),file=f.root+'/ip/docs/index.mdoc';let content=readFileSync(file,'utf8');content=content.replace('### 使用前提','{% resource-directory id="uart:csr" mount="ip:usage-dir" /%}\n\n### 使用前提\n\n**原生强调**');writeFileSync(file,content);
 const b=await f.load(),size=b.root.graph.index.size,data=await compileBook(b),page=resourcePage(resourceContext(b.root.graph),route([region('uart0')]),data.resourceBodies);
 assert.equal(b.resourceCatalog.mounts.filter(m=>m.mountId==='ip:usage-dir').length,1);assert.ok(!page.html.includes('浏览资源目录'));assert.ok(page.html.includes('<strong>原生强调</strong>'));assert.equal(b.root.graph.index.size,size);
});

test('十亿数组只携带符号汇总，末项页面和导航/ReaderData 体积有界', {timeout:10000},async t=>{
 const f=addressBookFixture(t,true),before=await f.load(),base=JSON.stringify(await compileBook(before)).length;
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.push({id:'billion',kind:'resource',label:'十亿 UART',base:'0x1000000',size:'0x1000',count:1000000000,stride:'0x1000',target:{project:'uart-ip',id:'uart:csr'}}));
 const b=await f.load(),data=await compileBook(b),nav=flatten(bookNavigation(b));
 const shallow=outlineResource(resourceContext(b.root.graph),{kind:'resource',project:'address-v2-composed',id:'soc:large',view:'definition',mountId:'demo:large'},1);assert.ok(shallow.chapters[0].children.every(node=>node.children.length===0));assert.ok(nav.length<600);assert.equal(Object.keys(data.pages).length,2);assert.ok(JSON.stringify(data).length<2000000);
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.at(-1).count=100000000);const smaller=await compileBook(await f.load());assert.ok(Math.abs(JSON.stringify(data).length-JSON.stringify(smaller).length)<10000);
 const last=route([{kind:'region',regionId:'billion',index:999999999},entry('ctrl')]),page=resourcePage(resourceContext(b.root.graph),last,data.resourceBodies);
 assert.equal(BigInt((page.view.facts as any).address),0x1000000n+999999999n*0x1000n+8n);assert.ok(page.html.length<30000);
 t.diagnostic(JSON.stringify({navigationNodes:nav.length,realPages:Object.keys(data.pages).length,readerDataChars:JSON.stringify(data).length,virtualPageChars:page.html.length}));
});

test('随包资源 query/read/outline 与同源接口保留相同绑定和路由',async()=>{
 const b=await loadBook(await resolveProjectConfig(composedConfig)),context=resourceContext(b.root.graph),manual=JSON.parse(JSON.stringify(compileManual(b))),selected=route([region('uart0')]);
 const query=manualResource(manual,selected,'query') as any;assert.equal(query.view.target.space,'soc:apb');assert.deepEqual(query.bindings.map((v:any)=>v.sectionId),['uart:usage','demo:uart0-use']);
 const read=readResource(context,selected,(project,id,scope)=>readDocument(b.projects.get(project)!.graph,id,{scope,maxChars:100000}));
 const packed=manualResource(manual,selected,'read') as any;let expected=read.content;for(const root of [...b.projects.values()].map(n=>n.config.root).sort((a,b)=>b.length-a.length))expected=expected.replaceAll(root+'/','');assert.equal(packed.content,expected);assert.deepEqual(packed.route,read.route);
 assert.equal((manualResource(manual,selected,'outline') as any).chapters[0].route.kind,'resource');
});


test('绑定正文保留 partial 词法变量和原始标题锚点，不重新解释为全局变量',async t=>{
 const f=addressBookFixture(t,true),config=f.root+'/ip/docs/edoc.config.js',file=f.root+'/ip/docs/index.mdoc';
 writeFileSync(config,`export default {projectId:'uart-ip',title:'独立 UART IP',markdoc:{variables:{label:'GLOBAL'},partials:{bound:'docs/_partials/bound.mdoc'},tags:{lexical:{selfClosing:true,transform(_node,cfg){return cfg.variables.label;}}}}};`);
 mkdirSync(f.root+'/ip/docs/_partials',{recursive:true});writeFileSync(f.root+'/ip/docs/_partials/bound.mdoc','{% section id="uart:partial" title="词法说明" %}\n{% lexical /%}\n{% /section %}');
 writeFileSync(file,readFileSync(file,'utf8').replace('### 使用前提','{% partial file="bound" variables={label:"LEXICAL"} /%}\n\n### 使用前提'));
 const b=await f.load(),data=await compileBook(b),page=resourcePage(resourceContext(b.root.graph),route([region('uart0')]),data.resourceBodies);
 assert.ok(page.html.includes('LEXICAL'));assert.ok(!page.html.includes('GLOBAL'));assert.ok(flatten(page.outline).some(n=>n.label==='词法说明'));
});

test('跨工程重复 mount、重复 partial 挂载、正文重锚点与无效资源锚点明确拒绝',async t=>{
 const f=addressBookFixture(t,true),ip=f.root+'/ip/docs/index.mdoc',original=readFileSync(ip,'utf8');
 writeFileSync(ip,original+'\n{% resource-directory id="uart:csr" mount="demo:apb" /%}');await assert.rejects(f.load,/RESOURCE_MOUNT_DUPLICATE/);writeFileSync(ip,original);
 const file=f.root+'/docs/index.mdoc',source=readFileSync(file,'utf8');mkdirSync(f.root+'/docs/_partials',{recursive:true});writeFileSync(f.root+'/docs/_partials/mount.mdoc','{% resource-directory id="soc:cpu" mount="partial:duplicate" /%}');
 writeFileSync(file,source+'\n{% include file="docs/_partials/mount.mdoc" /%}\n{% include file="docs/_partials/mount.mdoc" /%}');await assert.rejects(f.load,/RESOURCE_MOUNT_DUPLICATE/);
 writeFileSync(file,source+'\n{% resource-link target={"kind":"definition","id":"soc:apb"} anchor="not-there" /%}');await assert.rejects(async()=>compileBook(await f.load()),/RESOURCE_ANCHOR/);
 writeFileSync(file,source);writeFileSync(ip,original.replace('### 使用前提','{% panel id="duplicate" %}甲{% /panel %}\n{% panel id="duplicate" %}乙{% /panel %}\n### 使用前提'));await assert.rejects(async()=>compileBook(await f.load()),/RESOURCE_ANCHOR/);
});

test('窗口截断寄存器的虚拟页拒绝，保留结构化槽位诊断；无绑定页仍有基本信息',async t=>{
 const f=addressBookFixture(t,true);f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions[2].mappedSize='12');
 const b=await f.load(),context=resourceContext(b.root.graph),partial=route([region('apb'),region('ip-window'),region('csr'),entry('ctrl')],'demo:cpu','soc:cpu');
 assert.throws(()=>queryResource(context,partial),(error:any)=>{assert.equal(error.diagnostics[0].code,'PARTIAL_REGISTER_WINDOW');assert.ok(error.diagnostics[0].details.slot);return true;});
 const data=await compileBook(b),page=resourcePage(context,route([region('reserved')]),data.resourceBodies);assert.equal(page.bodyParts.length,0);assert.ok(page.html.includes('规划保留不赋予读写能力'));
});


test('真实 CLI outline/read/query 接受完整路由，text 不将资源伪装成文件目录',()=>{
 const selected=route([region('uart0'),entry('ctrl')]),run=(command:string,args:string[]=[])=>spawnSync(process.execPath,['packages/cli/edoc.ts',command,'--config',composedConfig,'--route',JSON.stringify(selected),...args],{encoding:'utf8',maxBuffer:4e6});
 const q=run('query');assert.equal(q.status,0,q.stderr);const value=JSON.parse(q.stdout);assert.equal(value.route.spaceId,'soc:apb');assert.equal(value.view.definition.project,'uart-ip');assert.equal(value.view.facts.address,'0x1000000000001008');
 const read=run('read',['--max-chars','100000']);assert.equal(read.status,0,read.stderr);const body=JSON.parse(read.stdout);assert.ok(body.content.indexOf('同一份原生字节布局')<body.content.indexOf('UART0 是本项目'));
 const outline=run('outline',['--format','text']);assert.equal(outline.status,0,outline.stderr);assert.ok(outline.stdout.includes('[资源 '));assert.ok(!outline.stdout.includes('[目录分组]'));
 const bad=run('query',['--id','soc:apb']);assert.notEqual(bad.status,0);assert.match(bad.stderr,/USAGE/);
});


test('仅目录声明的外部目标同样显式 deferred，不能由公开 Graph 声称成功',async t=>{
 const f=addressBookFixture(t,true);f.edit('docs/ir/uart.json',d=>{for(const key of Object.keys(d))delete d[key];d.objects=[{id:'local',kind:'node',label:'本地对象',ports:[]}];});
 writeFileSync(f.root+'/docs/index.mdoc','{% section id="root" title="外部挂载" %}{% resource-directory project="uart-ip" id="uart:csr" mount="foreign:only" /%}{% include project="uart" /%}{% /section %}');
 const config=await resolveProjectConfig(f.root+'/docs/edoc.config.js');await assert.rejects(()=>loadProject(config),/RESOURCE_REFERENCE/);
 const prepared=(await loadProject(config,{deferAddressTargets:true})).graph;assert.equal(prepared.resourceCatalog?.status,'deferred');assert.throws(()=>summary(prepared),/RESOURCE_BOOK_CONTEXT/);assert.throws(()=>query(prepared,'local'),/RESOURCE_BOOK_CONTEXT/);
 const b=await f.load();assert.equal(b.resourceCatalog.status,'complete');const selected=projectOutline(b,{project:'address-v2-composed',id:'foreign:only'}).chapters[0];assert.equal(selected.project,'address-v2-composed');assert.equal(selected.route?.project,'uart-ip');
 await assert.rejects(()=>html(b.root.graph,'错误入口'),/RESOURCE_READER_REQUIRED/);
});


test('正文命名空间区分局部导航、显式源页面链接和 SVG 内部引用',()=>{
 const selected=route([region('uart0')]),explicit=routeHash({kind:'page',project:'uart-ip',id:'docs/index',anchor:'local'}),binding:any={target:{kind:'definition',project:'uart-ip',id:'uart:csr'},sectionId:'usage',source:{projectId:'uart-ip',file:'docs/index.mdoc',line:1,page:'docs/index'}};
 const scoped=namespaceResourceBody({project:'uart-ip',page:'docs/index',sectionId:'usage',html:'<section id="local"><a href="#local">本段</a><a href="'+explicit+'">原文章</a><code>url(#shape)</code><svg><defs><path id="shape"/></defs><use href="#shape"/></svg></section>',outline:[],scenes:{}},binding,selected,0);
 assert.ok(scoped.html.includes('href="'+explicit+'"'));assert.ok(scoped.html.includes('<code>url(#shape)</code>'));assert.match(scoped.html,/<use href="#resource-author-[^"]+-shape"/);assert.ok(scoped.html.includes('href="'+routeHash({...selected,anchor:scoped.aliases.local})+'"'));
});
