import {commonClockCaption} from '../extensions/control-diagram/project.ts';
import {renderDrawingSVG} from '../drawing/svg-render.ts';
import {renderSVG} from './svg.ts';
import type {Scene} from './scene.ts';

// 构建器与浏览器共享绘制逻辑；只读取已验证布局，不引入文件系统或再次求解。
export function sceneSVG(scene:Scene,font='',instance=scene.id){
 return scene.drawing&&scene.drawingInput&&!scene.interfaceModel
  ?renderDrawingSVG(scene.drawing,scene.drawingInput,font,scene.display,instance,scene.control?commonClockCaption(scene.control):'')
  :renderSVG(scene,font,instance);
}
