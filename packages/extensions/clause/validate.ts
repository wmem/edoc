import type {Graph} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validateClauseData(graph:Graph){
 const {errors,report}=validationContext(graph);
 for(const entry of graph.index.values())if(entry.type==='clause'){
  if(!graph.manifest.requiredFeatures?.includes('clauses'))report(entry,'IR_FEATURE_REQUIRED','','规范资源需要声明 requiredFeatures: clauses');
 }
 return errors;
}
