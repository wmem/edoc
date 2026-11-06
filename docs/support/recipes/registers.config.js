// 虚构寄存器定义：图、字段表和查询共用此数据，不代表真实硬件。
export default {data:{registers:[
 {id:'manual:ctrl',kind:'register',label:'CTRL · 控制',width:32,gapPolicy:'reserved',description:'控制采样开关、模式和事件状态。',source:{file:'docs/support/recipes/registers.config.js',selector:'manual:ctrl'},fields:[
  {id:'manual:ctrl.count',label:'COUNT',msb:31,lsb:24,access:'RO',description:'计数状态；未声明定义复位值。'},
  {id:'manual:ctrl.event',label:'EVENT',msb:16,lsb:16,access:'W1C',reset:{unknown:true},description:'显式声明复位状态未知。'},
  {id:'manual:ctrl.mode',label:'MODE',msb:7,lsb:4,access:'RW',reset:{expression:'DEFAULT_MODE'},description:'原样保留参数表达式，不求值。'},
  {id:'manual:ctrl.enable',label:'ENABLE_CAPTURE_采样使能',msb:0,lsb:0,access:'RW',reset:{value:'0x0'},description:'长名称在图例完整显示。'}
 ]},
 {id:'manual:status64',kind:'register',label:'STATUS64 · 跨位带字段',width:64,fields:[
  {id:'manual:status64.top',label:'TOP',msb:63,lsb:60,access:'RO',reset:{value:'0xF'}},
  {id:'manual:status64.cross',label:'跨越位带的完整字段',msb:35,lsb:28,access:'RW',reset:{value:'0xA5'},description:'各位带片段指向同一字段。'},
  {id:'manual:status64.enable',label:'EN',msb:0,lsb:0}
 ]},
 {id:'manual:full64',kind:'register',label:'DATA64 · 精确复位字面值',width:64,fields:[
  {id:'manual:full64.data',label:'DATA',msb:63,lsb:0,access:'RW',reset:{value:'0xFEDCBA9876543210'}}
 ]}
],tables:[{id:'manual:register-instances',kind:'table',label:'实例到模板和字段',columns:[{field:'instance',label:'实例',type:'string'},{field:'register',label:'寄存器',type:'string'},{field:'field',label:'字段',type:'string'},{field:'source',label:'来源',type:'string'}],rows:[
 {id:'manual:instance0',values:{instance:'采样器 0',register:'CTRL',field:'MODE 字段定义',source:'定义来源'},links:{instance:{kind:'entity',id:'use:registers:template'},register:{kind:'entity',id:'manual:ctrl'},field:{kind:'entity',id:'manual:ctrl.mode'},source:{kind:'source',id:'manual:ctrl.mode'}}},
 {id:'manual:instance1',values:{instance:'采样器 1',register:'STATUS64',field:'本文中的字段表',source:'示例 PDF'},links:{instance:{kind:'entity',id:'use:registers:template'},register:{kind:'entity',id:'manual:status64'},field:{kind:'page',id:'docs/usage/rendering/registers',anchor:'manual:status64.cross'},source:{kind:'pdf',id:'location',target:'detail'}}}
]}]}};
