# edoc

以 Markdown/Markdoc 为正文基础，保留 Markdoc 原生能力，扩展页面编排、数据图表和原文引用，生成可导航、可查询的离线工程文档。作者和 Agent 维护源数据与说明，工具负责渲染，不手工维护生成的 HTML/SVG。

## 全局安装

需要 Node.js 24+、npm，以及该 Git 仓库的 SSH 访问权限：

```sh
npm install -g git+ssh://git@gitlab.kunyi.local/mem-tools/edoc.git
edoc --version
```

安装后运行 `edoc docs` 获取自带 HTML 手册地址，或用 `edoc docs serve` 在本机阅读。Agent 可运行 `edoc docs outline --depth 0`、`edoc docs read --id ref:config-data` 查询工具用法，无需克隆仓库。

npm 11.12.1 存在 Git 全局安装的预构建问题；遇到安装失败时，按[安装说明](docs/usage/start/01-install.mdoc#use:install:git-preparation)先打包再安装，无需修改 npm 全局配置。

## 环境与编译

需要 Node.js 24+ 和 npm。在仓库根目录执行：

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
- [Agent 维护入口](AGENTS.md)和[文档组织简略指南](docs/usage/engineering/agent-guide.mdoc)：维护规则、理解路线与按需查询。

修改工具后按[开发与验证](docs/development/contributing.mdoc)选择相关检查，先确认类型与行为，再检查网页、SVG 和 PDF 附件的实际阅读效果。
