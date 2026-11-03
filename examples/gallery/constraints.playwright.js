async page => {
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(false);await page.reload();await page.setViewportSize({width:1800,height:1100});await page.waitForFunction(()=>window.EdocReady);
 await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
 const ids=['mac:overview','board:flash-wiring','gallery:architecture-intent','gallery:wiring-intent'];
 for(const id of ids){const h=page.locator(`[data-diagram="${id}"]`);await h.scrollIntoViewIfNeeded();await page.waitForFunction(id=>document.querySelector(`[data-diagram="${id}"]`).dataset.initialized==='true',id);}
 const quality=await page.evaluate(ids=>{
  const issues=[],data=JSON.parse(document.querySelector('#edoc-data').textContent),scenes=data.scenes;
  for(const id of ids){
   const s=scenes[id],holder=document.querySelector(`[data-diagram="${id}"]`),g=window.EdocGraphs.find(g=>g.container.closest('[data-diagram]')===holder),svg=holder.querySelector('.static-svg svg');
   for(const net of s.nets){
    const paths=net.paths??net.branches,group=[...svg.querySelectorAll('[data-relation]')].find(e=>e.dataset.relation===net.id),drawn=group.querySelectorAll(':scope > path');
    if(drawn.length!==paths.length)issues.push(id+' 矢量路径数不一致');
    paths.forEach((b,i)=>{
     const edge=g.getCellById('branch:'+net.id+':'+i);
     if(!edge||JSON.stringify(edge.getSource())!==JSON.stringify(b.points[0])||JSON.stringify(edge.getTarget())!==JSON.stringify(b.points.at(-1))||JSON.stringify(edge.getVertices())!==JSON.stringify(b.points.slice(1,-1)))issues.push(id+' 动态路径偏离共享几何');
     if(drawn[i]?.getAttribute('d')!=='M'+b.points.map(p=>`${p.x},${p.y}`).join('L'))issues.push(id+' 静态路径偏离共享几何');
    });
    const junctions=net.junctions??(net.junction?[net.hub]:[]),dots=[...group.querySelectorAll(':scope > circle')];
    if(junctions.length!==dots.length)issues.push(id+' 静态分叉数不一致');
    junctions.forEach((p,i)=>{const cell=g.getCellById('hub:'+net.id+':'+i),pos=cell?.position();if(!pos||Math.abs(pos.x+3-p.x)>.001||Math.abs(pos.y+3-p.y)>.001)issues.push(id+' 动态分叉位置不一致');if(+dots[i]?.getAttribute('cx')!==p.x||+dots[i]?.getAttribute('cy')!==p.y)issues.push(id+' 静态分叉位置不一致');});
   }
  }
  const s=scenes['gallery:architecture-intent'],node=id=>s.nodes.find(n=>n.id==='mac:'+id),rx=node('rx'),fifo=node('fifo'),control=node('control'),parent=node('data-plane');
  if(control.x+control.width+140>parent.x+.01||Math.abs(control.y+control.height/2-parent.y-parent.height/2)>.01)issues.push('顶层 order/align 没有生效');
  if(Math.abs(rx.y+rx.height/2-fifo.y-fifo.height/2)>.01||Math.abs(rx.x-node('tx').x)>.01)issues.push('容器内对齐没有生效');
  const feedback=s.nets.find(n=>n.id==='mac:rel.event');if(!feedback.branches.flatMap(b=>b.points).some(p=>p.y>parent.y+parent.height+40))issues.push('反馈通道没有生效');
  const wiring=scenes['gallery:wiring-intent'],clock=wiring.nets.find(n=>n.id==='board:net.FLASH_SCK'),original=data.entities[clock.id];
  if(clock.endpoints.length!==3||JSON.stringify(clock.endpoints)!==JSON.stringify(original.endpoints))issues.push('多端点事实改变');
  const point=clock.junctions[0],dirs=new Set();for(const b of clock.paths)for(let i=1;i<b.points.length;i++){const a=b.points[i-1],z=b.points[i];if((a.x===z.x&&Math.abs(a.x-point.x)<.001&&point.y>=Math.min(a.y,z.y)&&point.y<=Math.max(a.y,z.y))||(a.y===z.y&&Math.abs(a.y-point.y)<.001&&point.x>=Math.min(a.x,z.x)&&point.x<=Math.max(a.x,z.x)))for(const q of [a,z]){if(q.x<point.x)dirs.add('L');if(q.x>point.x)dirs.add('R');if(q.y<point.y)dirs.add('T');if(q.y>point.y)dirs.add('B');}}
  if(dirs.size<3)issues.push('分叉标记不在实际 T 点');
  return {views:ids.length,issues,clockEndpoints:clock.endpoints.length,trueJunctions:clock.junctions.length,relativeLayout:true,feedbackChannel:true};
 },ids);
 assert(!quality.issues.length,JSON.stringify(quality));
 const arch=page.locator('[data-diagram="gallery:architecture-intent"]'),wiring=page.locator('[data-diagram="gallery:wiring-intent"]');
 await arch.scrollIntoViewIfNeeded();await arch.screenshot({path:'.edoc-build/gallery/layout-intent-architecture.png'});
 await wiring.scrollIntoViewIfNeeded();await wiring.screenshot({path:'.edoc-build/gallery/layout-intent-wiring.png'});
 await wiring.locator('.x6-node[data-cell-id="label:board:net.FLASH_SCK"]').click();const selected=JSON.parse(await page.locator('#properties').innerText());assert(selected.endpoints.length===3&&selected.endpoints.includes('board:J1.SCK'),'选择原 Net 应保留第三端点');
 await wiring.locator('[data-display=relation-labels]').uncheck();assert(await page.evaluate(()=>window.EdocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram==='gallery:wiring-intent').getEdges().every(e=>e.isVisible())),'隐藏标题不能隐藏路径');await wiring.locator('[data-display=relation-labels]').check();
 const pending=page.waitForEvent('download');await wiring.locator('[data-action=svg]').click();const download=await pending;await download.saveAs('.edoc-build/gallery/layout-intent-export.svg');
 await page.emulateMedia({media:'print'});assert(await arch.locator('.static-svg').isVisible()&&await wiring.locator('.static-svg').isVisible(),'打印图必须完整可见');
 await wiring.locator('.static-svg').screenshot({path:'.edoc-build/gallery/layout-intent-print.png'});await page.emulateMedia({media:'screen'});
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'布局提示不能导致整页窄屏溢出');
 assert(!errors.length,errors.join(';'));return {...quality,download:true,print:true,mobile:true,errors};
}
