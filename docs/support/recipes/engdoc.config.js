// 保存为你的工程 docs/engdoc.config.js；数据来自 docs/ir/authoring/objects.json。
export default {
  documents: 'docs',
  views: [{
    id: 'system:overview', kind: 'architecture', label: '生产与消费',
    include: {objects: ['system:producer', 'system:consumer'], relations: ['system:data']},
    layout: {direction: 'LR'}
  }]
};
