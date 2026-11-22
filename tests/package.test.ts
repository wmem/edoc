import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readFileSync,mkdirSync,existsSync,cpSync,chmodSync} from 'node:fs';
import {join,dirname,resolve,delimiter} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn,spawnSync} from 'node:child_process';
import {once} from 'node:events';
import {gzipSync,gunzipSync} from 'node:zlib';
import {repository} from './helpers.ts';
import {readerFixture} from './reader-fixture.ts';

// 单独运行：覆盖安装产物、运行依赖与全局式 bin 调用，不修改全局 npm 环境。
test('实际 npm 包仅用 JS 即可执行命令、读取指南、离线构建并查询',{timeout:180000},async t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-package-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const run=(command:string,args:string[],cwd=repository)=>{
  const result=spawnSync(command,args,{cwd,encoding:'utf8',timeout:120000});assert.equal(result.status,0,result.stderr||result.stdout||result.error?.message||'命令未成功退出');return result.stdout;
 };
 // 即使从未构建过样例，也用真实目录中的哨兵核验 npm 白名单下的嵌套排除。
 for(const directory of ['docs/output','examples/address-space-v2/output','templates/clauses/output']){
  const marker=join(repository,directory,'edoc-pack-exclusion-'+process.pid+'.txt');mkdirSync(dirname(marker),{recursive:true});writeFileSync(marker,'不应进入安装包');t.after(()=>rmSync(marker,{force:true}));
 }
 const packed=JSON.parse(run('npm',['pack','--json','--pack-destination',root]))[0];
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/cli/edoc.js'));
 assert.ok(packed.files.some((f:any)=>f.path==='LICENSE'));
 assert.equal(JSON.parse(readFileSync(join(repository,'package.json'),'utf8')).license,'MIT');
 assert.ok(!packed.files.some((f:any)=>f.path.endsWith('.ts')&&!f.path.endsWith('.d.ts')),'运行仅用 JS，类型声明单独交付');
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/core/index.d.ts'));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/drawing/drawing.schema.json'));
 assert.ok(!packed.files.some((f:any)=>f.path.startsWith('dist/packages/drawing-prototype/')));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/manual/index.html'));
 assert.ok(packed.files.some((f:any)=>f.path==='examples/fpga-mac/docs/SPEC.mdoc'),'源文 include 引用的样例必须随包');
 assert.ok(!packed.files.some((f:any)=>/^(docs|examples|templates)\//.test(f.path)&&f.path.includes('/output/')),'运行过文档/样例/模板构建也不能混入任何 output 文件');
 const prefix=join(root,'prefix');run('npm',['install','--prefix',prefix,join(root,packed.filename),'--ignore-scripts','--omit=dev','--prefer-offline','--package-lock=false']);
 for(const name of ['playwright','@antv/x6','@fontsource/noto-sans-sc','vite','react','typescript','fontkit'])assert.ok(!existsSync(join(prefix,'node_modules',name)),name+' 不属于运行依赖');
 assert.ok(!packed.files.some((f:any)=>f.path.startsWith('dist/packages/render-pdf/')));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/runtime/reader-true-true.js'));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/runtime/fonts/LICENSE'));
 const bin=join(prefix,'node_modules/.bin/edoc'),project=join(root,'project');mkdirSync(join(project,'docs'),{recursive:true});
 writeFileSync(join(project,'docs/edoc.config.js'),'export default {};');writeFileSync(join(project,'edoc.config.js'),"throw Error('不应默认读取项目根配置')");writeFileSync(join(project,'README.md'),'# 仓库介绍\n\n不进入默认正式文档。');writeFileSync(join(project,'docs/index.mdoc'),'# 安装包演示\n\n普通正文。');
 assert.match(run(bin,['--version'],project),/edoc 3/);assert.match(run(bin,['guide'],project),/文档组织简略指南/);
 const location=JSON.parse(run(bin,['docs','--format','json'],project));assert.ok(existsSync(location.html));assert.ok(existsSync(location.sources));
 assert.equal(typeof location.build.version,'string');assert.equal(typeof location.build.dirty,'boolean');assert.match(location.build.revision,/^[a-f0-9]{40,64}$/);assert.ok(location.build.builtAt);
 assert.equal(JSON.parse(run(bin,['guide','--full','--format','json'],project)).variant,'full');
 for(const file of [location.entry,location.readme,location.usage])assert.ok(existsSync(file));
 assert.ok(run(bin,['--help'],project).includes(location.entry));
 assert.match(readFileSync(location.entry,'utf8'),/快速开始/);
 assert.match(readFileSync(location.readme,'utf8'),/docs\/index\.mdoc/);
 for(const cmd of ['read','outline','query','serve'])assert.match(run(bin,['docs',cmd,'--help'],project),/源文主入口/);
 const shallow=JSON.parse(run(bin,['docs','outline'],project));assert.equal(shallow.maxDepth,0);assert.ok(shallow.chapters.every((n:any)=>!n.children.length));
 const all=JSON.parse(run(bin,['docs','outline','--all'],project));assert.ok(all.chapters.some((n:any)=>n.children.length));assert.equal(all.maxDepth,undefined);
 assert.match(run(bin,['docs','outline','--format','text'],project),/manual:home/);
 const wrongId=spawnSync(bin,['docs','read','--id',shallow.chapters[0].id],{cwd:project,encoding:'utf8'});assert.equal(wrongId.status,3);assert.match(wrongId.stderr,/sectionId/);
 // 安装源文及 include/code 依赖可独立加载；不借助仓库外的 examples。
 assert.ok(JSON.parse(run(bin,['outline','--config',join(location.sources,'edoc.config.js'),'--depth','0'],project)).chapters.length>0);
 assert.equal(JSON.parse(run(bin,['docs','read','--id','ref:config-data'],project)).id,'ref:config-data');
 const localState=JSON.parse(run(bin,['docs','query','--id','example:microwave','--element','cooking'],project));assert.equal(localState.modelId,'example:microwave');assert.equal(localState.target.id,'cooking');assert.ok(localState.outgoing.some((edge:any)=>edge.id==='tick'));
 assert.match(JSON.parse(run(bin,['docs','read','--id','example:fulfillment'],project)).content,/"fork"/);
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/extensions/control-diagram/state-machine.schema.json'));assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/extensions/control-diagram/flowchart.schema.json'));
 const stateSvg=join(root,'state.svg');run(bin,['export','--config',join(location.sources,'edoc.config.js'),'--view','author:state','--format','svg','--output',stateSvg],project);const stateXML=readFileSync(stateSvg,'utf8');assert.match(stateXML,/S101/);assert.match(stateXML,/<path data-path="[^"]+" d="M [^"]+ C /);assert.match(stateXML,/clk 上升沿/);

 assert.ok(!packed.files.some((f:any)=>f.path.startsWith('docs/usage/')),'源目录随主导航重整，不保留第二套旧入口');
 assert.equal(JSON.parse(run(bin,['docs','read','--id','use:home'],project)).source.file,'docs/index.mdoc');
 assert.equal(JSON.parse(run(bin,['guide','--format','json'],project)).source,'docs/writing/agent-guide.mdoc');
 assert.equal(JSON.parse(run(bin,['guide','--full','--format','json'],project)).source,'docs/writing/guide.mdoc');
 const roots=JSON.parse(run(bin,['docs','outline','--format','json'],project)).chapters;
 assert.deepEqual(roots.map((n:any)=>n.label),['edoc 文档','快速开始','编写与组织文档','图表','工程数据与多工程组合','阅读、查询与发布','查询参考','edoc 开发']);
 assert.ok(packed.files.some((f:any)=>f.path==='templates/clauses/docs/index.mdoc'));
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/extensions/clause/clause.schema.json'));
 const clauses=JSON.parse(run(bin,['docs','read','--project','behavior-contract-demo','--id','demo:timeout'],project));
 assert.match(clauses.content,/迟到/);assert.match(clauses.content,/时限/);assert.ok(clauses.clauses.length>=2);
 assert.equal(JSON.parse(run(bin,['docs','query','--project','behavior-contract-demo','--id','demo:deadline'],project)).references[0].entity.class,'applies-clause');
 const removed=spawnSync(bin,['docs','read','--id','use:home','--with-specs'],{cwd:project,encoding:'utf8'});assert.notEqual(removed.status,0);assert.match(removed.stderr,/未知/);
 assert.ok(!packed.files.some((f:any)=>f.path.includes('extensions/specification/')||f.path==='docs/charts/specifications.mdoc'));
 assert.equal(JSON.parse(run(bin,['docs','query','--id','system:producer'],project)).target.entity.label,'生产者');
 assert.match(JSON.parse(run(bin,['docs','read','--id','use:registers:create'],project)).content,/register-diagram/);
 assert.equal(JSON.parse(run(bin,['docs','query','--id','manual:full64.data'],project)).registerField.resetText,'0xFEDCBA9876543210');
 assert.equal(JSON.parse(run(bin,['docs','query','--id','manual:instance1'],project)).cellLinks.source.route.target,'detail');
 assert.ok(packed.files.some((f:any)=>f.path==='dist/packages/extensions/register/register.schema.json'));
 assert.ok(packed.files.some((f:any)=>f.path==='docs/charts/data-layout/registers.mdoc'));
 assert.ok(!packed.files.some((f:any)=>f.path==='docs/charts/data-layout/register-maps.mdoc'),'寄存器主教程合并后不再交付旧独立页面');
 const handbookMap=JSON.parse(run(bin,['docs','query','--id','fpga:csr'],project)).registerMap;
 assert.equal(handbookMap.totalKind,'immediate-instances');
 const statusPosition=JSON.parse(run(bin,['docs','query','--id','fpga:csr','--element',JSON.stringify([{kind:'region',regionId:'channel0'},{kind:'entry',entryId:'status'}])],project));
 assert.equal(statusPosition.address,'0x40000100');assert.equal(statusPosition.regionOffset.address,'0x0');
 const handbookDefinitions=JSON.parse(run(bin,['docs','read','--id','handbook:fpga:definitions'],project));
 assert.equal(handbookDefinitions.id,'handbook:fpga:definitions');assert.equal(handbookDefinitions.children.length,4);
 for(const domain of ['diagrams','behavior','timing','data-layout','records'])assert.ok(packed.files.some((f:any)=>f.path===`docs/charts/${domain}/index.mdoc`),'安装包携带图表领域入口 '+domain);

 for(const [domain,schema]of [['sequence','sequence'],['binary-layout','binary-layout'],['plot','plot'],['register-map','address-space']])assert.ok(packed.files.some((f:any)=>f.path===`dist/packages/extensions/${domain}/${schema}.schema.json`));
 for(const id of ['use:sequences','use:binary-layouts','use:register-maps','use:plots'])assert.equal(JSON.parse(run(bin,['docs','read','--id',id],project)).id,id);
 assert.equal(JSON.parse(run(bin,['docs','query','--id','seq:request','--element','reply'],project)).target.replyTo,'request');
 assert.equal(JSON.parse(run(bin,['docs','query','--id','space:csr','--element',JSON.stringify([{kind:'region',regionId:'device'},{kind:'entry',entryId:'ports',index:2},{kind:'entry',entryId:'ctrl'}])],project)).address,'0x1000000000000300');
 assert.equal(JSON.parse(run(bin,['docs','query','--id','binary:packet','--element','crc'],project)).layout[0].offset.value,undefined);
 assert.equal(JSON.parse(run(bin,['docs','query','--id','plot:quantile'],project)).plot.inputCount,48);
 for(const [kind,id]of [['id','seq:request'],['view','view:packet-sample'],['view','plot:distribution'],['id','space:csr']]){const target=join(root,id.replace(/:/g,'_')+'.svg');run(bin,['export','--config',join(location.sources,'edoc.config.js'),'--'+kind,id,'--format','svg','--output',target],project);const xml=readFileSync(target,'utf8');assert.match(xml,/<svg/);assert.match(xml,/@font-face/);assert.match(xml,/<metadata>/);}

 cpSync(join(location.root,'templates/clauses/docs/index.mdoc'),join(project,'docs/index.mdoc'));
 const installedContract=JSON.parse(run(bin,['read','--id','behavior:timeout'],project));assert.equal(installedContract.semanticKind,'behavior');assert.equal(installedContract.clauses.length,2);assert.match(installedContract.content,/截止时刻/);
 writeFileSync(join(project,'docs/index.mdoc'),'{% specification id="old" title="旧写法" %}原文{% /specification %}');
 const oldSource=spawnSync(bin,['validate'],{cwd:project,encoding:'utf8'});assert.equal(oldSource.status,1);assert.match(oldSource.stderr,/REMOVED_SYNTAX/);
 writeFileSync(join(project,'docs/index.mdoc'),'# 安装版机器条款');
 writeFileSync(join(project,'docs/edoc.config.js'),`export default {data:{clauses:[{id:'installed:clause',kind:'clause',label:'机器要求',body:{format:'markdoc',content:'完整前提和例外。'},source:{file:'source.mdoc'}}]}};`);
 assert.equal(JSON.parse(run(bin,['query','--id','installed:clause'],project)).target.semanticKind,'clause');
 assert.equal(JSON.parse(run(bin,['read','--id','installed:clause'],project)).clauses[0].id,'installed:clause');

 writeFileSync(join(project,'docs/edoc.config.js'),"throw Error('工具手册不得执行当前工程配置')");
 const server=spawn(bin,['docs','serve','--port','0'],{cwd:project,stdio:['ignore','pipe','pipe']});
 const exited=once(server,'exit');
 try{
  const url=await new Promise<string>((resolve,reject)=>{
   const timer=setTimeout(()=>reject(Error('手册服务器未就绪')),10000);let stdout='';
   const finish=(error?:Error,value?:string)=>{clearTimeout(timer);error?reject(error):resolve(value!);};
   server.once('error',error=>finish(error));server.once('exit',()=>finish(Error('手册服务器提前退出')));
   server.stdout.on('data',data=>{stdout+=data;const match=stdout.match(/http:\/\/127\.0\.0\.1:\d+\//);if(match)finish(undefined,match[0]);});
  });
  const response=await fetch(url);assert.equal(response.status,200);assert.match(await response.text(),/edoc/);
  assert.equal((await fetch(url+'package.json')).status,404,'只提供手册，不暴露安装目录');
 }finally{server.kill('SIGTERM');await exited;}
 assert.ok(JSON.parse(run(bin,['docs','outline','--depth','0'],project)).chapters.length>0);
 assert.match(JSON.parse(run(bin,['docs','read','--id','dev:environment:part-01'],project)).content,/历史 V1/);
 const missingManual=spawnSync(bin,['docs','read','--id','missing'],{cwd:project,encoding:'utf8'});assert.equal(missingManual.status,3);
 for(const args of [['docs','read'],['docs','read','--id','ref:config','--scope','invalid'],['docs','outline','--config','ignored'],['docs','query','--id','system:producer','--depth','11'],['docs','outline','--all','--depth','1']])assert.equal(spawnSync(bin,args,{cwd:project,encoding:'utf8'}).status,2,args.join(' '));
 const originalHTML=readFileSync(location.html);rmSync(location.html);
 assert.equal(JSON.parse(run(bin,['docs','read','--id','use:home'],project)).id,'use:home','Agent 查询不依赖 HTML 文件');
 assert.ok(JSON.parse(run(bin,['docs','outline'],project)).chapters.length>0);
 assert.match(run(bin,['docs'],project),/源文主入口/);writeFileSync(location.html,originalHTML);
 // 不依赖HTML或查询索引：从安装目录README沿.mdoc链接提取最小配方。
 const readme=readFileSync(location.readme,'utf8'),entryLink=readme.match(/\[docs\/index\.mdoc\]\(([^)]+)\)/)!;
 assert.ok(entryLink);const entry=readFileSync(resolve(dirname(location.readme),entryLink[1]),'utf8');
 const startLink=entry.match(/\[快速开始\]\(([^)#]+)(?:#[^)]*)?\)/)!;assert.ok(startLink);
 const startPath=resolve(dirname(location.entry),startLink[1]),start=readFileSync(startPath,'utf8');
 const tutorialLink=start.match(/\[生成第一份文档\]\(([^)#]+)(?:#[^)]*)?\)/)!;assert.ok(tutorialLink);
 const tutorial=readFileSync(resolve(dirname(startPath),tutorialLink[1]),'utf8');
 const configRecipe=tutorial.match(/```js\n([\s\S]*?)```/)!,proseRecipe=tutorial.match(/```markdown\n([\s\S]*?)```/)!;assert.ok(configRecipe&&proseRecipe);
 assert.match(readFileSync(join(location.root,'AGENTS.md'),'utf8'),/\[手册首页\]\(docs\/index\.mdoc\)/);
 const textProject=join(root,'from-installed-mdoc');mkdirSync(join(textProject,'docs'),{recursive:true});writeFileSync(join(textProject,'docs/edoc.config.js'),configRecipe[1]);writeFileSync(join(textProject,'docs/index.mdoc'),proseRecipe[1]);
 const indexPath=join(location.root,'dist/manual/index.json.gz'),originalIndex=readFileSync(indexPath);
 const oldIndex=JSON.parse(gunzipSync(originalIndex).toString('utf8'));assert.equal(oldIndex.version,2);oldIndex.version=1;writeFileSync(indexPath,gzipSync(JSON.stringify(oldIndex)));
 const incompatible=spawnSync(bin,['docs','read','--id','use:home'],{cwd:project,encoding:'utf8'});assert.equal(incompatible.status,1);assert.match(incompatible.stderr,/MANUAL_VERSION/);
 rmSync(indexPath);rmSync(location.html);
 assert.ok(run(bin,['--help'],textProject).includes(location.entry));run(bin,[],textProject);assert.match(readFileSync(join(textProject,'output/index.html'),'utf8'),/工程手册/);
 writeFileSync(indexPath,originalIndex);writeFileSync(location.html,originalHTML);
 writeFileSync(join(project,'docs/edoc.config.js'),'export default {};');
 run(bin,[],project);assert.ok(existsSync(join(project,'output/index.html')));
 // 安装包中的Schema、Worker入口和标准构建直接承载原生框图，不访问源码目录。
 mkdirSync(join(project,'docs/ir'),{recursive:true});
 const drawingFile=join(project,'docs/ir/native.json');cpSync(join(repository,'docs/ir/authoring/board-map.json'),drawingFile);
 writeFileSync(join(project,'docs/index.mdoc'),'{% relation-diagram id="manual:drawing-board-map" /%}');
 run(bin,['validate'],project);run(bin,['build'],project);
 assert.match(readFileSync(join(project,'output/index.html'),'utf8'),/board-map-example/);
 const drawingQuery=JSON.parse(run(bin,['query','--id','manual:drawing-board-map'],project));assert.equal(drawingQuery.target.entity.drawing.schemaVersion,'1.0');
 run(bin,['export','--view','manual:drawing-board-map','--format','svg','--output','native.svg'],project);assert.match(readFileSync(join(project,'native.svg'),'utf8'),/data-connection="board-bus"/);
 rmSync(drawingFile);
 writeFileSync(join(project,'docs/index.mdoc'),'{% section id="installed:read" title="安装包章节" %}原始 **说明**。{% /section %}');
 const section=JSON.parse(run(bin,['read','--id','installed:read'],project));assert.match(section.content,/原始 \*\*说明\*\*/);assert.equal(section.scope,'self');
 assert.equal(JSON.parse(run(bin,['outline','--id','installed:read','--depth','0'],project)).chapters[0].sectionId,'installed:read');
 writeFileSync(join(project,'docs/a.mdoc'),'{% section id="installed:a" title="甲" %}A{% /section %}');writeFileSync(join(project,'docs/z.mdoc'),'{% section id="installed:z" title="乙" %}Z{% /section %}');
 writeFileSync(join(project,'docs/index.mdoc'),'{% section id="installed:read" title="安装包章节" %}\n{% directory-order items=["z.mdoc"] /%}\n普通说明。\n{% /section %}');
 assert.deepEqual(JSON.parse(run(bin,['outline'],project)).chapters.map((n:any)=>n.label),['安装包章节','乙','甲']);assert.match(JSON.parse(run(bin,['read','--id','installed:read'],project)).content,/directory-order/);run(bin,[],project);
 // IR2 真实组合工程必须能由安装版独立构建和查询，不借用仓库源码解析器。
 const addressProject=join(root,'address-v2');cpSync(join(repository,'examples/address-space-v2/composed'),addressProject,{recursive:true,filter:file=>!file.split('/').includes('output')});
 const addressConfig=join(addressProject,'docs/edoc.config.js'),ipConfig=join(addressProject,'ip/docs/edoc.config.js');
 run(bin,['validate','--config',addressConfig],project);run(bin,['build','--config',addressConfig],project);run(bin,['build','--config',ipConfig],project);
 const path=JSON.stringify([{kind:'region',regionId:'uart0'},{kind:'entry',entryId:'ctrl'}]),instance=JSON.parse(run(bin,['query','--config',addressConfig,'--id','soc:apb','--element',path],project));
 assert.equal(instance.address,'0x1000000000001008');assert.equal(instance.definitionProjectId,'uart-ip');assert.equal(instance.entity.width,64);
 const local=JSON.parse(run(bin,['query','--config',addressConfig,'--id','uart:ctrl'],project)),foreign=JSON.parse(run(bin,['query','--config',addressConfig,'--project','uart-ip','--id','uart:ctrl'],project));
 assert.equal(local.target.entity.width,8);assert.equal(foreign.target.entity.width,64);
 const manualAddress=JSON.parse(run(bin,['docs','query','--project','address-v2-composed','--id','soc:apb','--element',path],project));
 assert.equal(manualAddress.address,instance.address);assert.equal(manualAddress.definitionProjectId,instance.definitionProjectId);assert.deepEqual(manualAddress.instancePath,instance.instancePath);
 const mapped=JSON.parse(run(bin,['query','--config',addressConfig,'--id','soc:apb','--element',JSON.stringify([{kind:'region',regionId:'uart0'}])],project));
 assert.equal(mapped.allocationSize,'0x1000');assert.equal(mapped.mappedSize,'0x100');
 const leaves=JSON.parse(run(bin,['query','--config',addressConfig,'--id','soc:engineering','--element',JSON.stringify({kind:'leaves',path:[{kind:'region',regionId:'partial'}]})],project));assert.equal(leaves.leaves.items[0].status,'PARTIAL_REGISTER_WINDOW');
 assert.match(readFileSync(join(addressProject,'output/index.html'),'utf8'),/register-presentation/);
 const api=run(process.execPath,['--input-type=module','-e',"import {Markdoc} from 'edoc'; console.log(typeof Markdoc.parse,typeof Markdoc.Tag)"],prefix);assert.match(api,/function function/);
 assert.match(run(process.execPath,['--input-type=commonjs','-e',"console.log(typeof require('edoc').Markdoc.parse)"],prefix),/function/);
 // 在仓库外的本地依赖工程复制实际配方，不能依赖源码仓库自引用。
 mkdirSync(join(prefix,'docs'),{recursive:true});
 cpSync(join(repository,'docs/support/recipes/frontmatter.config.js'),join(prefix,'docs/edoc.config.js'));
 writeFileSync(join(prefix,'docs/index.mdoc'),'---\n{"title":"独立元数据配方"}\n---\n# {% $meta.title %}');run(bin,[],prefix);assert.match(readFileSync(join(prefix,'output/index.html'),'utf8'),/独立元数据配方/);
 cpSync(join(repository,'docs/support/recipes/reader-note.config.js'),join(prefix,'docs/edoc.config.js'));
 writeFileSync(join(prefix,'docs/index.mdoc'),'{% reader-note tone="info" %}\n{% slot "title" %}\n独立 Schema 配方\n{% /slot %}\n普通说明。\n{% /reader-note %}');run(bin,[],prefix);assert.match(readFileSync(join(prefix,'output/index.html'),'utf8'),/独立 Schema 配方/);
 writeFileSync(join(prefix,'consumer.mts'),`import {Markdoc,resolveProjectConfig} from 'edoc';\nimport type {Node,RelationView,Table,MarkdocOptions,Drawing,Clause,ReadOptions,Sequence,BinaryLayout,RegisterBlock,AddressSpace,Memory,AddressRegion,PlotView} from 'edoc';\nconst drawing:Drawing={schemaVersion:'1.0',id:'d',nodes:[{id:'n',label:'原生模块'}],connections:[]};
const clause:Clause={id:'c',kind:'clause',label:'要求',body:{format:'markdoc',content:'必须保留。'},source:{file:'source.mdoc'}};
const reading:ReadOptions={withClauses:true};
const sequence:Sequence={id:'s',kind:'sequence',participants:[{id:'a'},{id:'b'}],steps:[{id:'m',from:'a',to:'b'}]};
const binary:BinaryLayout={id:'b',kind:'binary-layout',fields:[{id:'header',size:16}]};
const block:RegisterBlock={id:'r',kind:'register-block',label:'R',entries:[]};
const memory:Memory={id:'ram',kind:'memory',label:'RAM',capacityBytes:'0x1000',memoryType:'ram'};
const region:AddressRegion={id:'ram0',kind:'resource',label:'RAM0',base:'0',size:'0x100',target:{id:memory.id}};
const space:AddressSpace={id:'a',kind:'address-space',label:'A',addressWidth:32,addressUnitBits:8,base:'0',size:'0x100000000',regions:[]};
// @ts-expect-error IR2 不提供旧 mappings 输入。
const oldSpace:AddressSpace={...space,mappings:[]};
const plot:PlotView={id:'p',kind:'plot',data:'t',mark:'point',encoding:{x:{field:'x'},y:{field:'y'}}};
// @ts-expect-error 旧 SDK 字段已删除。
const removedReading:ReadOptions={withSpecs:true};
const node:Node={id:'n',kind:'node',label:'模块'};\nconst view:RelationView={id:'v',kind:'architecture',include:{objects:[node.id],relations:[]}};\nconst table:Table={id:'t',kind:'table',label:'表',columns:[],rows:[]};\nconst options:MarkdocOptions={variables:{x:1},tokenizer:{html:false,allowComments:true}};\n// @ts-expect-error 原生 tokenizer 选项也保持精确类型。\nconst badOptions:MarkdocOptions={tokenizer:{html:"no"}};\n// @ts-expect-error 不允许将字符串当作端口宽度，验证声明不是 any。\nconst bad:Node={id:'bad',kind:'node',label:'错误',ports:[{id:'p',label:'p',direction:'in',width:'8'}]};\nconsole.log(Markdoc.parse('正文'),resolveProjectConfig,view,table,options,bad);\n`);
 for(const [module,moduleResolution]of [['NodeNext','NodeNext'],['ESNext','Bundler']]){
  writeFileSync(join(prefix,'tsconfig.json'),JSON.stringify({compilerOptions:{strict:true,noEmit:true,skipLibCheck:false,module,moduleResolution,target:'ES2023'},include:['consumer.mts']}));
  run(process.execPath,[join(repository,'node_modules/typescript/bin/tsc'),'-p',join(prefix,'tsconfig.json')],prefix);
 }
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
 const run=(command:string,args:string[],cwd=source,env=process.env)=>{const r=spawnSync(command,args,{cwd,env,encoding:'utf8',timeout:180000});assert.equal(r.status,0,r.stderr||r.stdout||r.error?.message||'命令未成功退出');return r.stdout;};
 // 使用当前工作树建立独立 Git 快照，覆盖与 git+ssh 相同的 prepare/打包流程，不提交实际仓库。
 for(const name of ['package.json','package-lock.json','tsconfig.json','tsconfig.package.json','.gitignore','README.md','AGENTS.md','LICENSE','packages','docs','templates','examples','scripts'])cpSync(join(repository,name),join(source,name),{recursive:true,filter:path=>!/[\/\\](?:output|node_modules|\.edoc-build)(?:[\/\\]|$)/.test(path)});
 run('git',['init','--quiet']);run('git',['add','.']);run('git',['-c','user.name=edoc test','-c','user.email=edoc-test@example.invalid','commit','--quiet','-m','安装夹具']);
 const guards=join(root,'no-python');mkdirSync(guards);
 for(const name of ['python','python3','uv']){const file=join(guards,name);writeFileSync(file,'#!/bin/sh\nprintf "手册构建不能依赖 Python/uv\\n" >&2\nexit 91\n');chmodSync(file,0o755);}
 const packed=JSON.parse(run('npm',['pack','git+file://'+source,'--json','--pack-destination',root,'--prefer-offline'],source,{...process.env,PATH:guards+':'+process.env.PATH}))[0];
 run('npm',['install','--global','--prefix',prefix,join(root,packed.filename),'--omit=dev','--prefer-offline','--no-audit','--no-fund']);
 const installed=join(prefix,'lib/node_modules/edoc'),bin=join(prefix,'bin/edoc');
 for(const name of ['playwright','@antv/x6','@fontsource/noto-sans-sc','vite','typescript','fontkit'])assert.ok(!existsSync(join(installed,'node_modules',name)),name+' 不应留在最终全局安装中');
 const project=join(root,'project');mkdirSync(join(project,'docs'),{recursive:true});writeFileSync(join(project,'docs/edoc.config.js'),'export default {};');writeFileSync(join(project,'docs/index.mdoc'),'# Git 安装生成\n\n中文正文。');
 assert.match(run(bin,['--version'],project),/edoc 3/);run(bin,[],project);assert.match(readFileSync(join(project,'output/index.html'),'utf8'),/Git 安装生成/);
 const location=JSON.parse(run(bin,['docs','--format','json'],project));assert.equal(location.entry,join(installed,'docs/index.mdoc'));
 assert.equal(location.build.revision,run('git',['rev-parse','HEAD']).trim());assert.equal(location.build.dirty,false);assert.ok(existsSync(join(installed,'LICENSE')));
 assert.ok(run('edoc',['--help'],project,{...process.env,PATH:join(prefix,'bin')+delimiter+process.env.PATH}).includes(location.entry));
 assert.ok(existsSync(location.entry));assert.match(readFileSync(join(installed,'AGENTS.md'),'utf8'),/\[手册首页\]\(docs\/index\.mdoc\)/);
 assert.match(run(bin,['docs','read','--id','ref:config-data','--format','text'],project),/context.references/);
 const fixture=readerFixture(undefined,join(root,'with-pdf'));run(bin,['--config',join(fixture.root,'edoc.config.js')],project);assert.match(readFileSync(join(fixture.root,'output/index.html'),'utf8'),/pdfWorker/);
});
