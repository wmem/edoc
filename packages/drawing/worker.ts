import {parentPort} from 'node:worker_threads';
import {solveDrawingModel} from './solver.ts';
parentPort!.on('message', async input => {
  try { parentPort!.postMessage({scene: await solveDrawingModel(input)}); }
  catch (e) { const error = e as import('./types.ts').DrawingError; parentPort!.postMessage({error: {message: error.message, code: error.code, stage: error.stage, ids: error.ids, path: error.path}}); }
});
