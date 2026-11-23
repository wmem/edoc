import {sceneSVG} from './scene-svg.ts';
import {fontCSS} from './font.ts';
import type {Scene} from './scene.ts';
export {scene} from './native.ts';
export type * from './scene.ts';
export {esc} from './svg.ts';
export {anchor} from '../core/identity.ts';
export {styles} from './styles.ts';
export function svg(s:Scene,embedFont=true,instance=s.id){return sceneSVG(s,embedFont?fontCSS():'',instance);}
