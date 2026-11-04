import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync,existsSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {repository} from './helpers.ts';
import {readerFixture} from './reader-fixture.ts';

// 单独运行：覆盖安装产物、运行依赖与全局式 bin 调用，不修改全局 npm 环境。
test('实际 npm 包仅用 JS 即可执行命令、读取指南、离线构建并查询',{timeout:180000},t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-package-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const run=(command:string,args:string[],cwd=repository)=>{
  const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr||result.error?.message||'命令未成功退出');return result.stdout;
 };
 const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',root]))[0];
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/cli/edoc.js'));
 assert.ok(!packed.files.some((f:any)=>f.path.endsWith('.ts')),'安装包不依赖 TypeScript 源文件运行');
 const prefix=join(root,'prefix');run('npm',['install','--prefix',prefix,join(root,packed.filename),'--ignore-scripts','--omit=dev','--prefer-offline','--package-lock=false']);
 for(const name of ['playwright','@antv/x6','@fontsource/noto-sans-sc','vite'])assert.ok(!existsSync(join(prefix,'node_modules',name)),name+' 不属于运行依赖');
 assert.ok(!packed.files.some((f:any)=>f.path.startsWith('dist/packages/render-pdf/')));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/runtime/reader-true-true.js'));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/runtime/fonts/LICENSE'));
 const bin=join(prefix,'node_modules/.bin/edoc'),project=join(root,'project');mkdirSync(join(project,'docs'),{recursive:true});
 writeFileSync(join(project,'docs/edoc.config.js'),'export default {};');writeFileSync(join(project,'edoc.config.js'),"throw Error('不应默认读取项目根配置')");writeFileSync(join(project,'README.md'),'# 仓库介绍\n\n不进入默认正式文档。');writeFileSync(join(project,'docs/index.mdoc'),'# 安装包演示\n\n普通正文。');
 assert.match(run(bin,['--version'],project),/edoc 1/);assert.match(run(bin,['guide'],project),/edoc.config.js/);
 run(bin,[],project);assert.ok(existsSync(join(project,'output/index.html')));
 writeFileSync(join(project,'docs/index.mdoc'),'{% section id="installed:read" title="安装包章节" %}原始 **说明**。{% /section %}');
 const section=JSON.parse(run(bin,['read','--id','installed:read'],project));assert.match(section.content,/原始 \*\*说明\*\*/);assert.equal(section.scope,'self');
 assert.equal(JSON.parse(run(bin,['outline','--id','installed:read','--depth','0'],project)).chapters[0].sectionId,'installed:read');
 writeFileSync(join(project,'docs/a.mdoc'),'{% section id="installed:a" title="甲" %}A{% /section %}');writeFileSync(join(project,'docs/z.mdoc'),'{% section id="installed:z" title="乙" %}Z{% /section %}');
 writeFileSync(join(project,'docs/index.mdoc'),'{% section id="installed:read" title="安装包章节" %}\n{% directory-order items=["z.mdoc"] /%}\n普通说明。\n{% /section %}');
 assert.deepEqual(JSON.parse(run(bin,['outline'],project)).chapters.map((n:any)=>n.label),['安装包章节','乙','甲']);assert.match(JSON.parse(run(bin,['read','--id','installed:read'],project)).content,/directory-order/);run(bin,[],project);
 const api=run(process.execPath,['--input-type=module','-e',"import {Markdoc} from 'edoc'; console.log(typeof Markdoc.parse,typeof Markdoc.Tag)"],prefix);assert.match(api,/function function/);
 mkdirSync(join(project,'docs/_partials'),{recursive:true});writeFileSync(join(project,'docs/_partials/native.mdoc'),'{% section id="installed:native-part" %}片段 {% $product %} 第 {% $count %} 次{% /section %}');
 writeFileSync(join(project,'docs/edoc.config.js'),`export default {markdoc:{variables:{product:'安装包上下文',count:3},partials:{card:'docs/_partials/native.mdoc'}},tables:[{id:'installed:table',kind:'table',label:'安装包事实表',columns:[{field:'name',label:'名称',type:'string'}],rows:[{id:'installed:row',values:{name:'唯一事实'}}]}]};`);
 writeFileSync(join(project,'docs/index.mdoc'),'{% section id="installed:native" title="原生兼容" %}\n{% if true %}上下文 {% $product %}{% /if %}\n\n3. 起始值保留\n\n{% partial file="card" /%}\n\n{% table %}\n- 名称\n- 说明\n---\n- 原生表\n- 不需要 IR\n{% /table %}\n{% data-table id="installed:table" /%}\n{% code file="docs/_partials/native.mdoc" language="markdoc" /%}\n{% /section %}');
 assert.match(JSON.parse(run(bin,['read','--id','installed:native-part'],project)).content,/片段 安装包上下文 第 3 次/);run(bin,[],project);
 assert.match(JSON.parse(run(bin,['read','--id','installed:native'],project)).content,/```markdoc \{% process=false %\}/);
 const nativeHtml=readFileSync(join(project,'output/index.html'),'utf8');assert.match(nativeHtml,/安装包上下文/);assert.match(nativeHtml,/安装包事实表/);assert.match(nativeHtml,/start=\\"3/);
 mkdirSync(join(project,'docs/ir'),{recursive:true});writeFileSync(join(project,'docs/ir/facts.json'),JSON.stringify({objects:[{id:'a',kind:'node',label:'A'},{id:'b',kind:'node',label:'B'}],relations:[{id:'ab',kind:'connection',class:'data',endpoints:['a','b']}]}));
 writeFileSync(join(project,'docs/index.mdoc'),'{% relation-diagram id="overview" /%}');
 writeFileSync(join(project,'docs/edoc.config.js'),`export default {views:[{id:'overview',kind:'architecture',include:{objects:['a','b'],relations:['ab']}}]};`);
 const check=JSON.parse(run(bin,['validate','--format','json'],project));assert.deepEqual(check.dataFiles,['docs/ir/facts.json']);
 assert.equal(JSON.parse(run(bin,['query','--id','ab'],project)).target.entity.endpoints.length,2);
 run(bin,[],project);const content=readFileSync(join(project,'output/index.html'),'utf8');assert.match(content,/overview/);assert.match(content,/data:font/);
 run(bin,['export','--view','overview','--format','svg','--output','output/overview.svg'],project);assert.match(readFileSync(join(project,'output/overview.svg'),'utf8'),/<svg/);
 const composed=readerFixture(undefined,join(root,'composed'));run(bin,['--config',join(composed.root,'edoc.config.js')],project);const composedHtml=readFileSync(join(composed.root,'output/index.html'),'utf8');assert.match(composedHtml,/pdfWorker/);assert.match(composedHtml,/power-input|SCHEMATIC|schematic/);assert.ok(composedHtml.includes('fpga'));
 const failure=spawnSync(bin,['query','--id','missing'],{cwd:project,encoding:'utf8'});assert.equal(failure.status,3);
});

test('Git 打包执行 prepare 后可全局安装，最终安装无需开发依赖',{timeout:240000},t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-git-install-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const source=join(root,'source'),prefix=join(root,'global');mkdirSync(source);
 const run=(command:string,args:string[],cwd=source)=>{const r=spawnSync(command,args,{cwd,encoding:'utf8',timeout:180000});assert.equal(r.status,0,r.stderr||r.error?.message||'命令未成功退出');return r.stdout;};
 // 使用当前工作树建立独立 Git 快照，覆盖与 git+ssh 相同的 prepare/打包流程，不提交实际仓库。
 for(const name of ['package.json','package-lock.json','README.md','AGENTS.md','packages','docs','templates'])cpSync(join(repository,name),join(source,name),{recursive:true});
 mkdirSync(join(source,'scripts'));cpSync(join(repository,'scripts/build-package.mjs'),join(source,'scripts/build-package.mjs'));
 run('git',['init','--quiet']);run('git',['add','.']);run('git',['-c','user.name=edoc test','-c','user.email=edoc-test@example.invalid','commit','--quiet','-m','安装夹具']);
 const packed=JSON.parse(run('npm',['pack','git+file://'+source,'--json','--pack-destination',root,'--prefer-offline']))[0];
 run('npm',['install','--global','--prefix',prefix,join(root,packed.filename),'--omit=dev','--prefer-offline','--no-audit','--no-fund']);
 const installed=join(prefix,'lib/node_modules/edoc'),bin=join(prefix,'bin/edoc');
 for(const name of ['playwright','@antv/x6','@fontsource/noto-sans-sc','vite','typescript'])assert.ok(!existsSync(join(installed,'node_modules',name)),name+' 不应留在最终全局安装中');
 const project=join(root,'project');mkdirSync(join(project,'docs'),{recursive:true});writeFileSync(join(project,'docs/edoc.config.js'),'export default {};');writeFileSync(join(project,'docs/index.mdoc'),'# Git 安装生成\n\n中文正文。');
 assert.match(run(bin,['--version'],project),/edoc 1/);run(bin,[],project);assert.match(readFileSync(join(project,'output/index.html'),'utf8'),/Git 安装生成/);
 const fixture=readerFixture(undefined,join(root,'with-pdf'));run(bin,['--config',join(fixture.root,'edoc.config.js')],project);assert.match(readFileSync(join(fixture.root,'output/index.html'),'utf8'),/pdfWorker/);
});
