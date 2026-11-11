import {drawingSVG} from '../drawing/svg.ts';
import {fontCSS} from './font.ts';
import {renderSVG} from './svg.ts';
import type {Scene} from './scene.ts';
export {scene} from './native.ts';
export type * from './scene.ts';
export {esc} from './svg.ts';
export {anchor} from '../core/identity.ts';
export {styles} from './styles.ts';
export function svg(s:Scene,embedFont=true,instance=s.id){return s.drawing&&s.drawingInput&&!s.interfaceModel?drawingSVG(s.drawing,s.drawingInput,embedFont,s.display,instance):renderSVG(s,embedFont?fontCSS():'',instance);}
