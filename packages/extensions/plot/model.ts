import type {Graph,Table} from '../../core/types.ts';
import type {PlotView,PlotSpec,PlotTransform,PlotEncoding} from './types.ts';
import {figureFail} from '../../figure/errors.ts';
export type PlotRecord={values:Record<string,unknown>;rowIds:string[]};
export type PlotColumn={field:string;type:string;unit?:string};
export const quantile=(values:number[],p:number)=>{const sorted=[...values].sort((a,b)=>a-b),i=(sorted.length-1)*p,lo=Math.floor(i);return sorted.length?sorted[lo]+(sorted[Math.ceil(i)]-sorted[lo])*(i-lo):null;};
function statistics(records:PlotRecord[],encoding:Record<string,PlotEncoding>,mark:string){
 const groupFields=[...new Set(Object.entries(encoding).filter(([channel,e])=>e.field&&!e.aggregate&&['x','color','detail'].includes(channel)&&!(channel==='x'&&e.type==='quantitative'&&!['boxplot','errorbar'].includes(mark)&&!Object.values(encoding).some(e=>e.aggregate))).map(([,e])=>e.field!))];
 const partitions=new Map<string,PlotRecord[]>();for(const row of records){const key=JSON.stringify(groupFields.map(f=>row.values[f]??null));partitions.set(key,[...partitions.get(key)??[],row]);}
 return [...partitions.values()].map(rows=>({group:Object.fromEntries(groupFields.map(f=>[f,rows[0].values[f]??null])),rowIds:rows.flatMap(r=>r.rowIds),count:rows.length,fields:Object.fromEntries([...new Set(Object.values(encoding).filter(e=>e.field&&(e.type==='quantitative'||e.aggregate)).map(e=>e.field!))].map(field=>{
  const values=rows.map(r=>r.values[field]).filter((v):v is number=>typeof v==='number'),n=values.length,sum=values.reduce((a,b)=>a+b,0),mean=n?sum/n:null,q1=quantile(values,.25),median=quantile(values,.5),q3=quantile(values,.75),sorted=[...values].sort((a,b)=>a-b),iqr=q1===null?null:q3!-q1,lowerFence=iqr===null?null:q1!-1.5*iqr,upperFence=iqr===null?null:q3!+1.5*iqr,stderr=n>1?Math.sqrt(values.reduce((s,v)=>s+(v-mean!)**2,0)/(n-1)/n):null;
  return [field,{validCount:n,missingCount:rows.length-n,sum:n?sum:null,mean,median,min:n?sorted[0]:null,max:n?sorted.at(-1):null,q1,q3,stderr,lower:lowerFence===null?null:sorted.find(v=>v>=lowerFence),upper:upperFence===null?null:sorted.findLast(v=>v<=upperFence),outliers:lowerFence===null?[]:values.filter(v=>v<lowerFence||v>upperFence!)}];
 }))}));
}
export function plotTable(graph:Graph,id:string){const entry=graph.index.get(id);if(entry?.type!=='table')figureFail('PLOT_DATA',id,'plot.data 必须引用已有 Table');return entry.entity as Table;}
const numeric=(values:unknown[],id:string)=>values.filter(v=>v!==null&&v!==undefined).map(v=>{if(typeof v!=='number'||!Number.isFinite(v))figureFail('PLOT_VALUE',id,'统计字段必须是有限数字；缺测使用 null 或省略');return v;});
export function plotTransform(records:PlotRecord[],inputColumns:PlotColumn[],transforms:PlotTransform[],id:string){
 let rows=records,columns=[...inputColumns];const audit:unknown[]=[];
 const column=(field:string)=>{const c=columns.find(c=>c.field===field);if(!c)figureFail('PLOT_FIELD',id,'未知字段：'+field);return c;};
 const safeField=(field:string)=>{if(field.startsWith('__edoc_'))figureFail('PLOT_FIELD',id,'转换输出不能使用 __edoc_ 保留前缀');};
 const newField=(field:string)=>{safeField(field);if(columns.some(c=>c.field===field))figureFail('PLOT_FIELD',id,'转换输出字段不能覆盖已有字段：'+field);};
 for(const t of transforms){const before=rows.length;
  if('filter'in t){column(t.filter.field);const f=t.filter;if(f.range&&f.range[0]>f.range[1])figureFail('PLOT_RANGE',id,'筛选 range 下界不能大于上界');rows=rows.filter(r=>{const v=r.values[f.field];return f.equal!==undefined?v===f.equal:f.oneOf?f.oneOf.includes(v as any):typeof v==='number'&&v>=f.range![0]&&v<=f.range![1];});}
  else if('aggregate'in t){const groups=t.groupby??[];groups.forEach(column);const aliases=new Set(groups);for(const a of t.aggregate){safeField(a.as);if(aliases.has(a.as))figureFail('PLOT_FIELD',id,'重复聚合输出：'+a.as);aliases.add(a.as);if(a.op!=='count'&&!a.field)figureFail('PLOT_FIELD',id,'非 count 聚合需要 field');if(a.field){const c=column(a.field);if(c.type!=='number')figureFail('PLOT_TYPE',id,'聚合字段必须为 number：'+a.field);}}
   const partitions=new Map<string,PlotRecord[]>();for(const r of rows){const key=JSON.stringify(groups.map(f=>r.values[f]??null));partitions.set(key,[...partitions.get(key)??[],r]);}if(!groups.length&&!rows.length)partitions.set('[]',[]);
   rows=[...partitions.values()].map(group=>{const values=Object.fromEntries(groups.map(f=>[f,group[0]?.values[f]??null]));for(const a of t.aggregate){const v=a.field?numeric(group.map(r=>r.values[a.field!]),id):[];values[a.as]=a.op==='count'?group.length:!v.length?null:a.op==='sum'?v.reduce((x,y)=>x+y,0):a.op==='mean'?v.reduce((x,y)=>x+y,0)/v.length:a.op==='median'?quantile(v,.5):a.op==='min'?Math.min(...v):Math.max(...v);}return {values,rowIds:group.flatMap(r=>r.rowIds)};});
   columns=[...groups.map(column),...t.aggregate.map(a=>({field:a.as,type:'number',unit:a.op==='count'?'samples':column(a.field!).unit}))];
  }else if('bin'in t){const c=column(t.field);if(c.type!=='number')figureFail('PLOT_TYPE',id,'bin 需要 number 字段');t.as.forEach(newField);if(t.as[0]===t.as[1])figureFail('PLOT_FIELD',id,'bin 输出字段必须不同');rows=rows.map(r=>{const v=r.values[t.field],start=v===null||v===undefined?null:Math.floor(numeric([v],id)[0]/t.bin.step)*t.bin.step;return {...r,values:{...r.values,[t.as[0]]:start,[t.as[1]]:start===null?null:start+t.bin.step}};});columns.push(...t.as.map(field=>({...c,field})));}
  else if('quantile'in t){const c=column(t.quantile);if(c.type!=='number')figureFail('PLOT_TYPE',id,'quantile 需要 number 字段');const groups=t.groupby??[];groups.forEach(column);t.as.forEach(safeField);if(t.as[0]===t.as[1]||t.as.some(f=>groups.includes(f)))figureFail('PLOT_FIELD',id,'分位数输出字段与分组字段不能重名');const partitions=new Map<string,PlotRecord[]>();for(const r of rows){const key=JSON.stringify(groups.map(f=>r.values[f]??null));partitions.set(key,[...partitions.get(key)??[],r]);}rows=[...partitions.values()].flatMap(group=>{const values=numeric(group.map(r=>r.values[t.quantile]),id);return t.probs.map(p=>({values:{...Object.fromEntries(groups.map(f=>[f,group[0].values[f]])),[t.as[0]]:p,[t.as[1]]:quantile(values,p)},rowIds:group.flatMap(r=>r.rowIds)}));});columns=[...groups.map(column),{field:t.as[0],type:'number',unit:'probability'},{field:t.as[1],type:'number',unit:c.unit}];}
  audit.push({transform:t,inputCount:before,outputCount:rows.length,missing:'null/省略保持缺测；统计忽略缺测，count 计记录数'});
 }
 return {rows,columns,audit};
}
export function plotProjection(graph:Graph,view:PlotView){
 const table=plotTable(graph,view.data);if(table.columns.some(c=>c.field.startsWith('__edoc_')))figureFail('PLOT_FIELD',view.id,'__edoc_ 前缀为绘图内部保留字段');let nodes=0;
 const visit=(spec:PlotSpec,records:PlotRecord[],columns:PlotColumn[],path:string):any=>{
  if(++nodes>100)figureFail('PLOT_LIMIT',view.id,'组合图最多 100 个子视图');
  const result=plotTransform(records,columns,spec.transform??[],view.id),field=(name:string)=>{const c=result.columns.find(c=>c.field===name);if(!c)figureFail('PLOT_FIELD',view.id,'未知字段：'+name);return c;};
  if(spec.layer){if(spec.mark||spec.facet||spec.spec||spec.encoding)figureFail('PLOT_COMPOSITION',view.id,'layer 与 mark/encoding/facet/spec 不能混用');return {...result,path,layer:spec.layer.map((s,i)=>visit(s,result.rows,result.columns,path+'/layer/'+i))};}
  if(spec.facet){if(!spec.spec||spec.mark||spec.encoding)figureFail('PLOT_COMPOSITION',view.id,'facet 需要 spec，不能同时声明 mark/encoding');field(spec.facet.field);return {...result,path,facet:spec.facet,spec:visit(spec.spec,result.rows,result.columns,path+'/spec')};}
  if(!spec.mark||!spec.encoding||spec.spec)figureFail('PLOT_COMPOSITION',view.id,'普通统计图需要 mark 和 encoding');
  const encoding:Record<string,PlotEncoding>={};for(const [channel,source]of Object.entries(spec.encoding)){const e={...source},c=e.field?field(e.field):undefined;if(!c&&e.aggregate!=='count')figureFail('PLOT_FIELD',view.id,'映射需要 field 或 aggregate=count');e.type??=e.aggregate==='count'||c?.type==='number'?'quantitative':'nominal';if(e.type==='quantitative'&&c?.type!=='number'&&e.aggregate!=='count')figureFail('PLOT_TYPE',view.id,'quantitative 映射需要 number 字段');if(e.aggregate&&e.aggregate!=='count'&&c?.type!=='number')figureFail('PLOT_TYPE',view.id,'数值聚合需要 number 字段');if(e.type==='temporal')for(const r of result.rows){const v=r.values[e.field!];if(v!==undefined&&v!==null&&(typeof v!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(v)||!Number.isFinite(Date.parse(v))))figureFail('PLOT_TIMEZONE',view.id,'时间必须为带时区的 ISO 字符串：'+e.field);}if(e.type==='quantitative'&&e.aggregate!=='count')for(const r of result.rows){const v=e.field?r.values[e.field]:undefined;if(v!==undefined&&v!==null&&(typeof v!=='number'||!Number.isFinite(v)))figureFail('PLOT_VALUE',view.id,'定量字段必须为有限数字：'+e.field);}
   if(!e.title){if(e.aggregate==='count')e.title='count (samples)';else if(c?.unit)e.title=c.field+' ('+c.unit+')';}encoding[channel]=e;}
  for(const [a,b]of [['x','x2'],['y','y2']])if(encoding[a]?.field&&encoding[b]?.field&&field(encoding[a].field!).unit!==field(encoding[b].field!).unit)figureFail('PLOT_UNIT',view.id,'范围上下界字段单位不一致：'+a+'/'+b);
  const units=Object.fromEntries(Object.entries(encoding).map(([c,e])=>[c,e.aggregate==='count'?'samples':e.field?field(e.field).unit??null:null]));
  return {...result,path,mark:spec.mark,encoding,units,statistics:statistics(result.rows,encoding,spec.mark),sort:spec.mark==='line'&&!encoding.order&&['quantitative','temporal'].includes(encoding.x?.type??'')?'x-stable':'explicit-or-source'};
 };
 const sourceRecords=table.rows.map(r=>{const data=r.objectId?graph.index.get(r.objectId)?.entity:r.values;return {values:Object.fromEntries(table.columns.map(c=>[c.field,c.field.split('.').reduce((v:any,k)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data)])),rowIds:[r.id]};});
 const projection=visit(view,sourceRecords,table.columns,'');
 const checkUnits=(p:any):void=>{if(p.layer){for(const channel of ['x','y']){const values=p.layer.flatMap((s:any)=>s.units?.[channel]?[s.units[channel]]:[]);if(new Set(values).size>1)figureFail('PLOT_UNIT',view.id,'共享 '+channel+' 轴的图层单位不同');}p.layer.forEach(checkUnits);}if(p.spec)checkUnits(p.spec);};checkUnits(projection);
 return {modelId:view.id,table:table.id,source:table.source,inputCount:table.rows.length,sourceRecords,projection,statisticalPolicy:{quantile:'linear / R-7',boxplot:'Tukey 1.5 IQR',errorbar:'默认均值 ± 标准误差',missing:'不补零；折线保留缺测断点',count:'计记录数，包含字段缺测记录'}};
}
