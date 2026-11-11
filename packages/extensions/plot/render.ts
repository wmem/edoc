import { parse, View } from 'vega';
import { compile } from 'vega-lite';
import type { Graph } from '../../core/types.ts';
import { escape, svg as simpleSVG, text } from '../../figure/svg.ts';
import { plotProjection } from './model.ts';
import type { PlotView } from './types.ts';
export async function plotSVG(graph: Graph, model: PlotView) {
  const p = plotProjection(graph, model);
  const hasValues = (node: any): boolean => {
    if (node.layer) return node.layer.some(hasValues);
    if (node.spec) return hasValues(node.spec);
    const quantitative = Object.values(node.encoding).filter((e: any) => e.field && e.type === 'quantitative');
    return node.rows.length > 0 && quantitative.every((e: any) =>
      node.rows.some((row: any) => typeof row.values[e.field] === 'number'));
  };
  if (!hasValues(p.projection)) {
    return simpleSVG(model.width ?? 780, 180,
      text(24, 70, '没有可用的测量值：保留缺测，不生成零值曲线。'),
      {id: model.id, label: model.label, ...p});
  }
  const field = (name: string) => name.replace(/[.\[\]\\]/g, '\\$&');
  const values: Record<string, unknown>[] = [];
  const spec = (node: any): any => {
    if (node.layer) return {
      layer: node.layer.map(spec)
    };
    if (node.facet) return {
      facet: {
        field: field(node.facetField),
        type: 'nominal',
        title: node.columns.find((column: any) => column.field === node.facet.field)?.label ?? node.facet.field
      },
      columns: node.facet.columns ?? 2,
      spec: spec(node.spec)
    };
    const leaf = node.path;
    values.push(...node.rows.map((r: any, i: number) => ({
      ...r.values,
      ...r.facets,
      __edoc_leaf: leaf,
      __edoc_order: i,
      __edoc_rowIds: r.rowIds
    })));
    const encoding = structuredClone(node.encoding);
    for(const channel of Object.keys(node.binned))encoding[channel].bin='binned';
    if (node.sort === 'x-stable') encoding.order = {
      field: encoding.x.field,
      type: encoding.x.type,
      sort: 'ascending'
    };else if (node.mark === 'line' && !encoding.order) encoding.order = {
      field: '__edoc_order',
      type: 'quantitative'
    };
    for (const [channel, e] of Object.entries(encoding) as [string, any][]) {
      if (e.field) e.field = field(e.field);
      if (e.type === 'temporal' && ['x', 'y', 'color'].includes(channel)) e.scale = {
        type: 'utc'
      };
    }
    // 声明式转换只由领域投影执行；此处仅选择该图层的物化记录。
    return {
      transform: [{
        filter: {
          field: '__edoc_leaf',
          equal: leaf
        }
      }],
      mark: {
        type: node.mark,
        ...(node.mark === 'errorbar' ? {
          extent: 'stderr'
        } : {}),
        ...(node.mark === 'boxplot' ? {
          extent: 1.5
        } : {}),
        ...(node.mark === 'line' || node.mark === 'area' ? {
          invalid: 'break-paths-show-domains'
        } : {})
      },
      encoding,
      width: model.width ?? 780,
      height: model.height ?? 340
    };
  };
  const specification = spec(p.projection);
  const definition: any = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    data: {
      values
    },
    ...specification,
    config: {
      font: 'Noto Sans SC',
      axis: {
        labelFontSize: 12,
        titleFontSize: 13
      },
      view: {
        stroke: null
      }
    },
    background: 'white'
  };
  const warnings: string[] = [];
  const logger: any = {
    level() {
      return this;
    },
    warn(...args: unknown[]) {
      warnings.push(args.join(' '));
      return this;
    },
    info() {
      return this;
    },
    debug() {
      return this;
    },
    error(...args: unknown[]) {
      throw Error(args.join(' '));
    }
  };
  const compiled = compile(definition, {
    logger
  });
  if (warnings.length) throw Error('统计图后端拒绝未落实的选项：' + warnings.join('; '));
  const v = new View(parse(compiled.spec), {
    renderer: 'none',
    logger
  });
  try {
    await v.runAsync();
    const unexpected = warnings.filter(w => !/^Infinite extent for field .+: \[Infinity, -Infinity\]$/.test(w));
    if (unexpected.length) throw Error('统计图后端诊断：' + unexpected.join('; '));
    const output = await v.toSVG();
    return output.replace(/(<svg\b[^>]*>)/, match => `${match}<title>${escape(model.label ?? model.id)}</title><metadata>${escape(JSON.stringify({
      id: model.id,
      ...p,
      definition,
      backendDiagnostics: warnings
    }))}</metadata>`);
  } finally {
    v.finalize();
  }
}
