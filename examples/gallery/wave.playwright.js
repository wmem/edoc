async page=>{
 await page.waitForFunction(()=>window.EdocReady);
 await page.evaluate(()=>{document.documentElement.style.scrollBehavior='auto';document.querySelectorAll('main details').forEach(d=>d.open=true);});
 const result=await page.evaluate(async()=>{
  await document.fonts.ready;const samples=[];
  for(const svg of document.querySelectorAll('.wave svg')){
   const uses=[...svg.querySelectorAll('use')],ref=u=>u.getAttribute('href')??u.getAttribute('xlink:href');
   for(const use of uses){const node=document.getElementById(ref(use).slice(1));if(!node||node.closest('svg')!==svg)throw new Error('波形 use 存在悬空或跨实例引用');}
   if(svg.querySelector('style'))throw new Error('波形不应输出全局样式表');
   const clock=uses.find(u=>ref(u).endsWith('-pclk')),bus=uses.find(u=>ref(u).endsWith('-vvv-3'));
   if(!clock||!bus)throw new Error('未找到演示的时钟或数据总线图元');
   const point=(use,x,y)=>new DOMPoint(x,y).matrixTransform(svg.getCTM().inverse().multiply(use.getCTM()));
   const positions=[point(clock,5,5),point(clock,10,0),point(bus,10,10)];
   const image=new Image(),url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));image.src=url;await image.decode();
   const canvas=document.createElement('canvas');canvas.width=svg.viewBox.baseVal.width;canvas.height=svg.viewBox.baseVal.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
   const [inside,stroke,fill]=positions.map(p=>[...ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data]);
   if(!inside.slice(0,3).every(c=>c>240)||!stroke.slice(0,3).every(c=>c<100)||!(fill[0]>230&&fill[1]>230&&fill[2]>80&&fill[2]<230))throw new Error('时钟阶梯或总线填色的实际像素错误');
   samples.push({id:svg.id,inside,stroke,bus:fill});
  }
  const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);if(ids.length!==new Set(ids).size)throw new Error('文档存在重复 ID');
  if(samples.length!==2)throw new Error('应覆盖演示正文和查询参考中的两张波形');
  return {instances:samples.length,samples};
 });
 const first=page.locator('.wave').first();await first.scrollIntoViewIfNeeded();await first.screenshot({path:'.edoc-build/wave-fix/after.png'});
 await page.locator('.wave').nth(1).scrollIntoViewIfNeeded();await page.locator('.wave').nth(1).screenshot({path:'.edoc-build/wave-fix/second-instance.png'});
 await page.emulateMedia({media:'print'});await first.screenshot({path:'.edoc-build/wave-fix/print.png'});await page.emulateMedia({media:'screen'});
 return result;
}
