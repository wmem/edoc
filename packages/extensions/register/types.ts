import type {Source} from '../../core/common-types.ts';
export type RegisterReset={value:string}|{expression:string}|{unknown:true};
export type RegisterField={id:string;kind?:'register-field';label:string;msb:number;lsb:number;access?:string;reset?:RegisterReset;description?:string;source?:Source};
export type Register={id:string;kind:'register';label:string;width:number;fields:RegisterField[];gapPolicy?:'unspecified'|'reserved';description?:string;source?:Source};
