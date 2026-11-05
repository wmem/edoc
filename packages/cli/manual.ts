import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import {manualOutline,manualRead,manualQuery} from '../core/manual.ts';
import type {Manual} from '../core/manual.ts';
import {EdocError,failure} from '../core/errors.ts';
import {outlineText,readText} from './format.ts';
import {buildInfo} from '../core/build-info.ts';

export function manualLocations(){
 const root=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../':'../../../',import.meta.url));
 return {root,readme:resolve(root,'README.md'),entry:resolve(root,'docs/index.mdoc'),usage:resolve(root,'docs/usage/index.mdoc'),sources:resolve(root,'docs'),html:resolve(root,'dist/manual/index.html')};
}
const help=`edoc 自带工具手册（不读取当前项目配置）
源文主入口：${manualLocations().entry}
可直接读取 .mdoc 及其相对链接，Agent 无需查阅 HTML。
 edoc docs                                输出源文入口、HTML 地址与查询方法
 edoc docs --format json                  输出手册位置和工程身份
 edoc docs serve [--port 5176]             本机 HTTP 阅读，Ctrl+C 结束
 edoc docs outline [--project ID] [--id SECTION_ID] [--depth 0..10 | --all] [--format json|text]
 edoc docs read --id ID [--project ID] [--scope self|subtree] [--offset 0] [--max-chars 12000] [--format json|text]
 edoc docs query --id ID [--project ID] [--depth 0..10] [--max-items 1..10000] [--format json|text]
目录默认 depth=0；--all 显式返回全量。读取使用 sectionId，不使用导航 id/anchor。
入门：edoc docs read --id use:home --format text
最小配置：edoc docs read --id use:first-build --format text
项目正文和事实继续使用 edoc read/query/outline。
`;
class UsageError extends Error{}
export async function manualMain(argv:string[]):Promise<number>{
 let format='text';
 try{
  if((argv.length===1&&['--help','-h'].includes(argv[0]))||(['serve','outline','read','query'].includes(argv[0])&&argv.slice(1).some(t=>['--help','-h'].includes(t)))){process.stdout.write(help);return 0;}
  const command=!argv.length||argv[0].startsWith('--')?'location':argv[0],tokens=command==='location'?argv:argv.slice(1);
  if(!['location','serve','outline','read','query'].includes(command))throw new UsageError('未知手册命令；使用 edoc docs --help');
  const allowed=new Set(command==='location'?['--format']:command==='serve'?['--port']:['--format','--project','--id',...(['outline','query'].includes(command)?['--depth']:[]),...(command==='outline'?['--all']:[]),...(command==='query'?['--max-items']:[]),...(command==='read'?['--scope','--offset','--max-chars']:[])]);
  const args:Record<string,string>=Object.create(null);
  for(let i=0;i<tokens.length;){const key=tokens[i++];if(!allowed.has(key)||Object.hasOwn(args,key))throw new UsageError('未知或重复选项：'+key);if(key==='--all'){args[key]='true';continue;}if(tokens[i]===undefined||tokens[i].startsWith('--'))throw new UsageError(key+' 缺少值');args[key]=tokens[i++];}
  if(args['--all']&&args['--depth']!==undefined)throw new UsageError('--all 与 --depth 不能同时指定');
  format=args['--format']??(['read','query','outline'].includes(command)?'json':'text');if(!['text','json'].includes(format))throw new UsageError('--format 只接受 text/json');
  const number=(key:string,fallback:number,min:number,max:number)=>{const raw=args[key];if(raw===undefined)return fallback;if(!/^(0|[1-9][0-9]*)$/.test(raw)||+raw<min||+raw>max)throw new UsageError(`${key} 范围 ${min}–${max}`);return +raw;};
  for(const key of ['--id','--project'])if(args[key]!==undefined&&!args[key].trim())throw new UsageError(key+' 必须为非空 ID');
  if(['read','query'].includes(command)&&!args['--id'])throw new UsageError(command+' 需要 --id');
  if(args['--scope']!==undefined&&!['self','subtree'].includes(args['--scope']))throw new UsageError('--scope 只接受 self/subtree');
  const depth=number('--depth',0,0,10),maxItems=number('--max-items',1000,1,10000),offset=number('--offset',0,0,Number.MAX_SAFE_INTEGER),maxChars=number('--max-chars',12000,1,100000),port=number('--port',5176,0,65535);
  const directory=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../dist/manual/':'../../manual/',import.meta.url)),html=resolve(directory,'index.html');
  if(command==='serve'){
   if(!existsSync(html))failure('MANUAL_MISSING',html,'','缺少预构建 HTML；源文入口见 edoc docs --help，源码仓库可运行 npm run build:package');
   const server=createServer((request,response)=>{
    const path=new URL(request.url??'/','http://localhost').pathname;
    if(path==='/favicon.ico'){response.writeHead(204).end();return;}
    if(!['/','/index.html'].includes(path)){response.writeHead(404).end('Not found');return;}
    response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(readFileSync(html));
   });
   await new Promise<void>((ready,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);ready();});});
   const address=server.address() as {port:number};process.stdout.write(`edoc 工具手册：http://127.0.0.1:${address.port}/（Ctrl+C 结束）\n`);
   const close=()=>server.close();process.once('SIGINT',close);process.once('SIGTERM',close);return 0;
  }
  const index=resolve(directory,'index.json.gz');
  if(!existsSync(index))failure('MANUAL_MISSING',index,'','缺少预构建手册索引；源文入口见 edoc docs --help，源码仓库可运行 npm run build:package');
  const manual:Manual=JSON.parse(gunzipSync(readFileSync(index)).toString('utf8'));
  if(manual.version!==1)failure('MANUAL_VERSION',directory,'','手册索引版本不支持，请重新安装完整版本');
  if(command==='location'){
   const location={title:manual.title,...manualLocations(),build:buildInfo(),url:pathToFileURL(html).href,projects:Object.keys(manual.projects)};
   process.stdout.write(format==='json'?JSON.stringify(location,null,2)+'\n':`${manual.title}\n源文主入口：${location.entry}\n包说明：${location.readme}\n使用目录：${location.usage}\n直接阅读 .mdoc，按相对链接进入；源文目录：${location.sources}\n\n入门：edoc docs read --id use:home --format text\n最小配置：edoc docs read --id use:first-build --format text\n目录：edoc docs outline（默认浅层；--all 返回完整目录）\n读取使用 sectionId；工具用法使用 docs，项目内容使用普通 read/query/outline。\n\n供人阅读的 HTML：${location.url}\n本机网页阅读：edoc docs serve\n`);return 0;
  }
  if(command==='outline'){
   const result=manualOutline(manual,{project:args['--project'],id:args['--id'],depth:args['--all']?undefined:depth});
   process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':outlineText(result.chapters).join('\n')+'\n');return 0;
  }
  if(command==='query'){process.stdout.write(JSON.stringify(manualQuery(manual,args['--id'],{project:args['--project'],depth,maxItems}),null,2)+'\n');return 0;}
  const result=manualRead(manual,args['--id'],{project:args['--project'],scope:args['--scope'] as 'self'|'subtree'|undefined,offset,maxChars});
  process.stdout.write(format==='json'?JSON.stringify(result,null,2)+'\n':readText(result));return 0;
 }catch(error){
  if(error instanceof UsageError){process.stderr.write(error.message+'\n');return 2;}
  const diagnostics=error instanceof EdocError?error.diagnostics:[{code:'MANUAL_FAILED',file:'<manual>',path:'',message:String(error)}];
  process.stderr.write(format==='json'?JSON.stringify({valid:false,diagnostics},null,2)+'\n':diagnostics.map(d=>`${d.code} ${d.file} ${d.path}: ${d.message}`).join('\n')+'\n');
  return diagnostics.some(d=>d.code==='QUERY_NOT_FOUND')?3:1;
 }
}
