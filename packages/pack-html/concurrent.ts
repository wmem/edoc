// 出错后停止分配新任务，并等待已启动任务退出，避免失败构建遗留后台写入。
export async function forEachConcurrent<T>(items:T[],limit:number,run:(item:T,index:number)=>Promise<void>){
 let cursor=0,failed=false,error:unknown;
 const consume=async()=>{while(!failed&&cursor<items.length){const index=cursor++;try{await run(items[index],index);}catch(reason){if(!failed){failed=true;error=reason;}}}};
 await Promise.all(Array.from({length:Math.min(limit,items.length)},consume));
 if(failed)throw error;
}
