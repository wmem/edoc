import WaveDrom from 'wavedrom';
import type {Waveform} from '../core/types.ts';
import {esc} from '../render-graph/index.ts';

type Rule={selector:string;style:string;specificity:number};
const attributes=(node:any[]):Record<string,any>=>{
 if(!node[1]||typeof node[1]!=='object'||Array.isArray(node[1]))node.splice(1,0,{});
 return node[1];
};
function walk(node:any,visit:(node:any[])=>void){if(!Array.isArray(node))return;visit(node);for(const child of node.slice(2))walk(child,visit);}

// WaveDrom skin 的简单类型/类选择器转为图元自身样式。
// SVG use 的实例树不能依赖外层祖先选择器；内联可保留描边、彩色总线与箭头，同时不污染正文。
function isolate(tree:any[],index:number){
 const rules:Rule[]=[],ids=new Map<string,string>(),prefix=`engdoc-wave-${index}-`;
 walk(tree,node=>{
  const attrs=attributes(node);if(attrs.id)ids.set(attrs.id,prefix+attrs.id);
  if(node[0]==='style'){
   const css=node.slice(2).join('').replace(/font-family:Helvetica/g,"font-family:'Noto Sans SC',Arial,sans-serif");
   for(const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))for(const value of match[1].split(',')){
    const selector=value.trim();
    if(!/^(?:[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+)$/.test(selector))throw new Error('未支持的 WaveDrom skin 选择器：'+selector);
    rules.push({selector,style:match[2],specificity:selector[0]==='#'?100:selector[0]==='.'?10:1});
   }
  }
 });
 rules.sort((a,b)=>a.specificity-b.specificity);
 walk(tree,node=>{
  const attrs=attributes(node),classes=String(attrs.class??'').split(/\s+/),style:Record<string,string>={};
  const declarations=(text:string)=>{for(const pair of text.split(';')){const colon=pair.indexOf(':');if(colon>0)style[pair.slice(0,colon).trim()]=pair.slice(colon+1).trim();}};
  for(const rule of rules)if(rule.selector[0]==='.'?classes.includes(rule.selector.slice(1)):rule.selector[0]==='#'?attrs.id===rule.selector.slice(1):node[0]===rule.selector)declarations(rule.style);
  // 原有内联声明优先于 skin 的类/类型规则。
  if(attrs.style)declarations(attrs.style);
  if(Object.keys(style).length)attrs.style=Object.entries(style).map(([key,value])=>`${key}:${value}`).join(';');
  for(const [key,value]of Object.entries(attrs))if(typeof value==='string'){
   if(key==='id')attrs[key]=ids.get(value)??value;
   else if((key==='href'||key==='xlink:href')&&value.startsWith('#'))attrs[key]='#'+(ids.get(value.slice(1))??value.slice(1));
   else attrs[key]=value.replace(/url\(\s*(['"]?)#([^)'"\s]+)\1\s*\)/g,(_all,quote,id)=>`url(#${ids.get(id)??id})`);
  }
  node.splice(2,node.length-2,...node.slice(2).filter(child=>!Array.isArray(child)||child[0]!=='style'));
 });
 return tree;
}
export function waveform(w:Waveform,index:number):string{
 if(!Number.isSafeInteger(index)||index<0)throw new Error('波形实例序号必须为非负整数');
 // renderAny 会修改 skin；每个实例使用独立副本，避免共享 defs 与上一次输出残留。
 const tree=WaveDrom.renderAny(index,structuredClone(w.data),structuredClone(WaveDrom.waveSkin));
 const output=WaveDrom.onml.stringify(isolate(tree,index));
 if(/<script|<foreignObject|(?:href|src)=["'](?:https?:|javascript:|file:)/i.test(output))throw new Error('WaveJSON 输出包含不允许的资源或标记');
 return `<figure class="wave" data-waveform-id="${esc(w.id)}"><figcaption>${esc(w.label)} · ${w.semantic==='specification'?'规范示意':'实际仿真记录'}</figcaption>${output}</figure>`;
}
