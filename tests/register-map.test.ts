import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadProject,resolveProjectConfig} from '../packages/core/project.ts';
import {renderDocument} from '../packages/doc-theme/render.ts';
import {graphFromResources} from '../packages/core/graph.ts';
import {registerLeafProjection,registerMapProjection} from '../packages/extensions/register-map/model.ts';
import {registerMapTable,registerMapSVG} from '../packages/extensions/register-map/render.ts';
import type {ResourceType} from '../packages/core/types.ts';
const data=()=>JSON.parse(readFileSync('docs/ir/authoring/fpga-register-handbook.json','utf8'));
const graph=(d:any)=>graphFromResources(Object.entries(d).filter(([,v])=>Array.isArray(v)).map(([type,v])=>({type:type as ResourceType,data:{[type]:v},file:'facts.json'})),{projectId:'p',irVersion:'2.0',requiredFeatures:['registers','register-maps'],resources:[],entryDocuments:[]},{root:process.cwd()});
test('IR2 正式寄存器主例保留叶列表、用途与独立分配范围',()=>{
 const g=graph(data()),p=registerMapProjection(g,'fpga:csr'),leaf=registerLeafProjection(g,'fpga:csr');
 assert.equal(p.totalKind,'immediate-instances');assert.equal(p.total,'2');
 assert.deepEqual(p.intervals.map(r=>[r.start,r.endExclusive]),[['0x40000000','0x40000100'],['0x40000100','0x40000200']]);
 assert.equal(leaf.directRegisterTotal,'4');assert.deepEqual(leaf.rows.map(r=>[r.definitionId,r.regionOffset!.address,r.address]),[['fpga:control','0x0','0x40000000'],['fpga:version','0x4','0x40000004'],['fpga:status','0x0','0x40000100'],['fpga:threshold','0x4','0x40000104']]);
 assert.match(registerMapSVG(g,'fpga:csr'),/全局控制区/);assert.match(registerMapTable(g,'fpga:csr',{mode:'regions'}),/末地址（含）/);
 assert.match(registerMapTable(g,'fpga:csr',{mode:'registers',register:'fpga:control'}),/CTRL · 全局控制/);
});
test('呈现标签模式与显式定义章节校验保留，包括隐藏内容',async t=>{
 const root=mkdtempSync(join(tmpdir(),'edoc-ir2-presentation-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'docs/ir'),{recursive:true});writeFileSync(join(root,'docs/edoc.config.js'),'export default {};');writeFileSync(join(root,'docs/ir/facts.json'),JSON.stringify(data()));
 const write=(body:string)=>writeFileSync(join(root,'docs/index.mdoc'),body),load=async()=>loadProject(await resolveProjectConfig(undefined,root));
 write('{% section id="definition" title="定义" %}说明。{% /section %}\n{% register-map id="fpga:csr" mode="regions" /%}\n{% register-map id="fpga:csr" mode="registers" definitions={"fpga:control":"definition"} /%}');
 const rendered=await renderDocument((await load()).graph,'手册');assert.ok(!rendered.chapters.includes('<svg'));assert.match(rendered.chapters,/data-map-mode="regions"/);
 for(const attrs of ['register=""','register="missing"','definitions={"fpga:control":"missing"}','definitions={"fpga:control":"fpga:control"}']){write('{% tabs %}{% tab name="隐藏" %}{% register-map id="fpga:csr" mode="registers" '+attrs+' /%}{% /tab %}{% /tabs %}');await assert.rejects(load,/DOCUMENT_REFERENCE/);}
});
