import type {Source} from '../../core/common-types.ts';
export type Waveform = {id:string;kind:'waveform';label:string;format:'wavejson';semantic:'specification'|'simulation';data:Record<string,unknown>;source:Source};
