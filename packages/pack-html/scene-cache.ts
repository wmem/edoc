import {scene} from '../render-graph/native.ts';
import type {Graph} from '../core/types.ts';

// 仅在一次构建内复用；不同工程的同名图及不同显示模式不能共享结果。
export function cachedScene(render:typeof scene=scene):typeof scene{
 const graphs=new WeakMap<Graph['index'],Map<string,ReturnType<typeof scene>>>();
 return (graph,id,options={})=>{
  let entries=graphs.get(graph.index);if(!entries){entries=new Map();graphs.set(graph.index,entries);}
  const key=JSON.stringify([id,options.interfaces??null,options.control??null]);
  let pending=entries.get(key);
  if(!pending){pending=render(graph,id,options);entries.set(key,pending);const current=entries;void pending.catch(()=>{if(current.get(key)===pending)current.delete(key);});}
  return pending;
 };
}
