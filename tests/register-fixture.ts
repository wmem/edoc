import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {specimen} from './specification-fixture.ts';
import {samplePdf} from './reader-fixture.ts';
export const registerData={registers:[
 {id:'reg:CTRL',kind:'register',label:'CTRL',width:32,gapPolicy:'reserved',description:'虚构控制寄存器。',source:{file:'contract.txt',selector:'CTRL',attachment:{id:'original',target:'detail'}},fields:[
  {id:'reg:CTRL.EN',label:'ENABLE_CAPTURE_长中文字段名',msb:0,lsb:0,access:'RW',reset:{value:'0x0'},description:'控制开关。'},
  {id:'reg:CTRL.MODE',label:'MODE',msb:7,lsb:4,access:'RW',reset:{expression:'DEFAULT_MODE'},description:'保留原表达式，不求值。'},
  {id:'reg:CTRL.EVENT',label:'EVENT',msb:16,lsb:16,access:'W1C',reset:{unknown:true}},
  {id:'reg:CTRL.COUNT',label:'COUNT',msb:31,lsb:24,access:'RO'}
 ]},
 {id:'reg:STAT',kind:'register',label:'STAT64',width:64,fields:[
  {id:'reg:STAT.TOP',label:'TOP',msb:63,lsb:60,access:'RO',reset:{value:'0xF'}},
  {id:'reg:STAT.CROSS',label:'跨越位带的完整字段定义',msb:35,lsb:28,access:'RW',reset:{value:'0xA5'}},
  {id:'reg:STAT.EN',label:'EN',msb:0,lsb:0}
 ]},
 {id:'reg:FULL',kind:'register',label:'FULL64',width:64,fields:[{id:'reg:FULL.DATA',label:'DATA',msb:63,lsb:0,reset:{value:'0xFEDCBA9876543210'}}]}
],tables:[{id:'instances',kind:'table',label:'实例导航',columns:[{field:'instance',label:'实例',type:'string'},{field:'name',label:'寄存器',type:'string'},{field:'origin',label:'来源',type:'string'}],rows:[{id:'instance:UART0',values:{instance:'UART0',name:'**CTRL**',origin:'查看原文'},links:{instance:{kind:'entity',id:'reg:template'},name:{kind:'entity',id:'reg:CTRL'},origin:{kind:'source',id:'reg:CTRL.EN'}}},{id:'instance:UART1',values:{instance:'UART1',name:'字段定义',origin:'外部工程'},links:{name:{kind:'page',id:'docs/index',anchor:'reg:CTRL.MODE'},origin:{kind:'entity',project:'unloaded',id:'external'}}}]}]};
export const registerBody=`{% section id="manual" title="寄存器手册" %}
{% data-table id="instances" /%}
{% section id="reg:template" title="UART寄存器模板" %}
{% register-diagram id="reg:CTRL" /%}
{% register-field-table id="reg:CTRL" /%}
{% /section %}
{% section id="wide" title="64位定义" %}
{% register-diagram id="reg:STAT" /%}
{% register-field-table id="reg:STAT" /%}
{% register-diagram id="reg:FULL" /%}
{% /section %}
{% /section %}`;
export function registerFixture(t:any,data:unknown=registerData,body=registerBody){const p=specimen(t,body,JSON.stringify({attachments:{original:{type:'pdf',file:'original.pdf',targets:{detail:{page:2}}}},data}));p.write('contract.txt','虚构合同，仅用于工具测试。');writeFileSync(join(p.root,'original.pdf'),samplePdf());return p;}
