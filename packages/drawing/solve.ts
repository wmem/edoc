import {validateDrawing} from './validate.ts';
import {Worker} from 'node:worker_threads';
import {DrawingError} from './types.ts';
import type {DrawingScene} from './types.ts';
// 外部 JSON 先执行完整 Schema；浏览器只求解经过投影的类型化模型。
export async function solveDrawing(input: unknown, options: {budgetMs?: number; signal?: AbortSignal} = {}): Promise<DrawingScene> {
  validateDrawing(input);
  const budget = options.budgetMs ?? 15000;
  if (!Number.isFinite(budget) || budget <= 0) throw new DrawingError('DRAWING_BUDGET', 'execution', [input.id], '计算预算必须是正有限毫秒数');
  if (options.signal?.aborted) throw new DrawingError('DRAWING_CANCELLED', 'execution', [input.id], '求解已取消');
  // 独立线程才能中断同步路由；不能以同一事件循环的 setTimeout 充当预算。
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url.endsWith('.ts') ? './worker.ts' : './worker.js', import.meta.url), {execArgv: []});
    let finished = false;
    const stop = (error?: Error, scene?: DrawingScene) => { if (finished) return; finished = true; clearTimeout(timer); options.signal?.removeEventListener('abort', cancel); void worker.terminate(); error ? reject(error) : resolve(scene!); };
    const cancel = () => stop(new DrawingError('DRAWING_CANCELLED', 'execution', [input.id], '求解已取消'));
    const timer = setTimeout(() => stop(new DrawingError('DRAWING_BUDGET', 'execution', [input.id], `求解超过 ${budget} ms 预算，工作线程已终止`)), budget);
    options.signal?.addEventListener('abort', cancel, {once: true});
    worker.once('message', result => { if (result.error) { const e = result.error; stop(new DrawingError(e.code ?? 'DRAWING_WORKER', e.stage ?? 'execution', e.ids ?? [input.id], e.message, e.path)); } else stop(undefined, result.scene); });
    worker.once('error', error => stop(error instanceof Error ? error : new Error(String(error))));
    worker.once('exit', code => { if (!finished) stop(new DrawingError('DRAWING_WORKER', 'execution', [input.id], `求解线程提前退出：${code}`)); });
    worker.postMessage(input);
  });
}
