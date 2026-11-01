# FPGA–Flash 工程样例

**本例为虚构工程，不对应厂商实际器件。所有 Ball/Pin 数值不能用于硬件设计。**

本工程实际使用 CSV 源文件运行项目 Adapter，演示三层分离：

- board/devices.csv 是器件身份与名称来源。
- board/pins.csv 是端口、Ball/Pin、功能名和端点所属 Net 的唯一来源。
- board/nets.csv 定义 Net 身份、名称和类别。
- docs/views.json 和 docs/projections.json 只定义视图、分组及表格投影引用。

修改引脚只需修改 pins.csv，重新 build/validate/query 会运行 Adapter。接口表、连接图与查询共用转换后的同一 IR。

时钟 Net 有三个端点；它仍然是一条连接关系。HTML 的 QSPI 总览只改变显示，展开后保留全部独立信号。source 指向实际存在的 CSV 文件和稳定选择器。

本例验证文档工具与 Adapter 契约，不替代真实板卡的电气审核。
