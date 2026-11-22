import type {Graph,RecordEntry} from './types.ts';
import type {ResourceRoute} from './routes.ts';

// 通用路径形状由 provider 进一步校验；核心不解释 Region/entry。
export type ResourceStep={kind:string;[key:string]:unknown};
export type ResourceTarget={kind:'definition';project:string;id:string}|{kind:'instance';project:string;space:string;segments:ResourceStep[]};
export type ResourceSource={projectId:string;file:string;line:number;page:string;sectionId?:string};
export type ResourceMount={mountId:string;target:ResourceTarget;source:ResourceSource};
export type ResourceBinding={target:ResourceTarget;sectionId:string;source:ResourceSource;declaration:ResourceSource};
export type ResourceCatalog={status:'complete'|'deferred';deferred:{target:ResourceTarget;source:ResourceSource}[];mounts:ResourceMount[];bindings:ResourceBinding[]};
export type ResourceChild={key:string;label:string;target:ResourceTarget;count:string;firstIndex?:string;coordinate?:unknown;values?:Record<string,string>;status?:string;error?:string};
export type ResourceView={spaceId?:string;pathLabels?:string[];provider:string;title:string;type:string;target:ResourceTarget;definition?:{project:string;id:string};facts:unknown;children:{items:ResourceChild[];total:string;offset:number;limit:number;truncated:boolean};childColumns?:{key:string;label:string}[];details?:{label:string;value:string}[];presentation?:{kind:string;project:string;id:string};};
export type ResourceContext={projects:ReadonlyMap<string,Graph>;catalog:ResourceCatalog;preparing?:boolean};
export type ResourceCollection={title:string;columns:{key:string;label:string}[];items:ResourceChild[];cursor?:string;nextCursor?:string;hasMore:boolean;notice:string};
export interface ResourceProvider {
 id:string;
 accepts(record:RecordEntry):boolean;
 validateContent?(context:ResourceContext,target:ResourceTarget):void;
 resolve(context:ResourceContext,target:ResourceTarget,options:{offset:number;limit:number}):ResourceView;
 list?(context:ResourceContext,target:ResourceTarget,options:{cursor?:string;limit:number}):ResourceCollection|undefined;
}
export type ResourceCrumb={label:string;route:ResourceRoute|{kind:'page';project:string;id:string;anchor?:string}};
