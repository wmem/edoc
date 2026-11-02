export default {
  projectId: 'document-first-demo',
  title: '文档先行 · 虚构连接演示',
  documents: 'docs/index.mdoc',
  output: { html: 'output/manual.html', pdf: 'output/manual.pdf' },
  views: [{
    id: 'demo:overview', kind: 'wiring', label: '处理模块与存储模块（虚构）',
    include: { objects: ['demo:engine', 'demo:memory'], relations: ['demo:data', 'demo:valid'] },
    layout: { direction: 'LR' }
  }, {
    // 未被正文引用的视图不会布局；显式导出时才会发现其固定位置与对齐约束冲突。
    id: 'demo:unused', kind: 'architecture', label: '未发布的布局草稿',
    include: { objects: ['demo:engine', 'demo:memory'], relations: ['demo:data'] },
    layout: { positions: [{ objectId: 'demo:engine', x: 0, y: 0 }, { objectId: 'demo:memory', x: 900, y: 0 }], constraints: [{ type: 'align', axis: 'x', nodes: ['demo:engine', 'demo:memory'] }] }
  }],
  tables: [{
    id: 'demo:port-table', kind: 'table', label: '真实字段投影',
    columns: [{ field: 'label', label: '信号', type: 'string' }, { field: 'direction', label: '方向', type: 'string' }, { field: 'width', label: '位宽', type: 'number', unit: 'bit' }],
    rows: [{ id: 'demo:row-engine', objectId: 'demo:engine.data' }, { id: 'demo:row-memory', objectId: 'demo:memory.data' }]
  }]
};
