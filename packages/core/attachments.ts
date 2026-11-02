import {readFileSync,statSync} from 'node:fs';
import {projectPath,requireFile} from './paths.ts';
import {failure,EngDocError} from './errors.ts';

export type PdfTargetInput={page?:number;rect?:[number,number,number,number];destination?:string};
export type AttachmentInput={type:'pdf';file:string;title?:string;targets?:Record<string,PdfTargetInput>};
export type PdfTarget={page:number;rect?:[number,number,number,number];destination?:string;pdfDestination?:unknown[]};
export type PdfAttachment={id:string;type:'pdf';file:string;title:string;data:string;payload?:string;numPages:number;targets:Record<string,PdfTarget>};
export const record=(value:unknown):value is Record<string,any>=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.prototype.toString.call(value)==='[object Object]';
export async function loadAttachments(root:string,definitions:Record<string,AttachmentInput>,configFile:string,onInput:(file:string)=>void):Promise<Record<string,PdfAttachment>>{
 const output:Record<string,PdfAttachment>=Object.create(null);
 for(const [id,value]of Object.entries(definitions)){
  const path='/attachments/'+id;
  if(!id.trim()||!record(value)||value.type!=='pdf'||typeof value.file!=='string'||Object.keys(value).some(k=>!['type','file','title','targets'].includes(k))||value.title!==undefined&&(typeof value.title!=='string'||!value.title.trim()))failure('ATTACHMENT_CONFIG',configFile,path,'附件需要 type:pdf、file 及可选 title/targets');
  const file=projectPath(root,root,value.file);requireFile(file);onInput(file);
  if(statSync(file).size>128*1024*1024)failure('ATTACHMENT_SIZE',file,'','单个 PDF 附件最多 128 MiB');
  const bytes=readFileSync(file);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))failure('ATTACHMENT_PDF',file,'','附件不是 PDF');
  if(value.targets!==undefined&&!record(value.targets))failure('ATTACHMENT_TARGET',configFile,path+'/targets','targets 需要位置 ID 到定位参数的对象');
  let task:any;
  try{
   const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');task=getDocument({data:new Uint8Array(bytes),verbosity:0,useSystemFonts:false});
   const pdf=await task.promise,targets:Record<string,PdfTarget>=Object.create(null);
   for(const [targetId,target]of Object.entries(value.targets??{})){
    const at=path+'/targets/'+targetId;
    if(!targetId.trim()||!record(target)||Object.keys(target).some(k=>!['page','rect','destination'].includes(k)))failure('ATTACHMENT_TARGET',configFile,at,'位置参数只接受 page/rect 或 destination');
    if(target.destination!==undefined){
     if(typeof target.destination!=='string'||!target.destination||target.page!==undefined||target.rect!==undefined)failure('ATTACHMENT_TARGET',configFile,at,'destination 必须是非空字符串，不能同时指定 page/rect');
     const dest=await pdf.getDestination(target.destination);if(!dest)failure('PDF_DESTINATION',file,at,'PDF 命名目标不存在：'+target.destination);
     const page=typeof dest[0]==='number'?dest[0]+1:await pdf.getPageIndex(dest[0])+1;
     if(!Number.isInteger(page)||page<1||page>pdf.numPages)failure('PDF_PAGE',file,at,'命名目标指向的物理页无效');
     targets[targetId]={page,destination:target.destination,pdfDestination:dest};
    }else{
     if(!Number.isInteger(target.page)||target.page!<1||target.page!>pdf.numPages)failure('PDF_PAGE',file,at,'page 必须是 PDF 范围内从 1 开始的物理页号');
     if(target.rect!==undefined){const r=target.rect;if(!Array.isArray(r)||r.length!==4||r.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1)||r[0]>=r[2]||r[1]>=r[3])failure('PDF_RECT',configFile,at,'rect 为归一化 [x0,y0,x1,y1]，必须在 0–1 内且有正面积');}
     targets[targetId]={page:target.page!,...(target.rect?{rect:target.rect}:{})};
    }
   }
   output[id]={id,type:'pdf',file:value.file,title:value.title??id,data:bytes.toString('base64'),numPages:pdf.numPages,targets};
  }catch(error){if(error instanceof EngDocError)throw error;failure('ATTACHMENT_PDF',file,'',String(error));}finally{await task?.destroy();}
 }
 return output;
}
