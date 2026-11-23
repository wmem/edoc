import {drawingConcurrency} from '../drawing/pool.ts';
import {parseResourceRoute,queryResource,readResource} from '../core/resource-reading.ts';
import {outlineResource} from '../core/resource-navigation.ts';
import {resourceContext} from '../core/resource-pages.ts';
import {isEngineering,engineeringSVG} from '../figure/render.ts';
import {registerSVG} from '../extensions/register/render.ts';
import type {Register} from '../extensions/register/types.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../core/html.ts';
import {resolve,dirname,join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,renameSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolveProjectConfig,loadProject,protectOutputs} from '../core/project.ts';
import type {ResolvedConfig} from '../core/project.ts';
import {query,queryElement,summary} from '../core/query.ts';
import {readDocument} from '../core/read.ts';
import {outline} from '../core/outline.ts';
import {EdocError,failure} from '../core/errors.ts';
import {SUPPORTED_IR_VERSION} from '../core/load.ts';
import type {Diagnostic} from '../core/types.ts';
import {scene,svg} from '../render-graph/index.ts';
import {bookHTML} from '../pack-html/book.ts';
import {loadBook,projectOutline} from '../core/book.ts';
import {manualMain,manualLocations} from './manual.ts';
import {outlineText,readText} from './format.ts';
import {buildInfo} from '../core/build-info.ts';
import {preflightBook} from '../core/document-preflight.ts';

const help=`edoc / IR ${SUPPORTED_IR_VERSION}
使用说明主入口：${manualLocations().entry}
Agent 可直接读取该 .mdoc；也可运行 edoc docs --help，或 edoc docs read --id use:home --format text。
文档组织原则：edoc guide 读取简略指南，edoc guide --full 读取完整方法。
用法：
 edoc                                      读取当前项目 docs/edoc.config.js 并构建
 edoc --config path/to/custom.js            使用指定配置构建
 edoc build [--format html] [--output FILE] [--workers N]
 edoc validate [--format json|text]         扫描文档、发现数据并校验依赖
 edoc outline [--project PROJECT_ID] [--id SECTION_ID] [--depth 0..10] [--format json|text]
 edoc query [--project PROJECT_ID] --id ID [--element ELEMENT] [--depth 0..10] [--max-items 1..10000] [--format json|text]
 edoc read [--project PROJECT_ID] --id ID [--scope self|subtree] [--with-clauses] [--offset 0] [--max-chars 12000] [--format json|text]
 edoc query|read|outline --route RESOURCE_ROUTE_JSON [--format json|text]
 edoc export [--project PROJECT_ID] (--view ID | --id MODEL_ID) --format svg --output FILE
 edoc guide [--full] [--format text|json]    文档组织指南，默认简版；--full 完整版
 edoc docs [serve|outline|read|query]        定位 .mdoc 源文或按需查询工具手册
构建并发：--workers N 优先于 EDOC_WORKERS，默认使用 4 个工作线程。
项目命令均可使用 --config；省略时只查找当前目录下的 docs/edoc.config.js。
标准 docs/edoc.config.js 的工程根为 docs 上一级；其他显式配置以配置目录为工程根。
配置内容直接写在 JS 中；不要求 manifest、command 或 inputs 清单。
正文与 IR 数据自动发现和校验，每篇正文独立阅读；图形仅生成正文引用的视图。
显式 children/include 接入子工程；跨工程链接不加载外部工程。
PDF 附件内嵌于 HTML，支持位置引用及浏览器返回。
文档发布为 HTML；不提供整本 PDF 导出，生成 HTML 无需 Chromium。
退出码：0 成功；1 配置/数据/构建失败；2 用法错误；3 ID 不存在。
`;
class UsageError extends Error{}
type Target={format:'html'|'svg';file:string};

export async function main(argv:string[]):Promise<number>{
 let format='text',targets:Target[]=[],canClean=false,config:ResolvedConfig|undefined;
 try{
  if((argv.length===1&&['--help','-h'].includes(argv[0]))||(['build','validate','outline','query','read','export','guide'].includes(argv[0])&&argv.slice(1).some(t=>['--help','-h'].includes(t)))){process.stdout.write(help);return 0;}
  if(argv.length===1&&argv[0]==='--version'){const info=buildInfo();process.stdout.write(`edoc ${info.version} / IR ${SUPPORTED_IR_VERSION} / source ${info.revision??'unknown'}${info.dirty?' (dirty)':''}${info.builtAt?' / built '+info.builtAt:''}\n`);return 0;}
  if(argv[0]==='docs')return await manualMain(argv.slice(1));
  const implicit=!argv.length||argv[0].startsWith('--'),command=implicit?'build':argv[0],tokens=implicit?argv:argv.slice(1);
  if(!['build','validate','outline','query','read','export','guide'].includes(command))throw new UsageError('未知命令；使用 edoc --help 查看用法');
  const allowed=new Set(command==='guide'?['--format','--full']:['--config','--format',...(['query','read','outline'].includes(command)?['--route']:[]),...(command==='query'?['--id','--element','--depth','--max-items']:[]),...(command==='outline'?['--id','--depth']:[]),...(command==='read'?['--id','--scope','--offset','--max-chars','--with-clauses']:[]),...(['query','read','outline','export'].includes(command)?['--project']:[]),...(['build','export'].includes(command)?['--output']:[]),...(command==='build'?['--workers']:[]),...(command==='export'?['--view','--id']:[])]);
  const args:Record<string,string>=Object.create(null);
  for(let i=0;i<tokens.length;){const key=tokens[i++];if(!allowed.has(key))throw new UsageError(`未知选项 ${key}`);if(Object.hasOwn(args,key))throw new UsageError(`重复选项 ${key}`);if(key==='--full'||key==='--with-clauses'){args[key]='true';continue;}if(tokens[i]===undefined||tokens[i].startsWith('--'))throw new UsageError(`${key} 缺少值`);args[key]=tokens[i++];}
  format=args['--format']??(['query','outline','read'].includes(command)?'json':'text');
  if(command==='build'&&args['--format']==='text')throw new UsageError('build 的 --format 只接受 html');
  if(!({build:['text','html'],validate:['json','text'],outline:['json','text'],query:['json','text'],read:['json','text'],export:['svg'],guide:['json','text']}[command]!).includes(format))throw new UsageError('命令输出格式不正确');
  if(command==='guide'){const source='docs/writing/'+(args['--full']?'guide.mdoc':'agent-guide.mdoc'),content=readFileSync(resolve(manualLocations().root,source),'utf8');process.stdout.write(format==='json'?JSON.stringify({guideVersion:'4.0',variant:args['--full']?'full':'short',source,content},null,2)+'\n':content);return 0;}
  if(args['--route']&&(args['--id']||args['--element']||args['--project']))throw new UsageError('--route 已包含目标身份，不能并用 --id/--element/--project');
  const resourceRequest=args['--route']?parseResourceRoute(args['--route']):undefined;
  if(command==='query'&&!args['--id']&&!args['--route'])throw new UsageError('query 需要 --id');
  if(command==='read'&&!args['--id']&&!args['--route'])throw new UsageError('read 需要 --id');
  if(command==='outline'&&args['--id']!==undefined&&!args['--id'].trim())throw new UsageError('outline 的 --id 必须是非空章节 ID');
  if(args['--project']!==undefined&&!args['--project'].trim())throw new UsageError('--project 必须是非空工程 ID');
  if(command==='read'&&args['--scope']!==undefined&&!['self','subtree'].includes(args['--scope']))throw new UsageError('--scope 只接受 self/subtree');
  if(command==='export'&&((!!args['--view']===!!args['--id'])||!args['--output']||!args['--output'].endsWith('.svg')))throw new UsageError('export 需要 --view 或 --id、--format svg 和 .svg 的 --output');
  const number=(key:string,fallback:number,min:number,max:number)=>{const value=args[key];if(value===undefined)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(value)||+value<min||+value>max)throw new UsageError(`${key} 范围 ${min}–${max}`);return +value;};
  let workers:number|undefined;
  if(command==='build'){try{workers=drawingConcurrency(args['--workers']===undefined?undefined:number('--workers',1,1,Number.MAX_SAFE_INTEGER));}catch(error){throw new UsageError(error instanceof Error?error.message:String(error));}}
  const depth=number('--depth',0,0,10),maxItems=number('--max-items',1000,1,10000);
  const readOffset=number('--offset',0,0,Number.MAX_SAFE_INTEGER),readLimit=number('--max-chars',12000,1,100000);
  if(command==='build'&&args['--output']){const inferred=format==='text'?(args['--output'].endsWith('.html')?'html':undefined):format;if(!inferred||!args['--output'].endsWith('.'+inferred))throw new UsageError('--output 需要与 html 格式一致');format=inferred;}
  config=await resolveProjectConfig(args['--config']);
  if(command==='build'){
   if(format==='html')targets=[{format,file:args['--output']?resolve(args['--output']):config.outputs.find(t=>t.format===format)?.file??resolve(config.root,'output/index.'+format)}];
   else targets=config.outputs.slice();
  }else if(command==='export')targets=[{format:'svg',file:resolve(args['--output'])}];
  protectOutputs(targets,config.configInputs);
  const book=await loadBook(config,{onInputs(inputs){protectOutputs(targets,inputs);if(!Object.keys(config!.children).length)canClean=true;}});protectOutputs(targets,book.inputs);canClean=true;const project=book.root,selected=args['--project']?book.projects.get(args['--project']):project;if(!selected)throw new EdocError([{code:'QUERY_NOT_FOUND',file:config.file,path:'/project',message:'当前组合中没有此工程：'+args['--project']}]);const graph=selected.graph;
  if(args['--route']){
   const route=resourceRequest!,context=resourceContext(book.root.graph);
   const result=command==='outline'?outlineResource(context,route,args['--depth']===undefined?2:depth):command==='query'?queryResource(context,route,Math.min(args['--max-items']===undefined?50:maxItems,100)):readResource(context,route,(project,id,scope,offset)=>readDocument(book.projects.get(project)!.graph,id,{scope,offset,maxChars:100000}),{offset:readOffset,maxChars:readLimit,scope:args['--scope'] as 'self'|'subtree'|undefined});
   process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':command==='outline'?outlineText((result as any).chapters).join('\n')+'\n':command==='read'?readText(result as any):JSON.stringify(result,null,2)+'\n');return 0;
  }
  if(command==='query'){process.stdout.write(JSON.stringify(args['--element']?queryElement(graph,args['--id'],args['--element']):query(graph,args['--id'],{depth,maxItems}),null,2)+'\n');return 0;}
  if(command==='read'){
   const result=readDocument(graph,args['--id'],{withClauses:args['--with-clauses']?true:undefined,scope:args['--scope'] as 'self'|'subtree'|undefined,offset:readOffset,maxChars:readLimit});
   process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':readText(result));return 0;
  }
  if(command==='outline'){
   const result=projectOutline(book,{project:args['--project'],id:args['--id'],depth:args['--depth']===undefined?undefined:depth});
   process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':outlineText(result.chapters).join('\n')+'\n');return 0;
  }
  if(command==='validate'){
   const preflight=preflightBook(book);
   const result={...preflight,...summary(graph),documentFiles:project.documents.files,dataFiles:project.dataFiles,references:project.documents.references,projects:[...book.projects.values()].map(p=>({config:p.config.file,...summary(p.graph),documentFiles:p.documents.files,dataFiles:p.dataFiles,attachments:Object.keys(p.graph.attachments??{})}))};
   process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':`校验通过：${config.projectId} / ${project.documents.files.length} 个文档依赖 / ${project.dataFiles.length} 个数据文件 / ${graph.index.size} 个实体\n`+(preflight.deferredAnchors.length?`${preflight.deferredAnchors.length} 个动态锚点须由 build 校验（详情用 --format json）。\n`:''));return 0;
  }
  const status=resolve(config.root,'.edoc-build/build-status.json');mkdirSync(dirname(status),{recursive:true});writeFileSync(status,JSON.stringify({success:false,outputs:targets.map(t=>t.file)}));
  // 所有目标先生成到临时文件，再发布；不把部分成功当作整次成功。
  const generated:{pending:string;target:Target}[]=[],staged:{directory:string;file:string;target:Target}[]=[],temporary=mkdtempSync(join(tmpdir(),'edoc-build-'));
  try{
   const content=command==='build'&&targets.some(t=>t.format==='html')?await bookHTML(book,{workers}):undefined;
   for(const [i,target]of targets.entries()){
    mkdirSync(dirname(target.file),{recursive:true});const pending=join(temporary,`document-${i}.`+target.format);
    if(target.format==='svg'){const id=args['--id']??args['--view'],entry=graph.index.get(id);if(args['--id']&&entry?.type!=='register'&&!isEngineering(graph,id))failure(entry?'EXPORT_TYPE':'QUERY_NOT_FOUND',config.file,'/id','--id 必须指向可绘图模型：'+id);writeFileSync(pending,isEngineering(graph,id)?(await engineeringSVG(graph,id,true)).replace('><title>','><style>'+esc(fontCSS())+'</style><title>'):args['--id']&&entry?.type==='register'?registerSVG(entry.entity as Register,{project:graph.manifest.projectId,fontCSS:fontCSS()}):svg(await scene(graph,id,{interfaces:'expanded',control:'full'})));}
    else if(target.format==='html')writeFileSync(pending,content!);
    generated.push({pending,target});
   }
   // 临时目录可能位于另一文件系统，先复制到目标旁，再用 rename 发布。
   for(const {pending,target}of generated){const directory=mkdtempSync(join(dirname(target.file),'.edoc-output-')),file=join(directory,'document');staged.push({directory,file,target});writeFileSync(file,readFileSync(pending));}
   for(const {file,target}of staged)renameSync(file,target.file);
   writeFileSync(status,JSON.stringify({success:true,outputs:targets.map(t=>t.file)}));
   targets.forEach(t=>process.stdout.write(`已生成 ${t.file}\n`));return 0;
  }finally{rmSync(temporary,{recursive:true,force:true});staged.forEach(t=>rmSync(t.directory,{recursive:true,force:true}));}
 }catch(error){
  if(canClean)targets.forEach(t=>rmSync(t.file,{force:true}));
  if(config&&targets.length){const status=resolve(config.root,'.edoc-build/build-status.json');mkdirSync(dirname(status),{recursive:true});writeFileSync(status,JSON.stringify({success:false,outputs:targets.map(t=>t.file)}));}
  const diagnostics:Diagnostic[]=error instanceof EdocError?error.diagnostics:[{code:error instanceof UsageError?'USAGE':'BUILD_ERROR',file:'<cli>',path:'',message:error instanceof Error?error.message:String(error)}];
  process.stderr.write(format==='json'?JSON.stringify({valid:false,diagnostics},null,2)+'\n':diagnostics.map(d=>`${d.code} ${d.file}${d.path} ${d.id??''}: ${d.message}`).join('\n')+'\n');
  return error instanceof UsageError?2:diagnostics.some(d=>d.code==='QUERY_NOT_FOUND')?3:1;
 }
}
