async page => {
 if(!page.url().startsWith('file:'))throw new Error('请先用 playwright-cli 打开生成的 demo.html 文件');
 const errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(/^(https?|wss?):/.test(r.url()))external.push(r.url());});
 await page.context().setOffline(true);await page.reload();await page.waitForFunction(()=>window.EngDocReady);
 if(await page.locator('[data-diagram]').count()!==16)throw new Error('离线图形不完整');
 if(errors.length||external.length)throw new Error(JSON.stringify({errors,external}));
 return {offline:true,views:16,errors,external};
}
