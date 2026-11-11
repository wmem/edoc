import type { Graph } from '../../core/types.ts';
import { validationContext } from '../../core/validation-context.ts';
import { FigureError } from '../../figure/errors.ts';
import { addressIntervals, blockSpan, intervalsOverlap } from './model.ts';
import type { AddressSpace, RegisterBlock } from './types.ts';
export function validateRegisterMaps(graph: Graph) {
  const {
    errors,
    report,
    reference
  } = validationContext(graph);
  // 已映射块按所有实际地址空间上下文校验；未映射块才使用独立阅读的 8 bit 默认。
  const mapped = new Set<string>();
  const markMapped = (id: string) => {
    if (mapped.has(id)) return;
    mapped.add(id);
    const entry = graph.index.get(id);
    if (entry?.type === 'register-block') for (const item of (entry.entity as RegisterBlock).entries) if (item.block) markMapped(item.block);
  };
  for (const entry of graph.index.values()) if (entry.type === 'address-space') for (const mapping of (entry.entity as AddressSpace).mappings) markMapped(mapping.block);
  for (const entry of graph.index.values()) if (entry.type === 'register-block' || entry.type === 'address-space') {
    if (!graph.manifest.requiredFeatures?.includes('register-maps')) report(entry, 'IR_FEATURE_REQUIRED', '', '需要 register-maps 必需能力');
    const model = entry.entity as RegisterBlock | AddressSpace,
      items = model.kind === 'address-space' ? model.mappings : model.entries,
      ids = new Set<string>();
    for (const [i, e] of items.entries()) {
      const path = '/' + (model.kind === 'address-space' ? 'mappings' : 'entries') + '/' + i;
      if (ids.has(e.id)) report(entry, 'ADDRESS_DUPLICATE', path, '局部条目 ID 重复：' + e.id);
      ids.add(e.id);
      if ('register' in e && e.register) reference(entry, e.register, path + '/register', ['register']);
      if (e.block) reference(entry, e.block, path + '/block', ['register-block']);
      if (e.source && (e.source.file.startsWith('/') || e.source.file.split('/').includes('..'))) report(entry, 'SOURCE_PATH', path + '/source', '来源必须在工程内');
    }
    try {
      if (model.kind === 'register-block') {
        if (mapped.has(model.id)) continue;
        blockSpan(graph, model.id);
      }
      const ranges = addressIntervals(graph, model);
      for (let i = 0; i < ranges.length; i++) {
        const a = ranges[i];
        if (model.kind === 'address-space' && model.addressWidth && a.start + a.total > 1n << BigInt(model.addressWidth)) report(entry, 'ADDRESS_RANGE', '', '地址超出 addressWidth');
        for (const b of ranges.slice(i + 1)) if (intervalsOverlap(a, b)) report(entry, 'ADDRESS_OVERLAP', '', '地址条目重叠：' + a.id + ' / ' + b.id);
      }
    } catch (error) {
      if (error instanceof FigureError) report(entry, error.code, error.path, error.message);else throw error;
    }
  }
  return errors;
}
