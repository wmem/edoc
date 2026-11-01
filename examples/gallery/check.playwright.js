async page => {
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.context().setOffline(false);await page.reload();
 await page.setViewportSize({width:1440,height:1000});
 await page.waitForFunction(()=>window.EngDocReady);
 await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
 const figures=page.locator('[data-diagram]');assert(await figures.count()===16,'应有 16 张交互图');
 const wiring=page.locator('[data-diagram="board:flash-wiring"]');await wiring.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-diagram="board:flash-wiring"]').dataset.initialized==='true');
 await wiring.locator('.x6-node[data-cell-id="label:board:net.FLASH_SCK"]').click();
 const clock=JSON.parse(await page.locator('#properties').innerText());assert(clock.id==='board:net.FLASH_SCK'&&clock.endpoints.length===3&&clock.endpoints.includes('board:J1.SCK'),'三端点 Net 应显示测试连接器端点');
 await wiring.locator('input[data-class="clock"]').uncheck();
 assert(await page.evaluate(()=>window.EngDocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram==='board:flash-wiring').getEdges().filter(e=>e.getData()?.entityId==='board:net.FLASH_SCK').every(e=>!e.isVisible())),'分类筛选应隐藏整个 Net');
 await wiring.locator('input[data-class="clock"]').check();
 await wiring.locator('[data-group="board:qspi"]').click();
 assert(await page.evaluate(()=>window.EngDocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram==='board:flash-wiring').getEdges().some(e=>e.id.startsWith('bus:'))),'应能切换总线总览');
 await wiring.locator('[data-group="board:qspi"]').click();
 const downloadPromise=page.waitForEvent('download');await wiring.locator('[data-action="svg"]').click();const download=await downloadPromise;assert(download.suggestedFilename().endsWith('.svg'),'应支持 SVG 导出');
 const tx=page.locator('[data-diagram="mac:tx-view"]');await tx.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-diagram="mac:tx-view"]').dataset.initialized==='true');
 await tx.locator('[port="mac:top.s_axis_tdata"]').first().click();
 const port=JSON.parse(await page.locator('#properties').innerText());assert(port.id==='mac:top.s_axis_tdata'&&port.width===64&&port.direction==='in'&&port.source.file.endsWith('rtl/mac_example.sv'),'端口选择应显示 RTL 位宽与来源');
 for(const name of ['RX 接收','APB4 控制','TX 发送'])await page.getByRole('button',{name,exact:true}).click();
 const arch=page.locator('[data-diagram="mac:overview"]');await arch.scrollIntoViewIfNeeded();
 await arch.locator('[data-group="mac:pipeline-group"]').click();
 assert(await page.evaluate(()=>!window.EngDocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram==='mac:overview').getCellById('mac:tx').isVisible()),'层级图应支持集合总览');
 await arch.locator('[data-group="mac:pipeline-group"]').click();
 for(const name of ['从左到右 LR','从右到左 RL','从上到下 TB','从下到上 BT'])await page.getByRole('button',{name,exact:true}).click();
 // tab 交互已单独检查，下面展开所有视图进行独立几何与字体检查。
 await page.evaluate(()=>{document.querySelectorAll('.tab').forEach(e=>e.hidden=false);document.querySelectorAll('main details').forEach(e=>e.open=true);});
 for(let i=0;i<await figures.count();i++){await figures.nth(i).scrollIntoViewIfNeeded();await page.waitForFunction(i=>document.querySelectorAll('[data-diagram]')[i].dataset.initialized==='true',i);}
 const quality=await page.evaluate(async()=>{
  await document.fonts.ready;
  const scenes=JSON.parse(document.querySelector('#engdoc-data').textContent).scenes,issues=[];
  const intersects=(a,b)=>a.x<b.x+b.width-.1&&b.x<a.x+a.width-.1&&a.y<b.y+b.height-.1&&b.y<a.y+a.height-.1;
  const crosses=(a,b,r)=>{if(a.x===b.x&&a.y===b.y)return false;let lo=0,hi=1;for(const [key,min,max]of [['x',r.x+.1,r.x+r.width-.1],['y',r.y+.1,r.y+r.height-.1]]){const d=b[key]-a[key];if(Math.abs(d)<.0001){if(a[key]<min||a[key]>max)return false;}else{const u=(min-a[key])/d,v=(max-a[key])/d;lo=Math.max(lo,Math.min(u,v));hi=Math.min(hi,Math.max(u,v));if(lo>=hi)return false;}}return lo<hi;};
  for(const s of Object.values(scenes)){
   const nodes=s.nodes.filter(n=>!s.nodes.some(c=>c.parentId===n.id)),graph=window.EngDocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram===s.id);
   for(const net of s.nets){
    if(nodes.some(n=>intersects(n,net.labelBox)))issues.push(s.id+' 标签覆盖节点');
    for(const other of s.nets)if(other!==net&&intersects(net.labelBox,other.labelBox))issues.push(s.id+' 标签重叠');
    for(const branch of net.branches)for(let i=1;i<branch.points.length;i++)if(nodes.some(n=>crosses(branch.points[i-1],branch.points[i],n)))issues.push(s.id+' 连线穿框');
    const view=graph.findViewByCell(graph.getCellById('label:'+net.id)),b=view.container.getBBox();if(b.x<-.5||b.y<-.5||b.x+b.width>net.labelBox.width+.5||b.y+b.height>net.labelBox.height+.5)issues.push(s.id+' 实际标签超框');
   }
  }
  const broken=[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.hash.slice(1)));if(broken.length)issues.push('内部链接无法定位');
  return {views:Object.keys(scenes).length,connectedViews:Object.values(scenes).filter(s=>s.nets.length).length,issues:[...new Set(issues)]};
 });assert(!quality.issues.length,JSON.stringify(quality));
 await arch.scrollIntoViewIfNeeded();await arch.screenshot({path:'.engdoc-build/gallery/preview-architecture.png'});
 await wiring.scrollIntoViewIfNeeded();await wiring.locator('[data-action=reset]').click();await wiring.screenshot({path:'.engdoc-build/gallery/preview-wiring.png'});
 await wiring.locator('[data-action="expand"]').click();await page.waitForFunction(()=>document.querySelector('.diagram-expanded .canvas').clientWidth>1200);await wiring.locator('[data-action="read"]').click();await page.screenshot({path:'.engdoc-build/gallery/preview-large.png'});await page.keyboard.press('Escape');
 await page.locator('#search').fill('board:U1.QSPI_CLK');assert(await page.locator('#results a').count()>0,'稳定 ID 应可检索');await page.locator('#search').fill('');
 await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),'窄屏不能整体溢出');
 await page.locator('header.cover').scrollIntoViewIfNeeded();await page.screenshot({path:'.engdoc-build/gallery/preview-mobile.png'});
 assert(!errors.length,errors.join(';'));
 return {...quality,selection:true,port:true,filter:true,group:true,tabs:true,download:true,largeView:true,mobile:true};
}
