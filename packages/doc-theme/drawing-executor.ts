import {DrawingError} from '../drawing/types.ts';
import type {Drawing, DrawingScene} from '../drawing/types.ts';
declare const __EDOC_DRAWING_WORKER__: string;

// Worker 源码随单 HTML 内联，离线使用 Blob，不访问网络或 CDN。
export function solveDrawingInBrowser(input: Drawing, options: {budgetMs?: number; signal?: AbortSignal} = {}): Promise<DrawingScene> {
  if (options.signal?.aborted) return Promise.reject(new DrawingError('DRAWING_CANCELLED', 'execution', [input.id], '求解已取消'));
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([__EDOC_DRAWING_WORKER__], {type: 'text/javascript'}));
    const worker = new Worker(url); URL.revokeObjectURL(url);
    let done = false;
    const finish = (error?: Error, scene?: DrawingScene) => { if (done) return; done = true; clearTimeout(timer); worker.terminate(); options.signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(scene!); };
    const cancel = () => finish(new DrawingError('DRAWING_CANCELLED', 'execution', [input.id], '求解已取消'));
    const budget = options.budgetMs ?? 15000;
    const timer = setTimeout(() => finish(new DrawingError('DRAWING_BUDGET', 'execution', [input.id], `求解超过 ${budget} ms 预算，工作线程已终止`)), budget);
    options.signal?.addEventListener('abort', cancel, {once: true});
    worker.onmessage = ({data}) => { if (data.error) { const e = data.error; finish(new DrawingError(e.code, e.stage, e.ids, e.message, e.path)); } else finish(undefined, data.scene); };
    worker.onerror = event => finish(new DrawingError('DRAWING_WORKER', 'execution', [input.id], event.message));
    worker.postMessage(input);
  });
}
