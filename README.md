# EngDoc

通用工程文档系统。当前完成 **P0 协议最小闭环**：JSON IR → 校验 → 稳定 ID 索引 → 结构化查询。实现使用 TypeScript，运行需要 Node.js 24+，无需安装依赖或启动服务器。

V1 保持三层架构：通用工具、项目原始数据、项目 Adapter。当前演示 IR 为手工协议样例；不要求实际项目重复定义原始工程事实。

## 立即运行

在本仓库根目录执行：

```bash
node packages/cli/engdoc.ts validate \
  --config examples/board-flash/engdoc.config.json --format json

node packages/cli/engdoc.ts query \
  --config examples/board-flash/engdoc.config.json \
  --id board:net.FLASH_SCK --depth 1 --format json
```

也可以使用 `npm run engdoc -- ...`，或在 Linux/macOS 下直接执行 `./packages/cli/engdoc.ts ...`。`--help` 列出选项，`--version` 显示工具和 IR 版本。

预期校验通过：3 个 node、13 个 port、1 个 group、6 条 connection、1 个 view。查询时钟 Net 得到 **同一条关系中的三个端点**，包括测试连接器；`--depth 1` 进一步显示端点的 Ball/Pin 和来源。

**FPGA–Flash 所有数据均为虚构，不代表真实芯片或板卡，不得用于硬件设计。** 真实数据 Adapter 在 P3 实现。

## 阅读与修改入口

| 内容 | 入口 |
| --- | --- |
| P0 IR 契约、查询结构和边界 | [docs/IR-P0.md](docs/IR-P0.md) |
| 阶段验收与未完成项 | [docs/P0-验收.md](docs/P0-验收.md) |
| 环境与移植限制 | [env-notes.md](env-notes.md) |
| 机器 Schema | [packages/schema](packages/schema) |
| 加载、校验、查询公共 API | [packages/core/index.ts](packages/core/index.ts) |
| 命令行 | [packages/cli/engdoc.ts](packages/cli/engdoc.ts) |
| 虚构硬件数据及视图 | [examples/board-flash](examples/board-flash) |

修改工程事实应改原始数据并由 Adapter 重建 IR；P0 手工样例临时以 `objects.json` 为端口事实来源，以 `relations.json` 为连接来源。视图只保存引用和呈现策略。精确检索使用 query，不读取未来生成的 HTML、SVG 或前端打包文件。

当前只接受 IR 1.0 与 objects/relations/views 资源；未知类型或版本明确报错。后续阶段补齐资源与兼容性策略。通用代码不包含 QSPI/FPGA 协议或引脚知识。

## 针对性测试

分别运行，不提供默认全量测试命令：

```bash
npm run test:schema
npm run test:core
npm run test:query
npm run test:cli
```

测试使用 Node 自带的 test runner。CLI 子进程有 10 秒超时。源文件只读，不缓存校验或查询结果，不使用文件内容 hash。

## 恢复与下一阶段

工程与方案分别由 Git 管理。外部 checkpoint 包含工程 bundle、方案 bundle 和当前 task；解压后按 task 中命令恢复。`scripts/checkpoint.py` 可在两个仓库都干净时重新创建检查点，并将两个提交号写入 task。Git 自身的对象 ID 仅用于提交与恢复，不用于文件增量或状态检测。

P1 将使用 FPGA–Flash 方向实现端口图、分类连线、Ball/Pin/功能标签、总览与逐信号模式及 SVG，验证布局和连线可读性。P2 实现 Markdown/Markdoc 与单文件离线 HTML；P3 增加 PDF 和真实 Adapter；P4 做离线、打印与兼容性回归。P0 尚无绘图、HTML/PDF 或真实硬件一致性验收结果。
