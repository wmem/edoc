import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,cpSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {repository,fixture,save,prepareExample} from './helpers.ts';
function inspect(file:string){const p=spawnSync('python3',['-c',`import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\ntext=''.join((p.extract_text() or '') for p in r.pages)\nlinks=sum(1 for p in r.pages for a in p.get('/Annots',[]) if a.get_object().get('/Subtype')=='/Link')\nprint(json.dumps({'pages':len(r.pages),'outline':len(r.outline),'links':links,'text':''.join(text.split())},ensure_ascii=False))`,file],{encoding:'utf8',timeout:10000});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
function build(args:string[]){const r=spawnSync(process.execPath,['packages/cli/edoc.ts','build',...args],{cwd:repository,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);}
test('PDF 保留中文、全部 Tabs/折叠内容、目录书签与内部链接',{timeout:40000},t=>{
 const dir=mkdtempSync(join(tmpdir(),'edoc-pdf-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const output=join(dir,'mac.pdf');
 const project=join(dir,'project');cpSync(join(repository,'examples/fpga-mac'),project,{recursive:true,filter:p=>!p.includes('.edoc-build')});prepareExample(project);
 build(['--config',join(project,'edoc.config.js'),'--format','pdf','--output',output]);const d=inspect(output);
 assert.ok(!d.text.includes('\u0000'),'PDF 不能包含缺字映射');assert.ok(d.pages>=5);assert.ok(d.outline>0);assert.ok(d.links>10);
 for(const phrase of ['TX视角独有正文','RX视角独有正文','APB4视角独有正文','规范示意','RXFIFO','状态图'])assert.ok(d.text.includes(phrase),phrase);
});
test('长表格跨页保留所有行与重复表头',{timeout:40000},t=>{
 const f=fixture(t);const rows=Array.from({length:160},(_,i)=>({id:'long:row.'+i,values:{name:'ROW_SENTINEL_'+String(i).padStart(3,'0'),value:i}}));
 save(join(f.ir,'tables.json'),{tables:[{id:'long:table',kind:'table',label:'长表测试',columns:[{field:'name',label:'ROW_HEADER_SENTINEL',type:'string'},{field:'value',label:'值',type:'number'}],rows}]});f.edit('manifest',d=>{d.resources.push({type:'tables',path:'tables.json'});d.entryDocuments=['docs/long.mdoc'];});
 writeFileSync(join(f.root,'docs/long.mdoc'),'{% section id="long:section" title="长表" %}\n{% table id="long:table" /%}\n{% /section %}');const output=join(f.workspace,'long.pdf');
 build(['--config',join(f.root,'edoc.config.js'),'--format','pdf','--output',output]);const d=inspect(output);assert.ok(d.pages>3);
 for(let i=0;i<160;i++)assert.ok(d.text.includes('ROW_SENTINEL_'+String(i).padStart(3,'0')));
 assert.ok(d.text.split('ROW_HEADER_SENTINEL').length>3);
});
test('PDF 书签保留模块父子路径，目录标题与面板不抢占层级',{timeout:40000},t=>{
 const f=fixture(t);f.edit('manifest',d=>d.entryDocuments=['docs/hierarchy.mdoc']);
 const extra=Array.from({length:80},(_,i)=>'### 查询条目 '+i+'\n说明\n').join('\n');
 writeFileSync(join(f.root,'docs/hierarchy.mdoc'),'{% section id="modules" title="功能模块" %}\n{% section id="storage" title="存储与配置" %}\n{% section id="qspi" title="QSPI 模块" %}\n## 职责与边界\n正文\n{% panel title="布局面板" %}说明{% /panel %}\n'+extra+'\n{% /section %}\n{% /section %}\n{% /section %}');
 const output=join(f.workspace,'hierarchy.pdf');build(['--config',join(f.root,'edoc.config.js'),'--format','pdf','--output',output]);
 const code=`import json,sys
from pypdf import PdfReader
paths=[]
def walk(items,parents=()):
 last=None
 for item in items:
  if isinstance(item,list): walk(item,parents+((last,) if last else ()))
  else:
   last=str(item['/Title']);paths.append(parents+(last,))
reader=PdfReader(sys.argv[1])
walk(reader.outline)
print(json.dumps({'paths':paths,'toc':reader.pages[1].extract_text()},ensure_ascii=False))`;
 const result=spawnSync('python3',['-c',code,output],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);
 const data=JSON.parse(result.stdout),paths:string[][]=data.paths;
 const first=data.toc.replace(/\s/g,'');
 assert.ok(first.includes('目录')&&first.includes('功能模块'),'长目录首页应同时包含标题和首个条目：'+JSON.stringify(data.toc));
 assert.ok(paths.some(p=>p.slice(-4).join('/')==='功能模块/存储与配置/QSPI 模块/职责与边界'));
 assert.ok(paths.every(p=>!p.includes('目录')&&!p.includes('布局面板')));
});

test('分篇目录的 PDF 书签与网页分组一致，文章标题不重复为顶层',{timeout:40000},t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-multipage-outline-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,text:string)=>{mkdirSync(join(root,file,'..'),{recursive:true});writeFileSync(join(root,file),text);};
 write('docs/edoc.config.js',"export default {documents:'docs',compactIndex:true};");
 write('docs/index.mdoc','{% section id="home" title="手册入口" %}总览。{% /section %}');
 write('docs/modules/index.mdoc','{% section id="modules" title="功能模块" %}按职责选择。{% /section %}');
 write('docs/modules/storage/index.mdoc','{% section id="storage" title="存储与配置" %}模块分组。{% /section %}');
 write('docs/modules/storage/qspi.mdoc','{% section id="qspi" title="QSPI 模块" %}\n## 职责与边界\n查证来源。\n{% /section %}');
 const output=join(root,'result.pdf');build(['--config',join(root,'docs/edoc.config.js'),'--format','pdf','--output',output]);
 const code=`import json,sys
from pypdf import PdfReader
paths=[]
def walk(items,parents=()):
 last=None
 for item in items:
  if isinstance(item,list):walk(item,parents+((last,) if last else ()))
  else:
   last=str(item['/Title']);paths.append(parents+(last,))
walk(PdfReader(sys.argv[1]).outline)
print(json.dumps(paths,ensure_ascii=False))`;
 const result=spawnSync('python3',['-c',code,output],{encoding:'utf8',timeout:10000});assert.equal(result.status,0,result.stderr);const paths:string[][]=JSON.parse(result.stdout);
 assert.ok(paths.some(p=>p.slice(-4).join('/')==='功能模块/存储与配置/QSPI 模块/职责与边界'),JSON.stringify(paths));
 assert.equal(paths.filter(p=>p.at(-1)==='QSPI 模块').length,1,'不额外创建同名文章标题书签');
});
