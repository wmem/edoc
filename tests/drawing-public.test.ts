import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fixture,expectCode} from './helpers.ts';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig,loadProject} from '../packages/core/project.ts';
import {query} from '../packages/core/query.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
const view=()=>JSON.parse(readFileSync(new URL('../docs/ir/authoring/board-map.json',import.meta.url),'utf8')).views[0];
function native(t:any){const f=fixture(t);f.edit('views',d=>d.views=[view()]);f.edit('manifest',d=>{d.irVersion='2.0';d.requiredFeatures=[...d.requiredFeatures??[],'native-drawing'];d.entryDocuments=['docs/native.mdoc'];});writeFileSync(join(f.root,'docs/native.mdoc'),'{% section id="native" title="原生绘图" %}\n{% relation-diagram id="manual:drawing-board-map" /%}\n{% /section %}');return f;}

test('原生框图通过标准项目加载、构建及查询，无自定义scene注入',async t=>{
  const f=native(t),config=await resolveProjectConfig(join(f.root,'edoc.config.js')),project=await loadProject(config);
  assert.ok(project.graph.manifest.requiredFeatures?.includes('native-drawing'));
  const q=query(project.graph,'manual:drawing-board-map',{depth:0});assert.deepEqual((q.target.entity as any).drawing,view().drawing);
  assert.ok(!project.graph.index.has('fpga'),'局部显示节点不注册为真实器件');
  const s=await scene(project.graph,'manual:drawing-board-map');assert.equal(s.layoutEngine,'drawing');assert.equal(s.drawingInput!.schemaVersion,'1.0');assert.deepEqual(s.drawing!.satisfiedConstraints,verifyDrawingScene(s.drawingInput!,s.drawing!));
  const html=await bookHTML(await loadBook(config));assert.match(html,/manual:drawing-board-map/);assert.match(html,/board-map-example/);assert.match(html,/"drawingInput"/);
  const xml=svg(s);assert.match(xml,/data-connection="board-bus"/);assert.match(xml,/BTB/);assert.match(xml,/data:font\/woff2;base64,/);
});

test('项目自动识别native-drawing能力，直接IR必须显式声明',async t=>{
 const f=native(t);f.edit('manifest',d=>d.requiredFeatures=d.requiredFeatures.filter((x:string)=>x!=='native-drawing'));
 expectCode(f.load,'IR_FEATURE_REQUIRED','/views/0/drawing');
 const p=await loadProject(await resolveProjectConfig(join(f.root,'edoc.config.js')));assert.ok(p.graph.manifest.requiredFeatures?.includes('native-drawing'));
});
for(const [name,mutate,code]of [
 ['混用include',(v:any)=>v.include.objects=['board:U1'],'DRAWING_VIEW_CONFLICT'],
 ['混用外层layout',(v:any)=>v.layout={direction:'LR'},'DRAWING_VIEW_CONFLICT'],
 ['混用接口展开',(v:any)=>v.display={interfaceMode:'collapsed'},'DRAWING_VIEW_CONFLICT'],
 ['悬空显示端点',(v:any)=>v.drawing.connections[0].ends[0].node='missing','DRAWING_REFERENCE'],
 ['端口越界比例',(v:any)=>v.drawing.layout.constraints.find((r:any)=>r.type==='port').offset=2,'SCHEMA'],
 ['拼错布局字段',(v:any)=>v.drawing.layout.spacng={},'SCHEMA'],
 ['不再接受草案版本',(v:any)=>v.drawing.schemaVersion='drawing-draft-1','SCHEMA']
]as const)test('原生视图拒绝'+name,t=>{const f=native(t);f.edit('views',d=>mutate(d.views[0]));expectCode(f.load,code,name==='拼错布局字段'?'/views/0/drawing/layout/spacng':undefined);});

test('公共构建入口保留固定路线的失败，不回退自动布局',async t=>{
 const f=native(t);f.edit('views',d=>{const x=d.views[0].drawing;x.layout.constraints.find((r:any)=>r.type==='fixedRoute').paths[0].via=[{x:99,y:99}];});
 await assert.rejects(scene(f.load(),'manual:drawing-board-map'),(e:any)=>e.diagnostics?.some((d:any)=>d.code==='DRAWING_ORTHOGONAL'&&d.path.startsWith('/views/0/drawing')&&d.message.includes('t1-bus')));
});

test('独立检查器拒绝在线旁的标题，即使无碰撞且声称约束满足',async t=>{
 const f=native(t),s=await scene(f.load(),'manual:drawing-board-map'),forged=structuredClone(s.drawing!);forged.connections[0].labels[0].x+=12;
 assert.throws(()=>verifyDrawingScene(s.drawingInput!,forged),(e:any)=>e.code==='DRAWING_VERIFY'&&e.message.includes('标题中心'));
});
