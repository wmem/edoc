import test from 'node:test';
import assert from 'node:assert/strict';
import {cpSync,mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadConfig,loadIR,query} from '../packages/core/index.ts';
import {repository,expectCode} from './helpers.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
function project(t:any,name:string){const root=mkdtempSync(join(tmpdir(),'engdoc-adapter-'));cpSync(join(repository,'examples',name),root,{recursive:true,filter:p=>!p.includes('.engdoc-build')});t.after(()=>rmSync(root,{recursive:true,force:true}));return {root,load:()=>{const c=loadConfig(join(root,'engdoc.config.json'));return loadIR(c.irDirectory,c);}};}
test('板级 Adapter 从真实存在的 CSV 源转换，三端点与来源完整',t=>{const p=project(t,'board-flash'),g=p.load();const n=query(g,'board:net.FLASH_SCK',{depth:1});assert.equal((n.target.entity as any).endpoints.length,3);assert.equal(n.expansion.items.length,3);assert.equal(n.expansion.items[0].entity.source?.file,'board/pins.csv');});
test('Ball 单处更新同步影响图形、投影表与查询',async t=>{const p=project(t,'board-flash');p.load();const path=join(p.root,'board/pins.csv');writeFileSync(path,readFileSync(path,'utf8').replace('A12','Z99'));const g=p.load(),d=await renderDocument(g,'demo');assert.equal((query(g,'board:U1.QSPI_CLK').target.entity as any).attributes.ball,'Z99');assert.match(d.chapters,/Z99/);assert.match(svg(await scene(g,'board:flash-wiring'),false),/ball Z99/);});
test('MAC Adapter 从 RTL 参数解析宽度，覆盖关系可反查',t=>{const g=project(t,'fpga-mac').load();assert.equal((query(g,'mac:top.s_axis_tdata').target.entity as any).width,64);const refs=query(g,'MAC-TX-001').references;assert.ok(refs.some(r=>(r.entity as any).class==='covers'&&(r.entity as any).fromId==='MAC-CASE-TX'));assert.equal(query(g,'mac:tx-handshake').target.type,'waveform');});
test('源 RTL 位宽更新，不改正文和视图就更新查询',t=>{const p=project(t,'fpga-mac');p.load();const path=join(p.root,'rtl/mac_example.sv');writeFileSync(path,readFileSync(path,'utf8').replace('DATA_WIDTH = 64','DATA_WIDTH = 32'));assert.equal((query(p.load(),'mac:top.s_axis_tdata').target.entity as any).width,32);});
test('Adapter 源冲突和失败不伪装新成功',t=>{const p=project(t,'board-flash');p.load();const path=join(p.root,'board/pins.csv');writeFileSync(path,readFileSync(path,'utf8').replace('board:U5.CLK','board:U1.QSPI_CLK'));expectCode(p.load,'ADAPTER_FAILED');const status=JSON.parse(readFileSync(join(p.root,'.engdoc-build/adapter-status.json'),'utf8'));assert.equal(status.success,false);});
test('Adapter 超时使用非成功诊断',t=>{const p=project(t,'board-flash');const path=join(p.root,'engdoc.config.json');const c=JSON.parse(readFileSync(path,'utf8'));c.adapter.command=['node','-e','setInterval(()=>{},10000)'];c.adapter.timeoutMs=40;writeFileSync(path,JSON.stringify(c));expectCode(p.load,'ADAPTER_FAILED');});
