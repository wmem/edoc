import test from 'node:test';
import assert from 'node:assert/strict';
import {registerFixture,registerData} from './register-fixture.ts';
import {query,preflightBook} from '../packages/core/index.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {registerSVG} from '../packages/extensions/register/render.ts';
import type {Register} from '../packages/core/types.ts';
test('寄存器、字段与空洞投影同源，复位声明和64位整数不丢失',async t=>{
 const p=registerFixture(t),book=await p.load(),graph=book.root.graph,result=query(graph,'reg:CTRL',{depth:1});assert.equal(result.expansion.items.length,4);assert.equal(result.register!.segments.filter(s=>s.kind==='reserved').length,3);assert.equal(query(graph,'reg:CTRL.COUNT').registerField!.resetState,'undeclared');assert.equal(query(graph,'reg:CTRL.EVENT').registerField!.resetState,'unknown');assert.equal(query(graph,'reg:CTRL.MODE').registerField!.resetText,'表达式：DEFAULT_MODE');assert.equal(query(graph,'reg:FULL.DATA').registerField!.resetText,'0xFEDCBA9876543210');assert.equal(query(graph,'reg:CTRL.EN').registerField!.ownerId,'reg:CTRL');assert.ok(query(graph,'reg:STAT').register!.segments.some(s=>s.kind==='unspecified'));assert.equal(graph.index.get('reg:CTRL.EN')!.type,'register-field');
 const raw=JSON.stringify(graph.index.get('reg:FULL')!.entity),svg=registerSVG(graph.index.get('reg:FULL')!.entity as Register,{project:graph.manifest.projectId});assert.match(svg,/0xFEDCBA9876543210/);assert.equal(JSON.stringify(graph.index.get('reg:FULL')!.entity),raw);const data=await compileBook(book),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;assert.match(page.html,/寄存器来源/);assert.match(page.html,/表达式：DEFAULT_MODE/);assert.match(page.html,/data-register-gap="unspecified"/);
});
test('表格链接与query返回同一目标，文本不重解析，本地目标与页内锚点严格校验',async t=>{
 const p=registerFixture(t),book=await p.load(),row=query(book.root.graph,'instance:UART0');assert.equal(row.cellLinks!.name.route.id,'reg:CTRL');assert.equal(row.cellLinks!.origin.route.kind,'pdf');assert.equal(row.cellLinks!.origin.route.target,'detail');assert.equal(row.cellLinks!.origin.sourceOwnerId,'reg:CTRL');assert.ok(row.cellLinks!.instance);const data=await compileBook(book);assert.match(Object.values(data.pages).find(p=>p.id==='docs/index')!.html,/>\*\*CTRL\*\*<\/a>/);
 const bad=structuredClone(registerData);bad.tables[0].rows[0].links.name.id='missing';await assert.rejects(registerFixture(t,bad).load(),/LINK_TARGET/);
 const anchor=structuredClone(registerData);anchor.tables[0].rows[1].links.name.anchor='bad-anchor';const missing=await registerFixture(t,anchor).load();assert.throws(()=>preflightBook(missing),/DOCUMENT_ANCHOR/);
});
test('重叠、越界、复位溢出、重复字段ID和错误链接类型明确拒绝',async t=>{
 for(const mutate of [(d:any)=>d.registers[0].fields[1].lsb=0,(d:any)=>d.registers[0].fields[0].msb=32,(d:any)=>d.registers[0].fields[0].reset={value:'0x2'},(d:any)=>d.registers[0].fields[1].id=d.registers[0].fields[0].id,(d:any)=>d.tables[0].rows[0].links.name.kind='javascript']){const data=structuredClone(registerData);mutate(data);await assert.rejects(registerFixture(t,data).load());}
});
test('链接严格校验、对象投影与安装版手册保留相同查询目标',async t=>{
 const {compileManual,manualQuery}=await import('../packages/core/manual.ts');const book=await registerFixture(t).load(),packed=JSON.parse(JSON.stringify(compileManual(book)));for(const id of ['instance:UART0','instance:UART1','reg:CTRL','reg:CTRL.EN','reg:FULL.DATA']){const actual=manualQuery(packed,id),expected=query(book.root.graph,id);assert.deepEqual(actual.cellLinks,expected.cellLinks);assert.deepEqual(actual.register,expected.register);assert.deepEqual(actual.registerField,expected.registerField);}
 for(const [target,code]of [[{kind:'source',id:'reg:STAT'},'LINK_SOURCE'],[{kind:'pdf',id:'original',target:'missing'},'LINK_ATTACHMENT'],[{kind:'page',id:'missing'},'LINK_PAGE']]as const){const data:any=structuredClone(registerData);data.tables[0].rows[0].links.name=target;await assert.rejects(registerFixture(t,data).load(),new RegExp(code));}
 const data:any=structuredClone(registerData);data.tables=[];data.tables.push({id:'field-projection',kind:'table',label:'投影',columns:[{field:'label',label:'字段',type:'string'}],rows:[{id:'projection-row',objectId:'reg:CTRL.MODE',links:{label:{kind:'entity',id:'reg:CTRL.MODE'}}}]});const projection=await registerFixture(t,data,`{% data-table id="field-projection" /%}`).load();assert.match(Object.values((await compileBook(projection)).pages)[0].html,/>MODE<\/a>/);
 const invalid:any=structuredClone(registerData);invalid.tables[0].rows[0].links.absent={kind:'entity',id:'reg:CTRL'};await assert.rejects(registerFixture(t,invalid).load(),/TABLE_LINK_COLUMN/);
});
test('空寄存器仅投影空洞，同页重复呈现不产生重复DOM身份',async t=>{
 const empty:any=structuredClone(registerData);empty.tables=[];empty.registers.push({id:'empty',kind:'register',label:'EMPTY',width:32,fields:[]});const body=`{% register-diagram id="empty" /%}\n{% register-field-table id="empty" /%}\n{% register-field-table id="reg:CTRL" /%}\n{% register-field-table id="reg:CTRL" /%}`;const book=await registerFixture(t,empty,body).load(),segments=query(book.root.graph,'empty').register!.segments;assert.deepEqual(segments,[{msb:31,lsb:0,kind:'unspecified',label:'未声明位'}]);const html=Object.values((await compileBook(book)).pages).find(p=>p.id==='docs/index')!.html,ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);assert.equal(book.root.graph.index.get('reg:CTRL.MODE')!.type,'register-field');assert.ok(!book.root.graph.index.has('empty:gap:31:0'));
});
