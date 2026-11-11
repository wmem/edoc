import type {Source} from '../../core/common-types.ts';
export type AddressEntry={id:string;label?:string;register?:string;block?:string;offset:string;count?:number;stride?:string;span?:string;source?:Source};
export type RegisterBlock={id:string;kind:'register-block';label?:string;description?:string;size?:string;entries:AddressEntry[];source?:Source};
export type AddressMapping={id:string;label?:string;block:string;base:string;count?:number;stride?:string;source?:Source};
export type AddressSpace={id:string;kind:'address-space';label?:string;addressUnitBits?:number;addressWidth?:number;mappings:AddressMapping[];source?:Source};
export type RegisterPlacement={path:(string|number)[];definition:string;offset:string;address?:string;span:string;source?:Source;label?:string;description?:string;pathLabels?:string[];region?:string;regionOffset?:string};
