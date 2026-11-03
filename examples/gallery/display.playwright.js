async page => {
 const assert=(ok,message)=>{if(!ok)throw new Error(message);};
 await page.waitForFunction(()=>window.EdocReady);await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>document.fonts.ready);
 await page.evaluate(()=>document.documentElement.style.scrollBehavior='auto');
 const wiring=page.locator('[data-diagram="board:flash-wiring"]');await wiring.scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>document.querySelector('[data-diagram="board:flash-wiring"]').dataset.initialized==='true');
 const attrs=wiring.locator('[data-display="port-attributes"]'),labels=wiring.locator('[data-display="relation-labels"]');
 assert(!await attrs.isChecked()&&await labels.isChecked(),'默认应只显示端口名，保留连线标题');
 assert(!await wiring.locator('.canvas [data-port-annotation]').first().isVisible(),'默认附注应隐藏');
 await wiring.locator('[data-action=expand]').click();await wiring.locator('[data-action=fit]').click();
 await page.screenshot({path:'.edoc-build/gallery/display-default.png'});
 await attrs.check();await wiring.locator('.canvas [data-port-annotation]').first().waitFor({state:'visible'});assert(await wiring.locator('.canvas [data-port-annotation]').first().isVisible(),'附注应能显示');
 assert(!await wiring.locator('.canvas [data-port-annotation]').first().textContent().then(t=>t.includes('function QSPI_CLK')),'重复功能名不应重复展示');
 await page.screenshot({path:'.edoc-build/gallery/display-attributes.png'});
 await labels.uncheck();await wiring.locator('input[data-class="clock"]').uncheck();await wiring.locator('input[data-class="clock"]').check();
 const visibility=await page.evaluate(()=>{const g=window.EdocGraphs.find(g=>g.container.closest('[data-diagram]').dataset.diagram==='board:flash-wiring');return {label:g.getCellById('label:board:net.FLASH_SCK').isVisible(),line:g.getCellById('branch:board:net.FLASH_SCK:0').isVisible()};});
 assert(!visibility.label&&visibility.line,'隐藏标题及分类切换不能隐藏连线或恢复标题');
 await attrs.uncheck();await page.screenshot({path:'.edoc-build/gallery/display-minimal.png'});
 await page.emulateMedia({media:'print'});assert(!await wiring.locator('.static-svg [data-relation-label]').first().isVisible(),'打印应同步隐藏标题');assert(!await wiring.locator('.static-svg [data-port-annotation]').first().isVisible(),'打印应同步隐藏附注');await page.emulateMedia({media:'screen'});
 const pending=page.waitForEvent('download');await wiring.locator('[data-action=svg]').click();const download=await pending;await download.saveAs('.edoc-build/gallery/display-minimal.svg');
 await labels.check();await page.keyboard.press('Escape');
 const tx=page.locator('[data-diagram="mac:tx-view"]');await tx.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-diagram="mac:tx-view"]').dataset.initialized==='true');
 assert(!await tx.locator('[data-display="port-attributes"]').isChecked(),'开关应逐图独立');
 await wiring.scrollIntoViewIfNeeded();await wiring.locator('[port="board:U1.QSPI_CLK"]').first().click();const port=JSON.parse(await page.locator('#properties').innerText());assert(port.attributes.ball==='A12'&&port.attributes.function==='QSPI_CLK','隐藏文字后原属性仍可查询');
 const quality=await page.evaluate(()=>{
  const scenes=Object.values(JSON.parse(document.querySelector('#edoc-data').textContent).scenes);let checked=0;
  for(const s of scenes)for(const net of s.nets){const p={x:net.labelBox.x+net.labelBox.width/2,y:net.labelBox.y+net.labelBox.height/2};
   if(!net.branches.some(b=>b.points.slice(1).some((q,i)=>{const a=b.points[i];return Math.abs((q.x-a.x)*(p.y-a.y)-(q.y-a.y)*(p.x-a.x))<.01&&p.x>=Math.min(a.x,q.x)-.01&&p.x<=Math.max(a.x,q.x)+.01&&p.y>=Math.min(a.y,q.y)-.01&&p.y<=Math.max(a.y,q.y)+.01;})))throw new Error(s.id+' '+net.id+' 标题没有落在所属线上');checked++;
  }return {views:scenes.length,labelsOnLine:checked};
 });
 return {...quality,portAttributes:true,relationLabels:true,filterComposition:true,print:true,svg:true,selection:true,independentViews:true};
}
