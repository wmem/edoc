import {solveDrawingModel} from '../drawing/solver.ts';
self.onmessage = async event => {
  try { self.postMessage({scene: await solveDrawingModel(event.data)}); }
  catch (e) { const error = e as import('../drawing/types.ts').DrawingError; self.postMessage({error: {message: error.message, code: error.code, stage: error.stage, ids: error.ids, path: error.path}}); }
};
