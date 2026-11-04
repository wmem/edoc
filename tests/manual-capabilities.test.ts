import Markdoc from '@markdoc/markdoc';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {readDocument,query} from '../packages/core/index.ts';
import {compileBook} from '../packages/pack-html/book.ts';
import {tags} from '../packages/core/documents.ts';
import {repository} from './helpers.ts';

const manual=loadBook(await resolveProjectConfig(join(repository,'docs/edoc.config.js')));
const json=(file:string)=>JSON.parse(readFileSync(join(repository,file),'utf8'));
test('公共展示字段在正式参考有入口，能力清单的教程、参考与例子均指向真实小节',async()=>{
 const book=await manual,graph=book.root.graph;
 const content=(id:string)=>readDocument(graph,id,{scope:'subtree',maxChars:100000}).content;
 const check=(fields:string[],id:string)=>{const text=content(id);for(const field of fields)assert.ok(new RegExp('\\b'+field+'\\b').test(text),id+' 缺少字段 '+field);};
 const view=json('packages/extensions/relation-diagram/view.schema.json').properties.views.items.properties;
 const objects=json('packages/extensions/relation-diagram/object.schema.json').properties.objects.items.oneOf;
 for(const object of objects)check(Object.keys(object.properties),'ref:objects');
 check(Object.keys(objects[0].properties.interfaces.items.properties),'ref:interfaces');
 check(Object.keys(json('packages/schema/common.schema.json').$defs.port.properties),'ref:objects');
 check(Object.keys(json('packages/extensions/relation-diagram/relation.schema.json').properties.relations.items.properties),'ref:connections');
 const waveform=json('packages/extensions/waveform/waveform.schema.json').properties.waveforms.items.properties;
 check(Object.keys(waveform),'ref:waveforms');check(Object.keys(waveform.data.properties),'ref:waveforms');
 check(Object.keys(view),'ref:graph');check(Object.keys(view.include.properties),'ref:graph');
 check(Object.keys(view.layout.properties),'ref:graph-layout');check(Object.keys(view.display.properties),'ref:graph-display');
 check(Object.keys(view.layout.properties.positions.items.properties),'ref:graph-layout');
 for(const rule of view.layout.properties.constraints.items.oneOf)check(Object.keys(rule.properties),'ref:graph-layout');
 check(Object.keys(view.layout.properties.relationHints.additionalProperties.properties),'ref:relation-hints');
 const table=json('packages/extensions/data-table/table.schema.json').properties.tables.items.properties;
 check(Object.keys(table),'ref:tables');check(Object.keys(table.columns.items.properties),'ref:tables');
 for(const row of table.rows.items.oneOf)check(Object.keys(row.properties),'ref:tables');
 for(const [name,tag]of Object.entries(tags))check(Object.keys(tag.attributes??{}),['section','columns','panel','tabs','tab'].includes(name)?'ref:markdoc-structure':['reference','page','attachment'].includes(name)?'ref:markdoc-links':['include','code'].includes(name)?'ref:markdoc-files':'ref:tag-'+name);
 const document=book.root.documents.documents.find(d=>d.file==='docs/usage/reference/capabilities.mdoc')!;
 let rows=0;
 for(const table of [...document.ast.walk()].filter(n=>n.type==='table'))for(const row of [...table.walk()].filter(n=>n.type==='tr')){
  const cells=row.children.filter((n:any)=>n.type==='td');if(!cells.length)continue;assert.equal(cells.length,4);rows++;
  for(const cell of cells.slice(1)){
   const links=[...cell.walk()].filter(n=>n.type==='link');assert.equal(links.length,1);
   const [file,id]=links[0].attributes.href.split('#');assert.ok(id,'能力入口应可定位小节');
   const entry=graph.index.get(id);assert.equal(entry?.type,'document',id);
   assert.equal(resolve(repository,entry!.entity.source!.file),resolve(repository,dirname(document.file),file),id+' 指向了其他文件的同名章节');
  }
 }
 assert.ok(rows>=20);assert.match(content('use:capabilities:gaps'),/polyline/);assert.match(content('ref:graph-routing'),/待修复/);
 // 字段名与链接覆盖只是防遗漏，不替代下面的独立配方和浏览器阅读验证。
});

test('新增表格、页面和图形配方可分别在空工程运行，事实与接口状态正确',{timeout:60000},async t=>{
 const book=await manual,graph=book.root.graph;
 const blocks=(id:string,language:string)=>[...Markdoc.parse(readDocument(graph,id,{maxChars:100000}).content).walk()].filter(node=>node.type==='fence'&&node.attributes.language===language).map(node=>node.attributes.content);
 const one=(id:string,language:string)=>{const values=blocks(id,language);assert.equal(values.length,1,id);return values[0];};
 async function create(name:string,config:string,data:string|undefined,body:string,files:Record<string,string|Buffer>={}){
  const root=mkdtempSync(join(tmpdir(),'edoc-'+name+'-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const write=(file:string,text:string|Buffer)=>{mkdirSync(dirname(join(root,file)),{recursive:true});writeFileSync(join(root,file),text);};
  write('docs/edoc.config.js',config);write('docs/index.mdoc',body);if(data)write('docs/ir/facts.json',data);
  for(const [file,text]of Object.entries(files))write(file,text);
  const loaded=await loadBook(await resolveProjectConfig(undefined,root)),compiled=await compileBook(loaded);return {book:loaded,page:Object.values(compiled.pages)[0]};
 }
 const table=await create('tables',"export default {};",one('use:table-values','json'),one('use:table-values','text'));
 assert.match(table.page.html,/<th>频率 \(Hz\)<\/th>/);assert.match(table.page.html,/<td>false<\/td>/);assert.match(table.page.html,/<td>unknown<\/td>/);assert.match(table.page.html,/<td>\*\*普通文本\*\*<\/td>/);
 assert.equal((query(table.book.root.graph,'author:settings:low').target.entity as any).values.rate,20);
 const layout=await create('pages',"export default {};",undefined,one('use:page-layout-create','markdoc'));
 assert.equal(layout.book.root.graph.index.get('layout:details')?.type,'document');assert.match(layout.page.html,/class="tabs"/);assert.match(layout.page.html,/<details id=/);
 assert.ok(!readDocument(layout.book.root.graph,'layout:home').content.includes('这里保存按需读取的字段说明'));assert.match(readDocument(layout.book.root.graph,'layout:details').content,/字段说明/);
 const graphs=await create('graphs',one('use:graph-options-create','javascript'),one('use:graph-options-create','json'),one('use:graph-options-create','text'));
 assert.equal(Object.keys(graphs.page.scenes).length,4);assert.match(graphs.page.html,/class="interface-overview"/);
 const scene=graphs.page.scenes['author:interface-override'];assert.equal(scene.interfaces!.filter(i=>i.expanded).length,1);
 const node=scene.nodes.find(n=>n.id==='author:host')!,members=node.ports.filter(p=>p.interfaceId==='author:host.ctrl'&&!p.interfaceHeader&&!p.slot);
 assert.deepEqual(members.map(p=>p.label),['READY','COMMAND']);assert.ok(members.every(p=>p.side==='right'));
 assert.deepEqual(graphs.page.scenes['author:group-overview'].collapsedGroups,['author:workers']);
 // 教程拆页以后，读者仍能单独复制一种能力，不依赖前面章节或仓库 Gallery。
 const minimal="export default {};";
 for(const [name,id,view]of [['interfaces','use:interface-create','simple:stream'],['wiring','use:wiring','wire:overview'],['states','use:state','author:state']]as const){
  const sample=await create(name,minimal,one(id,'json'),one(id,'text'));
  assert.ok(sample.page.scenes[view],id+' 的完整图形配方必须独立构建');
  if(name==='interfaces'){assert.equal(sample.page.scenes[view].nets.length,1);assert.equal(sample.page.scenes[view].nets[0].sourceRelations?.length,2);}
  if(name==='wiring')assert.equal((query(sample.book.root.graph,'wire:clock').target.entity as any).endpoints.length,3);
  if(name==='states')assert.equal(sample.page.scenes[view].nets.length,2);
 }
 const wave=await create('waveform',minimal,one('use:waveform-create','json'),one('use:waveform-create','text'));assert.match(wave.page.html,/最小握手示意/);
 const native=await create('native',one('use:markdoc:variables','javascript'),undefined,one('use:markdoc:variables','text'));assert.match(native.page.html,/我的工程/);assert.match(native.page.html,/展示完整说明/);assert.ok(!native.page.html.includes('展示简略说明'));
 const partial=await create('native-partial',one('use:markdoc:partials','javascript'),undefined,one('use:markdoc:partials','text'),{'docs/_partials/card.mdoc':readFileSync(join(repository,'docs/support/recipes/_partials/markdoc-card.mdoc'))});assert.match(readDocument(partial.book.root.graph,'term:shared').content,/共享术语/);assert.match(partial.page.html,/我的工程/);
 const functions=await create('native-functions',one('use:markdoc:functions','javascript'),undefined,one('use:markdoc:functions','text'));assert.match(functions.page.html,/EDOC/);
 const markdown=await create('markdown',minimal,undefined,one('use:markdown:create','markdown'));assert.match(markdown.page.html,/<strong>重点<\/strong>/);assert.match(markdown.page.html,/<blockquote>/);assert.match(markdown.page.html,/<ol>/);assert.deepEqual(Object.keys(markdown.page.scenes),[]);
 const pdf=await create('attachments',one('use:pdf-create','javascript'),undefined,one('use:pdf-create','text'),{'source/reference.pdf':readFileSync(join(repository,'docs/assets/location.pdf'))});assert.equal(pdf.book.root.graph.attachments!.reference.targets.home.page,1);assert.match(pdf.page.html,/attachment-link/);
});
