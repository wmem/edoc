import type {Graph, RecordEntry, Register} from '../../core/types.ts';
import {FigureError, figureFail} from '../../figure/errors.ts';
import type {AddressEntry, AddressRegion, AddressSpace, AddressStep, EffectiveAccessPolicy, Memory, RegisterBlock, ResourceReference} from './types.ts';
import {addressInteger as integer, coordinate, exactUnits, hex, instanceIndex, positive, repetitionSpan} from './numeric.ts';
import {intervalsOverlap} from './intervals.ts';

export class DeferredAddressReference extends FigureError {
  projectId: string; target: ResourceReference;
  constructor(projectId: string, target: ResourceReference) {
    super('ADDRESS_BOOK_CONTEXT', target.id, `工程 ${projectId} 的引用 ${target.project}/${target.id} 需要已解析 Book 上下文`);
    this.projectId = projectId; this.target = target;
  }
}
export type LocatedResource = {graph: Graph; entry: RecordEntry};
export type AddressResolver = {
  find(projectId: string, id: string): LocatedResource;
  resolveRegion(projectId: string, spaceId: string, regionId: string): RegionLayout;
  resolveInstance(projectId: string, modelId: string, segments: AddressStep[]): AddressInstance;
};
export type BlockLayout = {block: RegisterBlock; unitBits: number; sizeBits: bigint; entries: {entry: AddressEntry; start: bigint; span: bigint; count: bigint; stride: bigint; total: bigint}[]};
export type RegionLayout = {region: AddressRegion; space: AddressSpace; target?: LocatedResource; mappedBits: bigint; resourceOffsetBits: bigint; targetBaseBits: bigint; targetStrideBits: bigint};
export type SourceFact = {role: 'mapping' | 'entry' | 'definition'; projectId: string; source: import('../../core/types.ts').Source};
export type AddressInstance = {
  kind: 'address-space-definition' | 'resource-definition' | 'region' | 'block-instance' | 'register-instance' | 'memory-slice';
  modelId: string; originProjectId: string; addressSpaceId?: string; addressUnitBits: number; instancePath: AddressStep[];
  definitionProjectId?: string; definitionId?: string; definitionType?: string;
  entity: Register | RegisterBlock | AddressSpace | Memory | AddressRegion;
  location: RecordEntry['location']; coordinate: ReturnType<typeof coordinate>; address?: string;
  relativeOffset?: ReturnType<typeof coordinate>; regionOffset?: ReturnType<typeof coordinate>;
  range: {start: ReturnType<typeof coordinate>; endExclusive: ReturnType<typeof coordinate>; sizeBits: string;lastAddress?:string;lastBit?:ReturnType<typeof coordinate>};
  visibleRange: {startBit: string; endExclusiveBit: string}; partial: boolean;
  projectedRange: {startBit:string;endExclusiveBit:string;sizeBits:string};
  allocationSize?: string; mappedSize?: string; resourceOffset?: {value: string; addressUnitBits: number};
  pathLabels: string[];
  accessPolicy?: EffectiveAccessPolicy; sources: SourceFact[];
  regionCoordinateSystem?: {projectId:string;addressSpaceId:string;addressUnitBits:number};
  mappedRange?: {startBit:string;endExclusiveBit:string};
  memorySlice?: {projectId:string;memoryId:string;startBit:string;endExclusiveBit:string};
  nativeOffset?: {value:string;addressUnitBits:number};
  coordinateChain: {projectId: string; addressSpaceId: string; coordinate: ReturnType<typeof coordinate>}[];
};
const unitOf = (block: RegisterBlock) => block.addressUnitBits ?? 8;
const max = (a: bigint, b: bigint) => a > b ? a : b;
const min = (a: bigint, b: bigint) => a < b ? a : b;

// 同一算法同时接受单工程与 Book 工程表。阶段 B 只需接入完整工程集合。
export class ResourceResolver implements AddressResolver {
  private blocks = new Map<string, BlockLayout>();
  readonly projects: ReadonlyMap<string, Graph>;
  constructor(projects: ReadonlyMap<string, Graph>) {this.projects = projects;}
  find(projectId: string, id: string): LocatedResource {
    const graph = this.projects.get(projectId);
    if (!graph) throw new DeferredAddressReference(projectId, {project: projectId, id});
    const entry = graph.index.get(id);
    if (!entry) figureFail('ADDRESS_REFERENCE', id, `工程 ${projectId} 中没有资源 ${id}`);
    return {graph, entry};
  }
  target(project: string, reference: ResourceReference, types: RecordEntry['type'][]): LocatedResource {
    const targetProject = reference.project ?? project;
    if (!this.projects.has(targetProject)) throw new DeferredAddressReference(project, reference);
    const result = this.find(targetProject, reference.id);
    if (!types.includes(result.entry.type)) figureFail('ADDRESS_REFERENCE', reference.id, `目标 ${targetProject}/${reference.id} 必须为 ${types.join('/')}，实际为 ${result.entry.type}`);
    return result;
  }
  block(project: string, id: string, stack: string[] = []): BlockLayout {
    const key = JSON.stringify([project, id]);
    if (stack.includes(key)) figureFail('ADDRESS_CYCLE', id, 'Block 循环：' + [...stack, key].join(' → '));
    if (stack.length >= 64) figureFail('ADDRESS_LIMIT', id, 'Block 嵌套超过 64 层');
    if (this.blocks.has(key)) return this.blocks.get(key)!;
    const {entry: record} = this.target(project, {id}, ['register-block']), block = record.entity as RegisterBlock, unitBits = unitOf(block), unit = BigInt(unitBits);
    const ids = new Set<string>();
    let minimum = 0n;
    const entries = block.entries.map(entry => {
      if (ids.has(entry.id)) figureFail('ADDRESS_DUPLICATE', id, '局部 entry ID 重复：' + entry.id);
      ids.add(entry.id);
      let required: bigint;
      if (entry.register) {
        const register = this.target(project, {id: entry.register}, ['register']).entry.entity as Register;
        required = (BigInt(register.width) + unit - 1n) / unit * unit;
      } else {
        required = this.block(project, entry.block!, [...stack, key]).sizeBits;
        exactUnits(required, unitBits, entry.id);
      }
      const span = entry.span === undefined ? required : positive(entry.span, entry.id) * unit;
      if (span < required) figureFail('ADDRESS_SPAN', entry.id, 'span 小于目标完整占用范围');
      const repeat = repetitionSpan(entry, exactUnits(span, unitBits, entry.id));
      const start = integer(entry.offset, entry.id) * unit, stride = repeat.stride * unit, total = repeat.total * unit;
      minimum = max(minimum, start + total);
      return {entry, start, span, count: repeat.count, stride, total};
    });
    for (let i = 0; i < entries.length; i++) for (const other of entries.slice(i + 1)) if (intervalsOverlap(entries[i], other)) figureFail('ADDRESS_OVERLAP', id, `Block 分配范围重叠：${entries[i].entry.id} / ${other.entry.id}`);
    const sizeBits = block.size === undefined ? minimum : positive(block.size, id) * unit;
    if (sizeBits < minimum) figureFail('ADDRESS_RANGE', id, 'entries 超出 Block.size');
    if (block.accessPolicy?.alignment !== undefined) positive(block.accessPolicy.alignment, id);
    const layout = {block, unitBits, sizeBits, entries};
    this.blocks.set(key, layout);
    return layout;
  }
  policy(project: string, block: RegisterBlock, parent: EffectiveAccessPolicy = {}): EffectiveAccessPolicy {
    const {alignment, ...own} = block.accessPolicy ?? {};
    return {...parent, ...own, ...(alignment === undefined ? {} : {alignment: {value: alignment, addressUnitBits: unitOf(block), bitAlignment: hex(positive(alignment, block.id) * BigInt(unitOf(block))), declaredBy: project + '/' + block.id}})};
  }
  space(project: string, id: string): AddressSpace {
    return this.target(project, {id}, ['address-space']).entry.entity as AddressSpace;
  }
  spaceRanges(project: string, id: string) {
    const space = this.space(project, id), unit = BigInt(space.addressUnitBits), lo = integer(space.base, id), size = positive(space.size, id), hi = lo + size;
    if (hi > (1n << BigInt(space.addressWidth))) figureFail('ADDRESS_RANGE', id, 'AddressSpace 超过 addressWidth');
    const ids = new Set<string>();
    const ranges = space.regions.map(region => {
      if (ids.has(region.id)) figureFail('ADDRESS_DUPLICATE', id, '局部 Region ID 重复：' + region.id);
      ids.add(region.id);
      const start = integer(region.base, region.id), span = positive(region.size, region.id), repeat = repetitionSpan(region, span);
      if (start < lo || start + repeat.total > hi) figureFail('ADDRESS_RANGE', region.id, `Region 分配越界：${hex(start)}..${hex(start + repeat.total)}，空间 ${id}`);
      if (region.alignment !== undefined) {
        const alignment = positive(region.alignment, region.id);
        if (start % alignment || repeat.count > 1n && repeat.stride % alignment) figureFail('ADDRESS_ALIGNMENT', region.id, 'Region 实例基址不满足 alignment');
      }
      return {region, start: start * unit, span: span * unit, count: repeat.count, stride: repeat.stride * unit, total: repeat.total * unit};
    });
    for (let i = 0; i < ranges.length; i++) for (const other of ranges.slice(i + 1)) if (intervalsOverlap(ranges[i], other)) figureFail('ADDRESS_OVERLAP', id, `Region 分配 size 重叠：${ranges[i].region.id} / ${other.region.id}`);
    return ranges;
  }
  resolveRegion(project: string, spaceId: string, regionId: string): RegionLayout {
    const space = this.space(project, spaceId), region = space.regions.find(r => r.id === regionId);
    if (!region) figureFail('ADDRESS_PATH', spaceId, 'Region 不存在：' + regionId);
    if (region.kind === 'reserved') return {region, space, mappedBits: 0n, resourceOffsetBits: 0n, targetBaseBits: 0n, targetStrideBits: 0n};
    const unit = BigInt(space.addressUnitBits), allocationBits = positive(region.size, region.id) * unit;
    if(region.mappedSize!==undefined&&positive(region.mappedSize,region.id)*unit>allocationBits)figureFail('ADDRESS_MAPPING_SIZE',region.id,'mappedSize 不能超过 size');
    if(region.kind==='window'&&region.targetStride!==undefined)positive(region.targetStride,region.id);
    const target = this.target(project, region.target, region.kind === 'window' ? ['address-space'] : ['register-block', 'memory']);
    const targetProject = target.graph.manifest.projectId;
    const block = target.entry.type === 'register-block' ? this.block(targetProject, target.entry.id) : undefined;
    const mappedBits = region.mappedSize === undefined ? block?.sizeBits ?? allocationBits : positive(region.mappedSize, region.id) * unit;
    exactUnits(mappedBits, space.addressUnitBits, region.id);
    if (!mappedBits || mappedBits > allocationBits) figureFail('ADDRESS_MAPPING_SIZE', region.id, 'mappedSize 必须 >0 且不大于分配 size');
    let resourceOffsetBits = 0n, targetBaseBits = 0n, targetStrideBits = 0n;
    if (region.kind === 'window') {
      const targetSpace = target.entry.entity as AddressSpace, targetUnit = BigInt(targetSpace.addressUnitBits);
      targetBaseBits = integer(region.targetBase, region.id) * targetUnit;
      if ((region.count ?? 1) > 1 && region.targetStride === undefined) figureFail('ADDRESS_TARGET_STRIDE', region.id, '重复 Window 必须声明 targetStride');
      targetStrideBits = region.targetStride === undefined ? mappedBits : positive(region.targetStride, region.id) * targetUnit;
      if ((region.count ?? 1) > 1 && targetStrideBits < mappedBits) figureFail('ADDRESS_TARGET_STRIDE', region.id, 'Window 重复目标片段不能重叠');
      const lo = integer(targetSpace.base, targetSpace.id) * targetUnit, end = (integer(targetSpace.base, targetSpace.id) + positive(targetSpace.size, targetSpace.id)) * targetUnit;
      if (targetBaseBits < lo || targetBaseBits + BigInt((region.count ?? 1) - 1) * targetStrideBits + mappedBits > end) figureFail('ADDRESS_RANGE', region.id, 'Window 超出目标 AddressSpace');
    } else {
      const resourceUnit = block?.unitBits ?? 8;
      resourceOffsetBits = integer(region.resourceOffset ?? '0', region.id) * BigInt(resourceUnit);
      if (block) {
        if (resourceOffsetBits || mappedBits !== block.sizeBits) figureFail('ADDRESS_BLOCK_SLICE', region.id, 'RegisterBlock 必须从 0 完整映射；mappedSize 按两方单位精确比较');
      } else {
        const capacityBits = positive((target.entry.entity as Memory).capacityBytes, target.entry.id) * 8n;
        exactUnits(mappedBits, 8, region.id);
        if (resourceOffsetBits + mappedBits > capacityBits) figureFail('ADDRESS_MEMORY_RANGE', region.id, 'Memory 切片超过容量');
      }
    }
    return {region, space, target, mappedBits, resourceOffsetBits, targetBaseBits, targetStrideBits};
  }
  checkWindowCycles(project: string, id: string, stack: string[] = [], done = new Set<string>()) {
    const key = JSON.stringify([project, id]);
    if (stack.includes(key)) figureFail('ADDRESS_CYCLE', id, 'Window 循环：' + [...stack, key].join(' → '));
    if (done.has(key)) return;
    for (const region of this.space(project, id).regions) if (region.kind === 'window') {
      if (!this.projects.has(region.target.project ?? project)) continue;
      const target = this.target(project, region.target, ['address-space']);
      this.checkWindowCycles(target.graph.manifest.projectId, target.entry.id, [...stack, key], done);
    }
    done.add(key);
  }
  // 按整数源地址查坐标。窗口中间态始终使用 bit，保留目标单位内余数。
  resolveAddress(originProjectId: string, spaceId: string, address: string) {
    const origin = this.space(originProjectId, spaceId), originBits = integer(address, spaceId) * BigInt(origin.addressUnitBits);
    if (originBits < integer(origin.base, spaceId) * BigInt(origin.addressUnitBits) || originBits >= (integer(origin.base, spaceId) + positive(origin.size, spaceId)) * BigInt(origin.addressUnitBits)) figureFail('ADDRESS_RANGE', spaceId, '查询地址超出源 AddressSpace');
    let project = originProjectId, space = origin, point = originBits;
    const segments: AddressStep[] = [], chain: {projectId:string;addressSpaceId:string;coordinate:ReturnType<typeof coordinate>}[] = [], visited = new Set<string>();
    const result = (status: 'unallocated' | 'unmapped' | 'reserved' | 'resource', extra: object = {}) => ({status, originProjectId, addressSpaceId:spaceId, coordinate:coordinate(originBits,origin.addressUnitBits), instancePath:segments, coordinateChain:chain, ...extra});
    for (;;) {
      const key=JSON.stringify([project,space.id]);if(visited.has(key))figureFail('ADDRESS_CYCLE',space.id,'地址点转换遇到 Window 循环');visited.add(key);
      chain.push({projectId:project,addressSpaceId:space.id,coordinate:coordinate(point,space.addressUnitBits)});
      let match: {region:AddressRegion;index:bigint;start:bigint}|undefined;
      for(const range of this.spaceRanges(project,space.id)) {
        if(point<range.start)continue;
        const i=range.stride? (point-range.start)/range.stride:0n;
        if(i<range.count&&point<range.start+i*range.stride+range.span){match={region:range.region,index:i,start:range.start+i*range.stride};break;}
      }
      if(!match)return result('unallocated');
      const {region,index,start}=match;segments.push({kind:'region',regionId:region.id,...((region.count??1)>1?{index:Number(index)}:{})});
      if(region.kind==='reserved')return result('reserved',{instance:this.resolveInstance(originProjectId,spaceId,segments)});
      const info=this.resolveRegion(project,space.id,region.id),delta=point-start;
      if(delta>=info.mappedBits)return result('unmapped');
      if(region.kind==='window') {
        point=info.targetBaseBits+index*info.targetStrideBits+delta;
        project=info.target!.graph.manifest.projectId;space=info.target!.entry.entity as AddressSpace;continue;
      }
      if(info.target!.entry.type==='memory')return result('resource',{resourcePoint:coordinate(info.resourceOffsetBits+delta,8),instance:this.resolveInstance(originProjectId,spaceId,segments)});
      project=info.target!.graph.manifest.projectId;
      let blockId=info.target!.entry.id,blockPoint=info.resourceOffsetBits+delta;
      for(;;){
        const layout=this.block(project,blockId);
        const item=layout.entries.find(item=>{if(blockPoint<item.start)return false;const i=item.stride?(blockPoint-item.start)/item.stride:0n;return i<item.count&&blockPoint<item.start+i*item.stride+item.span;});
        if(!item)return result('unallocated',{withinDefinition:{projectId:project,definitionId:blockId},resourcePoint:coordinate(blockPoint,layout.unitBits)});
        const i=item.stride?(blockPoint-item.start)/item.stride:0n;
        segments.push({kind:'entry',entryId:item.entry.id,...(item.count>1n?{index:Number(i)}:{})});
        blockPoint-=item.start+i*item.stride;
        if(item.entry.register)return result('resource',{resourcePoint:coordinate(blockPoint,layout.unitBits),instance:this.resolveInstance(originProjectId,spaceId,segments)});
        blockId=item.entry.block!;
      }
    }
  }
  resolveInstance(originProjectId: string, modelId: string, segments: AddressStep[]): AddressInstance {
    const initial = this.find(originProjectId, modelId), absolute = initial.entry.type === 'address-space';
    if (!absolute && initial.entry.type !== 'register-block' && initial.entry.type !== 'memory') figureFail('QUERY_TYPE', modelId, '实例根必须是 AddressSpace/RegisterBlock/Memory');
    let project = originProjectId, current = initial, unitBits = absolute ? (initial.entry.entity as AddressSpace).addressUnitBits : initial.entry.type === 'register-block' ? unitOf(initial.entry.entity as RegisterBlock) : 8;
    const originUnitBits = unitBits;
    // 当前局部坐标 bit + translation = 最初空间中的 bit；窗口仅平移、不缩放位坐标。
    let translation = 0n, blockBase = 0n, position = absolute ? integer((initial.entry.entity as AddressSpace).base, modelId) * BigInt(unitBits) : 0n;
    let span = absolute ? positive((initial.entry.entity as AddressSpace).size, modelId) * BigInt(unitBits) : initial.entry.type === 'register-block' ? this.block(project, modelId).sizeBits : positive((initial.entry.entity as Memory).capacityBytes, modelId) * 8n;
    let visibleLo = position, visibleHi = position + span, regionBase: bigint | undefined, regionInfo: RegionLayout | undefined;
    let nativeOffset: AddressInstance['nativeOffset'];
    let regionProject = originProjectId;
    let terminalRegion: AddressRegion | undefined, location = current.entry.location;
    let accessPolicy: EffectiveAccessPolicy | undefined = initial.entry.type === 'register-block' ? this.policy(project, initial.entry.entity as RegisterBlock) : undefined;
    const pathLabels:string[]=[],sources: SourceFact[] = [], spaces: {projectId: string; addressSpaceId: string; unitBits: number; translation: bigint}[] = absolute ? [{projectId: project, addressSpaceId: modelId, unitBits, translation}] : [];
    const addSource = (role: SourceFact['role'], entity: {source?: import('../../core/types.ts').Source}) => {if (entity.source) sources.push({role, projectId: project, source: entity.source});};
    addSource('definition', current.entry.entity);
    for (const [cursor, step] of segments.entries()) {
      if (current.entry.type === 'address-space' && step.kind === 'region') {
        const space = current.entry.entity as AddressSpace, info = this.resolveRegion(project, space.id, step.regionId), region = info.region;
        const i = instanceIndex(step, region);pathLabels.push(region.label+((region.count??1)>1?'['+i+']':''));
        const repeated = repetitionSpan(region, positive(region.size, region.id));
        const localStart = (integer(region.base, region.id) + i * repeated.stride) * BigInt(space.addressUnitBits);
        position = localStart + translation; regionBase ??= position; regionInfo = info; regionProject = project; terminalRegion = region;
        span = positive(region.size, region.id) * BigInt(space.addressUnitBits);
        location = {...current.entry.location, path: current.entry.location.path + '/regions/' + space.regions.indexOf(region)};
        addSource('mapping', region);
        if (cursor === segments.length - 1) {
          if (region.kind === 'resource' && info.target?.entry.type === 'memory') span = info.mappedBits;
          visibleLo = max(visibleLo, position); visibleHi = min(visibleHi, position + span);
          if(info.target?.entry.entity.source)sources.push({role:'definition',projectId:info.target.graph.manifest.projectId,source:info.target.entry.entity.source});
          break;
        }
        if (region.kind === 'reserved') figureFail('ADDRESS_PATH', region.id, 'Reserved 没有下级资源');
        visibleLo = max(visibleLo, position); visibleHi = min(visibleHi, position + info.mappedBits);
        if (visibleLo >= visibleHi) figureFail('ADDRESS_NOT_VISIBLE', region.id, 'Region 不在沿途 Window 可见区间内');
        terminalRegion = undefined;
        current = info.target!; project = current.graph.manifest.projectId;
        if (region.kind === 'window') {
          translation = position - (info.targetBaseBits + i * info.targetStrideBits);
          unitBits = (current.entry.entity as AddressSpace).addressUnitBits;
          spaces.push({projectId: project, addressSpaceId: current.entry.id, unitBits, translation});
          accessPolicy = undefined;
        } else if (current.entry.type === 'register-block') {
          blockBase = position - info.resourceOffsetBits;
          accessPolicy = this.policy(project, current.entry.entity as RegisterBlock);
        } else figureFail('ADDRESS_PATH', region.id, 'Memory Region 已是切片终点');
        addSource('definition', current.entry.entity);
      } else if (current.entry.type === 'register-block' && step.kind === 'entry') {
        const layout = this.block(project, current.entry.id), item = layout.entries.find(e => e.entry.id === step.entryId);
        if (!item) figureFail('ADDRESS_PATH', current.entry.id, 'Block entry 不存在：' + step.entryId);
        const i = instanceIndex(step, item.entry);
        position = blockBase + item.start + i * item.stride; span = item.span;
        nativeOffset = {value:hex((item.start+i*item.stride)/BigInt(layout.unitBits)),addressUnitBits:layout.unitBits};
        visibleLo = max(visibleLo, position); visibleHi = min(visibleHi, position + span);
        location = {...current.entry.location, path: current.entry.location.path + '/entries/' + layout.block.entries.indexOf(item.entry)};
        addSource('entry', item.entry);
        current = this.target(project, {id: item.entry.register ?? item.entry.block!}, item.entry.register ? ['register'] : ['register-block']);
        location = current.entry.location;
        pathLabels.push((item.entry.label??current.entry.entity.label??item.entry.id)+(item.count>1n?'['+i+']':''));
        addSource('definition', current.entry.entity);
        if (current.entry.type === 'register-block') {
          blockBase = position;
          accessPolicy = this.policy(project, current.entry.entity as RegisterBlock, accessPolicy);
        }
      } else figureFail('ADDRESS_PATH', modelId, `步骤 ${cursor} 类型不匹配；Space 用 RegionStep，Block 用 EntryStep`);
    }
    if (segments.length && visibleLo >= visibleHi) figureFail('ADDRESS_NOT_VISIBLE', modelId, '目标不在沿途映射的可见范围内');
    if (!terminalRegion && current.entry.type === 'register' && (visibleLo > position || visibleHi < position + span)) {throw new FigureError('PARTIAL_REGISTER_WINDOW', current.entry.id, `寄存器完整槽位 [${hex(position)},${hex(position + span)}) bit，仅可见 [${hex(visibleLo)},${hex(visibleHi)}) bit；路径 ${JSON.stringify(segments)}`, '', {originProjectId,addressSpaceId:absolute?modelId:undefined,instancePath:segments,definitionProjectId:project,definitionId:current.entry.id,slot:{startBit:hex(position),endExclusiveBit:hex(position+span)},visible:{startBit:hex(visibleLo),endExclusiveBit:hex(visibleHi)}});}
    const entity = terminalRegion ?? current.entry.entity as AddressInstance['entity'];
    const definition = terminalRegion ? undefined : current.entry;
    const visibleStart=max(position,visibleLo),visibleEnd=min(position+span,visibleHi);
    const start = coordinate(visibleStart, originUnitBits), end = coordinate(visibleEnd, originUnitBits);
    return {
      kind: terminalRegion ? terminalRegion.kind === 'resource' && regionInfo?.target?.entry.type === 'memory' ? 'memory-slice' : 'region' : current.entry.type === 'register' ? 'register-instance' : current.entry.type === 'register-block' ? segments.length ? 'block-instance' : 'resource-definition' : absolute ? 'address-space-definition' : 'resource-definition',
      modelId, originProjectId, ...(absolute ? {addressSpaceId: modelId} : {}), addressUnitBits: originUnitBits, instancePath: segments,
      ...(definition ? {definitionProjectId: project, definitionId: definition.id, definitionType: definition.type} : terminalRegion?.kind === 'resource' ? {definitionProjectId: regionInfo!.target!.graph.manifest.projectId, definitionId: regionInfo!.target!.entry.id, definitionType: regionInfo!.target!.entry.type} : {}),
      entity, location, coordinate: start, ...(absolute && start.address ? {address: start.address} : {}), ...(!absolute ? {relativeOffset: start} : {}),
      ...(regionBase !== undefined ? {regionOffset: coordinate(visibleStart - regionBase, originUnitBits)} : {}),
      range: {start, endExclusive: end, sizeBits: hex(visibleEnd-visibleStart),...(visibleEnd>visibleStart?{lastBit:coordinate(visibleEnd-1n,originUnitBits),...(start.address&&end.address?{lastAddress:hex(BigInt(end.address)-1n)}:{})}:{})}, projectedRange:{startBit:hex(position),endExclusiveBit:hex(position+span),sizeBits:hex(span)}, visibleRange: {startBit: hex(visibleLo), endExclusiveBit: hex(visibleHi)}, partial: visibleLo > position || visibleHi < position + span,
      ...(regionInfo ? {allocationSize: regionInfo.region.size, ...(regionInfo.region.kind !== 'reserved' ? {mappedSize: hex(exactUnits(regionInfo.mappedBits, regionInfo.space.addressUnitBits, regionInfo.region.id)), resourceOffset: {value: hex(regionInfo.resourceOffsetBits / BigInt(regionInfo.target?.entry.type === 'register-block' ? unitOf(regionInfo.target.entry.entity as RegisterBlock) : 8)), addressUnitBits: regionInfo.target?.entry.type === 'register-block' ? unitOf(regionInfo.target.entry.entity as RegisterBlock) : 8}} : {})} : {}),
      ...(regionInfo?{regionCoordinateSystem:{projectId:regionProject,addressSpaceId:regionInfo.space.id,addressUnitBits:regionInfo.space.addressUnitBits}}:{}),
      ...(terminalRegion&&regionInfo&&terminalRegion.kind!=='reserved'?{mappedRange:{startBit:hex(position),endExclusiveBit:hex(position+regionInfo.mappedBits)}}:{}),
      ...(terminalRegion?.kind==='resource'&&regionInfo?.target?.entry.type==='memory'?{memorySlice:{projectId:regionInfo.target.graph.manifest.projectId,memoryId:regionInfo.target.entry.id,startBit:hex(regionInfo.resourceOffsetBits+visibleLo-position),endExclusiveBit:hex(regionInfo.resourceOffsetBits+visibleHi-position)}}:{}),
      ...(nativeOffset?{nativeOffset}:{}), ...(accessPolicy ? {accessPolicy} : {}), pathLabels, sources,
      coordinateChain: spaces.map(s => ({projectId: s.projectId, addressSpaceId: s.addressSpaceId, coordinate: coordinate(visibleStart - s.translation, s.unitBits)}))
    };
  }
}
export function createAddressResolver(graph: Graph): ResourceResolver {
  return graph.addressResolver ?? new ResourceResolver(new Map([[graph.manifest.projectId, graph]]));
}
