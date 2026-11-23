import {parentPort} from 'node:worker_threads';
import {solveDrawingModel} from './solver.ts';
import type {LayoutJob} from './job.ts';
import {EdocError} from '../core/errors.ts';
parentPort!.on('message', async (job:LayoutJob) => {
  try {
    const scene=job.kind==='drawing'?await solveDrawingModel(job.input):await (await import('../render-graph/scene.ts')).layoutScene(job.graph,job.id);
    parentPort!.postMessage({scene});
  }
  catch (e) { const error = e as import('./types.ts').DrawingError; parentPort!.postMessage({error: {message: error.message, code: error.code, stage: error.stage, ids: error.ids, path: error.path,...(e instanceof EdocError?{diagnostics:e.diagnostics}:{})}}); }
});
