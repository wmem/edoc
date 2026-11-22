import test from 'node:test';
import assert from 'node:assert/strict';
import {registerPresentationId,planRegisterPresentations} from '../packages/extensions/register/presentation.ts';
import {registerDiagramHTML,registerSVG} from '../packages/extensions/register/render.ts';
import type {Register} from '../packages/core/types.ts';
import {registerFixture,registerData} from './register-fixture.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {namespaceResourceBody} from '../packages/core/resource-body.ts';
import {resourcePage} from '../packages/doc-theme/resource-page.ts';
import {resourceContext} from '../packages/core/resource-pages.ts';
import {addressBookFixture,region,entry} from './address-book-fixture.ts';

test('显式呈现身份不依赖邻接、图表顺序或项目同名，默认歧义不猜配对',()=>{
 const requests=[{node:'diagram-A',kind:'diagram' as const,register:'reg',scope:'page',name:'A'},{node:'diagram-B',kind:'diagram' as const,register:'reg',scope:'page',name:'B'},{node:'table-B',kind:'table' as const,register:'reg',scope:'page',name:'B'},{node:'table-A',kind:'table' as const,register:'reg',scope:'page',name:'A'}];
 const result=planRegisterPresentations('ip',requests);assert.equal(result.get('diagram-A'),result.get('table-A'));assert.equal(result.get('diagram-B'),result.get('table-B'));assert.notEqual(result.get('diagram-A'),result.get('diagram-B'));
 assert.deepEqual([...result].sort(),[...planRegisterPresentations('ip',requests.toReversed())].sort());assert.notEqual(registerPresentationId('p1','r'),registerPresentationId('p2','r'));
 const ambiguous=planRegisterPresentations('ip',requests.map(r=>({...r,name:undefined})));assert.equal(new Set(ambiguous.values()).size,4);
 assert.throws(()=>planRegisterPresentations('ip',[requests[0],{...requests[0],node:'duplicate'}]),/REGISTER_PRESENTATION/);assert.throws(()=>planRegisterPresentations('ip',[{...requests[0],name:''}]),/REGISTER_PRESENTATION/);
});

test('标签生成非相邻显式配对和可聚焦字段行，只有查看详情链接进入字段实体',async t=>{
 const body=`{% register-diagram id="reg:CTRL" presentation="A" /%}\n{% register-diagram id="reg:CTRL" presentation="B" /%}\n一段普通正文。\n{% register-field-table id="reg:CTRL" presentation="B" /%}\n{% register-field-table id="reg:CTRL" presentation="A" /%}`;
 const data=await compileBook(await registerFixture(t,{...registerData,tables:[]},body).load()),html=Object.values(data.pages)[0].html;
 const diagrams=[...html.matchAll(/<figure[^>]+data-register-presentation="([^"]+)"/g)].map(m=>m[1]),tables=[...html.matchAll(/<div class="data-table register-field-table"[^>]+data-register-presentation="([^"]+)"/g)].map(m=>m[1]);
 assert.deepEqual(diagrams,tables.toReversed());assert.equal(new Set(diagrams).size,2);assert.match(html,/data-register-field-row="reg:CTRL.EN" tabindex="-1"/);
 assert.match(html,/class="register-field-detail-link"[^>]+aria-label="MODE 查看详情"/);assert.doesNotMatch(html,/<a[^>]*data-register-field=/);assert.match(html,/<button[^>]+data-register-field=/);
 const ids=[...html.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
});

test('自动虚拟页图表共享显式 identity，绑定作者副本有独立呈现命名空间',async t=>{
 const b=await addressBookFixture(t,true).load(),page=resourcePage(resourceContext(b.root.graph),{kind:'resource',project:'address-v2-composed',id:'soc:apb',view:'instance',segments:[region('uart0'),entry('ctrl')],mountId:'demo:apb'},(await compileBook(b)).resourceBodies);
 const ids=[...page.html.matchAll(/data-register-presentation="([^"]+)"/g)].map(m=>m[1]);assert.equal(ids.length,2);assert.equal(ids[0],ids[1]);
 const html=registerDiagramHTML(registerData.registers[0] as Register,'ip','pair')+'<div data-register-presentation="pair" data-table="register-field-table:pair"></div>',body={project:'ip',page:'docs/index',sectionId:'usage',html,outline:[],scenes:{}},binding:any={source:{projectId:'ip',file:'docs/index.mdoc',line:1}},route:any={kind:'resource',project:'soc',id:'space',view:'definition'};
 const a=namespaceResourceBody(body,binding,route,0),c=namespaceResourceBody(body,binding,route,1),extract=(text:string)=>[...text.matchAll(/data-register-presentation="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(extract(a.html)).size,1);assert.notEqual(extract(a.html)[0],extract(c.html)[0]);assert.match(a.html,/data-register-project="ip"/);
});

test('独立 SVG 保留项目、字段 ID、来源与精确值，完全不依赖 HTML DOM 或路由',()=>{
 const register=registerData.registers[0] as Register,svg=registerSVG(register,{project:'source-ip'}),inline=registerDiagramHTML(register,'source-ip','pair');
 assert.match(svg,/data-register-field="reg:CTRL.EN"/);assert.match(svg,/source-ip/);assert.match(svg,/contract.txt/);assert.doesNotMatch(svg,/href=|presentation|role="button"|tabindex=/);assert.match(inline,/role="button" tabindex="0"/);assert.doesNotMatch(inline,/#edoc=/);
});
