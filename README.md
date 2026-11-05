# edoc

以 Markdown/Markdoc 为正文基础，保留 Markdoc 原生能力，扩展页面编排、数据图表和原文引用，生成可导航、可查询的离线工程文档。作者和 Agent 维护源数据与说明，工具负责渲染，不手工维护生成的 HTML/SVG。

## 使用说明与 Agent 入口

文档主入口是 [docs/index.mdoc](docs/index.mdoc)，安装包也携带同一份源文。Agent 可以从安装目录直接读取它，沿相对链接进入[使用文档](docs/usage/index.mdoc)、教程与字段参考，无需读取 HTML，也无需先克隆仓库或配置当前项目。

`edoc --help` 和 `edoc docs` 会显示实际安装目录中的 .mdoc 入口；`edoc docs --format json` 返回 root、readme、entry、usage 和 sources 路径。全局包通常位于 `npm root -g` 输出目录下的 edoc 文件夹。

按章节查阅也可以：

```sh
edoc docs read --id use:home --format text
edoc docs read --id use:first-build --format text
edoc docs outline --format text
```

手册目录默认只显示浅层，继续按 sectionId 和 --depth 展开；--all 显式返回完整目录。查工具用法使用 docs，查自己的工程使用普通 read/query/outline。文档组织原则按需读[简略指南](docs/usage/engineering/agent-guide.mdoc)；工具源码维护才进入开发文档。

`edoc guide` 直接输出简略组织指南，`edoc guide --full` 获取完整方法。工具用法从上述文档入口进入。

## 全局安装

需要 Node.js 24+、npm、Git，以及 [GitHub 仓库](https://github.com/wmem/edoc.git)的 SSH 访问权限：

```sh
npm pack git+ssh://git@github.com/wmem/edoc.git
npm install -g ./edoc-1.0.0.tgz
edoc --version
```

先打包成功，再在同一目录安装生成的 tgz；文件名随版本变化，以 npm pack 输出为准。第一步完成源码构建，第二步全局安装，之后直接使用 edoc。

安装后运行 `edoc docs` 定位随包源文；人在浏览器中阅读可用 `edoc docs serve`。Agent 从 docs/index.mdoc 或 `edoc docs read --id use:home --format text` 入门，无需克隆仓库。

当前使用上述两步流程绕过 npm 11.12.1 的 Git 全局预构建问题，无需修改 npm 全局配置。原因与升级方式见[安装说明](docs/usage/start/01-install.mdoc#use:install:git-preparation)。

## 源码开发：环境与编译

以下操作用于克隆的源码仓库，安装用户直接运行 edoc。需要 Node.js 24+ 和 npm，在源码仓库根目录执行：

```sh
npm ci
npm run build:package
```

编译结果在 dist/。源码开发可用 npm run edoc -- --help 查看命令；安装到其他工程的方法见[安装说明](docs/usage/start/01-install.mdoc)。

## 生成和阅读正式文档

本仓库的正式文档首页是 docs/index.mdoc，正文、配置与文档资源集中在 docs 下。README 仅承担仓库介绍和操作入口，保持 GitHub/GitLab 可直接阅读的标准 Markdown。

```sh
npm run docs:build
```

打开 output/index.html。也可以运行静态预览：

```sh
npm run docs:dev
```

访问 http://127.0.0.1:5175/ 。修改后重新构建并刷新；当前没有公开托管的文档地址。

本仓库图示复用 Node.js 样例转换器，不需要 Python。文档只导出 HTML，保留原始 PDF 附件的内嵌阅读和定位、单图 SVG 导出；构建文档无需浏览器。

`npm run build:package` 同时生成随包手册、查询索引和 TypeScript 声明；修改文档后重新运行该命令更新安装产物。`docs:build` 生成工作区阅读页，`docs:dev` 只预览工作区页面。

## 使用与维护入口

- [认识 edoc](docs/usage/overview.mdoc)：Markdown 基础、扩展渲染及各类输入的整体关系。
- [使用文档](docs/usage/index.mdoc)：上手、正文组织、功能教程和查询参考。
- [开发文档](docs/development/index.mdoc)：实现、构建与验证、设计依据。
- [源码维护规则](AGENTS.md)和[文档组织简略指南](docs/usage/engineering/agent-guide.mdoc)：分别面向维护工具与组织工程文档。

修改工具后按[开发与验证](docs/development/contributing.mdoc)选择相关检查，先确认类型与行为，再检查网页、SVG 和 PDF 附件的实际阅读效果。

## 许可证

采用与 Markdoc 相同的 [MIT 许可证](LICENSE)。第三方依赖保留各自许可证。
