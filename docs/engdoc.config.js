import {tutorialData} from './support/data.mjs';

// 工具自己的正式手册；展示设置直接写配置，项目样例提取交给 data。
export default {
  projectId: 'engdoc-manual',
  title: 'EngDoc 使用与开发文档',
  documents: [
    'docs/index.mdoc', 'docs/usage',
    'docs/development/index.mdoc',
    'docs/development/architecture.mdoc', 'docs/development/contributing.mdoc',
    'docs/development/api.mdoc', 'docs/development/environment.mdoc', 'docs/development/agent-rules.mdoc',
    'docs/development/history.mdoc', 'docs/development/design', 'docs/development/reviews',
    'docs/development/acceptance', 'docs/development/regression', 'docs/development/history'
  ],
  data: tutorialData,
  children: {component: 'docs/component/docs/engdoc.config.js', documentFirst: 'examples/document-first/docs/engdoc.config.js'},
  attachments: {
    location: {
      type: 'pdf', file: 'docs/assets/location.pdf', title: 'PDF 定位示例（虚构）',
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
    source: {file: 'docs/engdoc.config.js', selector: 'tool:pipeline'}
  }],
  output: {html: 'output/index.html'}
};
