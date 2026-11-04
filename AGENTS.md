# edoc 的 Agent 入口

先读 README.md，然后读取[完整维护规则](docs/development/agent-rules.mdoc)，并按其中要求阅读需求基线和推荐指南。完整规则只在该文档维护，本文件保留 Agent 约定的入口名称。

在仓库根可执行 `node packages/cli/edoc.ts read --id dev:agent-rules --scope subtree --format text`；事实使用 query，使用教程与开发文档按任务分别进入，不读取生成 HTML 作为源码。

安装后的工具手册从任意工程使用 `edoc docs read --id dev:agent-rules --scope subtree --format text`；不需要克隆仓库或加载用户项目配置。
