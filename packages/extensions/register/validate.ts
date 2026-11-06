import type {Graph} from '../../core/types.ts';
import type {Register} from './types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateRegisterData(graph:Graph){
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values())if(entry.type==='register'){
  const register=entry.entity as Register,used=new Set<number>();
  register.fields.forEach((field,index)=>{
   const path='/fields/'+index;
   if(field.lsb>field.msb||field.msb>=register.width)report(entry,'REGISTER_RANGE',path,'字段位范围必须满足0 ≤ lsb ≤ msb < width');
   for(let bit=field.lsb;bit<=Math.min(field.msb,register.width-1);bit++){if(used.has(bit)){report(entry,'REGISTER_OVERLAP',path,'字段位范围重叠：'+bit);break;}used.add(bit);}
   if(field.reset&&'value' in field.reset){const value=BigInt(field.reset.value);if(field.msb>=field.lsb&&value>=(1n<<BigInt(field.msb-field.lsb+1)))report(entry,'REGISTER_RESET',path+'/reset','复位位模式超出字段位宽，不自动截断或扩展');}
  });
 }
 return errors;
}
