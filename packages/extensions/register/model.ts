import type {Register,RegisterField,RegisterReset} from './types.ts';
export function resetText(reset?:RegisterReset){return !reset?'未声明':'value' in reset?reset.value:'expression' in reset?'表达式：'+reset.expression:'已声明未知';}
export function resetState(reset?:RegisterReset){return !reset?'undeclared':'value' in reset?'value':'expression' in reset?'expression':'unknown';}
export type RegisterSegment={msb:number;lsb:number;kind:'field'|'reserved'|'unspecified';fieldId?:string;label:string;marker?:string};
// 空洞仅是覆盖范围的计算结果，不创建字段实体，也不赋予访问/复位语义。
export function registerProjection(register:Register){
 const fields=register.fields.toSorted((a,b)=>b.msb-a.msb),segments:RegisterSegment[]=[];let next=register.width-1;
 const gap=(msb:number,lsb:number)=>{if(msb>=lsb)segments.push({msb,lsb,kind:register.gapPolicy==='reserved'?'reserved':'unspecified',label:register.gapPolicy==='reserved'?'保留位':'未声明位'});};
 fields.forEach((field,index)=>{gap(next,field.msb+1);segments.push({kind:'field',msb:field.msb,lsb:field.lsb,fieldId:field.id,label:field.label,marker:'F'+(index+1)});next=field.lsb-1;});gap(next,0);
 return {width:register.width,gapPolicy:register.gapPolicy??'unspecified',segments,fields:fields.map(field=>({id:field.id,label:field.label,msb:field.msb,lsb:field.lsb,width:field.msb-field.lsb+1,resetState:resetState(field.reset),resetText:resetText(field.reset)}))};
}
export const fieldRange=(field:Pick<RegisterField,'msb'|'lsb'>)=>field.msb===field.lsb?String(field.msb):`${field.msb}:${field.lsb}`;
