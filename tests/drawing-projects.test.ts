import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {hardwareDrawings, fpgaDrawings, hardwareReadingDrawings, fpgaReadingDrawings} from '../scripts/drawing-projects.ts';
import {solveDrawing} from '../packages/drawing/solve.ts';
import {verifyDrawingScene} from '../packages/drawing/verify.ts';
import {drawingSVG} from '../packages/drawing/svg.ts';

const hardware=process.env.EDOC_HARDWARE_PROJECT,fpga=process.env.EDOC_FPGA_PROJECT;
test('硬件系统关系视图去除供电接线，聚合来源和模块归属完整可追溯',{skip:!hardware&&'需要只读硬件工程',timeout:60000},async()=>{
  const policy=JSON.parse(readFileSync(join(hardware!,'board/v01/definition/architecture-views.json'),'utf8'));
  const facts=JSON.parse(readFileSync(join(hardware!,'board/v01/definition/architecture.json'),'utf8'));
  const examples=hardwareReadingDrawings(hardware!),views=examples.filter(e=>e.page==='hardware'||e.page==='hardware-parts');
  assert.deepEqual(views.map(e=>e.name),['hardware-system',...policy.readingViews.map((v:any)=>v.id)]);
  const main=views[0],map=JSON.parse(readFileSync(join(hardware!,'board/v01/definition/board-map.json'),'utf8'));
  assert.equal(main.page,'hardware');assert.equal(main.drawing.nodes.length,map.modules.length+facts.boards.length);assert.equal(main.drawing.connections.length,map.relations.length);
  assert.ok(views.slice(1).every(e=>e.page==='hardware-parts'),'分部图不能替代完整总图');
  const shown=new Set(views.slice(1).flatMap(e=>e.drawing.nodes.filter(n=>!['BOTTOM','TOP'].includes(n.id)).map(n=>n.id)));
  assert.deepEqual(shown,new Set(policy.overview.modules.map((m:any)=>m.id)));
  const covered=new Set(policy.overview.modules.flatMap((m:any)=>m.members));
  for(const n of facts.nodes)assert.ok(covered.has(n.key)||policy.omittedFromOverview[n.key],n.key+'缺少归属或省略说明');
  for(const e of views.slice(1)){
    const scene=await solveDrawing(e.drawing);assert.deepEqual(scene.satisfiedConstraints,verifyDrawingScene(e.drawing,scene));
    assert.ok(e.drawing.nodes.flatMap(n=>n.ports??[]).every(p=>p.appearance==='slot'&&p.label===''),'总图不重复写端口标签');
    for(const c of e.drawing.connections){
      const definition=policy.overview.relations.find((r:any)=>r.id===c.id)!;
      assert.deepEqual(c.originIds,definition.sources.map((id:string)=>'board/v01/definition/architecture.json#interactions/'+id));
      for(const id of definition.sources){const r=facts.interactions.find((r:any)=>r.key===id);assert.ok(r);assert.ok(!['power','clock'].includes(r.class));}
      assert.equal(c.ends.filter(end=>end.marker==='arrow').length,0,'聚合关系不得补猜方向');
      const owners=c.ends.map(end=>e.drawing.nodes.find(n=>n.id===end.node)!.parentId);
      if(owners[0]&&owners[1]&&owners[0]!==owners[1])assert.deepEqual(c.ends.map(end=>end.node),['interboard-bottom','interboard-top']);
    }
  }
  const scene=await solveDrawing(main.drawing);assert.deepEqual(scene.satisfiedConstraints,verifyDrawingScene(main.drawing,scene));
  const node=(id:string)=>scene.nodes.find(n=>n.id===id)!;
  const top=node('TOP'),bottom=node('BOTTOM'),fpga=node('processing');
  assert.ok(top.y+top.height<bottom.y,'两板分框而非相互包围');
  assert.ok(Math.abs(fpga.x+fpga.width/2-bottom.x-bottom.width/2)<30,'底板FPGA横向居中');
  for(const id of ['interboard-top','interboard-bottom']){
    const bar=node(id),board=node(bar.parentId!);assert.ok(bar.width/bar.height>20,'BTB为长条');
    assert.ok(bar.width>board.contentBox.width*.95,'BTB沿板边横贯');
    assert.ok(id.endsWith('top')?board.contentBox.y+board.contentBox.height-bar.y-bar.height<1:bar.y-board.contentBox.y<30,'BTB位于相向板边');
  }
  const resolved=(main.sources as any).resolved;
  for(let i=1;i<=6;i++){
    const m=resolved.find((m:any)=>m.id==='t1s-'+i);assert.equal(m.channel.internal,i);assert.equal(m.channel.net,`LAN8670_${i}_3V3`);
    // 内部通道1选择U12，而非反序面板T1S-1的U18。
    assert.equal(m.channel.ref,['U12','U14','U15','U16','U17','U18'][i-1]);assert.equal(node(m.id).title.lines[0],'T1S-'+i);
  }
  const pairs=new Set<string>();
  for(const c of main.drawing.connections){
    const r=map.relations.find((r:any)=>r.id===c.id);assert.deepEqual(c.originIds,r.sources.map((id:string)=>'board/v01/definition/architecture.json#interactions/'+id));
    const pair=c.ends.map(e=>e.node).sort().join('/');assert.ok(!pairs.has(pair));pairs.add(pair);
    assert.ok(r.sources.every((id:string)=>!['power','clock'].includes(facts.interactions.find((e:any)=>e.key===id)?.class)));
    assert.ok(c.ends.every(e=>!e.marker),'无证据不猜箭头');
    const owners=c.ends.map(e=>node(e.node).parentId);if(owners[0]!==owners[1])assert.deepEqual(c.ends.map(e=>e.node),['interboard-top','interboard-bottom']);
  }
  const noLines=structuredClone(main.drawing);noLines.connections=[];noLines.layout!.constraints=noLines.layout!.constraints!.filter(r=>!['fixedRoute','label','route'].includes(r.type));
  const clean=await solveDrawing(noLines);assert.deepEqual(clean.nodes,scene.nodes,'隐藏全部线后模块地图和匿名锚点保持原位');
  assert.ok(examples.some(e=>e.name==='hardware-top-ports'));
  const full=hardwareDrawings(hardware!).filter(e=>e.name.includes('overview'));assert.ok(full.every(e=>e.drawing.connections.length===75),'完整压力图继续保留');
});

test('FPGA功能总图保留数据和寄存器协作，包装与时钟不挤入总览',{skip:!fpga&&'需要只读FPGA工程',timeout:60000},async()=>{
  const examples=await fpgaReadingDrawings(fpga!),main=examples[0],source:any=main.sources;
  assert.equal(main.name,'fpga-system');assert.equal(main.drawing.nodes.length,4);assert.equal(main.drawing.connections.length,5);
  assert.ok(main.drawing.nodes.every(n=>!n.parentId));
  assert.ok(main.drawing.connections.every(c=>!c.id.endsWith('.clocks')&&!c.id.endsWith('.media-runtime')));
  assert.ok(source.objects.some((n:any)=>n.id.endsWith('.frames')&&n.parentId.endsWith('.spi')),'真实归属仍在来源');
  assert.ok(examples.some(e=>e.name==='fpga-datapath-control'),'运行控制有独立下级入口');
  for(const e of examples){const scene=await solveDrawing(e.drawing);assert.deepEqual(verifyDrawingScene(e.drawing,scene),scene.satisfiedConstraints);assert.ok(e.drawing.nodes.flatMap(n=>n.ports??[]).every(p=>p.appearance==='slot'));}
});
test('真实KY3134全量及主题视图保持源模块、每条交互、BTB内外锚点与方向',{skip:!hardware&&'通过 EDOC_HARDWARE_PROJECT 指定只读工程',timeout:60000},async()=>{
  const source=JSON.parse(readFileSync(join(hardware!,'board/v01/definition/architecture.json'),'utf8'));
  const cases=hardwareDrawings(hardware!);
  for(const example of cases){
    const input=example.drawing,before=structuredClone(input),scene=await solveDrawing(input),plane=example.name.includes('overview')?'overview':example.name.split('-').at(-1);
    const relations=source.interactions.filter((r:any)=>r.planes.includes(plane));
    assert.deepEqual(new Set(scene.connections.map(c=>c.id)),new Set(relations.map((r:any)=>r.key)));
    assert.equal(scene.nodes.length,input.nodes.length);assert.deepEqual(input,before);
    assert.deepEqual(scene.satisfiedConstraints,verifyDrawingScene(input,scene));
    for(const relation of relations){const c=scene.connections.find(c=>c.id===relation.key)!;assert.deepEqual(c.ends.map(e=>e.node),[relation.from,relation.to]);assert.deepEqual(c.ends.filter(e=>e.marker==='arrow').map(e=>e.id),relation.flow==='forward'?['to']:[]);}
    if(plane==='overview'){
      assert.equal(scene.nodes.length,36);assert.equal(scene.connections.length,75);
      const crossing=scene.connections.filter(c=>new Set(c.ends.map(e=>scene.nodes.find(n=>n.id===e.node)!.parentId)).size>1);
      assert.equal(crossing.length,9);for(const c of crossing)assert.deepEqual(c.ends.map(e=>e.node),['interboard-bottom','interboard-top']);
      for(const id of ['interboard-bottom','interboard-top']){const n=scene.nodes.find(n=>n.id===id)!;assert.equal(n.ports.length,18);assert.equal(new Set(n.ports.flatMap(p=>p.originIds)).size,9);}
    }
    const output=drawingSVG(scene,input,false);assert.equal((output.match(/data-connection=/g)??[]).length,relations.length);
  }
});

test('真实KY3133从生产装配投影整体与三种展开，包含时钟及实际层级',{skip:!fpga&&'通过 EDOC_FPGA_PROJECT 指定只读工程',timeout:60000},async()=>{
  const examples=await fpgaDrawings(fpga!);
  assert.equal(examples.length,4);
  for(const e of examples){
    const scene=await solveDrawing(e.drawing);assert.equal(scene.connections.length,e.drawing.connections.length);assert.deepEqual(verifyDrawingScene(e.drawing,scene),scene.satisfiedConstraints);
    if(e.name==='fpga-overall'){
      assert.equal(scene.nodes.length,8);assert.equal(scene.connections.length,7);
      assert.ok(scene.connections.some(c=>c.id.endsWith('.clocks')));
      const frames=scene.nodes.find(n=>n.id.endsWith('.frames'))!;assert.ok(frames.parentId!.endsWith('.spi'));
      const media=scene.nodes.find(n=>n.id.endsWith('.media'))!;assert.ok(media.parentId!.endsWith('.system'));
    }
    for(const r of (e.sources as any).relations)assert.ok(r.source.file);
  }
});
