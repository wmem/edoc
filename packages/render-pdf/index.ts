import {chromium} from 'playwright';
import {pathToFileURL} from 'node:url';
export async function pdf(htmlFile:string,output:string,executablePath?:string){
 const browser=await chromium.launch({executablePath:executablePath??process.env.ENGDOC_CHROMIUM,args:['--no-sandbox']});
 try{
 const page=await browser.newPage();
 await page.route('**/*',route=>route.request().url().startsWith('file:')?route.continue():route.abort());
 await page.goto(pathToFileURL(htmlFile).href,{waitUntil:'load',timeout:30000});
 await page.waitForFunction(()=>window.EngDocReady);
  await page.emulateMedia({media:'print'});
 await page.evaluate(async()=>{document.querySelectorAll('details').forEach(d=>d.open=true);document.querySelectorAll<HTMLElement>('.tab').forEach(t=>t.hidden=false);const text=[...new Set(document.querySelector('main')!.textContent!)].join('');await document.fonts.load('400 16px \"Noto Sans SC\"',text);await document.fonts.load('700 16px \"Noto Sans SC\"',text);await document.fonts.ready;});
 await page.pdf({path:output,format:'A4',landscape:true,printBackground:true,preferCSSPageSize:true,displayHeaderFooter:true,headerTemplate:'<span></span>',footerTemplate:'<div style="font-size:9px;text-align:center;width:100%;color:#68798a">EngDoc · <span class="pageNumber"></span> / <span class="totalPages"></span></div>',outline:true,tagged:true});
 }finally{await browser.close();}
}
