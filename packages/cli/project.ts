import {resolve,dirname,join} from 'node:path';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,renameSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolveProjectConfig,loadProject,protectOutputs} from '../core/project.ts';
import type {ResolvedConfig} from '../core/project.ts';
import {query,summary} from '../core/query.ts';
import {readDocument} from '../core/read.ts';
import {outline} from '../core/outline.ts';
import {EdocError} from '../core/errors.ts';
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
 edoc build [--format html] [--output FILE]
 edoc validate [--format json|text]         扫描文档、发现数据并校验依赖
 edoc outline [--project PROJECT_ID] [--id SECTION_ID] [--depth 0..10] [--format json|text]
 edoc query [--project PROJECT_ID] --id ID [--depth 0..10] [--max-items 1..10000] [--format json|text]
 edoc read [--project PROJECT_ID] --id SECTION_ID [--scope self|subtree] [--offset 0] [--max-chars 12000] [--format json|text]
 edoc export [--project PROJECT_ID] --view ID --format svg --output FILE
 edoc guide [--full] [--format text|json]    文档组织指南，默认简版；--full 完整版
 edoc docs [serve|outline|read|query]        定位 .mdoc 源文或按需查询工具手册
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
  const allowed=new Set(command==='guide'?['--format','--full']:['--config','--format',...(command==='query'?['--id','--depth','--max-items']:[]),...(command==='outline'?['--id','--depth']:[]),...(command==='read'?['--id','--scope','--offset','--max-chars']:[]),...(['query','read','outline','export'].includes(command)?['--project']:[]),...(['build','export'].includes(command)?['--output']:[]),...(command==='export'?['--view']:[])]);
  const args:Record<string,string>=Object.create(null);
  for(let i=0;i<tokens.length;){const key=tokens[i++];if(!allowed.has(key))throw new UsageError(`未知选项 ${key}`);if(Object.hasOwn(args,key))throw new UsageError(`重复选项 ${key}`);if(key==='--full'){args[key]='true';continue;}if(tokens[i]===undefined||tokens[i].startsWith('--'))throw new UsageError(`${key} 缺少值`);args[key]=tokens[i++];}
  format=args['--format']??(['query','outline','read'].includes(command)?'json':'text');
  if(command==='build'&&args['--format']==='text')throw new UsageError('build 的 --format 只接受 html');
  if(!({build:['text','html'],validate:['json','text'],outline:['json','text'],query:['json','text'],read:['json','text'],export:['svg'],guide:['json','text']}[command]!).includes(format))throw new UsageError('命令输出格式不正确');
  if(command==='guide'){const source='docs/usage/engineering/'+(args['--full']?'guide.mdoc':'agent-guide.mdoc'),content=readFileSync(resolve(manualLocations().root,source),'utf8');process.stdout.write(format==='json'?JSON.stringify({guideVersion:'4.0',variant:args['--full']?'full':'short',source,content},null,2)+'\n':content);return 0;}
  if(command==='query'&&!args['--id'])throw new UsageError('query 需要 --id');
  if(command==='read'&&!args['--id'])throw new UsageError('read 需要 --id');
  if(command==='outline'&&args['--id']!==undefined&&!args['--id'].trim())throw new UsageError('outline 的 --id 必须是非空章节 ID');
  if(args['--project']!==undefined&&!args['--project'].trim())throw new UsageError('--project 必须是非空工程 ID');
  if(command==='read'&&args['--scope']!==undefined&&!['self','subtree'].includes(args['--scope']))throw new UsageError('--scope 只接受 self/subtree');
  if(command==='export'&&(!args['--view']||!args['--output']||!args['--output'].endsWith('.svg')))throw new UsageError('export 需要 --view、--format svg 和 .svg 的 --output');
  const number=(key:string,fallback:number,min:number,max:number)=>{const value=args[key];if(value===undefined)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(value)||+value<min||+value>max)throw new UsageError(`${key} 范围 ${min}–${max}`);return +value;};
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
  if(command==='query'){process.stdout.write(JSON.stringify(query(graph,args['--id'],{depth,maxItems}),null,2)+'\n');return 0;}
  if(command==='read'){
   const result=readDocument(graph,args['--id'],{scope:args['--scope'] as 'self'|'subtree'|undefined,offset:readOffset,maxChars:readLimit});
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
   const content=command==='build'&&targets.some(t=>t.format==='html')?await bookHTML(book):undefined;
   for(const [i,target]of targets.entries()){
    mkdirSync(dirname(target.file),{recursive:true});const pending=join(temporary,`document-${i}.`+target.format);
    if(target.format==='svg')writeFileSync(pending,svg(await scene(graph,args['--view'],{interfaces:'expanded'})));
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
