import type {Graph} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateClauseData(graph:Graph){
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values())if(entry.type==='clause'){
  if(!graph.manifest.requiredFeatures?.includes('clauses'))report(entry,'IR_FEATURE_REQUIRED','','规范资源需要声明 requiredFeatures: clauses');
  if(Number(graph.manifest.irVersion.split('.')[1])<6)report(entry,'IR_VERSION','','规范资源需要 IR 1.6 或更高版本');
 }
 return errors;
}
