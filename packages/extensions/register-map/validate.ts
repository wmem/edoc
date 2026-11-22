import type {Graph, Memory, AddressSpace} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
import {FigureError} from '../../figure/errors.ts';
import {createAddressResolver, DeferredAddressReference} from './resolver.ts';
import {positive} from './numeric.ts';

export function validateRegisterMaps(graph: Graph, options: {allowDeferred?: boolean} = {}) {
  const {errors, report} = validationContext(graph), resolver = createAddressResolver(graph);
  graph.addressValidation = {status: 'complete', deferred: []};
  for (const record of graph.index.values()) {
    if (!['register-block', 'address-space', 'memory'].includes(record.type)) continue;
    if (!graph.manifest.requiredFeatures?.includes('register-maps')) report(record, 'IR_FEATURE_REQUIRED', '', '需要 register-maps 必需能力');
    const check = (fn: () => unknown, path = '') => {
      try { fn(); } catch (error) {
        if (error instanceof DeferredAddressReference) {
          graph.addressValidation!.status = 'deferred';
          // 仅内部准备阶段可携带该状态；公开加载和查询必须显式拒绝。
          graph.addressValidation!.deferred.push({projectId: graph.manifest.projectId, addressSpaceId: record.id, regionId: record.type==='address-space'?(record.entity as AddressSpace).regions.find((_r,i)=>path==='/regions/'+i)?.id??path:path, target: error.target});
          if (options.allowDeferred === false) report(record, error.code, path + '/target', `[${graph.manifest.projectId}/${record.id}] ${error.message}；目标工程未参与当前 Book 组合`);
        } else if (error instanceof FigureError) {
          const region = record.type === 'address-space' ? (record.entity as AddressSpace).regions.find((_r,i) => path === '/regions/' + i) : undefined;
          const target = region && region.kind !== 'reserved' ? `；目标 ${region.target.project ?? graph.manifest.projectId}/${region.target.id}` : '';
          report(record, error.code, path + error.path, `[${graph.manifest.projectId}/${record.id}] ${error.message}${target}`);
        }
        else throw error;
      }
    };
    if (record.type === 'memory') check(() => positive((record.entity as Memory).capacityBytes, record.id));
    if (record.type === 'register-block') check(() => resolver.block(graph.manifest.projectId, record.id));
    if (record.type === 'address-space') {
      const space = record.entity as AddressSpace;
      check(() => resolver.spaceRanges(graph.manifest.projectId, record.id));
      const slices: {key: string; start: bigint; end: bigint; id: string}[] = [];
      space.regions.forEach((region, index) => check(() => {
        const info = resolver.resolveRegion(graph.manifest.projectId, space.id, region.id);
        if (region.kind !== 'resource' || info.target?.entry.type !== 'memory') return;
        const key = JSON.stringify([info.target.graph.manifest.projectId, info.target.entry.id]);
        if ((region.count ?? 1) > 1) report(record, 'ADDRESS_MEMORY_ALIAS', '/regions/' + index, '重复直接 Memory Region 会重复映射同一切片');
        const slice = {key, start: info.resourceOffsetBits, end: info.resourceOffsetBits + info.mappedBits, id: region.id};
        for (const previous of slices) if (previous.key === key && slice.start < previous.end && previous.start < slice.end) report(record, 'ADDRESS_MEMORY_ALIAS', '/regions/' + index, '直接 Memory 切片重叠：' + previous.id + ' / ' + region.id);
        slices.push(slice);
      }, '/regions/' + index));
      check(() => resolver.checkWindowCycles(graph.manifest.projectId, space.id));
    }
  }
  return errors;
}
