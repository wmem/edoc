import { figureFail } from '../../figure/errors.ts';
import type { PlotTransform } from './types.ts';
export type PlotRecord = {
  values: Record<string, unknown>;
  rowIds: string[];
  facets?: Record<string, unknown>;
};
export type PlotColumn = {
  field: string;
  label?: string;
  type: string;
  unit?: string;
  // 显式分箱的起止字段配对，供后端识别已完成的分箱，不再次计算边界。
  binEnd?: string;
};
export const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b),
    i = (sorted.length - 1) * p,
    lo = Math.floor(i);
  return sorted.length ? sorted[lo] + (sorted[Math.ceil(i)] - sorted[lo]) * (i - lo) : null;
};
const numeric = (values: unknown[], id: string) => values.filter(v => v !== null && v !== undefined).map(v => {
  if (typeof v !== 'number' || !Number.isFinite(v)) figureFail('PLOT_VALUE', id, '统计字段必须是有限数字；缺测使用 null 或省略');
  return v;
});
export function plotTransform(records: PlotRecord[], inputColumns: PlotColumn[], transforms: PlotTransform[], id: string) {
  let rows = records,
    columns = [...inputColumns];
  const audit: unknown[] = [];
  const column = (field: string) => {
    const c = columns.find(c => c.field === field);
    if (!c) figureFail('PLOT_FIELD', id, '未知字段：' + field);
    return c;
  };
  const safeField = (field: string) => {
    if (field.startsWith('__edoc_')) figureFail('PLOT_FIELD', id, '转换输出不能使用 __edoc_ 保留前缀');
  };
  const newField = (field: string) => {
    safeField(field);
    if (columns.some(c => c.field === field)) figureFail('PLOT_FIELD', id, '转换输出字段不能覆盖已有字段：' + field);
  };
  for (const t of transforms) {
    const before = rows.length;
    if ('filter' in t) {
      column(t.filter.field);
      const f = t.filter;
      if (f.range && f.range[0] > f.range[1]) figureFail('PLOT_RANGE', id, '筛选 range 下界不能大于上界');
      rows = rows.filter(r => {
        const v = r.values[f.field];
        return f.equal !== undefined ? v === f.equal : f.oneOf ? f.oneOf.includes(v as any) : typeof v === 'number' && v >= f.range![0] && v <= f.range![1];
      });
    } else if ('aggregate' in t) {
      const groups = t.groupby ?? [];
      groups.forEach(column);
      const aliases = new Set(groups);
      for (const a of t.aggregate) {
        safeField(a.as);
        if (aliases.has(a.as)) figureFail('PLOT_FIELD', id, '重复聚合输出：' + a.as);
        aliases.add(a.as);
        if (a.op !== 'count' && !a.field) figureFail('PLOT_FIELD', id, '非 count 聚合需要 field');
        if (a.field) {
          const c = column(a.field);
          if (c.type !== 'number') figureFail('PLOT_TYPE', id, '聚合字段必须为 number：' + a.field);
        }
      }
      const partitions = new Map<string, PlotRecord[]>();
      for (const r of rows) {
        const key = JSON.stringify(groups.map(f => r.values[f] ?? null));
        partitions.set(key, [...(partitions.get(key) ?? []), r]);
      }
      if (!groups.length && !rows.length) partitions.set('[]', []);
      rows = [...partitions.values()].map(group => {
        const values = Object.fromEntries(groups.map(f => [f, group[0]?.values[f] ?? null]));
        for (const a of t.aggregate) {
          const v = a.field ? numeric(group.map(r => r.values[a.field!]), id) : [];
          values[a.as] = a.op === 'count' ? group.length : !v.length ? null : a.op === 'sum' ? v.reduce((x, y) => x + y, 0) : a.op === 'mean' ? v.reduce((x, y) => x + y, 0) / v.length : a.op === 'median' ? quantile(v, .5) : a.op === 'min' ? Math.min(...v) : Math.max(...v);
        }
        return {
          values,
          rowIds: group.flatMap(r => r.rowIds),
          ...(group[0]?.facets ? {
            facets: group[0].facets
          } : {})
        };
      });
      columns = [...groups.map(column), ...t.aggregate.map(a => ({
        field: a.as,
        type: 'number',
        unit: a.op === 'count' ? 'samples' : column(a.field!).unit
      }))];
    } else if ('bin' in t) {
      const c = column(t.field);
      if (c.type !== 'number') figureFail('PLOT_TYPE', id, 'bin 需要 number 字段');
      t.as.forEach(newField);
      if (t.as[0] === t.as[1]) figureFail('PLOT_FIELD', id, 'bin 输出字段必须不同');
      rows = rows.map(r => {
        const v = r.values[t.field],
          start = v === null || v === undefined ? null : Math.floor(numeric([v], id)[0] / t.bin.step) * t.bin.step;
        return {
          ...r,
          values: {
            ...r.values,
            [t.as[0]]: start,
            [t.as[1]]: start === null ? null : start + t.bin.step
          }
        };
      });
      columns.push({field:t.as[0],type:c.type,unit:c.unit,binEnd:t.as[1]}, {field:t.as[1],type:c.type,unit:c.unit});
    } else if ('quantile' in t) {
      const c = column(t.quantile);
      if (c.type !== 'number') figureFail('PLOT_TYPE', id, 'quantile 需要 number 字段');
      const groups = t.groupby ?? [];
      groups.forEach(column);
      t.as.forEach(safeField);
      if (t.as[0] === t.as[1] || t.as.some(f => groups.includes(f))) figureFail('PLOT_FIELD', id, '分位数输出字段与分组字段不能重名');
      const partitions = new Map<string, PlotRecord[]>();
      for (const r of rows) {
        const key = JSON.stringify(groups.map(f => r.values[f] ?? null));
        partitions.set(key, [...(partitions.get(key) ?? []), r]);
      }
      rows = [...partitions.values()].flatMap(group => {
        const values = numeric(group.map(r => r.values[t.quantile]), id);
        return t.probs.map(p => ({
          values: {
            ...Object.fromEntries(groups.map(f => [f, group[0].values[f]])),
            [t.as[0]]: p,
            [t.as[1]]: quantile(values, p)
          },
          rowIds: group.flatMap(r => r.rowIds),
          ...(group[0]?.facets ? {
            facets: group[0].facets
          } : {})
        }));
      });
      columns = [...groups.map(column), {
        field: t.as[0],
        type: 'number',
        unit: 'probability'
      }, {
        field: t.as[1],
        type: 'number',
        unit: c.unit
      }];
    }
    audit.push({
      transform: t,
      inputCount: before,
      outputCount: rows.length,
      missing: 'null/省略保持缺测；统计忽略缺测，count 计记录数'
    });
  }
  return {
    rows,
    columns,
    audit
  };
}
