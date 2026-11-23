import {parentPort,workerData} from 'node:worker_threads';
import {AsyncResource} from 'node:async_hooks';
import {resolveProjectConfig} from '../core/project.ts';
import {loadBook} from '../core/book.ts';
import {withDrawingPool} from '../drawing/solve.ts';
import {previewSession} from './session.ts';

// 每次失效替换整个 Worker，配置及传递导入不会命中上一代 ESM 缓存。
try{
 await withDrawingPool(workerData.workers,async()=>{
  const config=await resolveProjectConfig(workerData.config);
  parentPort!.postMessage({inputs:config.configInputs});
  const book=await loadBook(config,{onInputs(inputs){parentPort!.postMessage({inputs});}}),session=previewSession(book);
  parentPort!.postMessage({ready:session.bootstrap,inputs:session.inputs});
  await new Promise<void>(resolve=>{
   parentPort!.on('message',AsyncResource.bind(async({id,method,arg})=>{
    if(method==='close'){resolve();return;}
    try{parentPort!.postMessage({id,value:await session.request(method,arg)});}
    catch(error){parentPort!.postMessage({id,error:String(error)});}
   }));
  });
 });
}catch(error){parentPort!.postMessage({failed:String(error)});}
