export type Source = { file: string; selector?: string; line?: number };
export type Attributes = Record<string, unknown>;
export type Port = {
  id: string; label: string; direction: 'in' | 'out' | 'inout' | 'passive' | 'unknown';
  groupId?: string; attributes?: Attributes; width?: number; widthExpr?: string;
  parameterContext?: Attributes; clockDomainId?: string; source?: Source;
};
export type Node = {
  id: string; kind: 'node'; label: string; ports?: Port[]; parentId?: string;
  interfaces?: Interface[];
  attributes?: Attributes; source?: Source;
};
export type Interface = {id:string;label:string;members:string[];protocol?:string;role?:string;attributes?:Attributes;source?:Source};
export type Group = {
  id: string; kind: 'group'; label: string; members: string[];
  attributes?: Attributes; source?: Source;
};
export type Connection = {
  id: string; kind: 'connection'; class: string; label?: string; endpoints: string[];
  direction?: { sources: string[]; targets: string[] }; attributes?: Attributes; source?: Source;
};
export type LayoutSide='left'|'right'|'top'|'bottom';
export type LayoutConstraint={type:'order';axis:'x'|'y';nodes:string[];gap?:number}|{type:'align';axis:'x'|'y';nodes:string[]};
export type RelationLayoutHint={backbone?:[string,string];endpointSides?:Record<string,LayoutSide>;channel?:LayoutSide;priority?:'main'|'normal'};
export type View = {
  id: string; kind: 'architecture' | 'interface' | 'wiring' | 'state'; label?: string;
  include: { objects: string[]; relations: string[] };
  layout?: { direction?: 'LR' | 'RL' | 'TB' | 'BT'; routing?: 'orthogonal' | 'polyline';
    portOrder?: string[]; interfaceOrder?:string[];interfaceSides?:Record<string,'left'|'right'>;positions?: { objectId: string; x: number; y: number }[];
    constraints?:LayoutConstraint[];relationHints?:Record<string,RelationLayoutHint> };
  display?: { interfaceMode?:'collapsed'|'expanded';interfaceOverrides?:Record<string,'collapsed'|'expanded'>;portAttributes?: string[]; showPortAttributes?: boolean; showRelationLabels?: boolean; collapsedGroups?: string[]; classes?: string[] };
  source?: Source;
};
export type Entity = Node | Interface | Group | Port | Connection | View | Table | Waveform | Reference | DocumentEntity | Row;
export type ResourceType = 'objects' | 'relations' | 'views' | 'tables' | 'waveforms' | 'references';
export type Manifest = {
  irVersion: string; projectId: string; resources: { type: ResourceType; path: string }[];
  entryDocuments: string[]; adapterVersion?: string; requiredFeatures?:string[];
};
export type Diagnostic = { code: string; file: string; path: string; message: string; id?: string };
export type RecordEntry = {
  id: string; type: 'node' | 'interface' | 'port' | 'group' | 'connection' | 'view' | 'table' | 'waveform' | 'reference' | 'document' | 'row'; entity: Entity;
  location: { file: string; path: string }; ownerId?: string;
};
export type Graph = {
  manifest: Manifest; projectRoot: string; irDirectory: string;
  index: Map<string, RecordEntry>; connections: Map<string, Connection>;
  adjacency: Map<string, Set<string>>;
  interfaceByPort?:Map<string,string>;
};
export type Table = { id:string;kind:'table';label:string;columns:{field:string;label:string;type:'string'|'number'|'boolean'|'json';unit?:string}[];rows:{id:string;objectId?:string;values?:Record<string,unknown>}[];source?:Source };
export type Waveform = {id:string;kind:'waveform';label:string;format:'wavejson';semantic:'specification'|'simulation';data:Record<string,unknown>;source:Source};
export type Reference = {id:string;kind:'reference';label?:string;fromId:string;targetId:string;class:string;source?:Source};
export type DocumentEntity={id:string;kind:'document';label:string;source:Source};
export type Row={id:string;kind?:'row';objectId?:string;values?:Record<string,unknown>;source?:Source;label?:string};
