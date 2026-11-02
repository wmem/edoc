import {getDocument,GlobalWorkerOptions} from 'pdfjs-dist';
import type {PdfAttachment,PdfTarget} from '../core/attachments.ts';
import type {ReaderData} from '../core/reader-model.ts';
export type PdfPosition={page?:number;zoom?:number;left?:number;top?:number};
export type PdfReader=(holder:HTMLElement,attachment:PdfAttachment,target:PdfTarget|undefined,data:ReaderData,position:PdfPosition|undefined,onPosition:(state:PdfPosition)=>void)=>()=>void;
const bytes=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
let workerURL:string|undefined;
export const openPdf:PdfReader=(holder,attachment,target,data,position,onPosition)=>{
 const content=attachment.payload?data.pdfFiles[attachment.payload]:attachment.data;
 if(!workerURL){workerURL=URL.createObjectURL(new Blob([data.pdfWorker!],{type:'text/javascript'}));GlobalWorkerOptions.workerSrc=workerURL;}
 let stopped=false,task:any,pdf:any,renderTask:any,renderVersion=0,pageNumber=position?.page??target?.page??1,zoom=position?.zoom??0;
 const abort=new AbortController();
 class InlineBinaryFactory{async fetch({kind,filename}:{kind:string;filename:string}){const folder:Record<string,string>={cMapUrl:'cmaps',standardFontDataUrl:'standard_fonts',wasmUrl:'wasm'};const key=folder[kind]+'/'+filename,value=data.pdfSupport?.[key];if(!value)throw Error('PDF 支持资源未内嵌：'+key);return bytes(value);}}
 holder.innerHTML='<div class="pdf-toolbar"><button data-pdf="prev">上一页</button><label>页码 <input data-pdf="page" type="number" min="1"></label><span data-pdf="count"></span><button data-pdf="next">下一页</button><button data-pdf="minus">缩小</button><button data-pdf="plus">放大</button><button data-pdf="fit">适配整页</button><button data-pdf="target">定位引用位置</button><button data-pdf="download">下载原 PDF</button></div><div class="pdf-status" role="status">正在打开 PDF…</div><div class="pdf-scroll"><div class="pdf-sheet"><canvas></canvas><div class="pdf-region" hidden></div></div></div>';
 const scroll=holder.querySelector<HTMLElement>('.pdf-scroll')!,sheet=holder.querySelector<HTMLElement>('.pdf-sheet')!,canvas=holder.querySelector<HTMLCanvasElement>('canvas')!,region=holder.querySelector<HTMLElement>('.pdf-region')!,status=holder.querySelector<HTMLElement>('.pdf-status')!,input=holder.querySelector<HTMLInputElement>('[data-pdf=page]')!;
 const save=()=>onPosition({page:pageNumber,zoom,left:scroll.scrollLeft,top:scroll.scrollTop});
 scroll.addEventListener('scroll',save,{signal:abort.signal});
 let targetRect=target?.rect;
 async function draw(locate=false,restore?:PdfPosition){
  if(!pdf||stopped)return;const version=++renderVersion;renderTask?.cancel();
  try{
   const page=await pdf.getPage(pageNumber);if(stopped||version!==renderVersion)return;const base=page.getViewport({scale:1});
   if(locate&&target?.pdfDestination){const destination=target.pdfDestination,name=(destination[1]as any)?.name;
    if(name==='FitR'){const first=base.convertToViewportPoint(destination[2],destination[3]),last=base.convertToViewportPoint(destination[4],destination[5]),points=[...first,...last];targetRect=[Math.min(points[0],points[2])/base.width,Math.min(points[1],points[3])/base.height,Math.max(points[0],points[2])/base.width,Math.max(points[1],points[3])/base.height];}
    else if(name==='FitH'||name==='FitBH'){const point=base.convertToViewportPoint(page.view[0],typeof destination[2]==='number'?destination[2]:page.view[3]),y=Math.min(.98,Math.max(0,point[1]/base.height));targetRect=[0,y,1,Math.min(1,y+.02)];}
    else if(name==='FitV'||name==='FitBV'){const point=base.convertToViewportPoint(typeof destination[2]==='number'?destination[2]:page.view[0],page.view[3]),x=Math.min(.98,Math.max(0,point[0]/base.width));targetRect=[x,0,Math.min(1,x+.02),1];}
    else if(name==='XYZ'){const point=base.convertToViewportPoint(typeof destination[2]==='number'?destination[2]:page.view[0],typeof destination[3]==='number'?destination[3]:page.view[3]);const x=Math.min(.98,Math.max(0,point[0]/base.width)),y=Math.min(.98,Math.max(0,point[1]/base.height));targetRect=[x,y,Math.min(1,x+.02),Math.min(1,y+.02)];}
   }
   if(!zoom||locate){const r=locate?targetRect:undefined;zoom=Math.min(6,Math.max(.1,Math.min((scroll.clientWidth-48)/(base.width*(r?r[2]-r[0]:1)),(scroll.clientHeight-48)/(base.height*(r?r[3]-r[1]:1)))));}
   const viewport=page.getViewport({scale:zoom}),ratio=Math.min(window.devicePixelRatio||1,Math.sqrt(24000000/(viewport.width*viewport.height)));
   canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';sheet.style.width=viewport.width+'px';
   renderTask=page.render({canvasContext:canvas.getContext('2d')!,canvas,viewport,transform:ratio!==1?[ratio,0,0,ratio,0,0]:undefined});await renderTask.promise;if(stopped||version!==renderVersion)return;
   region.hidden=!targetRect||pageNumber!==target?.page;
   if(!region.hidden){const r=targetRect!;Object.assign(region.style,{left:r[0]*viewport.width+'px',top:r[1]*viewport.height+'px',width:(r[2]-r[0])*viewport.width+'px',height:(r[3]-r[1])*viewport.height+'px'});}
   input.value=String(pageNumber);holder.dataset.pdfPage=String(pageNumber);holder.dataset.pdfReady='true';status.textContent=`${attachment.title} · 第 ${pageNumber} / ${pdf.numPages} 页 · ${Math.round(zoom*100)}%`;
   if(restore)scroll.scrollTo(restore.left??0,restore.top??0);else if(locate&&targetRect)scroll.scrollTo(Math.max(0,(targetRect[0]+targetRect[2])/2*viewport.width-scroll.clientWidth/2),Math.max(0,(targetRect[1]+targetRect[3])/2*viewport.height-scroll.clientHeight/2));else scroll.scrollTo(0,0);save();
  }catch(error){if(stopped||version!==renderVersion||(error as Error).name==='RenderingCancelledException')return;status.textContent='PDF 显示失败：'+String(error);holder.dataset.pdfError='true';}
 }
 holder.addEventListener('click',event=>{const action=(event.target as Element).closest<HTMLElement>('[data-pdf]')?.dataset.pdf;if(!pdf)return;
  if(action==='download'){const url=URL.createObjectURL(new Blob([bytes(content)],{type:'application/pdf'})),a=document.createElement('a');a.href=url;a.download=attachment.file.split('/').at(-1)??attachment.id+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
  if(action==='target'){pageNumber=target?.page??1;void draw(true);return;}
  if(action==='prev')pageNumber=Math.max(1,pageNumber-1);else if(action==='next')pageNumber=Math.min(pdf.numPages,pageNumber+1);else if(action==='plus')zoom=Math.min(8,zoom*1.25);else if(action==='minus')zoom=Math.max(.1,zoom/1.25);else if(action==='fit')zoom=0;else return;void draw();
 },{signal:abort.signal});
 input.onchange=()=>{const n=Number(input.value);if(pdf&&Number.isInteger(n)&&n>=1&&n<=pdf.numPages){pageNumber=n;void draw();}else input.value=String(pageNumber);};
 void(async()=>{try{task=getDocument({data:bytes(content),BinaryDataFactory:InlineBinaryFactory,useWorkerFetch:false,useSystemFonts:false,verbosity:0,enableXfa:false}as any);pdf=await task.promise;if(stopped)return;input.max=String(pdf.numPages);holder.querySelector('[data-pdf=count]')!.textContent='/ '+pdf.numPages;await draw(!position?.zoom,position);}catch(error){if(!stopped){status.textContent='PDF 打开失败：'+String(error);holder.dataset.pdfError='true';}}})();
 return()=>{stopped=true;renderVersion++;abort.abort();renderTask?.cancel();void task?.destroy();};
};
