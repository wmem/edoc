import type { Graph, Table } from '../../core/types.ts';
import { figureFail } from '../../figure/errors.ts';
import { statistics } from './statistics.ts';
import { plotTransform } from './transform.ts';
import type { PlotColumn, PlotRecord } from './transform.ts';
import type { PlotEncoding, PlotSpec, PlotView } from './types.ts';
export { plotTransform, quantile } from './transform.ts';
export type { PlotColumn, PlotRecord } from './transform.ts';
export function plotTable(graph: Graph, id: string) {
  const entry = graph.index.get(id);
  if (entry?.type !== 'table') figureFail('PLOT_DATA', id, 'plot.data 必须引用已有 Table');
  return entry.entity as Table;
}
export function plotProjection(graph: Graph, view: PlotView) {
  const table = plotTable(graph, view.data);
  if (table.columns.some(c => c.field.startsWith('__edoc_'))) figureFail('PLOT_FIELD', view.id, '__edoc_ 前缀为绘图内部保留字段');
  const nodePaths = new Set<string>();
  // 每个面的结构相同，合并其带作用域的结果供查询与同一绘图定义消费。
  const mergeFacetProjections = (nodes: any[]): any => {
    const first = nodes[0],
      merged = {
        ...first,
        rows: nodes.flatMap(n => n.rows),
        audit: nodes.flatMap(n => n.audit)
      };
    if (first.statistics) merged.statistics = nodes.flatMap(n => n.statistics);
    if (first.layer) merged.layer = first.layer.map((_: unknown, i: number) => mergeFacetProjections(nodes.map(n => n.layer[i])));
    if (first.spec) merged.spec = mergeFacetProjections(nodes.map(n => n.spec));
    return merged;
  };
  const visit = (spec: PlotSpec, records: PlotRecord[], columns: PlotColumn[], path: string, scope: Record<string, unknown> = {}): any => {
    nodePaths.add(path);
    if (nodePaths.size > 100) figureFail('PLOT_LIMIT', view.id, '组合图最多 100 个子视图');
    const result = plotTransform(records, columns, spec.transform ?? [], view.id);
    if (Object.keys(scope).length) {
      result.rows = result.rows.map(row => ({
        ...row,
        facets: scope
      }));
      result.audit = result.audit.map(item => ({
        ...(item as object),
        facets: scope
      }));
    }
    const field = (name: string) => {
      const c = result.columns.find(c => c.field === name);
      if (!c) figureFail('PLOT_FIELD', view.id, '未知字段：' + name);
      return c;
    };
    if (spec.layer) {
      if (spec.mark || spec.facet || spec.spec || spec.encoding) figureFail('PLOT_COMPOSITION', view.id, 'layer 与 mark/encoding/facet/spec 不能混用');
      return {
        ...result,
        path,
        layer: spec.layer.map((s, i) => visit(s, result.rows, result.columns, path + '/layer/' + i, scope))
      };
    }
    if (spec.facet) {
      if (!spec.spec || spec.mark || spec.encoding) figureFail('PLOT_COMPOSITION', view.id, 'facet 需要 spec，不能同时声明 mark/encoding');
      field(spec.facet.field);
      const facetField = '__edoc_facet_' + (path.replaceAll('/', '_') || 'root'),
        partitions = new Map<string, PlotRecord[]>();
      // 父转换已经完成；子转换在每个面的记录上分别执行，聚合也不能跨面混合。
      for (const row of result.rows) {
        const value = row.values[spec.facet.field] ?? null,
          key = JSON.stringify(value),
          scoped = {
            ...row,
            facets: {
              ...row.facets,
              [facetField]: value
            }
          };
        partitions.set(key, [...(partitions.get(key) ?? []), scoped]);
      }
      const children = [...partitions.values()].map(rows => visit(spec.spec!, rows, result.columns, path + '/spec', rows[0].facets));
      return {
        ...result,
        path,
        facet: spec.facet,
        facetField,
        spec: children.length ? mergeFacetProjections(children) : visit(spec.spec, [], result.columns, path + '/spec', scope)
      };
    }
    if (!spec.mark || !spec.encoding || spec.spec) figureFail('PLOT_COMPOSITION', view.id, '普通统计图需要 mark 和 encoding');
    const encoding: Record<string, PlotEncoding> = {};
    for (const [channel, source] of Object.entries(spec.encoding)) {
      const e = {
          ...source
        },
        c = e.field ? field(e.field) : undefined;
      if (!c && e.aggregate !== 'count') figureFail('PLOT_FIELD', view.id, '映射需要 field 或 aggregate=count');
      e.type ??= e.aggregate === 'count' || c?.type === 'number' ? 'quantitative' : 'nominal';
      if (e.type === 'quantitative' && c?.type !== 'number' && e.aggregate !== 'count') figureFail('PLOT_TYPE', view.id, 'quantitative 映射需要 number 字段');
      if (e.aggregate && e.aggregate !== 'count' && c?.type !== 'number') figureFail('PLOT_TYPE', view.id, '数值聚合需要 number 字段');
      if (e.type === 'temporal') for (const r of result.rows) {
        const v = r.values[e.field!];
        if (v !== undefined && v !== null && (typeof v !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/.test(v) || !Number.isFinite(Date.parse(v)))) figureFail('PLOT_TIMEZONE', view.id, '时间必须为带时区的 ISO 字符串：' + e.field);
      }
      if (e.type === 'quantitative' && e.aggregate !== 'count') for (const r of result.rows) {
        const v = e.field ? r.values[e.field] : undefined;
        if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isFinite(v))) figureFail('PLOT_VALUE', view.id, '定量字段必须为有限数字：' + e.field);
      }
      if (!e.title) {
        if (e.aggregate === 'count') e.title = 'count (samples)';
        else if (c) e.title = (c.label ?? c.field) + (c.unit ? ' (' + c.unit + ')' : '');
      }
      encoding[channel] = e;
    }
    for (const [a, b] of [['x', 'x2'], ['y', 'y2']]) if (encoding[a]?.field && encoding[b]?.field && field(encoding[a].field!).unit !== field(encoding[b].field!).unit) figureFail('PLOT_UNIT', view.id, '范围上下界字段单位不一致：' + a + '/' + b);
    const binned:Record<string,string>={};
    for(const [start,end] of [['x','x2'],['y','y2']]){
      const a=encoding[start],b=encoding[end];
      if(a?.field&&b?.field&&a.bin===undefined&&field(a.field).binEnd===b.field)binned[start]=b.field;
    }
    const units = Object.fromEntries(Object.entries(encoding).map(([c, e]) => [c, e.aggregate === 'count' ? 'samples' : e.field ? field(e.field).unit ?? null : null]));
    return {
      ...result,
      path,
      mark: spec.mark,
      encoding,
      binned,
      units,
      statistics: statistics(result.rows, encoding, spec.mark),
      sort: spec.mark === 'line' && !encoding.order && ['quantitative', 'temporal'].includes(encoding.x?.type ?? '') ? 'x-stable' : 'explicit-or-source'
    };
  };
  const sourceRecords = table.rows.map(r => {
    const data = r.objectId ? graph.index.get(r.objectId)?.entity : r.values;
    return {
      values: Object.fromEntries(table.columns.map(c => [c.field, c.field.split('.').reduce((v: any, k) => v && Object.hasOwn(v, k) ? v[k] : undefined, data)])),
      rowIds: [r.id]
    };
  });
  const projection = visit(view, sourceRecords, table.columns, '');
  const checkUnits = (p: any): void => {
    if (p.layer) {
      for (const channel of ['x', 'y']) {
        const values = p.layer.flatMap((s: any) => s.units?.[channel] ? [s.units[channel]] : []);
        if (new Set(values).size > 1) figureFail('PLOT_UNIT', view.id, '共享 ' + channel + ' 轴的图层单位不同');
      }
      p.layer.forEach(checkUnits);
    }
    if (p.spec) checkUnits(p.spec);
  };
  checkUnits(projection);
  return {
    modelId: view.id,
    table: table.id,
    source: table.source,
    inputCount: table.rows.length,
    sourceRecords,
    projection,
    statisticalPolicy: {
      quantile: 'linear / R-7',
      boxplot: 'Tukey 1.5 IQR',
      errorbar: '默认均值 ± 标准误差',
      missing: '不补零；折线保留缺测断点',
      count: '计记录数，包含字段缺测记录'
    }
  };
}
