# IR 2.0 单工程地址资源

本例展示 UART 模板、项目分配、RAM 切片、Reserved 和不同地址单位的 Window。全部数据在 docs/ir/soc.json；阶段 A 不提供动态目录或跨工程强引用。

在仓库根执行：

```sh
node packages/cli/edoc.ts validate --config examples/address-space-v2/docs/edoc.config.js
node packages/cli/edoc.ts build --config examples/address-space-v2/docs/edoc.config.js
node packages/cli/edoc.ts query --config examples/address-space-v2/docs/edoc.config.js --id demo:cpu --element '[{"kind":"region","regionId":"apb"},{"kind":"region","regionId":"uart"},{"kind":"entry","entryId":"counter"}]'
node packages/cli/edoc.ts query --config examples/address-space-v2/docs/edoc.config.js --id demo:cpu --element '{"kind":"address","address":"0x1402"}'
```

COUNTER64 的 CPU 地址为 0x1000 + (0x1000 + 8) / 4 = 0x1402；原生偏移为 8 字节。readConsistency 是示例作者对虚构硬件的显式断言，不是工具证明的硬件能力。
