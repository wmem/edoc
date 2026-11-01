import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {repository,fixture,save} from './helpers.ts';
function inspect(file:string){const p=spawnSync('python3',['-c',`import json,sys\nfrom pypdf import PdfReader\nr=PdfReader(sys.argv[1])\ntext=''.join((p.extract_text() or '') for p in r.pages)\nlinks=sum(1 for p in r.pages for a in p.get('/Annots',[]) if a.get_object().get('/Subtype')=='/Link')\nprint(json.dumps({'pages':len(r.pages),'outline':len(r.outline),'links':links,'text':''.join(text.split())},ensure_ascii=False))`,file],{encoding:'utf8',timeout:10000});assert.equal(p.status,0,p.stderr);return JSON.parse(p.stdout);}
function build(args:string[]){const r=spawnSync(process.execPath,['packages/cli/engdoc.ts','build',...args],{cwd:repository,encoding:'utf8',timeout:30000});assert.equal(r.status,0,r.stderr);}
test('PDF 保留中文、全部 Tabs/折叠内容、目录书签与内部链接',{timeout:40000},t=>{
 const dir=mkdtempSync(join(tmpdir(),'engdoc-pdf-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const output=join(dir,'mac.pdf');
 build(['--config','examples/fpga-mac/engdoc.config.json','--format','pdf','--output',output]);const d=inspect(output);
 assert.ok(!d.text.includes('\u0000'),'PDF 不能包含缺字映射');assert.ok(d.pages>=5);assert.ok(d.outline>0);assert.ok(d.links>10);
 for(const phrase of ['TX视角独有正文','RX视角独有正文','APB4视角独有正文','规范示意','RXFIFO','状态图'])assert.ok(d.text.includes(phrase),phrase);
});
test('长表格跨页保留所有行与重复表头',{timeout:40000},t=>{
 const f=fixture(t);const rows=Array.from({length:160},(_,i)=>({id:'long:row.'+i,values:{name:'ROW_SENTINEL_'+String(i).padStart(3,'0'),value:i}}));
 save(join(f.ir,'tables.json'),{tables:[{id:'long:table',kind:'table',label:'长表测试',columns:[{field:'name',label:'ROW_HEADER_SENTINEL',type:'string'},{field:'value',label:'值',type:'number'}],rows}]});f.edit('manifest',d=>{d.resources.push({type:'tables',path:'tables.json'});d.entryDocuments=['docs/long.mdoc'];});
 writeFileSync(join(f.root,'docs/long.mdoc'),'{% section id="long:section" title="长表" %}\n{% table id="long:table" /%}\n{% /section %}');const output=join(f.workspace,'long.pdf');
 build(['--ir',f.ir,'--project-root',f.root,'--format','pdf','--output',output]);const d=inspect(output);assert.ok(d.pages>3);
 for(let i=0;i<160;i++)assert.ok(d.text.includes('ROW_SENTINEL_'+String(i).padStart(3,'0')));
 assert.ok(d.text.split('ROW_HEADER_SENTINEL').length>3);
});
