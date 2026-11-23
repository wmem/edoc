import type {Scene} from '../render-graph/scene.ts';

export type SceneStorage={scenes:Record<string,Scene>;printScenes?:Record<string,Scene>;sceneRefs?:Record<string,string>;printSceneRefs?:Record<string,string>};

// 共享的是只读布局数据；每个图形实例的 DOM 与交互状态仍由阅读器独立维护。
export function storeScenes<T extends SceneStorage>(value:T,store:Record<string,Scene>,identities:Map<Scene,string>):T{
 const refs=(scenes:Record<string,Scene>)=>Object.fromEntries(Object.entries(scenes).map(([id,scene])=>{
  let key=identities.get(scene);if(key===undefined){key=String(identities.size);identities.set(scene,key);store[key]=scene;}return [id,key];
 }));
 return {...value,scenes:{},printScenes:undefined,sceneRefs:refs(value.scenes),...(value.printScenes?{printSceneRefs:refs(value.printScenes)}:{})};
}

export function restoreScenes(value:SceneStorage,store:Record<string,Scene>){
 const restore=(refs:Record<string,string>)=>Object.fromEntries(Object.entries(refs).map(([id,key])=>{
  if(!Object.hasOwn(store,key))throw new Error('缺少图形布局：'+key);return [id,store[key]];
 }));
 if(value.sceneRefs)value.scenes=restore(value.sceneRefs);
 if(value.printSceneRefs)value.printScenes=restore(value.printSceneRefs);
}
