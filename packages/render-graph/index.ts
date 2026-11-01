import {fontCSS} from './font.ts';
import {renderSVG} from './svg.ts';
import type {Scene} from './scene.ts';
export {scene} from './scene.ts';
export type * from './scene.ts';
export {esc} from './svg.ts';
export {anchor} from '../core/identity.ts';
export {styles} from './styles.ts';
export function svg(s:Scene,embedFont=true,instance=s.id){return renderSVG(s,embedFont?fontCSS():'',instance);}
