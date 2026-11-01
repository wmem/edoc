// 文档适配样例，不是可用的 MAC 实现。接口字段由此文件唯一提供。
module mac_example #(
 parameter DATA_WIDTH = 64,
 parameter KEEP_WIDTH = 8
)(
 input logic clk,
 input logic aresetn,
 input logic [DATA_WIDTH-1:0] s_axis_tdata,
 input logic [KEEP_WIDTH-1:0] s_axis_tkeep,
 input logic s_axis_tvalid,
 input logic s_axis_tlast,
 output logic s_axis_tready,
 output logic [DATA_WIDTH-1:0] m_axis_tdata,
 output logic [KEEP_WIDTH-1:0] m_axis_tkeep,
 output logic m_axis_tvalid,
 output logic m_axis_tlast,
 input logic m_axis_tready,
 input logic [31:0] paddr,
 input logic [31:0] pwdata,
 input logic psel,
 input logic penable,
 input logic pwrite,
 output logic [31:0] prdata,
 output logic pready
);
endmodule
