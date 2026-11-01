import WaveDrom from 'wavedrom';
import type {Waveform} from '../core/types.ts';
import {esc} from '../render-graph/index.ts';
export function waveform(w:Waveform,index:number):string{
 const raw=WaveDrom.onml.stringify(WaveDrom.renderAny(index,w.data,WaveDrom.waveSkin));
 const output=raw.replace(/<style([^>]*)>([\s\S]*?)<\/style>/g,(_all:string,attrs:string,css:string)=>'<style'+attrs+'>'+css.replace(/([^{}]+)\{/g,(_m:string,selectors:string)=>selectors.split(',').map(selector=>'#svgcontent_'+index+' '+selector.trim()).join(',')+'{').replace(/font-family:Helvetica/g,"font-family:'Noto Sans SC',Arial,sans-serif")+'</style>');
 if(/<script|<foreignObject|(?:href|src)=["'](?:https?:|javascript:|file:)/i.test(output))throw new Error('WaveJSON 输出包含不允许的资源或标记');
 return `<figure class="wave"><figcaption>${esc(w.label)} · ${w.semantic==='specification'?'规范示意':'实际仿真记录'}</figcaption>${output}</figure>`;
}
