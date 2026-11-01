# EngDoc V1

通用工程文档系统：**项目源数据 → 项目 Adapter → JSON IR → 校验/查询 → Markdoc → 单文件离线 HTML 或 PDF**。

图、表、接口详情与查询共用工程事实。通用层不理解 FPGA/QSPI/AXIS，不要求项目迁移到统一数据库。生成文档只读，Agent 精确读取使用 query。

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
| 完整 V1 契约与新项目接入 | [docs/V1-开发与使用.md](docs/V1-开发与使用.md) |
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
npm run test:document
npm run test:adapter
npm run test:cli
npm run test:browser
npm run test:pdf
npm run test:quality
```

浏览器/PDF 测试使用 ENGDOC_CHROMIUM。没有默认全量测试命令。

## 恢复与数据纪律

工程与方案分别 Git 管理；checkpoint 打包两个完整 bundle 和最新 EngDoc-task.md。恢复先核对提交号，再 npm ci。scripts/checkpoint.py 在两个仓库干净时生成同一检查点的三项文件。

改变工程事实时修改项目源，调整 Adapter 并运行一致性检查；改变显示时只改视图引用和布局；改变规范行为时直接修改有稳定 ID 的正文条款。禁止静默改变规范语义。dist、生成 HTML/SVG 不作为 Agent 检索入口。

当前构建每次完整转换，不默认使用文件内容 hash 进行状态跟踪或缓存。
