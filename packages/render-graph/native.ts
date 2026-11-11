import type {Graph,RelationView} from '../core/types.ts';
import {EdocError} from '../core/errors.ts';
import {scene as engineeringScene} from './scene.ts';
import {solveDrawing} from '../drawing/solve.ts';
import {DrawingError} from '../drawing/types.ts';
import {drawingReaderScene} from '../drawing/reader-scene.ts';
import {drawingInterfaceScene} from '../drawing/interface-scene.ts';
import {prepareInterfaceModel,initialInterfaceState} from './interfaces.ts';
import type {Scene} from './scene.ts';

import {presentation,projectControl} from '../extensions/control-diagram/project.ts';
// 构建/导出入口：原生显示数据和工程接口投影共享求解器；浏览器只加载纯求解部分。
export async function scene(graph:Graph,id:string,options:{interfaces?:'expanded';control?:'full'}={}):Promise<Scene>{
  const control=presentation(graph,id);
  if(control){try{const input=projectControl(control,options.control==='full'?{collapsed:[]}:{}),geometry=await solveDrawing(input);const result=drawingReaderScene(input,geometry,id,control.view.label??control.model.label??id,control.view.display);return {...result,kind:control.model.kind,control,layoutEngine:'drawing'};}catch(error){if(!(error instanceof DrawingError))throw error;const origin=graph.index.get(id)!;throw new EdocError([{code:error.code,file:origin.location.file,path:origin.location.path+error.path,id,message:`${error.message}（${error.stage}；${error.ids.join('、')}）`}]);}}
  const entry=graph.index.get(id),view=entry?.entity as RelationView;
  try{
    if(view?.drawing){
      const geometry=await solveDrawing(view.drawing),result=drawingReaderScene(view.drawing,geometry,id,view.label??id,view.display);
      result.kind=view.kind;result.layoutEngine='drawing';return result;
    }
    const model=prepareInterfaceModel(graph,id);
    if(model){
      const state=initialInterfaceState(model);
      if(options.interfaces==='expanded'){state.modes=Object.fromEntries(model.nodes.flatMap(n=>(n.interfaces??[]).map(i=>[i.id,'expanded'])));state.classes=null;}
      return await drawingInterfaceScene(model,state,solveDrawing);
    }
  }catch(error){
    if(!(error instanceof DrawingError)||!entry)throw error;
    let path=error.path;
    if(view.drawing&&!path){
      const connection=view.drawing.connections.findIndex(c=>error.ids.includes(c.id)),node=view.drawing.nodes.findIndex(n=>error.ids.includes(n.id));
      path=connection>=0?'/connections/'+connection:node>=0?'/nodes/'+node:'';
    }
    throw new EdocError([{code:error.code,file:entry.location.file,path:entry.location.path+(view.drawing?'/drawing':'')+(path||(!view.drawing?'/layout':'')),id,message:`${error.message}（${error.stage}；${error.ids.join('、')}）`}]);
  }
  return engineeringScene(graph,id,options);
}
