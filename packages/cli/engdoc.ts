#!/usr/bin/env node
import {resolve,dirname,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync,renameSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {loadConfig,loadIR,query,summary,outline,EngDocError,SUPPORTED_IR_VERSION} from '../core/index.ts';
import type {Diagnostic} from '../core/types.ts';
import {scene,svg} from '../render-graph/index.ts';
import {html} from '../pack-html/index.ts';
import {pdf} from '../render-pdf/index.ts';
const help=`EngDoc V1 / IR 1.x / tags 1.0
用法：
 engdoc guide [--format text|json]  阅读推荐指南，无需项目配置
 engdoc outline --config engdoc.config.json [--format json|text]
 engdoc validate --config engdoc.config.json [--format json|text]
 engdoc query --config engdoc.config.json --id ID [--depth 0..10] [--max-items 1..10000] [--format json|text]
 engdoc export --config engdoc.config.json --view ID --format svg --output view.svg
 engdoc build --config engdoc.config.json --format html|pdf --output EngDoc.html|EngDoc.pdf
--config 与 --ir PATH 二选一，--ir 可指定 --project-root。
受信任配置声明 adapter 时运行转换；没有 adapter 的配置不运行 Adapter。
PDF 使用 ENGDOC_CHROMIUM 指定可执行文件，或 Playwright 已安装的 Chromium。
退出码：0 成功；1 数据/文件/构建失败；2 用法错误；3 ID 不存在。
`;
class UsageError extends Error{}
export async function main(argv:string[]):Promise<number>{
 let format=argv.includes('json')?'json':'text',failedOutput:string|undefined;
 try{
 if(argv.length===1&&['--help','-h'].includes(argv[0])){process.stdout.write(help);return 0;}
 if(argv.length===1&&argv[0]==='--version'){process.stdout.write(`EngDoc 1.0.0 / IR ${SUPPORTED_IR_VERSION} / tags 1.0\n`);return 0;}
 if(argv[0]==='guide'){
  if(!(argv.length===1||(argv.length===3&&argv[1]==='--format'&&['text','json'].includes(argv[2]))))throw new UsageError('用法：engdoc guide [--format text|json]');
  const content=readFileSync(new URL('../../docs/推荐指南.md',import.meta.url),'utf8');
  process.stdout.write(argv[2]==='json'?JSON.stringify({guideVersion:'1.0',source:'docs/推荐指南.md',content},null,2)+'\n':content);return 0;
 }
 const [command,...tokens]=argv;if(!['validate','query','build','export','outline'].includes(command))throw new UsageError('使用 --help 查看命令；文档组织建议见 engdoc guide');
 const allowed=new Set(['--config','--ir','--project-root','--format',...(command==='query'?['--id','--depth','--max-items']:[]),...(command==='build'?['--output']:[]),...(command==='export'?['--view','--output']:[])]);
 const options:Record<string,string>={};for(let i=0;i<tokens.length;i+=2){const key=tokens[i];if(!allowed.has(key))throw new UsageError(`未知选项 ${key}`);if(Object.hasOwn(options,key))throw new UsageError(`重复选项 ${key}`);if(tokens[i+1]===undefined||tokens[i+1].startsWith('--'))throw new UsageError(`${key} 缺少值`);options[key]=tokens[i+1];}
 format=options['--format']??(['query','outline'].includes(command)?'json':command==='build'?'html':'text');
 if(!({validate:['json','text'],query:['json','text'],outline:['json','text'],build:['html','pdf'],export:['svg']}[command]!).includes(format))throw new UsageError('命令输出格式不正确');
 if(Boolean(options['--config'])===Boolean(options['--ir']))throw new UsageError('--config 与 --ir 必须且只能提供一个');
 if(options['--config']&&options['--project-root'])throw new UsageError('--project-root 只用于 --ir');
 if(command==='query'&&!options['--id'])throw new UsageError('query 需要 --id');
 const number=(key:string,fallback:number,min:number,max:number)=>{const v=options[key];if(v===undefined)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(v)||+v<min||+v>max)throw new UsageError(`${key} 范围 ${min}–${max}`);return +v;};
 const depth=number('--depth',0,0,10),maxItems=number('--max-items',1000,1,10000);
 if(command==='build'||command==='export'){if(!options['--output']||!options['--output'].endsWith('.'+format))throw new UsageError('请提供与格式一致的 --output');failedOutput=resolve(options['--output']);if(command==='export'&&!options['--view'])throw new UsageError('export 需要 --view');}
 const config=options['--config']?loadConfig(options['--config']):{irDirectory:resolve(options['--ir']),projectRoot:options['--project-root']?resolve(options['--project-root']):undefined,title:undefined,chromiumExecutable:undefined};
 const graph=loadIR(config.irDirectory,config);
 if(command==='outline'){
  const result=outline(graph);
  const lines=(nodes:typeof result.chapters):string[]=>nodes.flatMap(n=>['  '.repeat(n.depth)+n.label,...lines(n.children)]);
  process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':lines(result.chapters).join('\n')+'\n');return 0;
 }
 if(command==='export'||command==='build'){
 const output=failedOutput!;mkdirSync(dirname(output),{recursive:true});const pending=output+'.pending';
 try{if(command==='export')writeFileSync(pending,svg(await scene(graph,options['--view'],{interfaces:'expanded'})));
 else{const content=await html(graph,config.title??graph.manifest.projectId);if(format==='html')writeFileSync(pending,content);else{const temporary=mkdtempSync(join(tmpdir(),'engdoc-pdf-'));try{const file=join(temporary,'document.html');writeFileSync(file,content);await pdf(file,pending,config.chromiumExecutable);}finally{rmSync(temporary,{recursive:true,force:true});}}}
 renameSync(pending,output);process.stdout.write(`已生成 ${output}\n`);return 0;
 }finally{rmSync(pending,{force:true});}
 }
 const result=command==='validate'?summary(graph):query(graph,options['--id'],{depth,maxItems});
 process.stdout.write(format==='json'||command==='query'?JSON.stringify(result,null,2)+'\n':`校验通过：${graph.manifest.projectId} / IR ${graph.manifest.irVersion} / ${graph.index.size} 个可引用实体\n`);return 0;
 }catch(error){
 if(failedOutput)rmSync(failedOutput,{force:true});
 const diagnostics:Diagnostic[]=error instanceof EngDocError?error.diagnostics:[{code:error instanceof UsageError?'USAGE':'BUILD_ERROR',file:'<cli>',path:'',message:error instanceof Error?error.message:String(error)}];
 process.stderr.write(format==='json'?JSON.stringify({valid:false,diagnostics},null,2)+'\n':diagnostics.map(d=>`${d.code} ${d.file}${d.path} ${d.id??''}: ${d.message}`).join('\n')+'\n');
 return error instanceof UsageError?2:diagnostics.some(d=>d.code==='QUERY_NOT_FOUND')?3:1;
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)process.exitCode=await main(process.argv.slice(2));
