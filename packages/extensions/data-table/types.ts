import type {LinkTarget} from '../../core/link-target.ts';
import type {Source} from '../../core/common-types.ts';
export type Table = { id:string;kind:'table';label:string;columns:{field:string;label:string;type:'string'|'number'|'boolean'|'json';unit?:string}[];rows:{id:string;objectId?:string;links?:Record<string,LinkTarget>;values?:Record<string,unknown>}[];source?:Source };
