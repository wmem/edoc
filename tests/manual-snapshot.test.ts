import test from 'node:test';
import assert from 'node:assert/strict';
import {loadBook,resolveProjectConfig,readDocument,projectOutline,query} from '../packages/core/index.ts';
import {compileManual,manualRead,manualOutline,manualQuery} from '../packages/core/manual.ts';
import {readerFixture} from './reader-fixture.ts';
import {isAbsolute,relative} from 'node:path';

test('手册索引 JSON 往返保留目录、正文分页、多工程身份和真实关系',async t=>{
 const fixture=readerFixture(t),book=await loadBook(await resolveProjectConfig(fixture.root+'/edoc.config.js'));
 const packed=JSON.parse(JSON.stringify(compileManual(book)));
 for(const options of [{},{depth:0},{id:'system-intro',depth:1},{project:'fpga',id:'module',depth:1}]){
  assert.deepEqual(manualOutline(packed,options),projectOutline(book,options));
 }
 for(const node of book.projects.values())for(const record of node.graph.index.values())if(record.type==='document'){
  for(const scope of ['self','subtree'] as const){
   const expected=readDocument(node.graph,record.id,{scope,maxChars:100000});
   assert.deepEqual(manualRead(packed,record.id,{project:node.config.projectId,scope,maxChars:100000}),expected);
   const first=manualRead(packed,record.id,{project:node.config.projectId,scope,maxChars:5});
   if(first.range.truncated){const rest=manualRead(packed,record.id,{project:node.config.projectId,scope,offset:first.range.nextOffset!,maxChars:100000});assert.equal(first.content+rest.content,expected.content);}
  }
 }
 const node=[...book.projects.values()].find(p=>p.graph.connections.size)!;
 const id=[...node.graph.connections.keys()][0];
 const expected=query(node.graph,id,{depth:1});
 for(const record of [expected.target,...expected.expansion.items,...expected.references])if(isAbsolute(record.location.file))record.location={...record.location,file:relative(node.config.root,record.location.file)};
 assert.deepEqual(manualQuery(packed,id,{project:node.config.projectId,depth:1}),expected);
});

test('手册查询拒绝未知身份、错误类型、范围与跨工程歧义',async t=>{
 const fixture=readerFixture(t);fixture.write('board/docs/index.mdoc','{% section id="module" title="同名章节" %}板级正文。{% /section %}');
 const book=await loadBook(await resolveProjectConfig(fixture.root+'/edoc.config.js')),packed=compileManual(book);
 assert.throws(()=>manualRead(packed,'missing'),/QUERY_NOT_FOUND/);
 assert.throws(()=>manualOutline(packed,{project:'missing'}),/QUERY_NOT_FOUND/);
 assert.throws(()=>manualQuery(packed,'missing'),/QUERY_NOT_FOUND/);
 assert.throws(()=>manualOutline(packed,{id:'module'}),/OUTLINE_AMBIGUOUS/);
 assert.equal(manualOutline(packed,{project:'fpga',id:'module'}).chapters[0].label,'FPGA 概览');
 const node=[...book.projects.values()].find(p=>[...p.graph.index.values()].some(r=>r.type==='node'))!;
 const id=[...node.graph.index.values()].find(r=>r.type==='node')!.id;
 assert.throws(()=>manualRead(packed,id,{project:node.config.projectId}),/READ_TYPE/);
 const section=[...book.root.graph.index.values()].find(r=>r.type==='document')!.id;
 assert.throws(()=>manualRead(packed,section,{offset:-1}),/READ_OFFSET/);
 assert.throws(()=>manualRead(packed,section,{maxChars:0}),/READ_LIMIT/);
});
