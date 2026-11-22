import test from 'node:test';
import assert from 'node:assert/strict';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';
import {resourceContext,routeResource,resourceCollection} from '../packages/core/resource-pages.ts';
import {resourceMountNavigation,loadResourceNavigation} from '../packages/core/resource-navigation.ts';
import {resourcePage} from '../packages/doc-theme/resource-page.ts';
import {addressLeaves} from '../packages/extensions/register-map/leaves.ts';
import {queryElement} from '../packages/core/query.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {hydrateProjectGraphs} from '../packages/core/resource-context.ts';
import type {RecordEntry} from '../packages/core/types.ts';
import type {ResourceRoute} from '../packages/core/routes.ts';
const project='address-v2-composed';
const route=(path:any[]=[],id='soc:engineering',mountId='demo:engineering-address'):ResourceRoute=>({kind:'resource',project,id,view:path.length?'instance':'definition',...(path.length?{spaceId:id,segments:path}:{}),mountId});

test('普通 IP 64 个寄存器可在通用左树分批全部取到；深层也有加载入口，数组不枚举',async t=>{
 const b=await addressBookFixture(t,true,true).load(),ctx=resourceContext(b.root.graph),root=resourceMountNavigation(ctx,b.resourceCatalog.mounts.find(m=>m.mountId==='demo:engineering-address')!);
 const bank=root.children.find(n=>n.label.includes('64 寄存器'))!;assert.equal(bank.children.length,20);assert.equal(bank.resourceChildren?.offset,20);
 for(let i=0;i<3;i++)loadResourceNavigation(ctx,bank);assert.equal(bank.children.length,64);assert.equal(bank.resourceChildren,undefined);
 assert.match(bank.children.at(-1)!.label,/R63/);assert.equal(new Set(bank.children.map(n=>JSON.stringify(n.route))).size,64);
 const dma=root.children.find(n=>n.label.includes('8 Channel'))!;assert.equal(dma.children[0].resourceCount,'8');
 // 深层摘要的首项通过“展开子项”取得子树，不用遍历 count。
 if(!dma.children[0].children.length)loadResourceNavigation(ctx,dma);
 const direct=resourceMountNavigation(ctx,b.resourceCatalog.mounts.find(m=>m.mountId==='demo:engineering-address')!,route([region('large'),{kind:'entry',entryId:'channels',index:999999999}]));
 const flat=(n:any):any[]=>[n,...n.children.flatMap(flat)];assert.ok(flat(direct).length<250);
 assert.ok(flat(direct).some(n=>n.route?.segments?.at(-1)?.index===999999999));
});

test('空间表的分配 size 与映射 mappedSize 独立；块/寄存器元数据和自动锚点正确',async t=>{
 const b=await addressBookFixture(t,true,true).load(),ctx=resourceContext(b.root.graph),data=await compileBook(b);
 const apb=routeResource(ctx,route([],'soc:apb','demo:apb')).view,row=apb.children.items.find(c=>c.key==='uart0')!;
 assert.equal(row.values?.allocation,'0x1000');assert.equal(row.values?.mapped,'0x100');assert.equal(row.values?.type,'register-block');assert.equal(apb.children.items.find(c=>c.key==='ip-window')?.values?.type,'window');
 const block=resourcePage(ctx,route([region('dma')]),data.resourceBodies);assert.match(block.html,/32 bit/);assert.match(block.html,/根 Block|绝对坐标/);assert.equal(block.view.children.items[0].count,'8');
 const register=resourcePage(ctx,route([region('dma'),{kind:'entry',entryId:'channels',index:7},entry('counter')]),data.resourceBodies);
 assert.equal((register.view.facts as any).address,'0x200E8');assert.match(register.html,/64 bit/);assert.match(register.html,/whole-register/);assert.match(register.html,/未声明/);
 assert.ok(register.html.indexOf('resource-auto-bit-layout')<register.html.indexOf('resource-auto-field-table'));assert.match(register.html,/resource-auto-access-policy/);assert.match(register.html,/resource-auto-sources/);
 const a=resourcePage(ctx,route([region('uart0')],'soc:apb','demo:apb'),data.resourceBodies);assert.equal(a.bodyParts.length,2);assert.deepEqual(a.bodyParts.map(p=>p.body.project),['uart-ip',project]);
 const definition=resourcePage(ctx,{kind:'resource',project,id:'dma:csr',view:'definition'},data.resourceBodies);assert.match(definition.html,/独立定义视图/);assert.equal((definition.view.facts as any).address,undefined);
});

test('DMA 8 Channel 多单位叶列表由独立算式逐项核验；分页连续且不重不漏',async t=>{
 const b=await addressBookFixture(t,true,true).load(),resolver=b.resourceResolver,path=[region('dma')];
 const expected=Array.from({length:8},(_,i)=>[0x20000n+BigInt(i)*32n,0x20000n+BigInt(i)*32n+8n]).flat();
 const actual:bigint[]=[];let cursor:string|undefined;
 do{const page=addressLeaves(resolver,project,'soc:engineering',path,{limit:3,cursor});actual.push(...page.items.map(r=>BigInt(r.instance!.address!)));cursor=page.nextCursor;}while(cursor);
 assert.deepEqual(actual,expected);
 const first=addressLeaves(resolver,project,'soc:engineering',[],{limit:50});assert.equal(first.items.length,50);
 const second=addressLeaves(resolver,project,'soc:engineering',[],{limit:50,cursor:first.nextCursor});assert.equal(second.items[0].instance!.address,'0x10190');
 assert.ok(second.items.some(r=>r.status==='PARTIAL_REGISTER_WINDOW'));assert.ok(second.items.some(r=>r.instance?.address==='0x42008'));
});

test('完整多跳、截断槽位、Memory 与 Reserved 保留身份，叶查询和离线重建同源',async t=>{
 const b=await addressBookFixture(t,true,true).load(),ctx=resourceContext(b.root.graph),resolver=b.resourceResolver;
 const full=addressLeaves(resolver,project,'soc:engineering',[region('multihop')]);assert.deepEqual(full.items.map(r=>r.instance?.address),['0x40008','0x41008','0x42008']);
 assert.deepEqual(full.items.at(-1)!.instance!.coordinateChain.map(s=>s.addressSpaceId),['soc:engineering','soc:cpu','soc:apb','uart:bus']);
 const partial=addressLeaves(resolver,project,'soc:engineering',[region('partial')]);assert.equal(partial.items.length,1);assert.equal(partial.items[0].status,'PARTIAL_REGISTER_WINDOW');assert.equal(partial.items[0].instance,undefined);
 assert.deepEqual((partial.items[0].diagnostic as any).visible,{startBit:'0x180000',endExclusiveBit:'0x180020'});
 const view=resourceCollection(ctx,routeResource(ctx,route([region('partial')])).view.target)!;assert.equal(view.items[0].status,'PARTIAL_REGISTER_WINDOW');
 const memory=resourcePage(ctx,route([region('memory')]));assert.equal(memory.view.type,'memory');assert.match(memory.html,/物理切片/);assert.equal(memory.collection,undefined);
 const reserved=resourcePage(ctx,route([region('reserved')]));assert.match(reserved.html,/规划保留不赋予读写能力/);
 assert.equal(addressLeaves(resolver,project,'soc:engineering',[region('planning')]).items.length,0);
 const selector=JSON.stringify({kind:'leaves',path:[region('multihop')],limit:2});const q=queryElement(b.root.graph,'soc:engineering',selector) as any;assert.equal(q.leaves.items.length,2);
 const data=await compileBook(b),graphs=hydrateProjectGraphs(Object.entries(data.projects).map(([projectId,p])=>({manifest:{projectId,irVersion:p.irVersion,requiredFeatures:p.requiredFeatures,resources:[],entryDocuments:[]},records:Object.entries(p.entities).map(([id,entity])=>({id,entity,...p.records[id]} as RecordEntry)),attachments:p.attachments})));
 const offline=queryElement(graphs.get(project)!,'soc:engineering',selector) as any;
 assert.deepEqual(offline.leaves.items.map((r:any)=>[r.instance.address,r.definitionProjectId,r.instancePath]),q.leaves.items.map((r:any)=>[r.instance.address,r.definitionProjectId,r.instancePath]));
});

test('十亿 Channel 的末项与稀疏窗口分页有界，不因 count 构造导航或叶表',async t=>{
 const f=addressBookFixture(t,true,true),b=await f.load(),resolver=b.resourceResolver;
 const last=999999999n,base=0x100000000n+last*32n,now=performance.now(),page=addressLeaves(resolver,project,'soc:engineering',[region('large')],{limit:3,cursor:'0x'+(base*8n).toString(16)});
 assert.deepEqual(page.items.map(r=>BigInt(r.instance!.address!)),[base,base+8n]);assert.equal(page.hasMore,false);assert.ok(page.scanned<20);assert.ok(performance.now()-now<1000);
 const huge=resourcePage(resourceContext(b.root.graph),route([region('large')]));assert.ok(huge.html.length<100000);assert.equal(huge.collection?.items.length,50);
 // 一百万个空窗口后才有一个寄存器：每页预算封顶，游标必须向前，而不是假称到末尾。
 f.edit('docs/ir/engineering.json',d=>{d.addressSpaces.push({id:'sparse:target',kind:'address-space',label:'稀疏目标',addressUnitBits:8,addressWidth:64,base:'0',size:'0x100000000',regions:[{id:'last',kind:'resource',label:'末段',base:'0x1E848000',size:'0x200',target:{id:'bank:csr'}}]});d.addressSpaces.push({id:'sparse:source',kind:'address-space',label:'稀疏窗口',addressUnitBits:8,addressWidth:64,base:'0',size:'0x100000000',regions:[{id:'windows',kind:'window',label:'Windows',base:'0',size:'0x200',count:1000001,stride:'0x200',targetStride:'0x200',targetBase:'0',target:{id:'sparse:target'}}]});});
 const sparse=await f.load(),scan=addressLeaves(sparse.resourceResolver,project,'sparse:source');assert.equal(scan.items.length,0);assert.equal(scan.hasMore,true);assert.ok(BigInt(scan.nextCursor!)>0n);assert.equal(scan.scanned,scan.scanBudget);
 const next=addressLeaves(sparse.resourceResolver,project,'sparse:source',[],{cursor:scan.nextCursor});assert.ok(BigInt(next.nextCursor!)>BigInt(scan.nextCursor!));
});

test('专业表保留子单位余数，Window 交集与地址排序不因分页舍入',async t=>{
 const f=addressBookFixture(t,true,true);f.edit('docs/ir/engineering.json',d=>{d.registerBlocks[0].entries[1].offset='5';d.addressSpaces.push({id:'word:space',kind:'address-space',label:'字空间',addressUnitBits:32,addressWidth:32,base:'0',size:'0x1000',regions:[{id:'bank',kind:'resource',label:'Byte IP',base:'0x100',size:'0x100',target:{id:'bank:csr'}}]});});
 const b=await f.load(),page=addressLeaves(b.resourceResolver,project,'word:space',[],{limit:3});assert.equal(page.items[1].instance?.coordinate.address,undefined);assert.equal(page.items[1].instance?.coordinate.unitIndex,'0x101');assert.equal(page.items[1].instance?.coordinate.subUnitBitOffset,'8');
 const collection=resourceCollection(resourceContext(b.root.graph),{kind:'definition',project,id:'word:space'})!;assert.match(collection.items[1].values!.coordinate,/0x101 \+ 8 bit/);
});

test('Window 截取重复实例中段时，目录首项选择首个可见索引而非丢弃整组',async t=>{
 const f=addressBookFixture(t,true,true);f.edit('docs/ir/engineering.json',d=>d.addressSpaces.push({id:'channel:window',kind:'address-space',label:'Channel 末段窗口',addressWidth:32,addressUnitBits:8,base:'0',size:'0x1000',regions:[{id:'tail',kind:'window',label:'Tail',base:'0',size:'0x20',target:{id:'soc:engineering'},targetBase:'0x200E0'}]}));
 const b=await f.load(),ctx=resourceContext(b.root.graph),r:ResourceRoute={kind:'resource',project,id:'channel:window',view:'instance',segments:[region('tail'),region('dma')]};
 const view=routeResource(ctx,r).view;assert.equal(view.children.items[0].status,undefined);assert.equal(view.children.items[0].firstIndex,'7');
 assert.equal((view.children.items[0].target as any).segments.at(-1).index,7);
 const list=resourceCollection(ctx,view.target)!;assert.equal(list.items.length,2);assert.match(list.items[1].label,/Channel\[7\]/);
});

test('交错重复族的叶列表按源地址归并，续页与独立小枚举完全一致',async t=>{
 const f=addressBookFixture(t,true,true);f.edit('docs/ir/engineering.json',d=>d.registerBlocks.push({id:'interleaved:csr',kind:'register-block',label:'交错族',addressUnitBits:8,entries:[{id:'a',register:'bank:r00',offset:'0',count:5,stride:'16'},{id:'b',register:'bank:r01',offset:'8',count:5,stride:'16'}]}));
 const b=await f.load(),expected=Array.from({length:5},(_,i)=>[BigInt(i*16),BigInt(i*16+8)]).flat(),actual:bigint[]=[];let cursor:string|undefined;
 do{const result=addressLeaves(b.resourceResolver,project,'interleaved:csr',[],{limit:3,cursor});actual.push(...result.items.map(item=>BigInt(item.instance!.relativeOffset!.address!)));cursor=result.nextCursor;}while(cursor);
 assert.deepEqual(actual,expected);
});
