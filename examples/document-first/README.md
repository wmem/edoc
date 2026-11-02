# 文档先行示例

虚构的处理模块与存储模块，用于演示标准数据、正文与显示设置分离，不代表真实硬件。

- engdoc.config.js：入口、HTML/PDF 输出、视图和投影表格直接配置。
- docs/index.mdoc：理解性正文；include details.mdoc，含折叠的查询参考。
- docs/ir/design.ir.json：两个模块、四个端口与两条原始关系；自动发现，不需要 manifest。
- demo:unused：未被正文引用的布局草稿，故意包含布局冲突。它保留查询能力，不影响发布使用的视图；显式导出该草稿才报 LAYOUT_CONFLICT。

安装后在此目录执行 engdoc；PDF 需要已有 Chromium，可通过 ENGDOC_CHROMIUM 指定。只看网页可运行 engdoc build --format html。工具源码开发时在仓库根运行：

```sh
node packages/cli/engdoc.ts validate --config examples/document-first/engdoc.config.js --format json
node packages/cli/engdoc.ts build --config examples/document-first/engdoc.config.js --format html
```

默认输出位于 output/manual.html 与 output/manual.pdf；生成文件不作为后续手工修改入口。
