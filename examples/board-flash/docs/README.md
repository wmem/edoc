# FPGA–Flash：P0 虚构协议样例

**本例完全虚构，不对应任何真实 FPGA、Flash 或板卡。所有 Ball/Pin 值都不能用于硬件设计。**

此阶段手工维护 IR，用于验证协议。它不是要求实际项目复制维护引脚数据。真实 EDA/约束源及 Adapter 在 P3 实现；图形在 P1 实现。

U1 表示演示 FPGA，U5 表示演示 Flash，J1 表示时钟测试端点。QSPI 六根真实独立信号分别保留为六条连接；FLASH_SCK 一条 Net 包含第三端点 J1.SCK，不拆成两条 Net。

精确端口值仅定义于 ir/objects.json，连接端点仅定义于 ir/relations.json，视图仅保存 ID 与显示策略。source 指向实际存在的本例手工 IR，不虚构原理图来源。

使用配置文件运行 validate/query。精确查询入口：board:U1.QSPI_CLK、board:net.FLASH_SCK、board:flash-wiring。label 可以改名；稳定 ID 不因展示名称改变。

P0 未提供表格、SVG、HTML、PDF，不能把协议验收当作图形可读性验收。
