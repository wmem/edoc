import test from 'node:test';
import assert from 'node:assert/strict';
import {tableFilter,matchesTableFilter,compareTableCells} from '../packages/extensions/data-table/reading.ts';
import {tableFixture} from './table-controls-fixture.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {readDocument} from '../packages/core/read.ts';

test('按类型比较、缺失值与有效空值分开；筛选包含边界与JSON文本',()=>{
 const value=(text:string,missing=false)=>({text,missing});
 assert.ok(compareTableCells(value('2'),value('10'),'number','asc')<0);assert.ok(compareTableCells(value('U2'),value('U10'),'string','asc')<0);assert.ok(compareTableCells(value('false'),value('true'),'boolean','asc')<0);
 for(const direction of ['asc','desc'] as const)assert.ok(compareTableCells(value('unknown',true),value('0'),'number',direction)>0);
 const range=tableFilter({min:'0',max:'2'},'number');assert.ok(matchesTableFilter(value('0'),'number',range));assert.ok(matchesTableFilter(value('2'),'number',range));assert.ok(!matchesTableFilter(value('10'),'number',range));assert.ok(!matchesTableFilter(value('unknown',true),'number',range));
 assert.deepEqual(tableFilter({mode:'missing',min:'9',max:'2'},'number'),{mode:'missing',text:'',min:'',max:'',value:''});
 const missing=tableFilter({mode:'missing'},'string');assert.ok(matchesTableFilter(value('unknown',true),'string',missing));assert.ok(!matchesTableFilter(value('unknown'),'string',missing));assert.ok(!matchesTableFilter(value(''),'string',missing));
 assert.ok(matchesTableFilter(value('null'),'json',tableFilter({mode:'known',text:'NULL'},'json')));assert.ok(matchesTableFilter(value('false'),'boolean',tableFilter({value:'false'},'boolean')));
 assert.deepEqual(tableFilter({min:'bad',text:'unused'},'number'),{mode:'all',text:'',min:'',max:'',value:''});
});
test('渲染携带类型/缺失元数据与开关，重复表行无重复ID，read和IR不变',async t=>{
 const p=tableFixture(t),book=await p.load(),before=JSON.stringify(book.root.graph.index.get('T')!.entity),source=readDocument(book.root.graph,'table:home',{scope:'subtree'}).content,data=await compileBook(book),page=Object.values(data.pages).find(p=>p.id==='docs/index')!;
 assert.match(page.html,/<col data-field="value" data-type="number">/);assert.match(page.html,/data-sortable="false" data-filterable="false"/);assert.match(page.html,/<td>false<\/td>/);assert.match(page.html,/<td>0<\/td>/);assert.match(page.html,/<td>null<\/td>/);assert.match(page.html,/<tr id="ed-7234" data-missing="1,2,3,4">/);
 const ids=[...page.html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);assert.equal(JSON.stringify(book.root.graph.index.get('T')!.entity),before);assert.equal(readDocument(book.root.graph,'table:home',{scope:'subtree'}).content,source);
 p.write('docs/index.mdoc','{% data-table id="T" sortable="yes" /%}');await assert.rejects(p.load(),/DOCUMENT_TAG/);
});
