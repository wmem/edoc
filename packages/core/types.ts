import type {Register,RegisterField} from '../extensions/register/types.ts';
import type {LinkTarget} from './link-target.ts';
export type {LinkTarget} from './link-target.ts';
export type * from '../extensions/register/types.ts';
import type {Source} from './common-types.ts';
import type {Node,Interface,Group,Port,Connection,RelationView} from '../extensions/relation-diagram/types.ts';
import type {Table} from '../extensions/data-table/types.ts';
import type {Waveform} from '../extensions/waveform/types.ts';
export type {Source,Attributes} from './common-types.ts';
export type * from '../extensions/relation-diagram/types.ts';
export type * from '../extensions/data-table/types.ts';
export type * from '../extensions/waveform/types.ts';

export type Entity = Node | Interface | Group | Port | Connection | RelationView | Table | Waveform | Reference | DocumentEntity | Specification | Row | Register | RegisterField;
export type ResourceType = 'objects' | 'relations' | 'views' | 'tables' | 'waveforms' | 'references' | 'specifications' | 'registers';
export type Manifest = {
  irVersion: string; projectId: string; resources: { type: ResourceType; path: string }[];
  entryDocuments: string[]; adapterVersion?: string; requiredFeatures?:string[];
};
export type Diagnostic = { code: string; file: string; path: string; message: string; id?: string };
export type RecordEntry = {
  id: string; type: 'node' | 'interface' | 'port' | 'group' | 'connection' | 'view' | 'table' | 'waveform' | 'reference' | 'document' | 'specification' | 'row' | 'register' | 'register-field'; entity: Entity;
  location: { file: string; path: string }; ownerId?: string;
};
export type Graph = {
  attachments?:Record<string,import('./attachments.ts').PdfAttachment>;
  specifications?:import('../extensions/specification/prepare.ts').SpecificationPlan;
  documentPlan?:import('./documents.ts').DocumentPlan;
  manifest: Manifest; projectRoot: string; irDirectory: string;
  index: Map<string, RecordEntry>; connections: Map<string, Connection>;
  adjacency: Map<string, Set<string>>;
  interfaceByPort?:Map<string,string>;
};
export type Reference = {id:string;kind:'reference';label?:string;fromId:string;targetId:string;class:string;source?:Source};
export type DocumentEntity={id:string;kind:'document';label:string;source:Source};
export type Row={id:string;links?:Record<string,LinkTarget>;kind?:'row';objectId?:string;values?:Record<string,unknown>;source?:Source;label?:string};

export type Specification={id:string;kind:"specification";label:string;body:{format:"markdoc";content:string};source:Source};
