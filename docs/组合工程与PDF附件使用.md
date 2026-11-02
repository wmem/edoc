# 组合工程、分篇阅读与 PDF 附件

工具已提供工程组合、单 HTML 内分篇阅读、跨工程弱跳转和 PDF 附件定位。本文保留该阶段完整说明；新的渐进式正式使用文档从[使用入口](manual/usage/index.mdoc)开始，精确字段见[查询参考](manual/usage/reference/index.mdoc)。该阶段功能验证范围见[组合阅读与 PDF 验收](组合阅读与PDF验收.md)。

## 最小配置与文档入口

```js
// engdoc.config.js
export default {};
```

运行 engdoc，默认输出 output/index.html。未指定 --config 时只读当前目录的 engdoc.config.js；显式 --config 的项目根是该配置目录。

正文缺省先采用工程 README.md；不存在 README.md 时采用 docs/，均不存在时报错。多篇正文建议明确写目录：

```js
export default {
  projectId: 'system',
  title: '系统文档',
  documents: 'docs'
};
```

目录递归发现 .md/.mdoc，index.md/index.mdoc 置前，其余按相对路径排序；跳过 ir、_partials、node_modules、output 及隐藏项。也可写单个文件或有序路径数组。普通 Markdown 链接到本工程其他 .md/.mdoc 时，工具会发现并加入目标页面，循环链接不会重复加入。

每个入口或发现的文件成为独立阅读页，仍打包到同一 HTML。文档子目录形成局部分组，目录 index 作为该分组首页；没有 index 的分组只展开目录，不生成空白文章。已声明的子工程目录是自动发现边界，不能通过 file include 跨入，需显式 project include。当前页面之外的正文保存在载荷中，不创建成整本书 DOM 再隐藏。侧栏显示页面及其章节树，本页目录负责页内定位。

## 父配置接入子配置

每个工程有自己的配置、正文和 IR，默认数据来源都是相对本工程根的 docs/ir/，多个数据目录继续使用 data 路径数组。父配置直接声明子配置路径：

```js
export default {
  projectId: 'system',
  title: '系统说明',
  documents: 'docs',
  children: {
    fpga: './fpga/engdoc.config.js',
    board: './board/engdoc.config.js'
  }
};
```

父正文保留自己的内容，在所需 section 接入子入口：

```text
{% section id="hardware" title="硬件组成" %}
这里编写父工程自己的说明与图表。

{% include project="fpga" /%}
{% include project="board" /%}
{% /section %}
```

子配置仍只写自身：

```js
export default {
  projectId: 'fpga',
  title: 'FPGA',
  documents: 'docs'
};
```

单独在 fpga 目录执行 engdoc 可生成它自己的 HTML；被父工程接入时不会改变它的路径、对象 ID 或文档组织，也不会触发其独立 output 额外写文件。孙工程采用同样方式递归组合。

children 的键是当前父工程的局部组合别名；公开 projectId 是稳定项目身份，两者用途不同。需要跨工程长期链接时显式填写 projectId，避免目录名变化影响身份。组合内 projectId 重复、组合循环、同一真实配置重复接入、同一子工程在正文重复接入均报错。

只有实际 include 的子工程会被加载。仅有 children 声明或跨工程链接都不会触发接入。父工程缺少显式要求接入的子输入时构建失败；独立子工程不会反过来要求父/兄弟存在。

## 页面、片段与稳定引用

普通文章间用 Markdown 链接：

```md
[接口说明](interfaces.mdoc#握手)
```

文档链接相对所在源文件，构建时转换为 HTML 内路由，并检查本地文件和锚点。标题生成可定位的 slug；重复标题在本页增加数字后缀。显式 section ID 适合长期引用。

普通 file include 继续用于同一页片段复用，路径相对所属工程根，推荐将片段放在 _partials 中：

```text
{% include file="docs/_partials/notes.mdoc" /%}
```

include file 不创建独立阅读页；include project 接入完整子文档树。PNG/JPEG/WebP 图片仍按所属工程根定位并内联，未增加任意 HTML/SVG 执行入口。

本工程对象或有稳定 ID 的 section 可用 reference；显式页面路径可用 page：

```text
{% reference id="device" /%}
{% reference id="spec:handshake" /%}
{% page id="docs/interfaces" anchor="握手" label="接口说明" /%}
```

页面 ID 当前为相对工程根的文档路径去掉 .md/.mdoc，例如 docs/interfaces。显式 section 的稳定 ID 在本工程内唯一，仍能被 query 定位；普通标题 slug 在页内组织，不要求所有文章的“概述”等标题全局唯一。本轮没有额外实现 frontmatter 自定义页面 ID。

## 跨工程只跳转，不加载

```text
{% reference project="board" id="device" label="核对板卡器件" /%}
{% page project="board" id="docs/index" label="板卡说明" /%}
```

project 是目标 projectId，不解释成 ..、../board 或配置文件路径。目标在当前组合 HTML 中就跳转；未包含的项目、对象、页面或锚点，点击后提示“当前生成的页面中没有此内容”，当前阅读页保留。

链接不读取目标配置、IR、正文或附件，不触发网络请求，不扩展组合集合。父/兄弟源目录缺失或其配置抛错，不影响只有弱链接的独立子构建。

跨工程 diagram/interface/table/waveform 取数不支持，也不允许跨工程拼接关系端点、表格投影或布局约束。每个工程在自己的数据内严格校验；本地引用错误仍报错。不同工程可有同名对象，查询和页面搜索显示项目归属。

## HTML 携带 PDF 原文

附件直接在配置内声明；位置映射也可由 data 函数返回的标准数据对象 attachments 字段提供，不要求另导入配置 JSON。同一附件 ID 不能在两处重复定义。

```js
export default {
  projectId: 'board',
  documents: 'docs',
  attachments: {
    schematic: {
      type: 'pdf',
      file: 'hardware/schematic.pdf',
      title: '原理图',
      targets: {
        power: { page: 3, rect: [0.10, 0.20, 0.40, 0.35] },
        core: { destination: 'M00_FPGA' }
      }
    }
  }
};
```

以上是格式示例，不代表真实 PDF 中存在这些页或命名目标。file 相对附件所属工程配置根。原始字节内嵌 HTML；同一实际文件的多别名只携带一份字节载荷，页面多次引用也不重复打包。下载得到原 PDF，无需源目录或本地服务器。

位置参数：

- page：从 1 开始的物理页号；省略 rect 时适配整页。
- rect：[x0,y0,x1,y1]，相对 CropBox 和 PDF 内置旋转后的显示区域归一化到 0–1，左上为 (0,0)，右下为 (1,1)；不是像素或 [x,y,width,height]。
- destination：PDF 自带命名目标，与 page/rect 互斥。支持页定位，以及 FitR 区域、XYZ 点和 FitH/FitV 等常见视图参数的定位。

正文引用稳定附件/位置身份：

```text
{% attachment id="schematic" target="power" label="查看电源原理图" /%}
```

PDF 阅读器提供分页、缩放、整页适配、引用位置标记、重新定位和原文下载。它是源 PDF 阅读功能，与将工程文档导出 PDF 分开。

PDF 文件缺失/损坏、页号越界、命名目标不存在或区域无效，在构建时报告，不偷偷退回第一页。省略 target 明确表示打开首页。PDF 换版后，项目需保持或更新稳定位置 ID 对应的映射；工具不能仅凭 ID 自动证明位置仍对应同一电路。

当前单个附件上限 128 MiB；HTML 会随原始文件大小和编码增长，打开时也有解码及画布内存成本。首批聚焦原文查看，不提供 PDF 编辑、全文检索或原生批注层交互。PDF.js、worker、CMap、字体和必要解码支持资源随含附件的 HTML 内嵌，不使用 CDN。

## 对象详情直接核对原理图

保留原始数据来源，再增加独立的 PDF 核对入口：

```json
{
  "source": {
    "file": "hardware/netlist.txt",
    "selector": "U1",
    "attachment": { "id": "schematic", "target": "core" }
  }
}
```

source.file/selector 继续表示原工程数据位置，不需要为了链接 PDF 而改写原始来源。点击图中对象或查看对象详情，可用“查看原始 PDF”进入对应位置。本地 source.attachment 同样严格校验；指定外部 project 时仍只生成弱跳转，未包含则提示。

跨工程 PDF 跳转也使用 projectId：

```text
{% attachment project="board" id="schematic" target="power" /%}
```

不会读取 board 的源文件来补齐附件；只有本次明确组合携带了该附件才打开。

## 返回、刷新与查询

正文、对象详情和 PDF 共用文档路由：点击跳转增加浏览历史，PDF 连续滚动/缩放更新当前状态，不把每一小步加入历史。浏览器后退恢复原文档的滚动、折叠/标签页、图形缩放/接口状态；前进恢复 PDF 阅读状态。复制稳定 URL 后可在相同 HTML 内定位，刷新也可恢复；直接打开无返回来源的深链接时可回首页。

```sh
engdoc
engdoc validate --format json
engdoc outline --format text
engdoc query --project fpga --id device --format json
engdoc export --project fpga --view overview --format svg --output output/overview.svg
```

--project 只选择本次显式组合已加载的 projectId，不查找外部配置。query 和浏览器对象详情共用查询规则，保留完整直接端点、来源、所属对象和关联引用。

既有文档导出仍可使用 build --format pdf，需要已有 Chromium。单工程保留原打印链路；组合工程生成包含各参与工程正文与对象的打印文档。浏览器打印当前阅读的正文页，并临时展开其折叠/Tabs；完整文档使用 CLI 导出。源 PDF 附件不自动合并进导出的文档 PDF。

## 当前验证与下一阶段

新增测试覆盖组合与独立构建、同名隔离、外部配置不执行、按页阅读、源链接、PDF 定位/下载/历史恢复、原图形及安装包。验收记录明确区分小型定位夹具与真实原理图的只读阅读检查，未声称自动生成了真实电路锚点映射。

本阶段先完成工具功能及当时的使用说明；后续已将工具文档自身组织为 docs/manual 下的正式工程，让使用文档承担长期展示，验收见[自文档组织与查询](自文档组织与查询验收.md)。
