import {readFileSync, writeFileSync, mkdirSync, rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {resolveProjectConfig} from '../packages/core/project.ts';
import {loadBook} from '../packages/core/book.ts';
import {bookHTML} from '../packages/pack-html/book.ts';
import {svg} from '../packages/render-graph/index.ts';
import {drawingRelationScene} from '../packages/drawing/interface-scene.ts';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {drawingSVG} from '../packages/drawing/svg.ts';
import {hardwareDrawings, fpgaDrawings, hardwareReadingDrawings, fpgaReadingDrawings} from './drawing-projects.ts';
import type {Drawing} from '../packages/drawing/types.ts';

// 开发验收产物：不注册公开标签，也不复制维护另一套工程事实。
const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, 'output/drawing-prototype'), project = join(output, '.project');
mkdirSync(join(project, 'docs'), {recursive: true}); mkdirSync(join(project, 'assets'), {recursive: true});
rmSync(join(output, 'index.html'), {force: true});
for(const name of ['hardware','hardware-parts','fpga','hardware-details','stress'])rmSync(join(project,'docs',name+'.mdoc'),{force:true});
mkdirSync(join(project, 'inputs'), {recursive: true});
const read = (name: string) => JSON.parse(readFileSync(join(root, `docs/support/proposals/drawing/${name}.json`), 'utf8'));
const base = read('automatic');
const examples: {name: string; title: string; description: string; drawing: Drawing}[] = [
  {name: 'automatic', title: '自动布局', description: '只提供框、父子关系、端口和连接；没有位置约束。可以使用连线标题开关、缩放、平移和大图查看。', drawing: base},
  {name: 'controlled', title: '意图与局部锁定', description: '沿用同一份图形数据，叠加上下板顺序、BTB 端口对齐、FPGA 局部位置与尺寸、SDIO 经过点。通道是偏好，明显绕行时可以放宽并报告。', drawing: {...base, ...read('controlled')}},
  {name: 'fixed-route', title: '固定多端点路线', description: '三个端点属于同一连接。指定分叉与全部折点，检查后原样输出；箭头只出现在两个接收端。', drawing: read('fixed-route')}
];
const option = (flag: string) => {const i=process.argv.indexOf(flag);return i>=0?process.argv[i+1]:undefined;};
const hardwareRoot=option('--hardware-root'),fpgaRoot=option('--fpga-root');
const stress=[...(hardwareRoot?hardwareDrawings(hardwareRoot).filter(e=>e.name.includes('overview')):[]),...(fpgaRoot?[(await fpgaDrawings(fpgaRoot))[0]]:[])].map(e=>({...e,page:'stress'}));
const projects=[...(hardwareRoot?hardwareReadingDrawings(hardwareRoot):[]),...(fpgaRoot?await fpgaReadingDrawings(fpgaRoot):[]),...stress];
let body = '{% section id="prototype:drawing" title="系统框图审阅" %}\n\n本版按模块关系组织总览：先看组成与协作，再进入模块接线。电源、时钟单独表达，接口名称不在两个端口和线上重复三遍。\n\n[画图原则与参考案例](principles.mdoc)。\n\n';
writeFileSync(join(project,'docs/principles.mdoc'),readFileSync(join(root,'docs/development/records/design/diagram-reading-levels.mdoc'),'utf8'));
if(hardwareRoot)body+='[KY3134 硬件框图](hardware.mdoc)。\n\n';
if(fpgaRoot)body+='[KY3133 FPGA 框图](fpga.mdoc)。\n\n';
if(projects.length)body+='[完整接线压力验证](stress.mdoc)保留全部原交互，用于查线和内核验证，不作为系统总图。\n\n';
for (const example of examples) {
  // 先删除各图旧结果；失败时不让旧文件冒充本次成功。
  for (const ext of ['svg', 'json']) rmSync(join(output, `${example.name}.${ext}`), {force: true});
  const scene = await solveDrawing(example.drawing), svg = drawingSVG(scene, example.drawing);
  writeFileSync(join(project, `assets/${example.name}.svg`), svg);
  writeFileSync(join(output, `${example.name}.svg`), svg);
  writeFileSync(join(output, `${example.name}.json`), JSON.stringify(scene, null, 2) + '\n');
  body += `{% section id="prototype:${example.name}" title="内核样例：${example.title}" collapsed=true %}\n\n${example.description}\n\n{% relation-diagram id="prototype:view:${example.name}" /%}\n\n几何范围 ${Math.ceil(scene.width)} × ${Math.ceil(scene.height)}；${scene.nodes.length} 个框、${scene.connections.length} 条连接。\n\n`;
  if (scene.diagnostics.length) body += scene.diagnostics.map(d => `- ${d.code}：${d.message}`).join('\n') + '\n\n';
  body += '{% /section %}\n\n';
  console.log(`${example.name}: ${scene.nodes.length} 框 / ${scene.connections.length} 连接，${Math.ceil(scene.width)} × ${Math.ceil(scene.height)}，${scene.durationMs.toFixed(1)} ms`);
}
body += '{% /section %}\n';
writeFileSync(join(project, 'docs/index.mdoc'), body);
const pages:Record<string,string>={hardware:'KY3134 硬件框图',fpga:'KY3133 FPGA 框图','hardware-parts':'硬件分部关系','hardware-details':'硬件模块与专题接线',stress:'完整接线压力验证'};
for(const group of Object.keys(pages)){
  const selected=projects.filter(e=>e.page===group);if(!selected.length)continue;
  let page=`{% section id="prototype:${group}" title="${pages[group]}" %}\n\n[返回原型首页](index.mdoc)。${group==='stress'?'本页是全部交互的几何压力验证，不是产品系统总图。':'先识别模块和主通路，再进入下级展开。总图的线表示模块关系，不等同逐引脚接线。'} ${group==='hardware'?'先看完整系统图；[分部关系](hardware-parts.mdoc)与[模块内部/外部接线](hardware-details.mdoc)另页展开，电源树单独阅读。':''}\n\n`;
  for(const e of selected){
    for(const ext of ['svg','json'])rmSync(join(output,e.name+'.'+ext),{force:true});
    const scene=await solveDrawing(e.drawing),id='prototype:view:'+e.name;
    writeFileSync(join(output,e.name+'.svg'),drawingSVG(scene,e.drawing));
    writeFileSync(join(output,e.name+'.json'),JSON.stringify(scene,null,2)+'\n');
    writeFileSync(join(project,'inputs',e.name+'.sources.json'),JSON.stringify(e.sources,null,2)+'\n');
    page+=`{% section id="prototype:${e.name}" title="${e.title}" %}\n\n${e.description}\n\n{% relation-diagram id="${id}" /%}\n\n${scene.nodes.length} 个框 · ${scene.connections.length} 条交互 · ${Math.ceil(scene.durationMs)} ms。\n\n{% section id="prototype:${e.name}:source" title="模块、交互与来源清单" collapsed=true %}\n\n{% code file="inputs/${e.name}.sources.json" language="json" /%}\n\n{% /section %}\n{% /section %}\n\n`;
    console.log(`${e.name}: ${scene.nodes.length} 框 / ${scene.connections.length} 连接，${Math.ceil(scene.width)} × ${Math.ceil(scene.height)}，${scene.durationMs.toFixed(1)} ms`);
  }
  page+='{% /section %}\n';writeFileSync(join(project,'docs',group+'.mdoc'),page);
}
const allExamples=[...examples,...projects];
// 接口事实唯一维护在已有样例；生成副本仅重定位 source，并添加独立的三端时钟用例。
const facts = JSON.parse(readFileSync(join(root, 'examples/gallery/interfaces.json'), 'utf8'));
facts.objects.push({id:'prototype:probe',kind:'node',label:'第三端观察模块（虚构）',ports:[{id:'prototype:probe.clock',label:'参考时钟',direction:'unknown'}]});
facts.relations.push({id:'prototype:clock',kind:'connection',class:'clock',label:'共享参考时钟',endpoints:['ifdemo:host.clk','ifdemo:engine.clk','prototype:probe.clock'],source:{file:'inputs/interfaces.json',selector:'prototype:clock'}});
facts.views = [...allExamples.map(example=>({id:'prototype:view:'+example.name,kind:'architecture',label:example.title,include:{objects:[],relations:[]},drawing:example.drawing,source:{file:'inputs/drawings.json',selector:example.name}})),facts.views[0], {id:'prototype:third-end',kind:'interface',label:'三端连接与独立接口',include:{objects:['ifdemo:host.m_ctrl','ifdemo:engine.s_ctrl','prototype:probe'],relations:['prototype:clock']},layout:facts.views[0].layout,display:{interfaceMode:'collapsed'}}];
function relocate(value: any): void {if(Array.isArray(value)){value.forEach(relocate);return;}if(value&&typeof value==='object'){if(value.source)value.source.file='inputs/interfaces.json';Object.values(value).forEach(relocate);}}
writeFileSync(join(project,'inputs/drawings.json'),JSON.stringify(Object.fromEntries(allExamples.map(e=>[e.name,e.drawing])),null,2)+'\n');
relocate(facts);for(const example of allExamples)facts.views.find((v:any)=>v.id==='prototype:view:'+example.name).source={file:'inputs/drawings.json',selector:example.name};writeFileSync(join(project,'inputs/interfaces.json'),JSON.stringify(facts,null,2)+'\n');
writeFileSync(join(project,'docs/interfaces.mdoc'),`{% section id="prototype:interfaces" title="接口合并、展开与导出" %}

本页复用现有 interfaces.json 的模块、接口和 17 条连接，使用 Drawing 求解器及原有网页控件。点击接口箭头可分别展开两端；点击接口名称或连线查看来源。可使用清晰阅读、大图、缩放和平移。

{% relation-diagram id="gallery:interface-buses" /%}

当前视图 SVG 按当前展开及筛选状态输出；SVG（逐信号）始终保留原视图全部 17 条连接。分组附注、端口属性和连线标题分别控制显示。

{% section id="prototype:interfaces.third" title="第三端点与未知方向" %}

这是由同一批模块的时钟端口及额外观察模块组成的一条三端连接，方向没有声明，图中不补箭头。接口成员没有参与此连接时仍保留本视图范围与未显示连接提示。

{% relation-diagram id="prototype:third-end" /%}

{% /section %}
{% /section %}
`);
writeFileSync(join(project,'docs/edoc.config.js'),"import fs from 'node:fs';const facts=JSON.parse(fs.readFileSync(new URL('../inputs/interfaces.json',import.meta.url),'utf8'));export default {projectId:'drawing',title:'系统框图审阅',data:()=>facts,output:{html:'index.html'}};\n");
const book = await loadBook(await resolveProjectConfig(join(project,'docs/edoc.config.js')));
writeFileSync(join(output,'index.html'),await bookHTML(book));
for(const [name,options] of [['interfaces-current',{}],['interfaces-full',{interfaces:'expanded' as const}]] as const){const result=await drawingRelationScene(book.root.graph,'gallery:interface-buses',options);writeFileSync(join(output,name+'.svg'),svg(result));}
console.log('验证页：output/drawing-prototype/index.html');
