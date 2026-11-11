import type {Graph} from '../../core/types.ts';
import type {PlotView} from './types.ts';
import {plotProjection} from './model.ts';
import {FigureError} from '../../figure/errors.ts';
import {validationContext} from '../../core/validation-context.ts';
export function validatePlots(graph:Graph){const {errors,report}=validationContext(graph);for(const entry of graph.index.values())if(entry.type==='view'&&('kind'in entry.entity?entry.entity.kind:'')==='plot'){if(!graph.manifest.requiredFeatures?.includes('plots'))report(entry,'IR_FEATURE_REQUIRED','','需要 plots 必需能力');try{plotProjection(graph,entry.entity as PlotView);}catch(error){if(error instanceof FigureError)report(entry,error.code,error.path,error.message);else throw error;}}return errors;}
