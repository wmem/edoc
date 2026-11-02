# EngDoc

把 Markdown 正文、工程数据和阅读组织转换为对人友好的离线文档。Agent 维护低噪声的源数据与知识，工具负责图、表、接口、目录和交互；查询时按 ID 读取正文或事实，不必读取生成的 HTML。

## 安装与第一次生成

需要 Node.js 24+。仓库版本推送到远程后，可通过 Git SSH 安装：

```sh
npm install -g git+ssh://git@gitlab.kunyi.local/mem-tools/engdoc.git
```

在你的工程准备 `README.md`，创建 `engdoc.config.js`：

```js
export default {};
```

运行 `engdoc`，打开 `output/index.html`。纯正文不需要 IR、转换脚本或 Chromium。配置直接写在 JS 文件中；需要更多能力时逐项增加：

```js
export default {
  projectId: 'my-project',
  title: '工程手册',
  documents: 'docs'
};
```

标准数据默认扫描 `docs/ir/`，支持多文件、多目录。已有网表、CSV 或 RTL 时，由项目 `data` 函数转换；图、表和查询共用事实。HTML 携带运行资源和 PDF 附件，离线按篇阅读。文档导出 PDF 另需已有 Chromium。

## 正式文档

正式文档使用 EngDoc 自身渲染，图表和示例就是使用说明的一部分。当前仓库没有公开托管地址，在源码仓库运行：

```sh
npm ci
npm run docs:build
```

打开 [正式文档 output/index.html](output/index.html)，或运行 `npm run docs:dev`，访问 http://127.0.0.1:5175/ 。这是构建后的静态预览，修改后需重建并刷新。本仓库图示复用原样例 Adapter，需要已有 Python 3，优先通过 uv 调用；不会自动安装 Python 或浏览器。

- [使用文档源入口](docs/manual/usage/index.mdoc)：第一次生成 → 文档组织 → 数据 → 图表 → 工程组合与 PDF。
- [查询参考源入口](docs/manual/usage/reference/index.mdoc)：配置、命令、标签、数据、布局和限制，按需读取。
- [开发文档源入口](docs/manual/development/index.mdoc)：架构、修改与验证、需求及历史资料索引。

教程直接展示架构、物理接线、多接口展开、状态、时序和布局对照；详细信号表和覆盖关系放在查询参考。硬件样例均为虚构，不能用于真实设计；波形和覆盖关联不代表执行了 RTL 仿真。

## 给 Agent 的查询入口

在具有配置和源文件的工程目录运行：

```sh
engdoc outline --format json
engdoc read --id ref:config-data --format text
engdoc query --id board:net.FLASH_SCK --depth 1
```

后两条 ID 属于本手册，用于其他工程时替换成该工程的稳定 ID。`read` 默认只取当前章节，明确返回来源、子章节和截断范围；`query` 取工程事实。修改源数据与知识后重建，不手改 HTML/SVG。源码开发可用 `node packages/cli/engdoc.ts` 代替已安装的 `engdoc`。

创建工程文档前可运行 `engdoc guide` 读取[推荐指南](docs/推荐指南.md)；维护本工具遵循 [AGENTS.md](AGENTS.md)。需求基线和历史验收的源码定位见[开发文档索引](docs/manual/development/history.mdoc)，当时的测试通过不能代替当前图形与阅读体验验收。
