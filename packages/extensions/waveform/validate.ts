import type {Graph} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateWaveformData(graph:Graph){
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values()){
    if(entry.type==='waveform') {
      const signals=(entry.entity as any).data.signal;
      const valid=(signal:any):boolean=>Array.isArray(signal)?typeof signal[0]==='string'&&signal.slice(1).every(valid):signal&&typeof signal==='object'&&(signal.name===undefined||typeof signal.name==='string')&&(signal.wave===undefined||typeof signal.wave==='string');
      if(!signals.every(valid))report(entry,'WAVEJSON','/data/signal','WaveJSON signal 必须是信号对象或命名分组');
    }
 }
 return errors;
}
