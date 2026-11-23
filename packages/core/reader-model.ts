import type {SceneStorage} from './scene-storage.ts';
import type {Scene} from '../render-graph/scene.ts';
import type {OutlineEntry} from './outline.ts';
import type {PdfAttachment} from './attachments.ts';
import type {Navigation} from './book.ts';
export type ReaderPage=SceneStorage&{id:string;project:string;title:string;file:string;html:string;anchorAliases?:Record<string,string>;scenes:Record<string,Scene>;outline:OutlineEntry[]};
export type ReaderProject={id:string;title:string;irVersion:string;requiredFeatures?:string[];records:Record<string,{type:string;location:{file:string;path:string};ownerId?:string;semanticKind?:string}>;entities:Record<string,any>;relations:Record<string,any>;sections:Record<string,{page:string;anchor:string}>;attachments:Record<string,PdfAttachment>};
export type ReaderData={diagramScenes?:Record<string,Scene>;resourceCatalog?:import('./resource-types.ts').ResourceCatalog;resourceBodies?:Record<string,import('./resource-body.ts').ResourceBody>;title:string;home:{project:string;id:string};navigation:Navigation[];pages:Record<string,ReaderPage>;projects:Record<string,ReaderProject>;pdfFiles:Record<string,string>;pdfWorker?:string;pdfSupport?:Record<string,string>};
