import {isControl} from './types.ts';
import type {Graph,Diagnostic} from '../../core/types.ts';
// 仅做结构可达性分析：守卫是文本，不能据此证明运行时可达性、覆盖率或无死锁。
export function controlDiagnostics(graph:Graph):Diagnostic[]{
 const results:Diagnostic[]=[];
 for(const entry of graph.index.values()){
  const m=entry.entity;if(!isControl(m))continue;
  const nodes=m.kind==='state-machine'?m.states:m.nodes,edges=m.kind==='state-machine'?m.transitions:m.edges;
  const report=(code:string,id:string,message:string)=>results.push({code,id,file:entry.location.file,path:entry.location.path,message});
  const seeds=m.kind==='state-machine'?[...m.initial?[m.initial]:[],...m.states.filter(s=>s.kind==='initial').map(s=>s.id)]:m.nodes.filter(n=>n.kind==='start').map(n=>n.id);
  if(!seeds.length)report('CONTROL_INITIAL_UNDECLARED',m.id,'未声明初始入口，不能分析完整可达范围');
  const reached=new Set(seeds);
  for(let i=0;i<=nodes.length;i++){
   const before=reached.size;
   for(const e of edges)if(reached.has(e.from))reached.add(e.to);
   if(m.kind==='state-machine')for(const r of m.regions??[])if(reached.has(r.owner)){if(r.initial)reached.add(r.initial);m.states.filter(s=>s.region===r.id&&s.kind==='initial').forEach(s=>reached.add(s.id));}
   if(before===reached.size)break;
  }
  if(seeds.length)for(const n of nodes)if(!reached.has(n.id)&&n.kind!=='history')report('CONTROL_STRUCTURALLY_UNREACHABLE',n.id,'从声明入口和显式边未找到结构可达路径；未执行守卫或调用');
  if(m.kind==='state-machine')for(const e of m.transitions)if(!e.trigger)report('CONTROL_TRIGGER_UNDECLARED',e.id,'迁移未声明 trigger，不自动解释为 completion/always');
 }
 return results;
}
