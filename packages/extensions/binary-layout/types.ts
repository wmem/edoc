import type {Source} from '../../core/common-types.ts';
export type Length=number|{field:string;unit?:'bit'|'byte'}|{op:'add'|'sub'|'mul'|'div'|'min'|'max';args:Length[]};
export type BinaryElement={id:string;label?:string;source?:Source;description?:string;offset?:Length}&(
 {kind?:'field'|'padding'|'reserved';size:Length;value?:string;enums?:Record<string,string>;byteOrder?:'big'|'little';bitOrder?:'msb-first'|'lsb-first'}|
 {kind:'align';to:number}|
 {kind:'ref';model:string}|
 {kind:'repeat';count:Length;element:BinaryElement}|
 {kind:'optional';condition:string;fields:BinaryElement[]}|
 {kind:'choice';selector:string;branches:{id:string;label?:string;when?:number|string;otherwise?:boolean;fields:BinaryElement[]}[]}
);
export type BinaryLayout={id:string;kind:'binary-layout';label?:string;unit?:'bit'|'byte';byteOrder?:'big'|'little';bitOrder?:'msb-first'|'lsb-first';fields:BinaryElement[];source?:Source};
export type BinaryView={id:string;kind:'binary-layout';model:string;label?:string;source?:Source;bitsPerRow?:8|16|32|64;collapsed?:string[];focus?:string;values?:Record<string,number|string|boolean>};
export function binaryElements(model:BinaryLayout){
 const result:{element:{id:string;label?:string;source?:Source};path:string}[]=[];
 const visit=(fields:BinaryElement[],path:string)=>fields.forEach((element,i)=>{const at=path+'/'+i;result.push({element,path:at});if('fields'in element)visit(element.fields,at+'/fields');if('element'in element)visit([element.element],at+'/element-wrapper');if('branches'in element)element.branches.forEach((branch,j)=>{result.push({element:branch,path:at+'/branches/'+j});visit(branch.fields,at+'/branches/'+j+'/fields');});});visit(model.fields,'/fields');return result.map(item=>({...item,path:item.path.replaceAll('/element-wrapper/0','/element')}));
}
