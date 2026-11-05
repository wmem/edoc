import type {Graph} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateSpecificationData(graph:Graph){
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values())if(entry.type==='specification'){
  if(!graph.manifest.requiredFeatures?.includes('specifications'))report(entry,'IR_FEATURE_REQUIRED','','规范资源需要声明 requiredFeatures: specifications');
  if(Number(graph.manifest.irVersion.split('.')[1])<3)report(entry,'IR_VERSION','','规范资源需要 IR 1.3 或更高版本');
 }
 return errors;
}
