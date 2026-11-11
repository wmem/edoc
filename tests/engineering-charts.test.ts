import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { graphFromResources } from '../packages/core/graph.ts';
import { query, queryElement } from '../packages/core/query.ts';
import { readDocument } from '../packages/core/read.ts';
import type { PlotView, ResourceType, Sequence } from '../packages/core/types.ts';
import { binaryProjection } from '../packages/extensions/binary-layout/model.ts';
import { plotProjection, quantile } from '../packages/extensions/plot/model.ts';
import { intervalsOverlap, registerMapProjection } from '../packages/extensions/register-map/model.ts';
import { sequenceProjection } from '../packages/extensions/sequence/model.ts';
import { engineeringSVG } from '../packages/figure/render.ts';
function data() {
  const result: Record<string, any[]> = {};
  for (const name of ['sequences', 'binary-layouts', 'register-maps', 'measurements']) {
    const d = JSON.parse(readFileSync('docs/ir/authoring/' + name + '.json', 'utf8'));
    for (const [key, value] of Object.entries(d)) result[key] = [...(result[key] ?? []), ...(value as any[])];
  }
  return result;
}
const load = (d = data()) => graphFromResources(Object.entries(d).map(([type, items]) => ({
  type: type as ResourceType,
  data: {
    [type]: items
  },
  file: 'models.json'
})), {
  projectId: 'charts',
  irVersion: '1.8',
  resources: [],
  entryDocuments: [],
  requiredFeatures: ['sequences', 'binary-layouts', 'plots', 'register-maps', 'registers']
}, {
  root: process.cwd(),
  strict: true
});
const rejects = (modify: (d: ReturnType<typeof data>) => void, code: string) => {
  const d = data();
  modify(d);
  assert.throws(() => load(d), (e: any) => e.diagnostics?.some((d: any) => d.code === code));
};
test('地址精确到 64 bit、嵌套数组实例和定义身份保持独立', () => {
  const g = load(),
    result = queryElement(g, 'space:csr', '["device","ports",2,"ctrl"]') as any;
  assert.equal(result.address, '0x1000000000000300');
  assert.equal(result.definition, 'reg:port-ctrl');
  assert.equal(registerMapProjection(g, 'space:csr').total, '8');
  assert.equal(query(g, 'block:port', {
    depth: 1
  }).expansion.items.length, 2);
  assert.equal(readDocument(g, 'space:csr').id, 'space:csr');
});
test('地址区间的解析重叠算法与独立枚举一致，海量稀疏数组不展开', () => {
  let seed = 71;
  const next = (n: number) => {
    seed = seed * 1664525 + 1013904223 >>> 0;
    return seed % n;
  };
  for (let i = 0; i < 2000; i++) {
    const make = () => {
      const span = BigInt(next(5) + 1);
      return {
        start: BigInt(next(40)),
        span,
        stride: span + BigInt(next(12)),
        count: BigInt(next(10) + 1)
      };
    };
    const a = make(),
      b = make();
    let expected = false;
    for (let x = 0n; x < a.count; x++) for (let y = 0n; y < b.count; y++) {
      const ax = a.start + x * a.stride,
        by = b.start + y * b.stride;
      if (ax < by + b.span && by < ax + a.span) expected = true;
    }
    assert.equal(intervalsOverlap(a, b), expected, JSON.stringify([a, b], (_, v) => typeof v === 'bigint' ? v.toString() : v));
  }
  const a = {
      start: 0n,
      span: 4n,
      stride: 16n,
      count: 9000000000000n
    },
    b = {
      ...a,
      start: 8n
    };
  assert.equal(intervalsOverlap(a, b), false);
  assert.equal(intervalsOverlap(a, {
    ...b,
    start: 16n
  }), true);
});
test('寄存器映射拒绝重叠、递归、越界与不明确数组，不改原Register', () => {
  rejects(d => d.registerBlocks[0].entries[1].offset = '0x0', 'ADDRESS_OVERLAP');
  rejects(d => d.registerBlocks[0].entries.push({
    id: 'self',
    block: 'block:port',
    offset: '0'
  }), 'ADDRESS_CYCLE');
  rejects(d => d.addressSpaces[0].addressWidth = 32, 'ADDRESS_RANGE');
  rejects(d => delete d.registerBlocks[1].entries[0].stride, 'ADDRESS_STRIDE');
});
test('消息局部ID、请求响应和事件约束可查询，par 不获得全局屏障', () => {
  const g = load(),
    m = g.index.get('seq:upgrade')!.entity as Sequence,
    p = sequenceProjection(m);
  assert.ok(!p.ordering.some(e => e.from === 'progress:receive' && e.to === 'poll:send'));
  assert.equal((queryElement(g, 'seq:request', 'reply') as any).target.replyTo, 'request');
  assert.ok(readDocument(g, m.id, {
    maxChars: 200
  }).range.truncated);
  rejects(d => d.sequences[0].steps[0].to = 'missing', 'SEQUENCE_PARTICIPANT');
  rejects(d => d.sequences[0].constraints = [{
    id: 'bad',
    kind: 'order',
    before: {
      message: 'reply',
      end: 'receive'
    },
    after: {
      message: 'request',
      end: 'send'
    }
  }], 'SEQUENCE_ORDER_CYCLE');
  rejects(d => d.sequences[0].steps[1].replyTo = 'missing', 'SEQUENCE_REPLY');
  rejects(d => d.sequences[1].steps.push({
    id: 'drop',
    kind: 'deactivate',
    participant: 'client'
  }), 'SEQUENCE_LIFECYCLE');
});
test('动态协议保留符号，场景计算与原定义独立，结构支持嵌套和重复', () => {
  const g = load(),
    symbolic = binaryProjection(g, 'binary:packet'),
    sample = binaryProjection(g, 'binary:packet', {
      values: {
        type: 1,
        len: 12,
        extension: true
      }
    });
  assert.equal(symbolic.rows.find(r => r.id === 'crc')!.offset.value, undefined);
  assert.equal(symbolic.size.expression, 'end(crc)');
  assert.match(symbolic.symbols.payload.size.expression, /len/);
  assert.equal(sample.rows.find(r => r.id === 'crc')!.offset.value, 224);
  assert.equal(sample.size.value, 256);
  assert.equal(binaryProjection(g, 'binary:scatter', {
    values: {
      count: 3
    }
  }).size.value, 224);
  assert.equal((queryElement(g, 'binary:scatter', 'descriptor') as any).target.location.path, '/binaryLayouts/2/fields/2/element');
  assert.equal(binaryProjection(g, 'binary:packet').size.value, undefined);
  rejects(d => d.binaryLayouts[0].fields[1].offset = 0, 'BINARY_OVERLAP');
  rejects(d => d.binaryLayouts[1].fields[5].size = {
    field: 'missing'
  }, 'BINARY_FIELD');
  rejects(d => d.binaryLayouts[0].fields[0].size = {
    field: 'opcode'
  }, 'BINARY_DEPENDENCY_CYCLE');
});
test('测量复用原始行，过滤/分位数口径、缺测与单位可追溯', () => {
  const g = load(),
    v = g.index.get('plot:quantile')!.entity as PlotView,
    p = plotProjection(g, v);
  assert.equal(p.inputCount, 48);
  assert.equal(p.projection.rows.length, 6);
  assert.equal(quantile([1, 2, 3, 4], .25), 1.75);
  assert.ok(p.projection.rows.every((r: any) => r.rowIds.length === 24));
  assert.equal(p.projection.rows[0].values.latencyQ, 14.55);
  rejects(d => d.views.find(v => v.id === 'plot:simple').encoding.y.field = 'no-field', 'PLOT_FIELD');
  rejects(d => d.views.find(v => v.id === 'plot:simple').encoding.y = {
    field: 'mode',
    type: 'quantitative'
  }, 'PLOT_TYPE');
  rejects(d => d.views.find(v => v.id === 'plot:simple').encoding.y2 = {
    field: 'load'
  }, 'PLOT_UNIT');
  rejects(d => d.views.find(v => v.id === 'plot:simple').url = 'https://example.org', 'SCHEMA');
});
test('所有新领域的简单/复杂图从真实模型生成离线SVG', async () => {
  const g = load();
  for (const id of ['seq:request', 'view:upgrade', 'binary:descriptor', 'binary:packet', 'view:packet-sample', 'binary:scatter', 'space:csr', 'plot:simple', 'plot:distribution', 'plot:quantile']) {
    const svg = await engineeringSVG(g, id);
    assert.match(svg, /<svg\b/);
    assert.match(svg, /<metadata>/);
    assert.ok(!svg.includes('<script'));
    assert.ok(!svg.includes('NaN'), id);
  }
});
test('展开元素追溯原模型；局部来源、互斥应答和生命周期不被版面隐藏', () => {
  const g = load(),
    child = queryElement(g, 'seq:upgrade', 'authenticate/challenge') as any,
    field = queryElement(g, 'binary:scatter', '["items","descriptor","opcode"]') as any;
  assert.equal(child.originModelId, 'seq:auth');
  assert.equal(child.target.location.path, '/sequences/1/steps/0');
  assert.equal(field.originModelId, 'binary:descriptor');
  assert.equal(field.target.location.path, '/binaryLayouts/0/fields/0');
  rejects(d => d.sequences[0].steps[0].source = {
    file: '../../outside.json'
  }, 'PATH_SCOPE');
  rejects(d => {
    const steps = d.sequences[0].steps;
    d.sequences[0].steps = [steps[1], steps[0]];
  }, 'SEQUENCE_ORDER_CYCLE');
  rejects(d => {
    const steps = d.sequences[0].steps;
    d.sequences[0].steps = [{
      id: 'conditional',
      kind: 'opt',
      guard: '有请求',
      steps: [steps[0]]
    }, steps[1]];
  }, 'SEQUENCE_BRANCH');
  const strict: Sequence = {
    id: 'strict',
    kind: 'sequence',
    participants: ['a', 'b', 'c', 'd'].map(id => ({
      id
    })),
    steps: [{
      id: 'outer',
      kind: 'strict',
      steps: [{
        id: 'nested',
        kind: 'strict',
        steps: [{
          id: 'first',
          from: 'a',
          to: 'b'
        }]
      }, {
        id: 'last',
        from: 'c',
        to: 'd'
      }]
    }]
  };
  assert.ok(sequenceProjection(strict).ordering.some(e => e.from === 'first:receive' && e.to === 'last:send' && e.reason === 'strict'));
  rejects(d => d.sequences[0].constraints = [{
    id: 'wait',
    kind: 'duration',
    from: {
      message: 'request',
      end: 'send'
    },
    to: {
      message: 'reply',
      end: 'receive'
    },
    max: 10,
    unit: 'cycles'
  }], 'SEQUENCE_CLOCK');
});
test('协议长度表达式按声明单位运算，保留精确有理数并拒绝分数位长', () => {
  const d = data();
  d.binaryLayouts.push({
    id: 'mixed',
    kind: 'binary-layout',
    unit: 'byte',
    fields: [{
      id: 'len',
      size: 1
    }, {
      id: 'data',
      size: {
        op: 'add',
        args: [{
          field: 'len',
          unit: 'bit'
        }, 1]
      }
    }]
  });
  const g = load(d);
  assert.equal(binaryProjection(g, 'mixed', {
    values: {
      len: 8
    }
  }).size.value, 24);
  assert.equal(binaryProjection(g, 'mixed', {
    values: {
      len: 1
    }
  }).size.value, 17);
  rejects(d => d.binaryLayouts[0].fields[0].size = {
    op: 'div',
    args: [1, 3]
  }, 'BINARY_LENGTH');
  rejects(d => d.binaryLayouts[0].fields[0].size = {
    op: 'div',
    args: [{
      field: 'length'
    }, 0]
  }, 'BINARY_LENGTH');
  const summary = binaryProjection(load(), 'binary:packet');
  assert.equal(summary.symbols.crc.offset.expression, 'end(pad)');
  assert.equal(summary.symbols.payload.size.expression, 'len × 8');
});
test('海量实例查询不先展开，空子块不触发长循环', () => {
  const d = data();
  d.registerBlocks[1].entries[0].count = 1000000000;
  d.registerBlocks[1].size = '0x100000000000';
  d.addressSpaces[0].addressWidth = 128;
  const g = load(d),
    p = registerMapProjection(g, 'space:csr', 5);
  assert.equal(p.rows.length, 5);
  assert.equal(p.total, '2000000000');
  assert.ok(p.truncated);
  const last = queryElement(g, 'space:csr', '["device","ports",999999999,"status"]') as any;
  assert.equal(last.definition, 'reg:port-status');
  assert.equal(last.address, '0x1000003B9ACA0004');
  const empty = data();
  empty.registerBlocks[0].entries = [];
  empty.registerBlocks[1].entries[0].count = 1000000000;
  empty.registerBlocks[1].size = '0x100000000000';
  assert.equal(registerMapProjection(load(empty), 'space:csr').rows.length, 0);
});
test('所有图元及声明式处理都落实到后端，样本数与统计结果可核对', async () => {
  for (const mark of ['point', 'bar', 'area', 'rule', 'errorbar', 'boxplot'] as const) {
    const d = data();
    d.views = d.views.filter(v => v.kind !== 'plot');
    d.views.push({
      id: 'plot:test',
      kind: 'plot',
      data: 'table:measurements',
      mark,
      encoding: {
        x: {
          field: 'load',
          type: 'ordinal'
        },
        y: {
          field: 'latency'
        },
        color: {
          field: 'mode'
        }
      }
    });
    const g = load(d);
    assert.match(await engineeringSVG(g, 'plot:test'), /<svg/);
    const p = plotProjection(g, g.index.get('plot:test')!.entity as PlotView);
    assert.equal(p.projection.statistics[0].fields.latency.validCount, 4);
    assert.equal(p.projection.statistics[0].fields.latency.mean, 9.95);
  }
  const d = data();
  d.views.push({
    id: 'plot:bins',
    kind: 'plot',
    data: 'table:measurements',
    transform: [{
      bin: {
        step: 5
      },
      field: 'latency',
      as: ['binStart', 'binEnd']
    }, {
      aggregate: [{
        op: 'count',
        as: 'n'
      }],
      groupby: ['binStart', 'binEnd']
    }],
    mark: 'bar',
    encoding: {
      x: {
        field: 'binStart'
      },
      x2: {
        field: 'binEnd'
      },
      y: {
        field: 'n'
      }
    }
  });
  assert.match(await engineeringSVG(load(d), 'plot:bins'), /<svg/);
  rejects(d => {
    d.views.find(v => v.id === 'plot:simple').encoding.x = {
      field: 'mode',
      type: 'temporal'
    };
  }, 'PLOT_TIMEZONE');
  rejects(d => d.views.find(v => v.id === 'plot:simple').transform = [{
    filter: {
      field: 'latency',
      range: [20, 10]
    }
  }], 'PLOT_RANGE');
});
test('嵌套模型的取值命名空间和对齐互不污染', () => {
  const d = data();
  d.binaryLayouts.push({
    id: 'child',
    kind: 'binary-layout',
    fields: [{
      id: 'len',
      size: 8
    }, {
      id: 'alignment',
      kind: 'align',
      to: 16
    }, {
      id: 'bytes',
      size: {
        field: 'len',
        unit: 'byte'
      }
    }]
  }, {
    id: 'parent',
    kind: 'binary-layout',
    fields: [{
      id: 'len',
      size: 8
    }, {
      id: 'child-ref',
      kind: 'ref',
      model: 'child'
    }]
  });
  d.views.push({
    id: 'scoped',
    kind: 'binary-layout',
    model: 'parent',
    values: {
      len: 3,
      '["child-ref","len"]': 2
    }
  });
  const g = load(d),
    p = binaryProjection(g, 'parent', g.index.get('scoped')!.entity as any);
  assert.equal(p.size.value, 40);
  assert.equal(p.rows.find(r => r.id === 'bytes')!.size.value, 16);
  assert.equal(p.rows.find(r => r.id === 'alignment')!.size.value, 8);
  rejects(d => d.binaryLayouts[2].fields[2].count = {
    field: 'count',
    unit: 'byte'
  }, 'BINARY_COUNT_UNIT');
});
test('统计支持时区与对象字段投影，缺测和包含美元符号的文本不破坏SVG', async () => {
  const d = data();
  d.tables.push({
    id: 'time-samples',
    kind: 'table',
    label: '时区采样',
    columns: [{
      field: 'time',
      label: '时间',
      type: 'string'
    }, {
      field: 'nested.value',
      label: '测量',
      type: 'number',
      unit: 'us'
    }],
    rows: [{
      id: 't1',
      values: {
        time: '2026-11-11T08:00:00Z',
        nested: {
          value: 1
        }
      }
    }, {
      id: 't2',
      values: {
        time: '2026-11-11T16:01:00+08:00',
        nested: {
          value: 2
        }
      }
    }]
  });
  d.views.push({
    id: 'temporal',
    kind: 'plot',
    label: '文字 $& 与 $1 <原文>',
    data: 'time-samples',
    mark: 'line',
    encoding: {
      x: {
        field: 'time',
        type: 'temporal'
      },
      y: {
        field: 'nested.value'
      }
    }
  });
  const g = load(d),
    xml = await engineeringSVG(g, 'temporal');
  assert.match(xml, /文字 \$&amp; 与 \$1 &lt;原文&gt;/);
  assert.equal((xml.match(/<svg\b/g) ?? []).length, 1);
  assert.ok(xml.includes('测量 (us)'));
  assert.ok(!xml.includes('NaN'));
  const missing = data();
  for (const row of missing.tables[0].rows) delete row.values.latency;
  assert.match(await engineeringSVG(load(missing), 'plot:simple'), /没有可用的测量值/);
});

// 将 SVG 的实际绘图定义交给同一后端执行，再读取 mark 数据，与独立数值判据比较。
async function plotted(svg: string) {
  const {
      DOMParser
    } = await import('@xmldom/xmldom'),
    {
      compile
    } = await import('vega-lite'),
    {
      parse,
      View
    } = await import('vega');
  const xml = new DOMParser().parseFromString(svg, 'image/svg+xml'),
    metadata = JSON.parse(xml.getElementsByTagName('metadata')[0].textContent!),
    view = new View(parse(compile(metadata.definition).spec), {
      renderer: 'none'
    });
  try {
    await view.runAsync();
    const rows: any[] = [], marks: any[] = [];
    const walk = (item: any) => {
      if (item.datum?.__edoc_rowIds) {
        rows.push(item.datum);
        marks.push({datum: item.datum, type: item.mark?.marktype, width: item.width, height: item.height});
      }
      for (const child of item.items ?? []) walk(child);
    };
    walk((view.scenegraph() as any).root);
    return {
      metadata,
      rows,
      marks
    };
  } finally {
    view.finalize();
  }
}
function plotData(values: Record<string, unknown>[], spec: Record<string, unknown>) {
  return {
    tables: [{
      id: 'samples',
      kind: 'table',
      label: '采样',
      columns: [{
        field: 'value',
        label: '数值',
        type: 'number',
        unit: 'us'
      }, {
        field: 'group',
        label: '组别',
        type: 'string'
      }],
      rows: values.map((values, i) => ({
        id: 'sample:' + i,
        values
      }))
    }],
    views: [{
      id: 'chart',
      kind: 'plot',
      data: 'samples',
      ...spec
    }]
  };
}
test('显式分箱只执行一次，端点、负数与缺测的查询及实际图元完全一致', async () => {
  const d = plotData([-10, -.1, 0, 10, null].map(value => value === null ? {} : {
      value
    }), {
      transform: [{
        bin: {
          step: 5
        },
        field: 'value',
        as: ['lo', 'hi']
      }],
      mark: 'point',
      encoding: {
        x: {
          field: 'lo'
        },
        y: {
          field: 'hi'
        }
      }
    }),
    g = load(d),
    p = (query(g, 'chart') as any).plot.projection;
  assert.deepEqual(p.rows.map((r: any) => [r.values.lo, r.values.hi]), [[-10, -5], [-5, 0], [0, 5], [10, 15], [null, null]]);
  const {
    metadata,
    rows
  } = await plotted(await engineeringSVG(g, 'chart'));
  assert.deepEqual(metadata.definition.data.values.map((r: any) => [r.lo, r.hi]), p.rows.map((r: any) => [r.values.lo, r.values.hi]));
  assert.deepEqual(rows.map(r => [r.lo, r.hi, r.__edoc_rowIds]), [[-10, -5, ['sample:0']], [-5, 0, ['sample:1']], [0, 5, ['sample:2']], [10, 15, ['sample:3']]]);
  assert.deepEqual(metadata.definition.transform, [{
    filter: {
      field: '__edoc_leaf',
      equal: ''
    }
  }]);
});
test('父转换先执行，分面内图层分别过滤、聚合和求分位数，来源保持所属面', async () => {
  const d = plotData([{
      group: 'A',
      value: 0
    }, {
      group: 'A',
      value: 10
    }, {
      group: 'B',
      value: 20
    }, {
      group: 'B',
      value: 30
    }], {
      transform: [{
        bin: {
          step: 5
        },
        field: 'value',
        as: ['lo', 'hi']
      }],
      facet: {
        field: 'group'
      },
      spec: {
        layer: [{
          transform: [{
            filter: {
              field: 'value',
              range: [10, 30]
            }
          }, {
            aggregate: [{
              op: 'mean',
              field: 'value',
              as: 'result'
            }]
          }],
          mark: 'point',
          encoding: {
            y: {
              field: 'result'
            }
          }
        }, {
          transform: [{
            quantile: 'value',
            probs: [.25, .5],
            as: ['p', 'result'],
            method: 'linear'
          }],
          mark: 'point',
          encoding: {
            x: {
              field: 'p'
            },
            y: {
              field: 'result'
            }
          }
        }]
      }
    }),
    g = load(d),
    p = (query(g, 'chart') as any).plot.projection,
    key = p.facetField;
  assert.equal(p.audit.length, 1);
  assert.equal(p.spec.layer[0].rows.length, 2);
  assert.deepEqual(p.spec.layer[0].rows.map((r: any) => [r.facets[key], r.values.result, r.rowIds]), [['A', 10, ['sample:1']], ['B', 25, ['sample:2', 'sample:3']]]);
  assert.deepEqual(p.spec.layer[1].rows.map((r: any) => [r.facets[key], r.values.result]), [['A', 2.5], ['A', 5], ['B', 22.5], ['B', 25]]);
  const {
    rows
  } = await plotted(await engineeringSVG(g, 'chart'));
  assert.deepEqual(rows.filter(r => r.__edoc_leaf.endsWith('/layer/0')).map(r => [r[key], r.result]), [['A', 10], ['B', 25]]);
  assert.deepEqual(rows.filter(r => r.__edoc_leaf.endsWith('/layer/1')).map(r => [r[key], r.result]), [['A', 2.5], ['A', 5], ['B', 22.5], ['B', 25]]);
});
test('分面空样本聚合保留显式作用域，兄弟图层过滤互不影响', async () => {
  const d = plotData([{
      group: 'A',
      value: 1
    }, {
      group: 'B',
      value: 2
    }], {
      facet: {
        field: 'group'
      },
      spec: {
        layer: [{
          transform: [{
            filter: {
              field: 'value',
              equal: 2
            }
          }, {
            aggregate: [{
              op: 'count',
              as: 'n'
            }]
          }],
          mark: 'point',
          encoding: {
            x: {
              field: 'n'
            }
          }
        }, {
          transform: [{
            filter: {
              field: 'value',
              equal: 1
            }
          }],
          mark: 'point',
          encoding: {
            y: {
              field: 'value'
            }
          }
        }]
      }
    }),
    g = load(d),
    p = (query(g, 'chart') as any).plot.projection,
    key = p.facetField;
  assert.deepEqual(p.spec.layer[0].rows.map((r: any) => [r.facets[key], r.values.n, r.rowIds]), [['A', 0, []], ['B', 1, ['sample:1']]]);
  const {
    rows
  } = await plotted(await engineeringSVG(g, 'chart'));
  assert.deepEqual(rows.filter(r => r.__edoc_leaf.endsWith('/layer/0')).map(r => [r[key], r.n]), [['A', 0], ['B', 1]]);
  assert.deepEqual(rows.filter(r => r.__edoc_leaf.endsWith('/layer/1')).map(r => [r[key], r.value]), [['A', 1]]);
});
test('地址校验使用每个实际上下文，独立块仍按8bit且拒绝在该单位下重叠', async () => {
  const d = {
      registers: [{
        id: 'reg32',
        kind: 'register',
        label: '寄存器',
        width: 32,
        fields: []
      }],
      registerBlocks: [{
        id: 'inner',
        kind: 'register-block',
        entries: [{
          id: 'a',
          register: 'reg32',
          offset: '0'
        }, {
          id: 'b',
          register: 'reg32',
          offset: '1'
        }]
      }, {
        id: 'outer',
        kind: 'register-block',
        entries: [{
          id: 'nested',
          block: 'inner',
          offset: '0'
        }]
      }],
      addressSpaces: [{
        id: 'word-space',
        kind: 'address-space',
        addressUnitBits: 32,
        mappings: [{
          id: 'mapped',
          block: 'outer',
          base: '4096'
        }]
      }]
    },
    g = load(d);
  assert.deepEqual(registerMapProjection(g, 'word-space').rows.map(r => [r.address, r.span]), [['0x1000', '0x1'], ['0x1001', '0x1']]);
  assert.equal((queryElement(g, 'word-space', '["mapped","nested","b"]') as any).address, '0x1001');
  await engineeringSVG(g, 'word-space');
  assert.throws(() => query(g, 'inner'), (e: any) => e.code === 'ADDRESS_OVERLAP');
  await assert.rejects(() => engineeringSVG(g, 'outer'), (e: any) => e.code === 'ADDRESS_OVERLAP');
  for (const unit of [8, 1]) {
    const bad = structuredClone(d);
    bad.addressSpaces.push({
      ...bad.addressSpaces[0],
      id: 'other-space',
      addressUnitBits: unit
    });
    assert.throws(() => load(bad), (e: any) => e.diagnostics?.some((d: any) => d.code === 'ADDRESS_OVERLAP'));
  }
  const unmapped = structuredClone(d);
  unmapped.addressSpaces = [];
  assert.throws(() => load(unmapped), (e: any) => e.diagnostics?.some((d: any) => d.code === 'ADDRESS_OVERLAP'));
  const bit = structuredClone(d);
  bit.registerBlocks[0].entries[1].offset = '4';
  bit.addressSpaces[0].addressUnitBits = 1;
  assert.throws(() => load(bit), (e: any) => e.diagnostics?.some((d: any) => d.code === 'ADDRESS_OVERLAP'));
});
test('仅引用字寻址空间的独立工程可以构建，不预先按8bit投影无关块', async t => {
  const {
      mkdtempSync,
      mkdirSync,
      writeFileSync,
      rmSync
    } = await import('node:fs'),
    {
      tmpdir
    } = await import('node:os'),
    {
      join,
      resolve
    } = await import('node:path'),
    {
      spawnSync
    } = await import('node:child_process');
  const root = mkdtempSync(join(tmpdir(), 'edoc-word-map-'));
  t.after(() => rmSync(root, {
    recursive: true,
    force: true
  }));
  mkdirSync(join(root, 'docs'));
  const facts = {
    registers: [{
      id: 'reg',
      kind: 'register',
      label: '寄存器',
      width: 32,
      fields: []
    }],
    registerBlocks: [{
      id: 'block',
      kind: 'register-block',
      entries: [{
        id: 'first',
        register: 'reg',
        offset: '0'
      }, {
        id: 'second',
        register: 'reg',
        offset: '1'
      }]
    }],
    addressSpaces: [{
      id: 'space',
      kind: 'address-space',
      addressUnitBits: 32,
      mappings: [{
        id: 'instance',
        block: 'block',
        base: '0'
      }]
    }]
  };
  writeFileSync(join(root, 'docs/edoc.config.js'), 'export default ' + JSON.stringify({
    data: facts
  }) + ';');
  writeFileSync(join(root, 'docs/index.mdoc'), '{% register-map id="space" /%}');
  const result = spawnSync(process.execPath, [resolve('packages/cli/edoc.ts'), 'build'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30000
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(root, 'output/index.html'), 'utf8'), /地址单位 32 bit/);
});
test('optional文字条件接受同名场景键，嵌套实例隔离，未知键明确诊断', () => {
  const child = {
      id: 'child',
      kind: 'binary-layout',
      fields: [{
        id: 'flag',
        size: 1
      }, {
        id: 'optional',
        kind: 'optional',
        condition: 'has_extension',
        fields: [{
          id: 'data',
          size: 7
        }]
      }]
    },
    parent = {
      id: 'parent',
      kind: 'binary-layout',
      fields: [{
        id: 'header',
        kind: 'optional',
        condition: '规范要求扩展',
        fields: [{
          id: 'prefix',
          size: 8
        }]
      }, {
        id: 'left',
        kind: 'ref',
        model: 'child'
      }, {
        id: 'right',
        kind: 'ref',
        model: 'child'
      }]
    };
  const d = {
      binaryLayouts: [child, parent],
      views: [{
        id: 'sample',
        kind: 'binary-layout',
        model: 'parent',
        values: {
          '规范要求扩展': true,
          '["left","has_extension"]': true,
          '["right","has_extension"]': false
        }
      }]
    },
    g = load(d),
    view = g.index.get('sample')!.entity as any,
    p = binaryProjection(g, 'parent', view);
  assert.equal(p.size.value, 17);
  assert.equal(binaryProjection(g, 'parent').size.value, undefined);
  assert.equal(p.rows.find(r => JSON.stringify(r.path) === '["left","optional"]')!.size.value, 7);
  assert.equal(p.rows.find(r => JSON.stringify(r.path) === '["right","optional"]')!.size.value, 0);
  const wrong = structuredClone(d);
  (wrong.views[0].values as any).has_extension = true;
  assert.throws(() => load(wrong), (e: any) => e.diagnostics?.some((d: any) => d.code === 'BINARY_VIEW'));
  const unknown = structuredClone(d);
  (unknown.views[0].values as any)['["left","unknown"]'] = true;
  assert.throws(() => load(unknown), (e: any) => e.diagnostics?.some((d: any) => d.code === 'BINARY_VIEW'));
  const field = structuredClone(d);
  field.binaryLayouts[0].fields[1].condition = 'flag';
  field.views[0].values = {
    '规范要求扩展': true,
    '["left","flag"]': 1,
    '["right","flag"]': false
  } as any;
  assert.equal(binaryProjection(load(field), 'parent', field.views[0] as any).size.value, undefined);
});

test('显式分箱的起止配对穿过聚合后仍生成有面积的直方柱，不误判普通范围', async () => {
  for (const axis of ['x', 'y']) {
    const other = axis === 'x' ? 'y' : 'x';
    const d = plotData([0, 5, 10].map(value => ({value})), {
      transform: [
        {bin: {step: 5}, field: 'value', as: ['lo', 'hi']},
        {aggregate: [{op: 'count', as: 'n'}], groupby: ['lo', 'hi']}
      ],
      mark: 'bar',
      encoding: {[axis]: {field: 'lo'}, [axis + '2']: {field: 'hi'}, [other]: {field: 'n'}}
    });
    const {metadata, marks} = await plotted(await engineeringSVG(load(d), 'chart'));
    const rectangles = marks.filter(mark => mark.type === 'rect');
    assert.equal(metadata.definition.encoding[axis].bin, 'binned');
    assert.deepEqual(rectangles.map(mark => [mark.datum.lo, mark.datum.hi, mark.datum.n]),
      [[0, 5, 1], [5, 10, 1], [10, 15, 1]]);
    assert.ok(rectangles.every(mark => mark.width > 1 && mark.height > 1), '每根直方柱必须有非零宽高');
  }
  const raw = plotData([{value: 0}], {
    mark: 'bar', encoding: {x: {field: 'value'}, x2: {field: 'value'}}
  });
  const {metadata} = await plotted(await engineeringSVG(load(raw), 'chart'));
  assert.equal(metadata.definition.encoding.x.bin, undefined);
});
