import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {relative,isAbsolute} from 'node:path';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig,loadProject} from '../packages/core/project.ts';
import {query,queryElement,summary} from '../packages/core/query.ts';
import {readDocument} from '../packages/core/read.ts';
import {compileManual,manualQuery} from '../packages/core/manual.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {hydrateProjectGraphs,connectResourceGraphs} from '../packages/core/resource-context.ts';
import {registerLeafProjection} from '../packages/extensions/register-map/model.ts';
import {registerMapTable} from '../packages/extensions/register-map/render.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {EdocError} from '../packages/core/errors.ts';
import type {Graph,RecordEntry} from '../packages/core/types.ts';
import {addressBookFixture,composedConfig,region,entry} from './address-book-fixture.ts';
const at=(graph:Graph,id:string,path:any[])=>queryElement(graph,id,JSON.stringify(path)) as any;

// source.file 保持原声明；只有 RecordEntry.location 的发布路径转为所属工程相对路径。
function normalize(value:any,graphs:ReadonlyMap<string,Graph>):any {
 if(Array.isArray(value))return value.map(v=>normalize(v,graphs));
 if(!value||typeof value!=='object')return value;
 return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,key==='location'&&v&&typeof v==='object'&&'file'in v&&isAbsolute(String(v.file))?{...v,file:relative([...graphs.values()].filter(g=>String(v.file).startsWith(g.projectRoot+'/')).sort((a,b)=>b.projectRoot.length-a.projectRoot.length)[0].projectRoot,String(v.file)).split('\\').join('/')}:normalize(v,graphs)]));
}

test('Book 两阶段解析：同名定义独立，UART0/1 共用源对象而绝对地址不同',async()=>{
 const book=await loadBook(await resolveProjectConfig(composedConfig)),g=book.root.graph,ip=book.projects.get('uart-ip')!.graph;
 assert.equal(book.resourceResolver.projects.get('uart-ip'),ip);assert.equal(ip.addressResolver,g.addressResolver);
 assert.equal((g.index.get('uart:ctrl')!.entity as any).width,8);assert.equal((ip.index.get('uart:ctrl')!.entity as any).width,64);
 for(const [n,base]of [['uart0',0x1000000000001000n],['uart1',0x1000000000002000n]] as const){
  const r=at(g,'soc:apb',[region(n),entry('ctrl')]);assert.equal(BigInt(r.address),base+8n);
  assert.equal(r.definitionProjectId,'uart-ip');assert.equal(r.entity,ip.index.get('uart:ctrl')!.entity);
  assert.equal(r.location,ip.index.get('uart:ctrl')!.location);assert.ok(r.sources.some((s:any)=>s.projectId==='uart-ip'&&s.source.selector==='uart:ctrl'));
 }
 assert.equal([...g.index.values()].filter(r=>r.id==='uart:ctrl').length,1);
 assert.deepEqual(registerLeafProjection(g,'soc:apb').rows.map(r=>[r.definitionProjectId,r.address]),[['address-v2-composed','0x0'],['uart-ip','0x1000000000001008'],['uart-ip','0x1000000000002008']]);
 const expanded=query(g,'soc:apb',{depth:3}).expansion.items;
 assert.equal(expanded.filter(r=>r.id==='uart:ctrl').length,2);assert.ok(expanded.some(r=>r.projectId==='uart-ip'&&r.id==='uart:enable'));
 assert.match(registerMapTable(g,'soc:apb'),/uart-ip/);
});

test('IP 可以独立加载/编译；SoC 独立 Graph 明确要求 Book，内部 deferred 不能查询/读取/渲染',async()=>{
 const ip=await loadBook(await resolveProjectConfig(composedConfig.replace('/docs/edoc.config.js','/ip/docs/edoc.config.js')));
 assert.equal(ip.projects.size,1);assert.equal(summary(ip.root.graph).valid,true);await compileBook(ip);
 const config=await resolveProjectConfig(composedConfig);await assert.rejects(()=>loadProject(config),/ADDRESS_BOOK_CONTEXT/);
 const prepared=(await loadProject(config,{deferAddressTargets:true})).graph;assert.equal(prepared.addressValidation?.status,'deferred');
 assert.throws(()=>query(prepared,'soc:apb'),/ADDRESS_BOOK_CONTEXT/);assert.throws(()=>readDocument(prepared,'soc:apb'),/ADDRESS_BOOK_CONTEXT/);await assert.rejects(()=>renderDocument(prepared,'未装配'),/ADDRESS_BOOK_CONTEXT/);
});

test('未 include 不自动加载强引用目标；弱文档链接仍允许未组合工程',async t=>{
 const f=addressBookFixture(t),file=f.root+'/docs/index.mdoc';writeFileSync(file,readFileSync(file,'utf8').replace('{% include project="uart" /%}','{% reference project="absent-doc" id="anything" /%}'));
 await assert.rejects(f.load,(error:any)=>{assert.ok(error instanceof EdocError);const d=error.diagnostics.find((d:any)=>d.code==='ADDRESS_BOOK_CONTEXT');assert.ok(d);assert.match(d.file,/docs\/ir\/uart.json$/);assert.match(d.path,/addressSpaces\/0\/regions\/0\/target/);assert.match(d.message,/address-v2-composed\/soc:apb/);assert.match(d.message,/uart-ip\/uart:csr/);return true;});
 f.edit('docs/ir/uart.json',d=>{d.addressSpaces.forEach((s:any)=>s.regions=[]);});assert.equal((await f.load()).projects.size,1);
});

test('Book 终校验拒绝外部错误类型/缺失 ID，诊断同时保留源和目标身份',async t=>{
 const f=addressBookFixture(t);
 for(const id of ['uart:ctrl','missing']){
  f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions[0].target.id=id);
  await assert.rejects(f.load,(error:any)=>{const d=error.diagnostics.find((d:any)=>d.code==='ADDRESS_REFERENCE');assert.match(d.file,/docs\/ir\/uart.json$/);assert.match(d.path,/addressSpaces\/0\/regions\/0/);assert.match(d.message,/address-v2-composed\/soc:apb/);assert.ok(d.message.includes('uart-ip')&&d.message.includes(id));return true;});
 }
});

test('终校验解析后才计算外部原生跨度，拒绝 mappedSize/单位/Window 越界',async t=>{
 const f=addressBookFixture(t),original=readFileSync(f.root+'/docs/ir/uart.json','utf8');
 for(const [mutate,code]of [[(d:any)=>d.addressSpaces[0].regions[0].mappedSize='4','ADDRESS_BLOCK_SLICE'],[(d:any)=>d.addressSpaces[0].regions[2].targetBase='0x81','ADDRESS_RANGE']] as const){
  writeFileSync(f.root+'/docs/ir/uart.json',original);f.edit('docs/ir/uart.json',mutate);await assert.rejects(f.load,new RegExp(code));
 }
 writeFileSync(f.root+'/docs/ir/uart.json',original);f.edit('ip/docs/ir/uart.json',d=>d.registerBlocks[0].size='0x101');await assert.rejects(f.load,/ADDRESS_UNIT/);
});

test('跨工程两跳 Window 使用 BigInt 位坐标，保留目标单位余数与来源工程',async()=>{
 const book=await loadBook(await resolveProjectConfig(composedConfig)),g=book.root.graph;
 const r=at(g,'soc:cpu',[region('apb'),region('ip-window'),region('csr'),entry('ctrl')]);
 assert.equal(BigInt(r.address),0x4000n+(0x2000n+8n)/4n);assert.equal(r.definitionProjectId,'uart-ip');
 assert.deepEqual(r.coordinateChain.map((s:any)=>[s.projectId,s.addressSpaceId]),[['address-v2-composed','soc:cpu'],['address-v2-composed','soc:apb'],['uart-ip','uart:bus']]);
 const point=(queryElement(g,'soc:apb',JSON.stringify({kind:'address',address:'0x1000000000003001'})) as any).addressPoint;
 assert.equal(point.coordinateChain[1].coordinate.subUnitBitOffset,'8');assert.equal(point.coordinateChain[1].coordinate.address,undefined);
});

test('外部嵌套 Block 按各自原生单位投影，叶定义与策略仍归属 IP',async t=>{
 const f=addressBookFixture(t);
 f.edit('ip/docs/ir/uart.json',d=>{
  d.registerBlocks[0].id='uart:leaf';d.registerBlocks[0].accessPolicy={alignment:'4',allowedTransferBits:[32]};
  d.registerBlocks.push({id:'uart:csr',kind:'register-block',label:'原生字块',addressUnitBits:32,size:'0x40',entries:[{id:'child',block:'uart:leaf',offset:'0'}]});
 });
 const b=await f.load(),r=at(b.root.graph,'soc:apb',[region('uart1'),entry('child'),entry('ctrl')]);
 assert.equal(BigInt(r.address),0x1000000000002000n+8n);assert.equal(r.definitionProjectId,'uart-ip');assert.equal(r.accessPolicy.alignment.bitAlignment,'0x20');assert.equal(r.accessPolicy.alignment.declaredBy,'uart-ip/uart:leaf');
 assert.deepEqual(registerLeafProjection(b.root.graph,'soc:apb').rows.map(row=>row.address),['0x0','0x1000000000001008','0x1000000000002008']);
});

test('跨工程同名 AddressSpace 不误判 Window 自环',async t=>{
 const f=addressBookFixture(t);
 f.edit('ip/docs/ir/uart.json',d=>d.addressSpaces[0].id='soc:apb');
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions[2].target.id='soc:apb');
 const b=await f.load(),r=at(b.root.graph,'soc:cpu',[region('apb'),region('ip-window'),region('csr'),entry('ctrl')]);
 assert.equal(r.address,'0x4802');assert.deepEqual(r.coordinateChain.slice(1).map((s:any)=>[s.projectId,s.addressSpaceId]),[['address-v2-composed','soc:apb'],['uart-ip','soc:apb']]);
});

test('跨工程 Window 环路明确失败；完整槽位判据不被跨工程截断绕过',async t=>{
 const f=addressBookFixture(t);
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions[2].mappedSize='12');let book=await f.load();
 assert.throws(()=>at(book.root.graph,'soc:cpu',[region('apb'),region('ip-window'),region('csr'),entry('ctrl')]),/PARTIAL_REGISTER_WINDOW/);
 f.edit('ip/docs/ir/uart.json',d=>d.addressSpaces[0].regions=[{id:'cycle',kind:'window',label:'回边',base:'0',size:'0x80',target:{project:'address-v2-composed',id:'soc:cpu'},targetBase:'0x4000'}]);
 await assert.rejects(f.load,(error:any)=>{assert.match(error.message,/ADDRESS_CYCLE/);assert.match(error.message,/uart-ip/);assert.match(error.message,/address-v2-composed/);return true;});
});

test('同工程外部 Memory 物理切片 alias 终校验，显式 Window 多路径允许',async t=>{
 const f=addressBookFixture(t);
 f.edit('ip/docs/ir/uart.json',d=>d.memories=[{id:'ram',kind:'memory',label:'共享 RAM',capacityBytes:'0x1000',memoryType:'ram'}]);
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.push({id:'ram0',kind:'resource',label:'RAM0',base:'0x5000',size:'0x100',target:{project:'uart-ip',id:'ram'}},{id:'ram1',kind:'resource',label:'RAM1',base:'0x6000',size:'0x100',target:{project:'uart-ip',id:'ram'},resourceOffset:'0x80'}));
 await assert.rejects(f.load,/ADDRESS_MEMORY_ALIAS/);
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.at(-1).resourceOffset='0x100');await f.load();
 f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions.push({id:'ram-alias',kind:'window',label:'显式别名',base:'0x7000',size:'0x100',target:{id:'soc:apb'},targetBase:'0x5000'}));
 // 同一 AddressSpace 的 Window 回边即使区间有限仍被禁止；用独立空间表示显式路径。
 await assert.rejects(f.load,/ADDRESS_CYCLE/);
 f.edit('docs/ir/uart.json',d=>{const w=d.addressSpaces[0].regions.pop();w.base='0';d.addressSpaces.push({id:'alias',kind:'address-space',label:'别名',addressUnitBits:8,addressWidth:32,base:'0',size:'0x100',regions:[w]});});
 {const b=await f.load(),r=at(b.root.graph,'alias',[region('ram-alias'),region('ram0')]);assert.equal(r.memorySlice.projectId,'uart-ip');assert.equal(r.memorySlice.memoryId,'ram');}
});

test('呈现成员关系在 Book 完整后终校验，不能把父工程同名寄存器当外部定义',async t=>{
 const f=addressBookFixture(t);f.edit('docs/ir/uart.json',d=>d.addressSpaces[0].regions=d.addressSpaces[0].regions.filter((r:any)=>r.id!=='local'));
 const file=f.root+'/docs/index.mdoc';writeFileSync(file,readFileSync(file,'utf8')+'\n{% section id="local-definition" title="本地" %}本地章节。{% /section %}\n{% register-map id="soc:apb" mode="registers" definitions={"uart:ctrl":"local-definition"} /%}');
 await assert.rejects(f.load,/DOCUMENT_REFERENCE.*definitions/);
});

test('随包 JSON 与 ReaderData 分工程重建共享 resolver，投影/多跳/来源与 CLI Graph 一致',async()=>{
 const book=await loadBook(await resolveProjectConfig(composedConfig)),graphs=book.resourceResolver.projects,manual=JSON.parse(JSON.stringify(compileManual(book))),data=JSON.parse(JSON.stringify(await compileBook(book)));
 const hydrated=hydrateProjectGraphs(Object.entries(data.projects).map(([projectId,p]:[string,any])=>({manifest:{projectId,irVersion:p.irVersion,requiredFeatures:p.requiredFeatures,resources:[],entryDocuments:[]},records:Object.entries(p.entities).map(([id,entity])=>({id,entity,...p.records[id]} as RecordEntry))})));
 for(const [id,options]of [['soc:apb',{depth:3}],['soc:cpu',{element:JSON.stringify([region('apb'),region('ip-window'),region('csr'),entry('ctrl')])}]] as const){
  const expected='element'in options?queryElement(book.root.graph,id,options.element):query(book.root.graph,id,options);
  assert.deepEqual(manualQuery(manual,id,{project:'address-v2-composed',...options}),normalize(expected,graphs));
  const browser=hydrated.get('address-v2-composed')!;assert.deepEqual('element'in options?queryElement(browser,id,options.element):query(browser,id,options),normalize(expected,graphs));
 }
 const incomplete=new Map([['address-v2-composed',hydrated.get('address-v2-composed')!]]);assert.throws(()=>connectResourceGraphs(incomplete),/ADDRESS_BOOK_CONTEXT/);assert.throws(()=>query(incomplete.values().next().value!,'soc:apb'),/ADDRESS_BOOK_CONTEXT/);
 assert.throws(()=>hydrateProjectGraphs([{...manual.projects['uart-ip'],manifest:{...manual.projects['uart-ip'].manifest,irVersion:'1.8'}}]),/IR_VERSION/);
 assert.throws(()=>hydrateProjectGraphs([manual.projects['uart-ip'],manual.projects['uart-ip']]),/PROJECT_ID_DUPLICATE/);
});
