# EngDoc V1

通用工程文档系统：**项目源数据 → 项目 Adapter → JSON IR → 校验/查询 → Markdoc → 单文件离线 HTML 或 PDF**。

图、表、接口详情与查询共用工程事实。通用层不理解 FPGA/QSPI/AXIS，不要求项目迁移到统一数据库。生成文档只读，Agent 精确读取使用 query。

需求入口见[需求与设计基线](docs/需求与设计基线.md)，原始 V1 方案快照及来源见 [docs/design/](docs/design/README.md)。真实工程曾暴露路径与标签缺陷，修复及实际检查范围见[图形渲染修复验收](docs/图形渲染修复验收.md)；历史测试通过不能替代图形质量验收。

用户再次检查 MAC 架构图和多端点接线图后，[二次审查](docs/图形约束二次审查.md)检出了独立关系共线、层级框边标签及实际分叉标记缺陷。本批增加默认路由规则和按需声明的布局约束，使用契约、验证范围及限制见[布局约束使用与验收](docs/布局约束使用与验收.md)；功能回归通过仍不能解释为任意图形布线质量达标。

Agent 接入或组织文档前先读 [推荐指南](docs/推荐指南.md)：文档分层、渐进描述、理解性正文与查询性参考分别组织。运行 `node packages/cli/engdoc.ts guide` 可读取同一份指南，`outline --config ...` 可直接检查章节树。工具入口规则见 [AGENTS.md](AGENTS.md)，起步示例见 [正文模板](templates/project-doc.mdoc)。

## 图形能力 Demo

运行 `npm run demo`，打开 http://127.0.0.1:5174/ 。集中体验 16 张交互图：层级架构、接口与连线联动展开、逐端口接口、Ball/Pin 与多端点 Net、状态、四方向布局、固定障碍绕行，以及 WaveJSON 波形。“按需声明布局意图”展示同一数据的相对位置、对齐、主干与反馈通道，无需填写逐节点坐标。

支持大图、1:1 阅读、筛选、高亮、分组和 SVG 导出；端口属性可按需显示，连线标题在线上且可隐藏。同时生成可离线打开的 HTML 与 PDF。只生成文件运行 `npm run demo:build`。需要已安装 Chromium，操作及数据来源见 [Demo 说明](examples/gallery/README.md)。

## 安装与立即运行

需要 Node.js 24+、Python 3（示例 Adapter）；PDF 另需 Chromium。

```bash
npm ci
node packages/cli/engdoc.ts validate --config examples/board-flash/engdoc.config.json --format json
node packages/cli/engdoc.ts query --config examples/board-flash/engdoc.config.json --id board:net.FLASH_SCK --depth 1 --format json
node packages/cli/engdoc.ts export --config examples/board-flash/engdoc.config.json --view board:flash-wiring --format svg --output output/flash.svg
node packages/cli/engdoc.ts build --config examples/board-flash/engdoc.config.json --format html --output output/board.html
node packages/cli/engdoc.ts build --config examples/fpga-mac/engdoc.config.json --format html --output output/mac.html
```

HTML 内嵌 CSS、JavaScript、SVG、工程数据和中文字体，直接双击打开，无服务器或外部运行资源。文件较大是内嵌字体及交互资源的结果。

PDF 使用相同配置、正文和 IR：

```bash
export ENGDOC_CHROMIUM=/path/to/chrome-headless-shell
node packages/cli/engdoc.ts build --config examples/fpga-mac/engdoc.config.json --format pdf --output output/mac.pdf
```

PDF 使用完整静态图形，展开 Tabs 和折叠内容，包含目录、书签、文内链接和页码。

## 能力与入口

| 内容 | 入口 |
| --- | --- |
| 原始需求与设计目标、当前图形质量要求 | [docs/需求与设计基线.md](docs/需求与设计基线.md) |
| 原方案快照与来源 | [docs/design/README.md](docs/design/README.md) |
| 实际图形缺陷与后续验收重点 | [docs/图形渲染审查.md](docs/图形渲染审查.md) |
| 路径、标签与大图阅读的修复及实测 | [docs/图形渲染修复验收.md](docs/图形渲染修复验收.md) |
| 波形描边、填色与多实例修复 | [docs/时序图渲染修复.md](docs/时序图渲染修复.md) |
| 端口属性、线上标题与文字显隐 | [docs/图形文字显示.md](docs/图形文字显示.md) |
| 模块多接口、单端/双端展开及完整导出 | [docs/接口分组实现与验收.md](docs/接口分组实现与验收.md) |
| 接口分组的已批准设计依据 | [docs/接口分组与连线展开设计.md](docs/接口分组与连线展开设计.md) |
| 默认可用、按需声明展示属性与约束的统一原则与后续范围 | [docs/声明式展示与约束设计.md](docs/声明式展示与约束设计.md) |
| 第一批图形布局约束、默认路由修复及实际验收 | [docs/布局约束使用与验收.md](docs/布局约束使用与验收.md) |
| 完整 V1 契约与新项目接入 | [docs/V1-开发与使用.md](docs/V1-开发与使用.md) |
| 分层、渐进阅读的改进与验证 | [docs/文档组织改进验收.md](docs/文档组织改进验收.md) |
| V1 验收矩阵 | [docs/V1-验收.md](docs/V1-验收.md) |
| 初始 P0 验收历史 | [docs/P0-验收.md](docs/P0-验收.md) |
| 环境、浏览器与移植限制 | [env-notes.md](env-notes.md) |
| IR Schema / 核心 API | packages/schema / packages/core/index.ts |
| 图形与布局 | packages/render-graph |
| Markdoc / HTML / PDF | packages/doc-theme / packages/pack-html / packages/render-pdf |
| 板级 CSV 网表 Adapter | examples/board-flash |
| RTL 接口与规范文档 Adapter | examples/fpga-mac |

**两个样例均为虚构工程。Ball/Pin 不代表真实芯片；MAC RTL 不是可用 MAC 实现，VERIFY 是覆盖关系样例，不代表 RTL 仿真已完成。**

## 针对性验证

按需要分别运行：

```bash
npm run typecheck
npm run test:schema
npm run test:core
npm run test:query
npm run test:graph
npm run test:layout
npm run test:interface
npm run test:wave
npm run test:document
npm run test:outline
npm run test:adapter
npm run test:cli
npm run test:browser
npm run test:pdf
npm run test:quality
```

浏览器、PDF 和波形像素回归使用 ENGDOC_CHROMIUM。没有默认全量测试命令。

## 恢复与数据纪律

工程与方案分别 Git 管理；checkpoint 打包两个完整 bundle 和最新 EngDoc-task.md。恢复先核对提交号，再 npm ci。scripts/checkpoint.py 在两个仓库干净时生成同一检查点的三项文件。

改变工程事实时修改项目源，调整 Adapter 并运行一致性检查；改变显示时只改视图引用和布局；改变规范行为时直接修改有稳定 ID 的正文条款。禁止静默改变规范语义。dist、生成 HTML/SVG 不作为 Agent 检索入口。

当前构建每次完整转换，不默认使用文件内容 hash 进行状态跟踪或缓存。
