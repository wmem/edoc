import {Worker} from 'node:worker_threads';
import {DrawingError} from './types.ts';
import type {Drawing,DrawingScene} from './types.ts';
import type {EngineeringGraph,LayoutJob,LayoutResult} from './job.ts';
import type {Scene} from '../render-graph/scene.ts';
import {EdocError} from '../core/errors.ts';

// 显式参数优先于环境变量；默认使用 4 个工作线程。
export function drawingConcurrency(workers?:number){
 if(workers!==undefined){if(!Number.isSafeInteger(workers)||workers<1)throw new Error('workers 必须是正安全整数');return workers;}
 const value=process.env.EDOC_WORKERS;
 if(value===undefined)return 4;
 if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))throw new Error('EDOC_WORKERS 必须是正安全整数');
 return Number(value);
}
type Job={id:string;input:LayoutJob;budget?:number;signal?:AbortSignal;resolve:(scene:LayoutResult)=>void;reject:(error:Error)=>void;cancel:()=>void;slot?:Slot;done:boolean};
type Slot={worker:Worker;job?:Job;timer?:ReturnType<typeof setTimeout>};

export class DrawingPool{
 private readonly slots=new Set<Slot>();
 private readonly queue:Job[]=[];
 private closed=false;
 private readonly size:number;
 constructor(size=drawingConcurrency()){
  this.size=size;
  if(!Number.isSafeInteger(size)||size<1)throw new Error('工作线程数量必须是正安全整数');
 }
 solve(input:Drawing,budget:number,signal?:AbortSignal):Promise<DrawingScene>{
  return this.submit({kind:'drawing',input},input.id,budget,signal) as Promise<DrawingScene>;
 }
 layout(graph:EngineeringGraph,id:string):Promise<Scene>{
  // 旧工程图没有单图预算；移到线程不新增超时或改变原有布局算法。
  return this.submit({kind:'engineering',graph,id},id) as Promise<Scene>;
 }
 private submit(input:LayoutJob,id:string,budget?:number,signal?:AbortSignal):Promise<LayoutResult>{
  if(this.closed)return Promise.reject(new DrawingError('DRAWING_WORKER','execution',[id],'工作线程池已关闭'));
  return new Promise((resolve,reject)=>{
   const job:Job={id,input:structuredClone(input),budget,signal,resolve,reject,done:false,cancel:()=>this.finish(job,new DrawingError('DRAWING_CANCELLED','execution',[id],'求解已取消'),undefined,true)};
   if(signal?.aborted){job.cancel();return;}
   signal?.addEventListener('abort',job.cancel,{once:true});this.queue.push(job);this.dispatch();
  });
 }
 close(){
  this.closed=true;
  for(const job of [...this.queue,...[...this.slots].flatMap(slot=>slot.job?[slot.job]:[])])this.finish(job,new DrawingError('DRAWING_CANCELLED','execution',[job.id],'工作线程池已关闭'),undefined,true);
  for(const slot of this.slots)this.remove(slot);
 }
 private remove(slot:Slot){
  clearTimeout(slot.timer);this.slots.delete(slot);void slot.worker.terminate();
 }
 private finish(job:Job,error?:Error,scene?:LayoutResult,discard=false){
  if(job.done)return;job.done=true;job.signal?.removeEventListener('abort',job.cancel);
  const index=this.queue.indexOf(job);if(index>=0)this.queue.splice(index,1);
  if(job.slot){const slot=job.slot;clearTimeout(slot.timer);slot.job=undefined;job.slot=undefined;if(discard)this.remove(slot);else slot.worker.unref();}
  if(error)job.reject(error);else job.resolve(scene!);
  this.dispatch();
 }
 private create(){
  const worker=new Worker(new URL(import.meta.url.endsWith('.ts')?'./worker.ts':'./worker.js',import.meta.url),{execArgv:[]}),slot:Slot={worker};
  this.slots.add(slot);
  worker.on('message',result=>{const job=slot.job;if(!job)return;if(result.error){const e=result.error;this.finish(job,e.diagnostics?new EdocError(e.diagnostics):job.input.kind==='engineering'?new Error(e.message):new DrawingError(e.code??'DRAWING_WORKER',e.stage??'execution',e.ids??[job.id],e.message,e.path));}else this.finish(job,undefined,result.scene);});
  worker.on('error',error=>{if(slot.job)this.finish(slot.job,error instanceof Error?error:new Error(String(error)),undefined,true);else this.remove(slot);});
  worker.on('exit',code=>{if(!this.slots.has(slot))return;if(slot.job)this.finish(slot.job,new DrawingError('DRAWING_WORKER','execution',[slot.job.id],`求解线程提前退出：${code}`),undefined,true);else{this.slots.delete(slot);this.dispatch();}});
  return slot;
 }
 private dispatch(){
  if(this.closed)return;
  while(this.queue.length){
   let slot=[...this.slots].find(slot=>!slot.job);
   if(!slot){if(this.slots.size>=this.size)return;try{slot=this.create();}catch(error){this.finish(this.queue[0],error instanceof Error?error:new Error(String(error)));return;}}
   const job=this.queue.shift()!;slot.job=job;job.slot=slot;slot.worker.ref();
   // 排队不消耗单图计算预算；运行中的同步求解仍可被终止。
   if(job.budget!==undefined)slot.timer=setTimeout(()=>this.finish(job,new DrawingError('DRAWING_BUDGET','execution',[job.id],`求解超过 ${job.budget} ms 预算，工作线程已终止`),undefined,true),job.budget);
   try{slot.worker.postMessage(job.input);}catch(error){this.finish(job,error instanceof Error?error:new Error(String(error)),undefined,true);}
  }
 }
}
