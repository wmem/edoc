import {AsyncLocalStorage} from 'node:async_hooks';
import {validateDrawing} from './validate.ts';
import {DrawingPool} from './pool.ts';
let pool:DrawingPool|undefined;
const scopedPool=new AsyncLocalStorage<DrawingPool>();
const currentPool=()=>scopedPool.getStore()??(pool??=new DrawingPool());

export function solveEngineeringScene(graph:import('./job.ts').EngineeringGraph,id:string){
 return currentPool().layout({index:graph.index,connections:graph.connections},id);
}

// 每次构建独立管理并发与生命周期，不改写进程环境，也不干扰同时执行的其他构建。
export async function withDrawingPool<T>(workers:number,run:()=>Promise<T>):Promise<T>{
 const current=new DrawingPool(workers);
 try{return await scopedPool.run(current,run);}finally{current.close();}
}
import {DrawingError} from './types.ts';
import type {DrawingScene} from './types.ts';
// 外部 JSON 先执行完整 Schema；浏览器只求解经过投影的类型化模型。
export async function solveDrawing(input: unknown, options: {budgetMs?: number; signal?: AbortSignal} = {}): Promise<DrawingScene> {
  validateDrawing(input);
  const budget = options.budgetMs ?? 15000;
  if (!Number.isFinite(budget) || budget <= 0) throw new DrawingError('DRAWING_BUDGET', 'execution', [input.id], '计算预算必须是正有限毫秒数');
  if (options.signal?.aborted) throw new DrawingError('DRAWING_CANCELLED', 'execution', [input.id], '求解已取消');
  return currentPool().solve(input,budget,options.signal);
}
