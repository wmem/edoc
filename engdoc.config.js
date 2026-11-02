import {tutorialData} from './docs/manual/support/data.mjs';

// 工具自己的正式手册；展示设置直接写配置，项目样例提取交给 data。
export default {
  projectId: 'engdoc-manual',
  title: 'EngDoc 使用与开发文档',
  documents: ['docs/manual/index.mdoc', 'docs/manual/usage', 'docs/manual/development'],
  data: tutorialData,
  children: {component: 'docs/manual/component/engdoc.config.js'},
  attachments: {
    location: {
      type: 'pdf', file: 'docs/manual/assets/location.pdf', title: 'PDF 定位示例（虚构）',
      targets: {detail: {page: 2, rect: [0.15, 0.25, 0.75, 0.65]}, named: {destination: 'DETAIL'}}
    }
  },
  views: [{
    id: 'tool:pipeline', kind: 'architecture', label: 'EngDoc 的数据与阅读路径',
    include: {
      objects: ['tool:sources', 'tool:config', 'tool:core', 'tool:query', 'tool:render', 'tool:html'],
      relations: ['tool:input-data', 'tool:input-doc', 'tool:lookup', 'tool:layout', 'tool:output']
    },
    layout: {direction: 'TB', routing: 'orthogonal'},
    source: {file: 'engdoc.config.js', selector: 'tool:pipeline'}
  }],
  output: {html: 'output/index.html'}
};
