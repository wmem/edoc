# EngDoc V1 通用工程文档系统设计方案

**方案状态：** V1 设计基线，待原型验证  
**适用范围：** FPGA IP、板级硬件、通信协议及其他具有结构化对象与关系的工程文档  
**核心目标：** 让 Agent 写工程事实与设计说明，而不是逐页编写 HTML、SVG、CSS 或绘图库代码。  
**最终交付：** 单个自包含 HTML 文件或单个 PDF 文件，可按需要选择格式。

# 1. 目标与边界

EngDoc 是一个可复用的工程文档编排、渲染与查询工具。项目继续使用已有的 RTL、配置、原理图、Netlist、约束文件及项目专属描述。项目转换脚本从这些来源提取信息，生成标准 EngDoc IR；通用工具将 IR 与 Markdown/Markdoc 正文合并为单份可导航文档，并按需导出**一个自包含 HTML**或**一个 PDF**。机器查询独立使用临时 IR，不依赖最终交付文件。

V1 必须满足以下原则：

1. **三层分离：** 通用工具、项目数据、项目转换脚本各自独立；不要求项目迁移到统一工程数据库。

2. **事实只定义一次：** 接口位宽、管脚编号、连接拓扑等精确信息以既有项目数据或项目内唯一权威数据为准。图形视图引用这些事实，不重新书写。

3. **正文与数据分离：** 正文使用 Markdown 说明目的、机制、行为、边界与选择；接口表、引脚表、连接图等从数据生成。

4. **图形与工程语义分离：** 通用工具理解节点、端口、连接、分组、布局、引用；不内建 AXI-Stream、QSPI、RGMII、FPGA Ball 等领域知识。

5. **Agent 按需读取：** 不将构建产物作为知识输入；提供简短入口、稳定 ID 与 JSON 查询，避免加载整个生成站点。

6. **可验证：** IR、引用、连接端点、文档标签和生成结果都要检查；工程特有的一致性由转换脚本负责。

7. **增量演进：** 先通过真实 FPGA 与板级硬件样例验证通用能力，重复出现的项目脚本再提取为可复用 Adapter。

V1 不负责：通用 EDA 数据库、完整 RTL/EDA 自动理解、从 PDF 图片可靠还原电气关系、网页双向编辑工程、任意复杂图形的完美自动布局、自动推断全部架构语义。

# 2. 三层架构与数据流

## 2.1 项目数据层

项目保留原有文件，例如 SystemVerilog RTL、fpga.config.js、SVD/寄存器表、EDA 原理图、管脚约束和设计说明。原始资料缺少的语义可以由项目专属的注释文件补充，如模块功能分类、显示分组、架构关系与来源说明。补充文件只填缺口，不复制已有的准确字段。

规范性行为不必全部机器化。例如“复位后 FIFO 清空”“上游 valid 变低且帧未结束时丢帧”仍由 SPEC 的稳定条款唯一表达；可结构化的端口/参数/寄存器等精确事实由项目数据提供。两类内容以 ID 关联，不互相改写语义。

## 2.2 项目转换脚本层

每个项目实现一个 Adapter，读取项目既有数据并输出标准 IR。脚本可以使用 Python、Go、TypeScript 或其他语言；同一项目只需维护一套转换规则。若发现多个项目确实共用解析和映射机制，再单独托管可复用 Adapter。

转换脚本不得把工程事实（例如 FPGA Ball=A12、AXIS 宽度=64）硬编码为正常数据来源。无法确定的值必须标记未解析或报错，不得猜测。规范与实际 RTL/原理图不一致时给出差异，不通过修改正文或转换结果掩盖冲突。

## 2.3 通用工具层

通用工具提供：IR Schema、验证、查询、索引、文档编排、图形渲染、WaveJSON 展示、单文件 HTML 打包、PDF 打印导出与可选 SVG 导出。最终交付不能依赖额外的 CSS、JavaScript、字体、图片或数据文件；不得依赖具体项目名、RTL 目录、EDA 格式或协议名称。

构建顺序：**项目源数据 → 项目 Adapter → 临时 EngDoc IR → Schema/引用检查 → 合并文档 → 自包含 HTML 或 PDF 单文件**。查询索引用于构建及 Agent 检索，可嵌入 HTML 的必要部分；IR 和临时构建资源均可重建，不回写项目源数据。

# 3. 通用能力清单

## 3.1 文档能力

正文保留 Markdown 标题、段落、列表、引用、普通表格及代码块。需要高级排版时使用受控的 Markdoc 标签；不允许在文档中用原生 JS、CSS、HTML 手工实现布局。

| 标签 | 作用 | 主要约束 |
| --- | --- | --- |
| `section` | 有 ID 的章节，可折叠 | 必须有标题或引用标识 |
| `columns` | 固定比例多栏 | 比例使用预设；窄屏自动堆叠 |
| `panel` | 章节内卡片或布局容器 | 可嵌套，不接受任意 CSS |
| `tabs`、`tab` | 多视角内容切换 | 各 Tab 有稳定名称 |
| `diagram` | 引用图形视图 | 必须提供有效 `id` |
| `interface` | 引用接口详情视图 | 可选择总览/逐信号模式 |
| `table` | 引用结构化表格 | 列定义由数据提供 |
| `waveform` | 引用时序数据 | 使用 WaveJSON |
| `reference` | 引用对象/章节/条款 | 无效 ID 构建失败 |

普通页可以保留 `.md`，需要自定义标签的页使用 `.mdoc`。项目仍按功能拆分多个源文档，由入口决定顺序和目录；**发布时合并为同一个 HTML/PDF 文件**。导航使用文内目录与稳定锚点，而非多页网站路由。

## 3.2 图形基础对象

图形协议只提供少量通用对象：

| 对象 | 必须支持 |
| --- | --- |
| `Node` | 唯一 ID、类型、标题、属性、可选父节点 |
| `Port` | 唯一 ID、所属节点、名称、方向、属性、可选分组 |
| `Connection` | 唯一 ID、至少两个端点、类型/分类、可选方向与标签 |
| `Group` | 逻辑分组、成员引用、可折叠及视图过滤 |
| `Label` | 标题、端口标注、连线标注与附加说明 |
| `Reference` | 指向工程对象、文档条款、表格行或其他视图 |

`Node.parentId` 表示图形层级；`Group` 表示逻辑集合或折叠集合，两者不能混为一谈。连接模型使用端点列表而不是只允许 `from/to`，以保留同一电气 Net 连接多个端点的事实。两端逻辑数据流也可以使用此模型并附方向信息。

**图形与事实严格分开：** 图形视图主要列出需要显示的对象/关系 ID、布局方向、端口排序、标签与样式策略，不重新保存节点的管脚号、接口宽度、实际连接端点。

## 3.3 V1 图形预设与连线分类

四类预设共用图形底座：

- `architecture`：功能架构框图，数据路径、控制路径、FIFO/CDC 等模块。

- `interface`：单一 Component 边界与逻辑接口组；详细模式必须逐真实端口显示名称、方向、位宽及关联时钟域。

- `wiring`：芯片/板级简化连接图，显示物理 Ball/Pin、功能名及 Net；多端点 Net 不可丢失。

- `state`：状态图，迁移条件以关系标签表达；不在 V1 中内建 HDL FSM 语义分析。

内置连接分类为 `data`、`control`、`clock`、`reset`、`event`、`power`、`configuration`、`other`，允许项目自定义类名。颜色不是唯一的区分方式，线型、箭头、标签应共同传达类型。总线折叠仅改变视图；逐信号模式不得合并真实独立 Net 或 RTL 信号。

## 3.4 交互与导出

V1 的 HTML 具有缩放、平移、适配画布、对象选中、相邻关系高亮、分类过滤、分组展开/折叠、属性面板和文内跳转，保留可选 SVG 导出。PDF 使用同一份工程内容，但以静态图形、目录、章节链接、打印排版呈现，不承诺 HTML 的筛选与拖动交互。两种输出均为只读，不修改源工程。

## 3.5 时序图

Waveform 独立使用 WaveJSON，不把每个时钟跳变都转换成通用 Graph 节点。WaveJSON 来源可为手写规范样例、测试结果的项目转换输出，必须区分“规范示意波形”与“实际仿真波形”，不能混淆。

# 4. EngDoc IR V1 格式

## 4.1 文件组织与版本

Adapter 输出一个目录，入口为 `manifest.json`，指向各资源文件。IR 使用 JSON；所有文件使用 UTF-8，字段由 JSON Schema 校验。协议版本采用 `major.minor`；同一 major 内允许兼容新增可选字段，破坏性变化提升 major。未知必需类型、未支持 major、丢失引用均报错。

建议生成物：

```text
.engdoc-build/ir/
├── manifest.json
├── objects.json
├── relations.json
├── views.json
├── tables.json
└── waveforms/
    └── tx-handshake.json
```

不同资源可继续分片，不能假设整个项目都必须装入一个 JSON。`manifest.json` 只声明项目 ID、IR 版本、资源清单和入口文档路径，不存重复工程字段。

## 4.2 公共字段约定

- 每个可引用对象都有稳定、非空的 `id`；ID 在项目命名空间内唯一。不得通过文件内容 hash 派生 ID。

- `label` 是展示名称，不作为主键。重命名展示文字不应破坏引用。

- `kind` 表示通用对象类型；`class` 表示绘图/关系类别；不把协议名硬编码为通用枚举。

- `attributes` 允许领域扩展，但端点、层级、方向、引用等重要关系必须使用正式字段。

- 端口方向允许 `in`、`out`、`inout`、`passive`、`unknown`；信息未知时不得强行归为 `in` 或 `out`。

- 参数化 HDL 宽度未解析时可保留 `widthExpr` 和参数上下文；只有在可证明的参数组合下写入确定的 `width`。

- `source` 可记录原始文件、符号路径或稳定对象选择器，用于追溯；行号仅作附加定位，不作为长期身份。

- 宏观架构关系、电气 Net、控制/时钟关系必须明确分类。图形库不得自行推断其电气含义。

## 4.3 结构示例

以下是 Adapter **生成的 IR 示意**，不是要求项目手工维护第二份引脚定义：

```json
{
  "irVersion": "1.0",
  "projectId": "demo-board",
  "objects": [
    {
      "id": "board:U1",
      "kind": "node",
      "label": "FPGA",
      "ports": [
        { "id": "board:U1.QSPI_CLK", "label": "QSPI_CLK",
          "direction": "out", "attributes": { "ball": "A12" } }
      ]
    },
    {
      "id": "board:U5",
      "kind": "node",
      "label": "Flash",
      "ports": [
        { "id": "board:U5.CLK", "label": "CLK",
          "direction": "in", "attributes": { "pin": "6" } }
      ]
    }
  ],
  "relations": [
    {
      "id": "board:net.FLASH_SCK",
      "kind": "connection",
      "class": "clock",
      "endpoints": ["board:U1.QSPI_CLK", "board:U5.CLK"]
    }
  ],
  "views": [
    {
      "id": "board:flash-wiring",
      "kind": "wiring",
      "include": {
        "objects": ["board:U1", "board:U5"],
        "relations": ["board:net.FLASH_SCK"]
      },
      "layout": { "direction": "LR", "routing": "orthogonal" },
      "display": { "portAttributes": ["ball", "pin"] }
    }
  ]
}
```

示例中的 Ball/Pin 数值仅用于说明字段关系，不对应真实硬件。正式 JSON Schema 应拆为 `manifest`、`object`、`relation`、`view`、`table`、`waveform`、`reference`，并分别提供正反例验证；以上是语义样例，不应直接当成所有字段已封闭的最终 JSON Schema。

## 4.4 表格、时序与引用

表格资源由 `id`、列定义（字段名、显示名、数据类型、单位）、行 ID 与行数据组成。原始结构化对象可以通过 Adapter 投影为表格数据，但不能要求正文重复复制其值。时序资源标明 `format: wavejson`、数据来源及语义类别（规范示意/仿真记录）。

`Reference` 使用稳定 ID 指向对象、端口、连接、表格行、章节或 Spec 条款。构建时生成 `id → 文档内锚点/机器资源/来源` 索引；HTML 和 PDF 都使用内部定位，不生成跨文件的文档链接。无效引用是构建错误；视图过滤不应删除实体身份，未显示对象仍可通过查询访问。

# 5. 文档源码及渲染示例

文档的主要内容继续使用 Markdown；`.mdoc` 只增加专用标签。

```text
---
title: 1G Ethernet MAC
component: cm_mac_1g
---

# 内部架构

MAC 分为 TX、RX 和控制模块。TX 将上层 AXI-Stream
帧转换成发送数据，RX 负责接收、校验与过滤。

{% diagram id="mac:overview" /%}

## TX 数据通路

{% columns ratio="2:1" %}
{% panel %}
{% diagram id="mac:tx-datapath" /%}
{% /panel %}
{% panel %}
### 关键行为
- 上游反压
- 帧长检查
- FCS 生成
{% /panel %}
{% /columns %}

### 输入接口

{% interface id="mac:tx-axis" mode="detailed" /%}

TX 暂时不能接收数据时，通过 TREADY 对上层反压。
具体约束见 MAC-TX-001。

{% waveform id="mac:tx-handshake" /%}

{% reference id="MAC-TX-001" /%}
```

这是计划定义的自定义标签规范；标签的实际属性、容器嵌套及 Markdown 解析行为需在 POC 期间以测试固化。详细接口字段、信号位宽、引脚和连线均不写在正文里。`README` 做高可读总览与阅读路由，`SPEC` 记录行为规范和稳定 ID，`ARCH` 说明内部机制，`VERIFY` 展示 Verify → Case → Spec 的覆盖及反向查询。复用现有 FPGA 文档约定，不改变其语义；源文档可以分文件管理，最终输出合并为一份可导航文档。

# 6. 布局规则与性能边界

## 6.1 文档布局

采用受控组件系统，优先提供 `section`、`columns`、`panel`、`tabs` 等少数可组合容器。HTML 中宽屏允许多栏、窄屏自动堆叠；PDF 使用独立打印样式，保证表格、图形和章节跨页可读。不在正文中直接指定像素坐标、CSS 类名或 JavaScript。嵌套必须支持正常 Markdown 段落、标题、列表与引用。

## 6.2 图形布局

- 架构图：优先自动层次布局。

- 接口图：保证端口固定边、顺序和组别，实际信号不遗漏。

- 板级连接图：小图优先左右固定布局与正交连线。

- 复杂多端点网络：允许分叉、汇合、交点标识，避免把一条 Net 错误复制为不相关的边。

- 高密度视图：先拆分图层或按分类筛选，再考虑手动布局提示。

- 自动布局结果不稳定时：允许在**视图**内记录手动位置/路径提示，不能把这些坐标回写到工程事实。

通用工具不承诺“任意复杂图都无需人工调整”。每张图的目标是连接可追踪、标签可读、无误导性连线；美观次之。

## 6.3 单文件 HTML 与 PDF 规则

最终交付必须恰好是一个 `.html` 或一个 `.pdf` 文件。源码、Adapter、临时 IR、构建缓存允许为多个文件，但不能是交付文档的运行依赖。项目可分别选择输出格式；无需同时交付两种格式。

**HTML 模式：**

- 先将各 Markdown/Markdoc 源章节编排为一份文档，生成文内目录与稳定锚点，不使用多页路由。

- 将必要 CSS、JavaScript、SVG、WaveJSON、图形数据、图标及字体资源内联到 HTML；页面打开后不得发起外部资源请求。

- 交付文件应能在常见桌面浏览器中直接通过 `file://` 打开，无需本地 Web Server 或联网。

- 通过文内目录、搜索和内部锚点导航；禁止运行时动态加载分包、外部 Worker、外链 CDN 或依赖其他文件。

**PDF 模式：**

- 使用同一份文档结构与图形数据，生成独立打印排版，推荐由 Chromium/Playwright 导出。

- 导出前展开所有会隐藏正文的折叠内容；Tabs 的各页按顺序完整输出，不能只打印当前选项。

- 图形按完整可视范围导出，优先保留 SVG 矢量质量；避免节点/连线被视口裁剪。

- 生成封面、章节目录、页码，并尽可能保留 PDF Outline 和内部跳转；对长表格及大图提供跨页/横向页策略。

**限制：** HTML 包含全部资源，文件体积可能偏大；PDF 不保留筛选、拖动和展开等交互。单文件构建优先保证内容完整与离线可读，超大工程图必须允许拆视图而不能静默裁切。

# 7. 转换脚本标准契约

每个项目可通过 `engdoc.config.json` 声明 Adapter 执行入口、文档根目录、项目 ID 和 IR 输出位置。标准命令建议为：

```bash
engdoc build --config engdoc.config.json --format html --output EngDoc.html
engdoc build --config engdoc.config.json --format pdf --output EngDoc.pdf
engdoc validate --config engdoc.config.json
engdoc query --config engdoc.config.json --id board:net.FLASH_SCK --format json
engdoc export --config engdoc.config.json --view board:flash-wiring --format svg
```

构建工具按配置执行 Adapter，并要求其：

1. 成功退出且生成合法 `manifest.json`；失败使用非零退出码，包含可定位的诊断信息。

2. 不修改 RTL、EDA、配置等输入文件，不写入通用工具仓库。

3. 稳定命名对象与引用 ID；输出顺序尽量确定，生成目录可整体重建。

4. 在数据缺失时明确报错或标记未知，不默默填入虚构引脚、方向或宽度。

5. 如存在项目内补充语义，确保补充数据只记录原始源中没有的内容。

通用工具只验证 IR 的通用结构与引用正确性；RTL 解析、寄存器含义、EDA Netlist 真实性等由 Adapter 或项目独立验证承担。Adapter 可以直接使用项目已有配置和解析程序，避免重新造一套工程前端。

# 8. Agent 的阅读与编辑规则

项目应提供一个简短入口文档，说明项目目标、文档地图、数据来源和 Adapter 用法。Agent 先读入口，再按任务读取相关 `.md/.mdoc` 与原始工程数据；需要精确字段时优先 `engdoc query`。不得把 `dist/`、生成 HTML、SVG、前端 bundle 作为日常检索源。

角色分工：

- 新增或改变工程事实：修改原始项目数据，必要时调整 Adapter，并运行与 RTL/EDA 的一致性检查。

- 改变图形呈现方式：修改项目专属视图定义，不复制工程字段。

- 改变文字解释或规范行为：修改相关文档与稳定 ID；不得以“格式优化”静默改变规范语义。

- 需要通用图形组件的新能力：修改 EngDoc 通用工具并更新 Schema、测试与示例。

查询输出默认简洁，只返回目标对象、必要直接关系、来源和文档定位；深度展开需显式参数。使用文件元数据、显式依赖与构建成功状态跟踪构建，不引入默认文件内容 hash 缓存。

# 9. 项目与通用工具目录建议

通用工具独立仓库：

```text
engdoc/
├── packages/
│   ├── schema/          # IR JSON Schema 与版本
│   ├── core/            # 加载、校验、索引、查询
│   ├── render-graph/    # Node/Port/Connection/Group
│   ├── render-wave/     # WaveJSON 适配
│   ├── doc-theme/       # Markdoc 标签、单文档布局与打印样式
│   ├── pack-html/       # 资源内联与单文件检查
│   ├── render-pdf/      # 打印布局与 PDF 导出
│   └── cli/             # build、validate、query、export
├── examples/
│   ├── fpga-mac/
│   └── board-flash/
└── tests/
```

每个工程独立维护：

```text
project/
├── rtl/                 # 如适用：原工程文件
├── board/               # 如适用：EDA 工程
├── docs/
│   ├── README.mdoc
│   ├── SPEC.mdoc
│   ├── ARCH.mdoc
│   ├── VERIFY.mdoc
│   └── views/           # 只有显示/引用信息
├── doc-adapter/         # 项目专属转换脚本
└── engdoc.config.json
```

文件名和目录可遵守项目现有约定；`README/SPEC/ARCH/VERIFY` 是 FPGA 项目的内容层级约定，不强加于非 FPGA 工程。具体目录由项目 Adapter 配置决定。

# 10. 技术选择与替换边界

| 部分 | V1 选择 | 说明 |
| --- | --- | --- |
| 正文与声明式布局 | Markdoc | 保留 Markdown，使用受控标签与 AST |
| HTML 文档渲染 | TypeScript 单文档渲染器 | 合并章节、文内导航、引用与搜索 |
| HTML 打包 | Vite 构建与资源内联 | 只交付一个可离线打开的 HTML；实现方式需经 POC 验证 |
| PDF 输出 | Chromium / Playwright | 基于打印布局产生一个 PDF，启用目录与书签能力 |
| 端口级图形 | AntV X6 | 使用端口、连接、SVG 和交互能力 |
| 自动布局 | ELK.js | 只作为可替换的布局后端 |
| 数字时序 | WaveDrom | 直接消费 WaveJSON |
| 核心实现 | TypeScript | Schema、CLI、渲染器共用类型 |
| 项目 Adapter | 不限语言 | 通过 JSON 文件协议隔离 |

此前的 Astro Starlight 适合多页文档站点，但与已确认的**单文件交付**方向不一致，因此不再作为 V1 默认发布链路。正文仍使用 Markdoc 解析与受控布局组件，使用单文档渲染器将所有章节合并，再进行 HTML 资源内联；可评估 `vite-plugin-singlefile`，但其对 public 资源、SVG 和动态分包存在限制，必须通过单文件完整性测试，不能依赖插件名称就认定成功。PDF 从同一份内容通过独立打印视图生成。X6 的端口布线与 PDF 图形输出也需要真实样例验收；前端框架类型不得进入 IR。

# 11. 安全性、稳定性与可移植性

- 生成内容须对标签、路径、属性进行转义；项目数据不能作为任意 HTML 或脚本执行。

- Adapter 属于项目提供的本地构建程序，可能执行任意代码；只对受信任项目运行，不自动执行来源不明的文档附件。

- 所有外部引用路径必须在允许的项目范围内解析；禁止通过相对路径读取工程范围外的敏感文件。

生成的 HTML 与 PDF 都必须是自包含单文件，不能在打开后要求额外资源或网络连接。HTML 至少验证主流桌面浏览器 `file://` 直接打开；PDF 验证常用阅读器离线打开。临时构建目录和源文件不属于交付依赖。

- 不使用内容 hash 作为默认状态跟踪机制。构建失败不得展示陈旧产物为“最新成功结果”。

- IR 版本、文档标签版本和 Adapter 适配版本必须可见，升级失败要报告准确原因。

**交付形式已确认：** 原建议是输出由多个 HTML 页面和资源组成的静态站点目录；现根据用户明确要求改为**严格单文件**，可选择 HTML 或 PDF。原因是便于保存、转发和离线阅读。影响是多章节必须合并、导航改为文内锚点、HTML 必须内联全部资源、PDF 使用独立打印布局，且文件体积可能增加。此要求不改变三层数据架构。

# 12. 验证策略与验收标准

## 12.1 通用校验

1. JSON Schema 对所有 IR 资源校验，错误包含文件、对象 ID 和字段路径。

2. 对象 ID 唯一；全部引用可解析；不存在循环层级或悬空关系。

3. Connection 至少两个有效端点；多端点同属一条关系；分组成员存在。

4. 视图只引用声明过的对象与关系；隐藏/折叠不改变数据含义。

5. Markdoc 标签合法，属性符合约定；普通 Markdown 排版正常。

6. SVG 图形端口不错接、标签不重叠到无法阅读、分类与筛选可用。

7. 查询结果与最终文档来自同一份 IR；指定 ID 在 HTML 的文内锚点和 PDF 的章节定位有效。

8. HTML 输出目录中只有目标交付文件；不依赖网络、外部脚本、字体、图片、JSON 或 Worker，直接 `file://` 打开后目录、图形与搜索正常。

9. PDF 输出为单个文件；所有 Tabs/折叠正文完整可见，目录、书签、页码、连线与多页表格无明显缺失或裁切。

## 12.2 样例 A：FPGA 外接 Flash

验收内容：

- 至少两颗芯片、多个真实独立信号、端口 Ball 与 Pin/功能标签。

- 一组 QSPI 信号可总线化概览，也能展开逐根查看。

- 同一 Net 增加第三端点时，图与查询都保留三个端点。

- 在项目数据源中更改一个 Ball/Pin 后，转换、表格、图形同时更新，无需修改文档正文或图形定义中的重复值。

- 可以导出可读 SVG，保留指向原理图/Netlist 的来源信息。

## 12.3 样例 B：1G MAC Component

验收内容：

- README、SPEC、ARCH、VERIFY 作为独立源章节合并到一个交付文件，HTML 通过内部目录跳转，PDF 通过目录与书签定位。

- 标准 Markdown 与嵌套栏布局同时正确渲染。

- AXI-Stream 64-bit 等结构化接口字段只从数据提取，不在正文和图形重复保存。

- 架构图可追踪 TX、RX、控制、FIFO 等功能连接；接口图详细模式逐信号。

- WaveJSON 显示握手与反压示意，标注其规范/实际数据来源。

- 稳定 Spec ID 可以跳转到相关架构、接口、Verify 与 Case；反向覆盖查询有效。

## 12.4 测试拆分

按 Schema/解析、引用/查询、图形路由、单文件 HTML 打包、PDF 打印布局、浏览器交互分别运行测试，避免每次变更触发无差别全量测试。对关键样例做宽屏和窄屏截图，并在无服务器、无网络条件下直接打开 HTML；PDF 要检查目录、分页、跨页表格、全部 Tabs、图形完整性和链接。不能仅以构建命令成功判断交付正确。项目真实 RTL/EDA 一致性测试与通用工具测试分开。

# 13. 实施阶段与交付物

| 阶段 | 开发目标 | 交付与放行条件 |
| --- | --- | --- |
| P0 协议原型 | IR Schema、ID/引用、最简单的 Node/Port/Connection | 手工样例 JSON 能被校验和查询，多端点关系不失真 |
| P1 图形引擎 | 四类图形预设的公共底座、正交布线、高亮、过滤、SVG | FPGA–Flash 样例可读且准确，人工布局回退有效 |
| P2 单文档引擎 | Markdoc、嵌套布局、数据引用、章节合并与自包含 HTML | MAC 文档输出一个 HTML，直接离线打开，目录与引用可跳转 |
| P3 PDF 与 Adapter | PDF 打印布局、两个示例 Adapter、项目一致性检查 | 同一份数据能输出一个 PDF；修改项目源后重新生成，差异可发现 |
| P4 交付质量 | HTML/PDF 单文件完整性、离线回归、版本兼容 | 两种格式可独立构建且无额外文件依赖，新项目无须修改通用工具源码 |

每阶段都应包含可运行样例和自动化验证；从 P2 开始交付可直接打开的单文件 HTML，从 P3 开始同时具备单文件 PDF 生成能力。P0/P1 是重要的可行性门槛：若端口级连线在真实项目规模下无法达到可读性，先修订绘图策略，而不是继续堆叠文档功能。

# 14. 关键决策与风险记录

**已确定：** 三层架构、数据与正文分离、独立转换脚本、通用 IR、端口级连接、多端点关系、稳定 ID、按需查询、只读生成、项目域适配、按真实样例分阶段验收；最终交付为一个自包含 HTML 或一个 PDF，二者可选。

**待原型证明：** Markdoc 多层嵌套与单文档合并；X6 端口定位与复杂线条的可读性；ELK 自动布局回退；HTML 的完全资源内联及 `file://` 离线交互；PDF 中目录、书签、分页与完整图形输出。

**变更原则：** 后续如果需要把原定“只读工具”改为可编辑器、把项目独立数据改为统一数据库、把真实逐端口图改为仅逻辑分组图，均属于实质方向或语义变化，必须先明确说明原要求、拟变更、理由及影响并获得批准。

# 15. 官方技术资料

- [Markdoc 标签与嵌套](https://markdoc.dev/docs/tags)、[Markdoc 校验](https://markdoc.dev/docs/validation)

- [Vite 单文件构建插件及限制](https://github.com/richardtallent/vite-plugin-singlefile)、[Playwright PDF 导出与目录](https://playwright.dev/docs/api/class-page#page-pdf)

- [AntV X6 端口](https://x6.antv.antgroup.com/en/tutorial/basic/port)、[AntV X6 连线](https://x6.antv.antgroup.com/en/api/model/edge)

- [ELK.js 布局引擎](https://github.com/kieler/elkjs)

- [WaveDrom 与 WaveJSON](https://wavedrom.com/tutorial.html)

- [KiCad CLI Netlist 导出](https://docs.kicad.org/master/en/cli/cli.html)

