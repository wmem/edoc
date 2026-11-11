import {fontCSS} from '../render-graph/font.ts';
import {renderDrawingSVG} from './svg-render.ts';
import type {DrawingScene,Drawing} from './types.ts';
export function drawingSVG(scene:DrawingScene,drawing:Drawing,embedFont=true,display:{showRelationLabels?:boolean;showPortAttributes?:boolean}={},instance=scene.id,caption=''){return renderDrawingSVG(scene,drawing,embedFont?fontCSS():'',display,instance,caption);}
