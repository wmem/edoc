import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {repository} from './helpers.ts';
import {readerFixture} from './reader-fixture.ts';

// 单独运行：覆盖安装产物、运行依赖与全局式 bin 调用，不修改全局 npm 环境。
test('实际 npm 包仅用 JS 即可执行命令、读取指南、离线构建并查询',{timeout:180000},t=>{
 const root=mkdtempSync(join(tmpdir(),'engdoc-package-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const run=(command:string,args:string[],cwd=repository)=>{
  const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr||result.error?.message||'命令未成功退出');return result.stdout;
 };
 const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',root]))[0];
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/cli/engdoc.js'));
 assert.ok(!packed.files.some((f:any)=>f.path.endsWith('.ts')),'安装包不依赖 TypeScript 源文件运行');
 const prefix=join(root,'prefix');run('npm',['install','--prefix',prefix,join(root,packed.filename),'--ignore-scripts','--omit=dev','--prefer-offline','--package-lock=false']);
 const bin=join(prefix,'node_modules/.bin/engdoc'),project=join(root,'project');mkdirSync(project);
 writeFileSync(join(project,'engdoc.config.js'),'export default {};');writeFileSync(join(project,'README.md'),'# 安装包演示\n\n普通正文。');
 assert.match(run(bin,['--version'],project),/EngDoc 1/);assert.match(run(bin,['guide'],project),/engdoc.config.js/);
 run(bin,[],project);assert.ok(existsSync(join(project,'output/index.html')));
 writeFileSync(join(project,'README.md'),'{% section id="installed:read" title="安装包章节" %}原始 **说明**。{% /section %}');
 const section=JSON.parse(run(bin,['read','--id','installed:read'],project));assert.match(section.content,/原始 \*\*说明\*\*/);assert.equal(section.scope,'self');
 mkdirSync(join(project,'docs/ir'),{recursive:true});writeFileSync(join(project,'docs/ir/facts.json'),JSON.stringify({objects:[{id:'a',kind:'node',label:'A'},{id:'b',kind:'node',label:'B'}],relations:[{id:'ab',kind:'connection',class:'data',endpoints:['a','b']}]}));
 writeFileSync(join(project,'README.md'),'{% diagram id="overview" /%}');
 writeFileSync(join(project,'engdoc.config.js'),`export default {views:[{id:'overview',kind:'architecture',include:{objects:['a','b'],relations:['ab']}}]};`);
 const check=JSON.parse(run(bin,['validate','--format','json'],project));assert.deepEqual(check.dataFiles,['docs/ir/facts.json']);
 assert.equal(JSON.parse(run(bin,['query','--id','ab'],project)).target.entity.endpoints.length,2);
 run(bin,[],project);const content=readFileSync(join(project,'output/index.html'),'utf8');assert.match(content,/overview/);assert.match(content,/data:font/);
 run(bin,['export','--view','overview','--format','svg','--output','output/overview.svg'],project);assert.match(readFileSync(join(project,'output/overview.svg'),'utf8'),/<svg/);
 const composed=readerFixture(undefined,join(root,'composed'));run(bin,['--config',join(composed.root,'engdoc.config.js')],project);const composedHtml=readFileSync(join(composed.root,'output/index.html'),'utf8');assert.match(composedHtml,/pdfWorker/);assert.match(composedHtml,/power-input|SCHEMATIC|schematic/);assert.ok(composedHtml.includes('fpga'));
 const failure=spawnSync(bin,['query','--id','missing'],{cwd:project,encoding:'utf8'});assert.equal(failure.status,3);
});
