import {tutorialData} from './support/data.mjs';

// 工具自己的正式手册；展示设置直接写配置，项目样例提取交给 data。
export default {
  projectId: 'edoc-manual',
  title: 'edoc 使用与开发文档',
  documents: [
    'docs/index.mdoc', 'docs/usage/index.mdoc', 'docs/usage/overview.mdoc',
    'docs/usage/start',
    'docs/usage/writing/index.mdoc', 'docs/usage/writing/markdown.mdoc', 'docs/usage/writing/documents.mdoc',
    'docs/usage/rendering/index.mdoc',
    'docs/usage/rendering/page-layout.mdoc', 'docs/usage/rendering/tables.mdoc',
    'docs/usage/rendering/diagrams.mdoc', 'docs/usage/rendering/interfaces.mdoc',
    'docs/usage/rendering/waveforms.mdoc', 'docs/usage/rendering/references.mdoc',
    'docs/usage/rendering/graph-options.mdoc', 'docs/usage/rendering/layout.mdoc',
    'docs/usage/engineering/index.mdoc', 'docs/usage/engineering/data.mdoc',
    'docs/usage/engineering/composition.mdoc', 'docs/usage/engineering/query.mdoc',
    'docs/usage/engineering/agent-guide.mdoc', 'docs/usage/engineering/guide.mdoc',
    'docs/usage/publishing/index.mdoc', 'docs/usage/publishing/reading.mdoc', 'docs/usage/publishing/output.mdoc',
    'docs/usage/reference',
    'docs/development/index.mdoc',
    'docs/development/architecture.mdoc', 'docs/development/contributing.mdoc',
    'docs/development/api.mdoc', 'docs/development/environment.mdoc', 'docs/development/agent-rules.mdoc',
    'docs/development/history.mdoc', 'docs/development/design', 'docs/development/reviews',
    'docs/development/acceptance', 'docs/development/regression', 'docs/development/history'
  ],
  data: tutorialData,
  children: {component: 'docs/component/docs/edoc.config.js', documentFirst: 'examples/document-first/docs/edoc.config.js'},
  attachments: {
    location: {
      type: 'pdf', file: 'docs/assets/location.pdf', title: 'PDF 定位示例（虚构）',
      targets: {detail: {page: 2, rect: [0.15, 0.25, 0.75, 0.65]}, named: {destination: 'DETAIL'}}
    }
  },
  views: [{
    id: 'tool:pipeline', kind: 'architecture', label: 'edoc 的数据与阅读路径',
    include: {
      objects: ['tool:sources', 'tool:config', 'tool:core', 'tool:query', 'tool:render', 'tool:html'],
      relations: ['tool:input-data', 'tool:input-doc', 'tool:lookup', 'tool:layout', 'tool:output']
    },
    layout: {direction: 'TB', routing: 'orthogonal'},
    source: {file: 'docs/edoc.config.js', selector: 'tool:pipeline'}
  }],
  output: {html: 'output/index.html'}
};
