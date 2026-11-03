import {startReader} from './reader.ts';
declare const __EDOC_PDF__:boolean;
declare const __EDOC_INTERFACES__:boolean;
void(async()=>{
 const interfaces=__EDOC_INTERFACES__?(await import('./interface-client.ts')).initializeInterfaces:undefined;
 const pdf=__EDOC_PDF__?(await import('./pdf-reader.ts')).openPdf:undefined;
 startReader(interfaces,pdf);
})().catch(error=>{const notice=document.querySelector<HTMLElement>('#notice')!;notice.hidden=false;notice.textContent='文档初始化失败：'+String(error);});
