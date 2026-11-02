import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,repository,expectCode,save} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
test('适度规模层次图保留 24 节点与 23 条关系',async t=>{
 const f=fixture(t);f.edit('objects',d=>d.objects=Array.from({length:24},(_,i)=>({id:'scale:n'+i,kind:'node',label:'模块 '+i})));
 f.edit('relations',d=>d.relations=Array.from({length:23},(_,i)=>({id:'scale:e'+i,kind:'connection',class:i%2?'control':'data',endpoints:['scale:n'+i,'scale:n'+(i+1)]})));
 f.edit('views',d=>d.views=[{id:'scale:v',kind:'architecture',include:{objects:Array.from({length:24},(_,i)=>'scale:n'+i),relations:Array.from({length:23},(_,i)=>'scale:e'+i)},layout:{direction:'TB',routing:'orthogonal'}}]);
 const s=await scene(f.load(),'scale:v');assert.equal(s.nodes.length,24);assert.equal(s.nets.length,23);assert.ok(s.height>s.width);assert.equal((svg(s,false).match(/data-relation=/g)??[]).length,23);
});
test('父子层级包围框与 Node.parentId 保持一致',async t=>{
 const f=fixture(t);f.edit('objects',d=>d.objects[1].parentId='board:U1');const s=await scene(f.load(),'board:flash-wiring'),parent=s.nodes.find(n=>n.id==='board:U1')!,child=s.nodes.find(n=>n.id==='board:U5')!;
 assert.equal(child.parentId,parent.id);assert.ok(parent.x<child.x&&parent.y<child.y);assert.ok(parent.x+parent.width>=child.x+child.width);
});
test('构建失败删除旧交付物，不把旧成功文件当成最新',t=>{
 const f=fixture(t);f.edit('relations',d=>d.relations[0].endpoints[2]='missing');const output=join(f.workspace,'old.html');writeFileSync(output,'OLD SUCCESS');
 const r=spawnSync(process.execPath,['packages/cli/engdoc.ts','build','--config',join(f.root,'engdoc.config.js'),'--format','html','--output',output],{cwd:repository,encoding:'utf8',timeout:10000});assert.equal(r.status,1);assert.equal(existsSync(output),false);
});
test('表格类型、引用与 WaveJSON 正反例',t=>{
 const f=fixture(t);save(join(f.ir,'tables.json'),{tables:[{id:'table:x',kind:'table',label:'x',columns:[{field:'width',label:'width',type:'number'}],rows:[{id:'row:x',objectId:'board:U1.QSPI_CLK'}]}]});f.edit('manifest',d=>d.resources.push({type:'tables',path:'tables.json'}));assert.ok(f.load());
 const table=JSON.parse(readFileSync(join(f.ir,'tables.json'),'utf8'));table.tables[0].columns[0].type='string';save(join(f.ir,'tables.json'),table);expectCode(f.load,'TABLE_VALUE');
});
test('标准 WaveJSON 有来源、仿真/示意标识，拒绝无效类型',t=>{
 const f=fixture(t);save(join(f.ir,'waveforms.json'),{waveforms:[{id:'wave:x',kind:'waveform',label:'wave',format:'wavejson',semantic:'simulation',source:{file:'trace.json'},data:{signal:[{name:'clk',wave:'p...'}]}}]});f.edit('manifest',d=>d.resources.push({type:'waveforms',path:'waveforms.json'}));assert.ok(f.load());const data=JSON.parse(readFileSync(join(f.ir,'waveforms.json'),'utf8'));data.waveforms[0].data.signal=[123];save(join(f.ir,'waveforms.json'),data);expectCode(f.load,'WAVEJSON');
});
test('危险文本不成为 HTML，未知宽度不被猜测',async t=>{
 const f=fixture(t);f.edit('objects',d=>{d.objects[0].ports[0].label='</script><img src=x onerror=alert(1)>';delete d.objects[0].ports[0].width;d.objects[0].ports[0].widthExpr='UNRESOLVED';});
 const g=f.load();const output=svg(await scene(g,'board:flash-wiring'),false);assert.ok(!output.includes('<img src=x'));assert.ok(output.includes('UNRESOLVED'));assert.ok(!('width'in(g.index.get('board:U1.QSPI_CLK')!.entity)));
});
test('父节点有大量自身端口时框与画布不裁切',async t=>{const f=fixture(t);f.edit('objects',d=>{d.objects[1].parentId='board:U1';for(let i=0;i<24;i++)d.objects[0].ports.push({id:'extra:p'+i,label:'extra'+i,direction:'unknown'});});const s=await scene(f.load(),'board:flash-wiring');for(const n of s.nodes)for(const p of n.ports){assert.ok(p.y<n.y+n.height);assert.ok(p.y<s.height);}});
test('覆盖引用悬空与表格重复行 ID 均失败',t=>{const f=fixture(t);save(join(f.ir,'references.json'),{references:[{id:'ref:x',kind:'reference',fromId:'board:U1',targetId:'missing-spec',class:'covers'}]});f.edit('manifest',d=>d.resources.push({type:'references',path:'references.json'}));expectCode(f.load,'REFERENCE_MISSING');save(join(f.ir,'references.json'),{references:[]});save(join(f.ir,'tables.json'),{tables:[{id:'table:x',kind:'table',label:'x',columns:[{field:'name',label:'n',type:'string'}],rows:[{id:'row:x',values:{name:'a'}},{id:'row:x',values:{name:'b'}}]}]});f.edit('manifest',d=>d.resources.push({type:'tables',path:'tables.json'}));expectCode(f.load,'DUPLICATE_ID');});
