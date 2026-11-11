import type { Graph, Register } from '../../core/types.ts';
import { figureFail } from '../../figure/errors.ts';
import type { AddressEntry, AddressMapping, AddressSpace, RegisterBlock, RegisterPlacement } from './types.ts';
export const hex = (n: bigint) => '0x' + n.toString(16).toUpperCase();
const count = (entry: {
  count?: number;
}) => BigInt(entry.count ?? 1);
export function addressInteger(value: string, id: string) {
  try {
    const n = BigInt(value);
    if (n < 0n) throw Error();
    return n;
  } catch {
    return figureFail('ADDRESS_INTEGER', id, '地址量必须是非负整数字符串');
  }
}
function blockOf(graph: Graph, id: string): RegisterBlock {
  const e = graph.index.get(id);
  if (e?.type !== 'register-block') figureFail('ADDRESS_REFERENCE', id, '块引用不存在或类型错误：' + id);
  return e.entity as RegisterBlock;
}
function registerOf(graph: Graph, id: string): Register {
  const e = graph.index.get(id);
  if (e?.type !== 'register') figureFail('ADDRESS_REFERENCE', id, '寄存器引用不存在或类型错误：' + id);
  return e.entity as Register;
}
export function entrySpan(graph: Graph, e: AddressEntry, unitBits = 8, stack: string[] = []): bigint {
  const minimum = e.register ? BigInt(Math.ceil(registerOf(graph, e.register).width / unitBits)) : blockSpan(graph, e.block!, unitBits, stack);
  if (e.span === undefined) return minimum;
  const span = addressInteger(e.span, e.id);
  if (span < minimum) figureFail('ADDRESS_SPAN', e.id, 'span 小于定义所需范围');
  return span;
}
export function repetitionSpan(e: {
  id: string;
  count?: number;
  stride?: string;
}, span: bigint) {
  const n = count(e);
  if (n > 1n && !e.stride) figureFail('ADDRESS_STRIDE', e.id, '数组必须显式声明 stride');
  const stride = e.stride === undefined ? span : addressInteger(e.stride, e.id);
  if (n > 1n && stride < span) figureFail('ADDRESS_OVERLAP', e.id, '数组 stride 小于实例跨度，存在重叠');
  return {
    count: n,
    stride,
    total: (n - 1n) * stride + span
  };
}
export function blockSpan(graph: Graph, id: string, unitBits = 8, stack: string[] = []): bigint {
  if (stack.length > 64) figureFail('ADDRESS_LIMIT', id, '寄存器块嵌套深度不能超过 64');
  if (stack.includes(id)) figureFail('ADDRESS_CYCLE', id, '寄存器块引用成环：' + [...stack, id].join(' → '));
  const block = blockOf(graph, id);
  let minimum = 0n;
  const ranges: (RepeatedInterval & {
    id: string;
  })[] = [];
  for (const e of block.entries) {
    const span = entrySpan(graph, e, unitBits, [...stack, id]),
      repeat = repetitionSpan(e, span),
      start = addressInteger(e.offset, e.id),
      end = start + repeat.total;
    for (const other of ranges) if (intervalsOverlap({
      start,
      span,
      ...repeat
    }, other)) figureFail('ADDRESS_OVERLAP', id, `地址单位 ${unitBits} bit 下块 ${id} 的条目重叠：${other.id} / ${e.id}`);
    ranges.push({
      id: e.id,
      start,
      span,
      ...repeat
    });
    if (end > minimum) minimum = end;
  }
  if (block.size === undefined) return minimum;
  const declared = addressInteger(block.size, id);
  if (declared < minimum) figureFail('ADDRESS_RANGE', id, '块内条目超出已声明 size');
  return declared;
}
// 有限等差区间的精确重叠判定：使用 floor-sum，不枚举数组实例。
const floor = (a: bigint, b: bigint) => a >= 0n ? a / b : -((-a + b - 1n) / b);
const ceil = (a: bigint, b: bigint) => -floor(-a, b);
function floorSum(n: bigint, m: bigint, a: bigint, b: bigint) {
  let answer = 0n;
  for (;;) {
    if (a >= m) {
      answer += (n - 1n) * n * (a / m) / 2n;
      a %= m;
    }
    if (b >= m) {
      answer += n * (b / m);
      b %= m;
    }
    const y = a * n + b;
    if (y < m) return answer;
    n = y / m;
    b = y % m;
    [m, a] = [a, m];
  }
}
export type RepeatedInterval = {
  start: bigint;
  span: bigint;
  count: bigint;
  stride: bigint;
};
export function intervalsOverlap(a: RepeatedInterval, b: RepeatedInterval) {
  if (a.span === 0n || b.span === 0n) return false;
  const pairs = (threshold: bigint) => {
    const step = a.count === 1n ? 1n : a.stride,
      m = b.count === 1n ? 1n : b.stride,
      c = threshold + a.start - b.start;
    const clamp = (n: bigint) => n < 0n ? 0n : n > a.count ? a.count : n;
    const lo = clamp(ceil(-c, step)),
      hi = clamp(ceil((b.count - 1n) * m - c, step));
    const middle = hi > lo ? floorSum(hi - lo, m, step, c + lo * step) + (hi - lo) : 0n;
    return middle + (a.count - hi) * b.count;
  };
  return pairs(a.span - 1n) > pairs(-b.span);
}
export function addressIntervals(graph: Graph, model: RegisterBlock | AddressSpace) {
  const unit = model.kind === 'address-space' ? model.addressUnitBits ?? 8 : 8;
  return (model.kind === 'address-space' ? model.mappings : model.entries).map(e => {
    const span = 'base' in e ? blockSpan(graph, e.block, unit) : entrySpan(graph, e, unit),
      repeated = repetitionSpan(e, span);
    return {
      id: e.id,
      start: addressInteger('base' in e ? e.base : e.offset, e.id),
      span,
      count: repeated.count,
      stride: repeated.stride,
      total: repeated.total
    };
  });
}
export function registerInstance(graph: Graph, id: string, selector: string) {
  const model = graph.index.get(id)?.entity as RegisterBlock | AddressSpace | undefined;
  if (!model || !['register-block', 'address-space'].includes(model.kind)) figureFail('QUERY_TYPE', id, '实例查询需要地址空间或寄存器块');
  let path: (string | number)[];
  try {
    path = selector.startsWith('[') ? JSON.parse(selector) : [selector];
    if (!Array.isArray(path) || !path.length || path.some(v => typeof v !== 'string' && (!Number.isSafeInteger(v) || v < 0))) throw Error();
  } catch {
    return figureFail('ADDRESS_PATH', id, '实例路径应为字符串/非负索引的 JSON 数组');
  }
  let cursor = 0,
    at = 0n,
    unit = 8,
    definition: string = id;
  const sources: unknown[] = [];
  const step = (e: AddressEntry | AddressMapping, span: bigint) => {
    at += addressInteger('base' in e ? e.base : e.offset, e.id);
    const n = e.count ?? 1;
    if (n > 1) {
      const i = path[cursor++];
      if (typeof i !== 'number' || i < 0 || i >= n) figureFail('ADDRESS_INDEX', id, '数组需要范围内的显式索引：' + e.id);
      at += BigInt(i) * repetitionSpan(e, span).stride;
    }
    if (e.source) sources.push(e.source);
  };
  if (model.kind === 'address-space') {
    const space = model as AddressSpace;
    unit = space.addressUnitBits ?? 8;
    const mappingId = path[cursor++],
      mapping = space.mappings.find(m => m.id === mappingId);
    if (!mapping) figureFail('ADDRESS_PATH', id, '映射条目不存在');
    step(mapping, blockSpan(graph, mapping.block, unit));
    definition = mapping.block;
  }
  let span = blockSpan(graph, definition, unit);
  const seen = new Set<string>();
  while (cursor < path.length) {
    if (seen.has(definition)) figureFail('ADDRESS_CYCLE', definition, '块引用成环');
    seen.add(definition);
    const block = blockOf(graph, definition),
      entryId = path[cursor++],
      entry = block.entries.find(e => e.id === entryId);
    if (!entry) figureFail('ADDRESS_PATH', id, '块内条目不存在');
    span = entrySpan(graph, entry, unit);
    step(entry, span);
    definition = entry.register ?? entry.block!;
    if (entry.register) {
      if (cursor !== path.length) figureFail('ADDRESS_PATH', id, '寄存器实例路径后有多余元素');
      break;
    }
  }
  const target = graph.index.get(definition)!;
  return {
    modelId: id,
    instancePath: path,
    addressUnitBits: unit,
    definition,
    definitionType: target.type,
    offset: hex(at),
    ...(model.kind === 'address-space' ? {
      address: hex(at)
    } : {}),
    span: hex(span),
    entity: target.entity,
    sources: [...sources, ...(target.entity.source ? [target.entity.source] : [])]
  };
}
// 查询定义集合不展开数组，用于呈现选择和显式定义链接的严格校验。
export function registerMapDefinitions(graph: Graph, id: string) {
  const definitions = new Set<string>(), visited = new Set<string>();
  const visit = (blockId: string) => {
    if (visited.has(blockId)) return;
    visited.add(blockId);
    for (const entry of blockOf(graph, blockId).entries) {
      if (entry.register) definitions.add(entry.register);
      else visit(entry.block!);
    }
  };
  const model = graph.index.get(id)?.entity as RegisterBlock | AddressSpace;
  if (model.kind === 'address-space') model.mappings.forEach(mapping => visit(mapping.block));
  else visit(id);
  return definitions;
}

export function registerMapProjection(graph: Graph, id: string, limit = 120, options: {register?: string} = {}) {
  const model = graph.index.get(id)?.entity as RegisterBlock | AddressSpace;
  const rows: RegisterPlacement[] = [];
  let total = 0n;
  const unit = model.kind === 'address-space' ? model.addressUnitBits ?? 8 : 8;
  if (model.kind === 'register-block') blockSpan(graph, id, unit);
  const selected = (definition: string) => !options.register || options.register === definition;
  const counts = new Map<string, bigint>();
  const leafCount = (blockId: string, stack: string[] = []): bigint => {
    if (stack.includes(blockId)) figureFail('ADDRESS_CYCLE', blockId, '块引用成环');
    if (counts.has(blockId)) return counts.get(blockId)!;
    const total = blockOf(graph, blockId).entries.reduce((n, entry) => n + count(entry) *
      (entry.register ? selected(entry.register) ? 1n : 0n : leafCount(entry.block!, [...stack, blockId])), 0n);
    counts.set(blockId, total);
    return total;
  };
  const indexed = (label: string, index: bigint, repeated: bigint) => label + (repeated > 1n ? '[' + index + ']' : '');
  const visit = (blockId: string, base: bigint, path: (string | number)[], labels: string[], region: string, regionBase: bigint) => {
    for (const entry of blockOf(graph, blockId).entries) {
      if (entry.register && !selected(entry.register) || entry.block && !leafCount(entry.block)) continue;
      const span = entrySpan(graph, entry, unit), repeat = repetitionSpan(entry, span);
      const definition = entry.register ? registerOf(graph, entry.register) : blockOf(graph, entry.block!);
      const label = entry.label ?? definition.label ?? entry.id;
      for (let i = 0n; i < repeat.count && rows.length < limit; i++) {
        const p = [...path, entry.id, ...(repeat.count > 1n ? [Number(i)] : [])];
        const pathLabels = [...labels, indexed(label, i, repeat.count)];
        const offset = base + addressInteger(entry.offset, entry.id) + i * repeat.stride;
        if (entry.register) rows.push({
          path: p, definition: entry.register, offset: hex(offset),
          ...(model.kind === 'address-space' ? {address: hex(offset)} : {}),
          span: hex(span), source: entry.source, label: indexed(label, i, repeat.count), description: (definition as Register).description,
          pathLabels, region, regionOffset: hex(offset - regionBase)
        });
        else if (leafCount(entry.block!)) visit(entry.block!, offset, p, pathLabels, region, regionBase);
      }
    }
  };
  if (model.kind === 'address-space') {
    for (const mapping of model.mappings) {
      const repeat = repetitionSpan(mapping, blockSpan(graph, mapping.block, unit));
      const block = blockOf(graph, mapping.block), label = mapping.label ?? block.label ?? mapping.id;
      total += repeat.count * leafCount(mapping.block);
      for (let i = 0n; leafCount(mapping.block) > 0n && i < repeat.count && rows.length < limit; i++) {
        const base = addressInteger(mapping.base, mapping.id) + i * repeat.stride;
        const region = indexed(label, i, repeat.count);
        visit(mapping.block, base, [mapping.id, ...(repeat.count > 1n ? [Number(i)] : [])], [region], region, base);
      }
    }
  } else {
    total = leafCount(id);
    visit(id, 0n, [], [], model.label ?? id, 0n);
  }
  const entries = model.kind === 'address-space' ? model.mappings : model.entries;
  return {
    modelId: id, addressUnitBits: unit, relative: model.kind === 'register-block',
    total: total.toString(), truncated: total > BigInt(rows.length), limit, rows,
    intervals: addressIntervals(graph, model).map(interval => {
      const entry = entries.find(entry => entry.id === interval.id)!;
      const definition = 'register' in entry && entry.register ? registerOf(graph, entry.register) : blockOf(graph, entry.block!);
      return {...interval, label: entry.label ?? definition.label ?? entry.id, description: definition.description,
        start: hex(interval.start), end: interval.total ? hex(interval.start + interval.total - 1n) : null,
        span: hex(interval.span), count: interval.count.toString(), stride: hex(interval.stride), total: hex(interval.total)};
    })
  };
}
