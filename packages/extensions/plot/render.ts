import {compile} from 'vega-lite';
import {parse,View} from 'vega';
import type {Graph} from '../../core/types.ts';
import type {PlotView} from './types.ts';
import {plotProjection} from './model.ts';
import {escape,svg as simpleSVG,text} from '../../figure/svg.ts';
export async function plotSVG(graph:Graph,model:PlotView){
 const p=plotProjection(graph,model);
 const hasValues=(node:any):boolean=>node.layer?node.layer.some(hasValues):node.spec?hasValues(node.spec):node.rows.length>0&&Object.values(node.encoding).filter((e:any)=>e.field&&e.type==='quantitative').every((e:any)=>node.rows.some((r:any)=>typeof r.values[e.field]==='number'));
 if(!hasValues(p.projection))return simpleSVG(model.width??780,180,text(24,70,'没有可用的测量值：保留缺测，不生成零值曲线。'),{id:model.id,label:model.label,...p});
 const field=(name:string)=>name.replace(/[.\[\]\\]/g,'\\$&');
 const spec=(node:any,original:any):any=>{
  const transform=(original.transform??[]).map((t:any)=>{if(t.quantile){const {method,...rest}=t;return {...rest,quantile:field(t.quantile),groupby:t.groupby?.map(field)};}if(t.aggregate)return {...t,groupby:t.groupby?.map(field),aggregate:t.aggregate.map((a:any)=>a.op==='count'?{op:a.op,as:a.as}:{...a,field:field(a.field)})};if(t.filter)return {filter:{...t.filter,field:field(t.filter.field)}};return {...t,field:field(t.field)};});
  if(node.layer)return {transform,layer:node.layer.map((n:any,i:number)=>spec(n,original.layer[i]))};
  if(node.facet)return {transform,facet:{field:field(node.facet.field),type:'nominal'},columns:node.facet.columns??2,spec:spec(node.spec,original.spec)};
  const encoding=structuredClone(node.encoding);
  if(node.sort==='x-stable')encoding.order={field:encoding.x.field,type:encoding.x.type,sort:'ascending'};
  else if(node.mark==='line'&&!encoding.order)encoding.order={field:'__edoc_order',type:'quantitative'};
  for(const [channel,e]of Object.entries(encoding) as [string,any][]){if(e.field)e.field=field(e.field);if(e.type==='temporal'&&['x','y','color'].includes(channel))e.scale={type:'utc'};}
  return {transform,mark:{type:node.mark,...node.mark==='errorbar'?{extent:'stderr'}:{},...node.mark==='boxplot'?{extent:1.5}:{},...(node.mark==='line'||node.mark==='area'?{invalid:'break-paths-show-domains'}:{})},encoding,width:model.width??780,height:model.height??340};
 };
 const definition:any={$schema:'https://vega.github.io/schema/vega-lite/v6.json',data:{values:p.sourceRecords.map((r:any,i:number)=>({...r.values,__edoc_order:i}))},...spec(p.projection,model),config:{font:'Noto Sans SC',axis:{labelFontSize:12,titleFontSize:13},view:{stroke:null}},background:'white'};
 const warnings:string[]=[];const logger:any={level(){return this;},warn(...args:unknown[]){warnings.push(args.join(' '));return this;},info(){return this;},debug(){return this;},error(...args:unknown[]){throw Error(args.join(' '));}};
 const compiled=compile(definition,{logger});if(warnings.length)throw Error('统计图后端拒绝未落实的选项：'+warnings.join('; '));
 const v=new View(parse(compiled.spec),{renderer:'none',logger});try{await v.runAsync();const unexpected=warnings.filter(w=>!/^Infinite extent for field .+: \[Infinity, -Infinity\]$/.test(w));if(unexpected.length)throw Error('统计图后端诊断：'+unexpected.join('; '));const output=await v.toSVG();return output.replace(/(<svg\b[^>]*>)/,match=>`${match}<title>${escape(model.label??model.id)}</title><metadata>${escape(JSON.stringify({id:model.id,...p,definition,backendDiagnostics:warnings}))}</metadata>`);}finally{v.finalize();}
}
