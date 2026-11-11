import type { Graph } from '../../core/types.ts';
import { validationContext } from '../../core/validation-context.ts';
import { FigureError, figureFail } from '../../figure/errors.ts';
import { binaryModel, binaryProjection } from './model.ts';
import type { BinaryLayout, BinaryView, Length } from './types.ts';
import { binaryElements } from './types.ts';
export function validateBinaryLayouts(graph: Graph) {
  const {
    errors,
    report,
    reference
  } = validationContext(graph);
  for (const entry of graph.index.values()) if (entry.type === 'binary-layout') {
    const model = entry.entity as BinaryLayout,
      elements = binaryElements(model),
      ids = new Set<string>();
    if (!graph.manifest.requiredFeatures?.includes('binary-layouts')) report(entry, 'IR_FEATURE_REQUIRED', '', '需要 binary-layouts 必需能力');
    for (const {
      element,
      path
    } of elements) {
      if (ids.has(element.id)) report(entry, 'BINARY_DUPLICATE', path, '局部 ID 重复：' + element.id);
      ids.add(element.id);
    }
    const dependencies = new Map<string, string[]>();
    for (const {
      element,
      path
    } of elements) {
      const e = element as any,
        refs: string[] = [];
      const checkCount = (v: Length): void => {
        if (typeof v === 'number') return;
        if ('field' in v) {
          if (v.unit) report(entry, 'BINARY_COUNT_UNIT', path, '重复次数无量纲，不接受 unit');
        } else v.args.forEach(checkCount);
      };
      if (e.count !== undefined) checkCount(e.count);
      const length = (v: Length): void => {
        if (typeof v === 'number') return;
        if ('field' in v) {
          refs.push(v.field);
          if (!elements.some(x => x.element.id === v.field && (!('kind' in x.element) || (x.element as any).kind === 'field'))) report(entry, 'BINARY_FIELD', path, '长度必须引用本模型普通字段：' + v.field);
        } else {
          if (['sub', 'div'].includes(v.op) && v.args.length !== 2) report(entry, 'BINARY_ARITY', path, 'sub/div 需要两个参数');
          v.args.forEach(length);
        }
      };
      for (const k of ['size', 'offset', 'count']) if (e[k] !== undefined) length(e[k]);
      dependencies.set(e.id, refs);
      if (e.model) reference(entry, e.model, path + '/model', ['binary-layout']);
      if (e.kind === 'choice') {
        if (!elements.some(x => x.element.id === e.selector && (!('kind' in x.element) || (x.element as any).kind === 'field'))) report(entry, 'BINARY_SELECTOR', path, '未知 selector 字段：' + e.selector);
        const choices = new Set();
        let fallback = 0;
        for (const b of e.branches) {
          if (b.when === undefined === !b.otherwise) report(entry, 'BINARY_CHOICE', path, '分支必须声明 when 或 otherwise 二选一');
          if (b.otherwise) fallback++;else if (choices.has(b.when)) report(entry, 'BINARY_CHOICE', path, '重复 when');
          choices.add(b.when);
        }
        if (fallback > 1) report(entry, 'BINARY_CHOICE', path, '最多一个 otherwise');
      }
    }
    const checked = new Set<string>();
    const visit = (id: string, stack: string[]) => {
      if (stack.includes(id)) figureFail('BINARY_DEPENDENCY_CYCLE', model.id, '字段长度依赖成环：' + [...stack, id].join(' → '));
      if (checked.has(id)) return;
      for (const ref of dependencies.get(id) ?? []) visit(ref, [...stack, id]);
      checked.add(id);
    };
    try {
      for (const id of ids) visit(id, []);
      binaryProjection(graph, model.id);
    } catch (error) {
      if (error instanceof FigureError) report(entry, error.code, error.path, error.message);else throw error;
    }
  } else if (entry.type === 'view' && ('kind' in entry.entity ? entry.entity.kind : '') === 'binary-layout') {
    const view = entry.entity as BinaryView;
    try {
      const model = binaryModel(graph, view.model),
        elements = binaryElements(model),
        ids = new Set(elements.map(e => e.element.id));
      for (const id of [...(view.collapsed ?? []), ...(view.focus ? [view.focus] : [])]) if (!ids.has(id)) report(entry, 'BINARY_VIEW', '', '未知本模型元素：' + id);
      binaryProjection(graph, view.model, view);
    } catch (error) {
      if (error instanceof FigureError) report(entry, error.code, error.path, error.message);else throw error;
    }
  }
  return errors;
}
