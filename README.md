# edoc

以 Markdown/Markdoc 为正文基础，保留 Markdoc 原生能力，扩展页面编排、数据图表和原文引用，生成可导航、可查询的离线工程文档。作者和 Agent 维护源数据与说明，工具负责渲染，不手工维护生成的 HTML/SVG。

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

本仓库图示复用原样例转换器，需要已有 Python 3，优先通过 uv 调用。文档只导出 HTML，保留原始 PDF 附件的内嵌阅读和定位、单图 SVG 导出；构建文档无需浏览器。

## 使用与维护入口

- [认识 edoc](docs/usage/overview.mdoc)：Markdown 基础、扩展渲染及各类输入的整体关系。
- [使用文档](docs/usage/index.mdoc)：上手、正文组织、功能教程和查询参考。
- [开发文档](docs/development/index.mdoc)：实现、构建与验证、设计依据。
- [Agent 维护入口](AGENTS.md)和[文档组织简略指南](docs/usage/engineering/agent-guide.mdoc)：维护规则、理解路线与按需查询。

修改工具后按[开发与验证](docs/development/contributing.mdoc)选择相关检查，先确认类型与行为，再检查网页、SVG 和 PDF 附件的实际阅读效果。
