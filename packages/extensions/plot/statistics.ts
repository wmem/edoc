import type {PlotRecord} from './transform.ts';
import {quantile} from './transform.ts';
import type {PlotEncoding} from './types.ts';

function fieldStatistics(rows: PlotRecord[], field: string) {
  const values = rows.map(row => row.values[field]).filter((v): v is number => typeof v === 'number');
  const n = values.length;
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = n ? sum / n : null;
  const q1 = quantile(values, .25);
  const median = quantile(values, .5);
  const q3 = quantile(values, .75);
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = q1 === null ? null : q3! - q1;
  const lowerFence = iqr === null ? null : q1! - 1.5 * iqr;
  const upperFence = iqr === null ? null : q3! + 1.5 * iqr;
  const stderr = n > 1 ? Math.sqrt(values.reduce((s, v) => s + (v - mean!) ** 2, 0) / (n - 1) / n) : null;
  return {
    validCount: n, missingCount: rows.length - n, sum: n ? sum : null, mean, median,
    min: n ? sorted[0] : null, max: n ? sorted.at(-1) : null, q1, q3, stderr,
    lower: lowerFence === null ? null : sorted.find(v => v >= lowerFence),
    upper: upperFence === null ? null : sorted.findLast(v => v <= upperFence),
    outliers: lowerFence === null ? [] : values.filter(v => v < lowerFence || v > upperFence!)
  };
}

export function statistics(records: PlotRecord[], encoding: Record<string, PlotEncoding>, mark: string) {
  const hasAggregate = Object.values(encoding).some(e => e.aggregate);
  const summarizesDistribution = ['boxplot', 'errorbar'].includes(mark);
  const groupFields = [...new Set(Object.entries(encoding).filter(([channel, e]) => {
    if (!e.field || e.aggregate || !['x', 'color', 'detail'].includes(channel)) return false;
    return !(channel === 'x' && e.type === 'quantitative' && !summarizesDistribution && !hasAggregate);
  }).map(([, e]) => e.field!))];
  const numericFields = [...new Set(Object.values(encoding)
    .filter(e => e.field && (e.type === 'quantitative' || e.aggregate)).map(e => e.field!))];
  const partitions = new Map<string, PlotRecord[]>();
  for (const row of records) {
    const key = JSON.stringify(groupFields.map(field => row.values[field] ?? null));
    const group = partitions.get(key) ?? [];
    group.push(row);
    partitions.set(key, group);
  }
  return [...partitions.values()].map(rows => ({
    ...(rows[0]?.facets ? {facets: rows[0].facets} : {}),
    group: Object.fromEntries(groupFields.map(field => [field, rows[0].values[field] ?? null])),
    rowIds: rows.flatMap(row => row.rowIds),
    count: rows.length,
    fields: Object.fromEntries(numericFields.map(field => [field, fieldStatistics(rows, field)]))
  }));
}
