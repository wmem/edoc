import type {Graph, RegisterBlock, AddressSpace} from '../../core/types.ts';
import {figureFail} from '../../figure/errors.ts';
import type {AddressStep} from './types.ts';
import {createAddressResolver} from './resolver.ts';
import {coordinate, exactUnits, hex} from './numeric.ts';
export {hex, addressInteger, repetitionSpan} from './numeric.ts';
export {intervalsOverlap} from './intervals.ts';
export type {RepeatedInterval} from './intervals.ts';
export {createAddressResolver, ResourceResolver} from './resolver.ts';

export function blockSpan(graph: Graph, id: string) {
  const block = createAddressResolver(graph).block(graph.manifest.projectId, id);
  return exactUnits(block.sizeBits, block.unitBits, id);
}
export function addressIntervals(graph: Graph, model: RegisterBlock | AddressSpace) {
  const resolver = createAddressResolver(graph), project = graph.manifest.projectId;
  return model.kind === 'address-space' ? resolver.spaceRanges(project, model.id).map(r => ({...r, id: r.region.id, label: r.region.label, description: r.region.description, kind: r.region.kind})) : resolver.block(project, model.id).entries.map(e => ({...e, id: e.entry.id, label: e.entry.label ?? graph.index.get(e.entry.register ?? e.entry.block!)!.entity.label ?? e.entry.id, description: (graph.index.get(e.entry.register ?? e.entry.block!)!.entity as RegisterBlock).description, kind: e.entry.register ? 'register' : 'register-block'}));
}
export function parseInstancePath(selector: string): AddressStep[] {
  let path: unknown;
  try { path = JSON.parse(selector); } catch { return figureFail('ADDRESS_PATH', selector, '路径必须是 RegionStep/EntryStep 的 JSON 数组'); }
  if (!Array.isArray(path) || path.some(step => !step || typeof step !== 'object' || !['region', 'entry'].includes(step.kind) || typeof step[step.kind === 'region' ? 'regionId' : 'entryId'] !== 'string' || Object.keys(step).some(k => !['kind', step.kind === 'region' ? 'regionId' : 'entryId', 'index'].includes(k)) || step.index !== undefined && (!Number.isSafeInteger(step.index) || step.index < 0))) figureFail('ADDRESS_PATH', selector, '路径必须由合法的 RegionStep/EntryStep 构成；不支持旧字符串路径');
  return path as AddressStep[];
}
export function registerInstance(graph: Graph, id: string, selector: string) {
  return createAddressResolver(graph).resolveInstance(graph.manifest.projectId, id, parseInstancePath(selector));
}
// 只遍历定义图，不展开数组。不同项目的定义保持限定身份。
export function registerMapDefinitions(graph: Graph, id: string) {
  const resolver = createAddressResolver(graph), definitions = new Set<string>(), visited = new Set<string>();
  const visit = (project: string, modelId: string) => {
    const key = JSON.stringify([project, modelId]); if (visited.has(key)) return; visited.add(key);
    const record = resolver.find(project, modelId).entry;
    if (record.type === 'register-block') for (const e of (record.entity as RegisterBlock).entries) {
      if (e.register) {if (project === graph.manifest.projectId) definitions.add(e.register);} else visit(project, e.block!);
    }
    if (record.type === 'address-space') for (const region of (record.entity as AddressSpace).regions) if (region.kind !== 'reserved') {
      const target = resolver.resolveRegion(project, modelId, region.id).target!;
      if (target.entry.type !== 'memory') visit(target.graph.manifest.projectId, target.entry.id);
    }
  };
  visit(graph.manifest.projectId, id); return definitions;
}

// 根列表列出当前层实例，total 明确统计当前层，不冒充跨 Window 的叶寄存器总数。
// 每个等差序列只创建一个游标；工作量由定义数与输出 limit 决定。
export function registerMapProjection(graph: Graph, id: string, limit = 120, options: {register?: string} = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) figureFail('QUERY_LIMIT', id, '列表 limit 必须为 1..10000');
  const resolver = createAddressResolver(graph), project = graph.manifest.projectId, model = resolver.find(project, id).entry.entity as RegisterBlock | AddressSpace;
  const unit = model.addressUnitBits ?? 8, ranges = addressIntervals(graph, model), cursors = ranges.map(range => ({range, index: 0n}));
  const rows: ReturnType<typeof registerInstance>[] = [];
  const stepFor = (range: typeof ranges[number], index: bigint): AddressStep => ({...(model.kind === 'address-space' ? {kind: 'region' as const, regionId: range.id} : {kind: 'entry' as const, entryId: range.id}), ...(range.count > 1n ? {index: Number(index)} : {})});
  while (rows.length < limit) {
    const available = cursors.filter(c => c.index < c.range.count && (!options.register || model.kind === 'register-block' && model.entries.find(e => e.id === c.range.id)?.register === options.register));
    if (!available.length) break;
    available.sort((a, b) => {const x = a.range.start + a.index * a.range.stride, y = b.range.start + b.index * b.range.stride; return x < y ? -1 : x > y ? 1 : a.range.id < b.range.id ? -1 : a.range.id > b.range.id ? 1 : 0;});
    const next = available[0]; rows.push(resolver.resolveInstance(project, id, [stepFor(next.range, next.index++)]));
  }
  const selected = ranges.filter(range => !options.register || model.kind === 'register-block' && model.entries.find(e => e.id === range.id)?.register === options.register);
  const total = selected.reduce((sum, range) => sum + range.count, 0n);
  return {modelId: id, addressUnitBits: unit, relative: model.kind === 'register-block', totalKind: 'immediate-instances' as const, total: total.toString(), truncated: total > BigInt(rows.length), limit, rows,
    intervals: ranges.map(r => ({id: r.id, label: r.label, description: r.description, kind: r.kind, start: hex(exactUnits(r.start, unit, r.id)), endExclusive: hex(exactUnits(r.start + r.total, unit, r.id)), lastAddress: r.total ? hex(exactUnits(r.start + r.total, unit, r.id) - 1n) : null, span: hex(exactUnits(r.span, unit, r.id)), count: r.count.toString(), stride: hex(exactUnits(r.stride, unit, r.id)), total: hex(exactUnits(r.total, unit, r.id)), coordinate: coordinate(r.start, unit)}))};
}

// 寄存器呈现继续从同一 resolver 取叶实例；直接映射的数组按定义计数后限额展开。
// Window 在本阶段由区域列表和显式路径查询承载，不把其未知叶总数冒充零。
export function registerLeafProjection(graph: Graph, id: string, limit = 120, selected?: string) {
  const resolver = createAddressResolver(graph), project = graph.manifest.projectId, rows: ReturnType<typeof registerInstance>[] = [], counts = new Map<string, bigint>();
  let hasWindows = false;
  const count = (definitionProject: string, blockId: string): bigint => {
    const key = JSON.stringify([definitionProject,blockId]);
    if (counts.has(key)) return counts.get(key)!;
    const total = resolver.block(definitionProject, blockId).entries.reduce((sum, item) => sum + item.count * (item.entry.register ? !selected || definitionProject === project && selected === item.entry.register ? 1n : 0n : count(definitionProject,item.entry.block!)), 0n);
    counts.set(key, total); return total;
  };
  const compare=(a:ReturnType<typeof registerInstance>,b:ReturnType<typeof registerInstance>)=>{const x=BigInt(a.coordinate.bitPosition),y=BigInt(b.coordinate.bitPosition);return x<y?-1:x>y?1:JSON.stringify(a.instancePath).localeCompare(JSON.stringify(b.instancePath));};
  function* merge(streams:Generator<ReturnType<typeof registerInstance>>[]):Generator<ReturnType<typeof registerInstance>> {
    const active=streams.map(stream=>({stream,next:stream.next()})).filter(item=>!item.next.done);
    while(active.length){active.sort((a,b)=>compare(a.next.value!,b.next.value!));const first=active[0];yield first.next.value!;first.next=first.stream.next();if(first.next.done)active.shift();}
  }
  function* visit(definitionProject:string,blockId:string,path:AddressStep[]):Generator<ReturnType<typeof registerInstance>> {
    const streams=resolver.block(definitionProject,blockId).entries.flatMap(item=>{
      if(item.entry.register?selected&&(definitionProject!==project||selected!==item.entry.register):!count(definitionProject,item.entry.block!))return [];
      return [(function*(){for(let i=0n;i<item.count;i++){
        const next=[...path,{kind:'entry' as const,entryId:item.entry.id,...(item.count>1n?{index:Number(i)}:{})}];
        if(item.entry.register)yield resolver.resolveInstance(project,id,next);else yield* visit(definitionProject,item.entry.block!,next);
      }})()];
    });yield* merge(streams);
  }
  let total=0n;const streams:Generator<ReturnType<typeof registerInstance>>[]=[],root=resolver.find(project,id).entry;
  if(root.type==='register-block'){total=count(project,id);if(total)streams.push(visit(project,id,[]));}
  else for(const range of resolver.spaceRanges(project,id)){
    if(range.region.kind==='window'){hasWindows=true;continue;}
    const target=range.region.kind==='resource'?resolver.resolveRegion(project,id,range.region.id).target:undefined;
    if(target?.entry.type!=='register-block')continue;
    const definitionProject=target.graph.manifest.projectId,leaves=count(definitionProject,target.entry.id);total+=range.count*leaves;
    if(leaves)streams.push((function*(){for(let i=0n;i<range.count;i++)yield* visit(definitionProject,target.entry.id,[{kind:'region',regionId:range.region.id,...(range.count>1n?{index:Number(i)}:{})}]);})());
  }
  for(const row of merge(streams)){rows.push(row);if(rows.length>=limit)break;}
  return {rows, directRegisterTotal: total.toString(), hasWindows, truncated: total > BigInt(rows.length), limit};
}
