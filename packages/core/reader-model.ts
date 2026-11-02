import type {Scene} from '../render-graph/scene.ts';
import type {OutlineEntry} from './outline.ts';
import type {PdfAttachment} from './attachments.ts';
import type {Navigation} from './book.ts';
export type ReaderPage={id:string;project:string;title:string;file:string;html:string;scenes:Record<string,Scene>;outline:OutlineEntry[]};
export type ReaderProject={id:string;title:string;irVersion:string;records:Record<string,{type:string;location:{file:string;path:string};ownerId?:string}>;entities:Record<string,any>;relations:Record<string,any>;sections:Record<string,{page:string;anchor:string}>;attachments:Record<string,PdfAttachment>};
export type ReaderData={title:string;home:{project:string;id:string};navigation:Navigation[];pages:Record<string,ReaderPage>;projects:Record<string,ReaderProject>;pdfFiles:Record<string,string>;pdfWorker?:string;pdfSupport?:Record<string,string>};
