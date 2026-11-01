export type Source = { file: string; selector?: string; line?: number };
export type Attributes = Record<string, unknown>;
export type Port = {
  id: string; label: string; direction: 'in' | 'out' | 'inout' | 'passive' | 'unknown';
  groupId?: string; attributes?: Attributes; width?: number; widthExpr?: string;
  parameterContext?: Attributes; clockDomainId?: string; source?: Source;
};
export type Node = {
  id: string; kind: 'node'; label: string; ports?: Port[]; parentId?: string;
  attributes?: Attributes; source?: Source;
};
export type Group = {
  id: string; kind: 'group'; label: string; members: string[];
  attributes?: Attributes; source?: Source;
};
export type Connection = {
  id: string; kind: 'connection'; class: string; label?: string; endpoints: string[];
  direction?: { sources: string[]; targets: string[] }; attributes?: Attributes; source?: Source;
};
export type View = {
  id: string; kind: 'architecture' | 'interface' | 'wiring' | 'state'; label?: string;
  include: { objects: string[]; relations: string[] };
  layout?: { direction?: 'LR' | 'RL' | 'TB' | 'BT'; routing?: 'orthogonal' | 'polyline';
    portOrder?: string[]; positions?: { objectId: string; x: number; y: number }[] };
  display?: { portAttributes?: string[]; collapsedGroups?: string[]; classes?: string[] };
  source?: Source;
};
export type Entity = Node | Group | Port | Connection | View;
export type ResourceType = 'objects' | 'relations' | 'views';
export type Manifest = {
  irVersion: string; projectId: string; resources: { type: ResourceType; path: string }[];
  entryDocuments: string[]; adapterVersion?: string;
};
export type Diagnostic = { code: string; file: string; path: string; message: string; id?: string };
export type RecordEntry = {
  id: string; type: 'node' | 'port' | 'group' | 'connection' | 'view'; entity: Entity;
  location: { file: string; path: string }; ownerId?: string;
};
export type Graph = {
  manifest: Manifest; projectRoot: string; irDirectory: string;
  index: Map<string, RecordEntry>; connections: Map<string, Connection>;
  adjacency: Map<string, Set<string>>;
};
