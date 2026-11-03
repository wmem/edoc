import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,existsSync,readdirSync,statSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {resolveProjectConfig,loadProject,protectOutputs} from '../packages/core/project.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {scene} from '../packages/render-graph/index.ts';
import {loadBook} from '../packages/core/book.ts';
import {query} from '../packages/core/query.ts';
import {repository} from './helpers.ts';

function project(t:{after:(fn:()=>void)=>void},source='export default {};'){
 const root=mkdtempSync(join(tmpdir(),'edoc-project-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,value:string|unknown)=>{mkdirSync(resolve(root,file,'..'),{recursive:true});writeFileSync(join(root,file),typeof value==='string'?value:JSON.stringify(value,null,2));};
 write('docs/edoc.config.js',source);write('README.md','# 项目说明\n正文。');
 return {root,write,config:()=>resolveProjectConfig(undefined,root),load:async()=>loadProject(await resolveProjectConfig(undefined,root))};
}
const facts={objects:[{id:'a',kind:'node',label:'A'},{id:'b',kind:'node',label:'B'}],relations:[{id:'ab',kind:'connection',class:'data',label:'数据流',endpoints:['a','b']}]};
const view={id:'v',kind:'architecture',include:{objects:['a','b'],relations:['ab']}};
const cli=(root:string,args:string[]=[])=>spawnSync(process.execPath,[join(repository,'packages/cli/edoc.ts'),...args],{cwd:root,encoding:'utf8',timeout:20000});
test('空 JS 配置支持纯正文，无 docs/ir/manifest/额外清单，默认值可直接构建',async t=>{
 const p=project(t),config=await p.config();assert.equal(config.file,join(p.root,'docs/edoc.config.js'));assert.equal(config.root,p.root);assert.equal(config.data,'docs/ir');assert.equal(config.title,p.root.split('/').at(-1));assert.deepEqual(config.documents,['README.md']);assert.equal(config.outputs[0].file,join(p.root,'output/index.html'));assert.equal(config.outputs.length,1);
 const loaded=await p.load();assert.equal(loaded.dataFiles.length,0);assert.equal(loaded.graph.connections.size,0);assert.equal(existsSync(join(p.root,'manifest.json')),false);
 const r=cli(p.root);assert.equal(r.status,0,r.stderr);assert.match(readFileSync(join(p.root,'output/index.html'),'utf8'),/项目说明/);assert.equal(JSON.parse(readFileSync(join(p.root,'.edoc-build/build-status.json'),'utf8')).success,true);
});
test('显式配置覆盖发现规则，相对输入与输出以该配置目录为准',async t=>{
 const p=project(t);p.write('other/custom.js',`export default {title:'指定项目',documents:'book.mdoc',output:{html:'publish/book.html'}}`);p.write('other/book.mdoc','正文');
 const config=await resolveProjectConfig('other/custom.js',p.root);assert.equal(config.root,join(p.root,'other'));assert.equal(config.outputs[0].file,join(p.root,'other/publish/book.html'));
 const r=cli(p.root,['--config','other/custom.js']);assert.equal(r.status,0,r.stderr);assert.ok(existsSync(config.outputs[0].file));assert.ok(!existsSync(join(p.root,'output/index.html')));
});
test('配置不向父目录查找，也不回退另一份配置',async t=>{
 const p=project(t);mkdirSync(join(p.root,'child'));await assert.rejects(()=>resolveProjectConfig(undefined,join(p.root,'child')),/CONFIG_MISSING/);await assert.rejects(()=>resolveProjectConfig('missing.js',p.root),/指定的配置文件不存在/);
 p.write('edoc.config.js',"throw Error('禁止默认回退根配置')");assert.equal((await p.config()).root,p.root);rmSync(join(p.root,'docs/edoc.config.js'));await assert.rejects(p.config,/docs\/edoc.config.js/);
});
test('标准 docs 配置的默认与显式入口一致，相对 import 仍以配置自身为准',async t=>{
 const p=project(t);p.write('docs/local-data.mjs',`export const values=${JSON.stringify(facts)};`);p.write('docs/edoc.config.js',"import {values} from './local-data.mjs'; export default {data:context=>{if(!context.root.endsWith('"+p.root.split('/').at(-1)+"'))throw Error('错误工程根');return values;}};");
 const implicit=await p.config(),explicit=await resolveProjectConfig('docs/edoc.config.js',p.root);assert.equal(implicit.root,explicit.root);assert.deepEqual(implicit.outputs,explicit.outputs);assert.ok(implicit.configInputs.includes(join(p.root,'docs/local-data.mjs')));assert.equal((await p.load()).graph.index.get('a')!.entity.label,'A');
 p.write('docs/edoc.config.mjs','export default {};');assert.equal((await resolveProjectConfig('docs/edoc.config.mjs',p.root)).root,p.root);
 p.write('docs/edoc.config.cjs','module.exports = {};');assert.equal((await resolveProjectConfig('docs/edoc.config.cjs',p.root)).root,p.root);
 p.write('docs/custom.js',"export default {documents:'local.mdoc'};");p.write('docs/local.mdoc','自定义配置目录正文');assert.equal((await resolveProjectConfig('docs/custom.js',p.root)).root,join(p.root,'docs'));
});
test('子工程标准配置位于 docs 时，自动扫描边界覆盖其整个工程且仍可独立构建',async t=>{
 const p=project(t,`export default {projectId:'parent',documents:'.',children:{child:'child/docs/edoc.config.js'}};`);
 p.write('child/docs/edoc.config.js',"throw Error('未接入不能执行子配置')");p.write('child/overview.mdoc','# 子工程根部说明');p.write('child/docs/index.mdoc','# 子工程正文\n\n[根部说明](../overview.mdoc)');p.write('child/docs/ir/facts.json',{objects:[{id:'child-only',kind:'node',label:'子工程事实'}]});
 assert.ok((await p.load()).documents.files.every(file=>!file.startsWith('child/')));
 p.write('child/docs/edoc.config.js',"export default {projectId:'child'};");p.write('README.md','{% section id="parent" title="父工程" %}\n\n{% include project="child" /%}\n\n{% /section %}');
 const combined=await loadBook(await p.config());assert.equal(combined.projects.get('child')!.config.root,join(p.root,'child'));assert.ok(!combined.root.graph.index.has('child-only'));assert.ok(combined.projects.get('child')!.graph.index.has('child-only'));assert.ok(combined.projects.get('child')!.documents.files.includes('overview.mdoc'));
 const independent=await loadBook(await resolveProjectConfig(undefined,join(p.root,'child')));assert.deepEqual([...independent.projects.keys()],['child']);assert.ok(independent.root.graph.index.has('child-only'));
});
test('先扫描全部正文，包括 include/折叠/Tabs，再调用数据提供函数',async t=>{
 const p=project(t,`export default {documents:'docs/index.mdoc',data:({root,references})=>{if(references.length!==2)throw Error('引用不完整');return ${JSON.stringify(facts)};},views:[${JSON.stringify(view)}]};`);
 p.write('docs/index.mdoc','{% include file="docs/nested.mdoc" /%}');p.write('docs/nested.mdoc','{% section id="hidden" title="折叠" collapsed=true %}{% tabs %}{% tab name="图" %}{% diagram id="v" /%}{% reference id="a" /%}{% /tab %}{% /tabs %}{% /section %}');
 const loaded=await p.load();assert.equal(loaded.documents.references.length,2);assert.deepEqual(loaded.documents.files,['docs/index.mdoc','docs/nested.mdoc']);assert.equal(query(loaded.graph,'ab').target.entity.id,'ab');
 p.write('docs/nested.mdoc','{% include file="docs/missing.mdoc" /%}');await assert.rejects(p.load,/FILE_MISSING/);
});
test('文档缺失或 include 循环在读取数据前失败',async t=>{
 const p=project(t,`export default {data:()=>{throw Error('不应执行数据提供函数')}};`);p.write('README.md','{% include file="missing.mdoc" /%}');await assert.rejects(p.load,error=>String(error).includes('FILE_MISSING')&&!String(error).includes('不应执行'));
 p.write('README.md','{% include file="README.md" /%}');await assert.rejects(p.load,/DOCUMENT_INCLUDE_CYCLE/);
});
test('自动发现 docs/ir 下多级 IR，无清单也能建立完整关系及来源索引',async t=>{
 const p=project(t,`export default {views:[${JSON.stringify(view)}]};`);p.write('README.md','{% diagram id="v" /%}');p.write('docs/ir/nested/objects.json',{objects:facts.objects});p.write('docs/ir/relations.ir.json',{irVersion:'1.2',relations:facts.relations});p.write('docs/ir/source-not-ir.json',{notes:'不是配置清单或 IR'});
 p.write('docs/ir/raw-array.json',[1,2]);p.write('data/unrelated.json','{不是本次数据目录');
 const loaded=await p.load();assert.equal(loaded.dataFiles.length,2);assert.equal(loaded.graph.connections.get('ab')!.endpoints.length,2);assert.equal(loaded.documents.references[0].id,'v');assert.equal(loaded.graph.index.get('a')!.location.file,join(p.root,'docs/ir/nested/objects.json'));
});
test('缺失的正文数据引用报告实际文件、行号和 ID，不猜文件名',async t=>{
 const p=project(t);p.write('README.md','第一行\n\n{% diagram id="missing:diagram" /%}');await assert.rejects(p.load,(error:any)=>error.diagnostics.some((d:any)=>d.code==='DOCUMENT_REFERENCE'&&d.file==='README.md'&&d.path==='#L3'&&d.id==='missing:diagram'));
});
test('配置直接定义图表，无第二份配置 JSON，只有被正文引用的视图生成 Scene',async t=>{
 const bad={...view,id:'unused',layout:{positions:[{objectId:'a',x:0,y:0},{objectId:'b',x:900,y:0}],constraints:[{type:'align',axis:'x',nodes:['a','b']}]}};
 const p=project(t,`export default {data:${JSON.stringify(facts)},views:[${JSON.stringify(view)},${JSON.stringify(bad)}]};`);p.write('README.md','{% diagram id="v" /%}');
 const {graph}=await p.load(),before=JSON.stringify([...graph.index]);const rendered=await renderDocument(graph,'按需图');assert.deepEqual(Object.keys(rendered.scenes),['v']);assert.equal(JSON.stringify([...graph.index]),before);await assert.rejects(()=>scene(graph,'unused'),/LAYOUT_CONFLICT/);assert.ok(rendered.entities.unused,'未布局的对象仍可查询和搜索');
});
test('接口与布局约束能力自动按实际结构启用',async t=>{
 const p=project(t,`export default {data:{objects:[{id:'n',kind:'node',label:'N',ports:[{id:'p',label:'P',direction:'unknown'}],interfaces:[{id:'if',label:'IF',members:['p']}]}]},views:[{id:'v',kind:'interface',include:{objects:['n'],relations:[]},layout:{constraints:[]}}]};`);
 p.write('README.md','{% interface id="if" /%}');const {graph}=await p.load();assert.ok(graph.manifest.requiredFeatures!.includes('interface-groups'));assert.ok(graph.manifest.requiredFeatures!.includes('layout-intent'));
});
for(const [name,source,code]of [
 ['拼错配置项',`export default {documnts:'README.md'};`,'CONFIG_FIELD'],
 ['数据路径数组错误',`export default {data:[1]};`,'CONFIG_TYPE'],
 ['未知输出格式',`export default {output:{htlm:'x.html'}};`,'CONFIG_FIELD'],
 ['显式数据文件缺失',`export default {data:'missing.json'};`,'FILE_MISSING'],
 ['不支持的数据能力',`export default {data:{objects:[],requiredFeatures:['future-only']}};`,'IR_FEATURE'],
 ['对象引用不完整',`export default {data:{relations:[{id:'broken',kind:'connection',class:'data',endpoints:['a','b']}]}};`,'REFERENCE_MISSING']
] as const)test(name+' 明确失败',async t=>{const p=project(t,source);await assert.rejects(p.load,new RegExp(code));});
test('自动数据扫描拒绝路径/符号链接逃逸，图表 schema 仍严格',async t=>{
 const p=project(t);const outside=mkdtempSync(join(tmpdir(),'edoc-outside-'));t.after(()=>rmSync(outside,{recursive:true,force:true}));mkdirSync(join(p.root,'docs/ir'),{recursive:true});writeFileSync(join(outside,'facts.json'),JSON.stringify(facts));symlinkSync(outside,join(p.root,'docs/ir/link'));await assert.rejects(p.load,/PATH_SCOPE/);
 rmSync(join(p.root,'docs/ir/link'));p.write('docs/ir/bad.json',{objects:[{id:'n',kind:'node',label:'N',typo:true}]});await assert.rejects(p.load,/SCHEMA/);
});
test('读取不改变输入，重复加载使用当前文件内容，不用内容 hash',async t=>{
 const p=project(t);p.write('docs/ir/design.json',facts);const file=join(p.root,'docs/ir/design.json'),before=statSync(file).mtimeMs;await p.load();assert.equal(statSync(file).mtimeMs,before);p.write('docs/ir/design.json',{...facts,objects:[{...facts.objects[0],label:'更新名称'},facts.objects[1]]});assert.equal((await p.load()).graph.index.get('a')!.entity.label,'更新名称');
});
test('批量端口的重复来源每轮只定位一次，新一轮仍拒绝符号链接逃逸',async t=>{
 const p=project(t);p.write('source.dat','原始输入');
 p.write('docs/ir/design.json',{objects:[{id:'n',kind:'node',label:'N',source:{file:'source.dat'},ports:Array.from({length:2000},(_,i)=>({id:'n.p'+i,label:'P'+i,direction:'unknown',source:{file:'source.dat'}}))}]});
 const original=fs.realpathSync;let calls=0;
 fs.realpathSync=((...args:any[])=>{if(String(args[0])===join(p.root,'source.dat'))calls++;return Reflect.apply(original,fs,args);})as typeof fs.realpathSync;syncBuiltinESMExports();
 try{
  const result=await p.load();assert.equal(result.graph.index.size,2001);assert.equal(result.inputs.filter(file=>file===join(p.root,'source.dat')).length,1);assert.equal(calls,2,'输入收集与语义校验各定位一次，不按端口重复文件系统检查');
  const outside=mkdtempSync(join(tmpdir(),'edoc-source-outside-'));t.after(()=>rmSync(outside,{recursive:true,force:true}));writeFileSync(join(outside,'data'),'外部文件');
  rmSync(join(p.root,'source.dat'));symlinkSync(join(outside,'data'),join(p.root,'source.dat'));await assert.rejects(p.load,/PATH_SCOPE/);
 }finally{fs.realpathSync=original;syncBuiltinESMExports();}
});
test('输出不能覆盖配置或任何已定位源文件',async t=>{
 const p=project(t);assert.throws(()=>protectOutputs([{file:join(p.root,'README.md')}],[join(p.root,'README.md')]),/OUTPUT_SOURCE/);assert.throws(()=>protectOutputs([{file:'same'},{file:'same'}],[]),/OUTPUT_DUPLICATE/);
 symlinkSync(join(p.root,'README.md'),join(p.root,'alias.html'));assert.throws(()=>protectOutputs([{file:join(p.root,'alias.html')}],[join(p.root,'README.md')]),/OUTPUT_SOURCE/);
 const pending=join(p.root,'output/index.html.pending');p.write('output/index.html.pending','独立用户文件');const r=cli(p.root);assert.equal(r.status,0,r.stderr);assert.equal(readFileSync(pending,'utf8'),'独立用户文件');
});
test('CJS 工程中的 .js 配置也能直接 export default，无需项目安装辅助函数',async t=>{
 const p=project(t);p.write('package.json',{type:'commonjs'});assert.equal((await p.config()).documents[0],'README.md');
});
