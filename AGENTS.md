# edoc 的 Agent 入口

调用已安装的 edoc 为其他项目维护文档时，先读 [README.md](README.md) 和[源文主入口](docs/index.mdoc)，按任务进入[使用文档](docs/usage/index.mdoc)。这些 .mdoc 随安装包交付，可直接读取；也可用 edoc --help 定位，或 edoc docs read 按章节查阅，不读取生成 HTML 作为知识源。

维护 edoc 源码时，先读 README.md，然后读取[完整维护规则](docs/development/agent-rules.mdoc)，并按其中要求阅读需求基线和推荐指南。完整维护规则只在该文档维护，本文件保留 Agent 约定的入口名称。

在源码仓库根可执行 `node packages/cli/edoc.ts read --id dev:agent-rules --scope subtree --format text`；事实使用 query，使用教程与开发文档按任务分别进入，不读取生成 HTML 作为源码。

安装后的使用说明可从任意工程执行 `edoc docs read --id use:home --format text`；需要工具维护规则时再读取 dev:agent-rules，不加载用户项目配置。
