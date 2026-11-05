import type {Source,Attributes} from '../../core/common-types.ts';

// 结构、端口和连接领域的数据；不是任意图表的通用模型。
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
export type RelationView = {
  id: string; kind: 'architecture' | 'interface' | 'wiring' | 'state'; label?: string;
  include: { objects: string[]; relations: string[] };
  layout?: { direction?: 'LR' | 'RL' | 'TB' | 'BT'; routing?: 'orthogonal' | 'polyline';
    portOrder?: string[]; interfaceOrder?:string[];interfaceSides?:Record<string,'left'|'right'>;positions?: { objectId: string; x: number; y: number }[];
    constraints?:LayoutConstraint[];relationHints?:Record<string,RelationLayoutHint> };
  display?: { interfaceMode?:'collapsed'|'expanded';interfaceOverrides?:Record<string,'collapsed'|'expanded'>;showInterfaceDetails?:boolean;portAttributes?: string[]; showPortAttributes?: boolean; showRelationLabels?: boolean; collapsedGroups?: string[]; classes?: string[] };
  source?: Source;
};
