import {specimen} from './specification-fixture.ts';
export const tableData={objects:[{id:'device',kind:'node',label:'投影对象',attributes:{count:12}}],tables:[{
 id:'T',kind:'table',label:'测试参数表',columns:[{field:'name',label:'项目',type:'string'},{field:'value',label:'数量',type:'number'},{field:'flag',label:'启用',type:'boolean'},{field:'meta',label:'补充',type:'json'},{field:'note',label:'备注',type:'string'}],rows:[
  {id:'r0',values:{name:'U10',value:10,flag:true,meta:{group:'core'},note:'unknown'}},
  {id:'r1',values:{name:'U2',value:2,flag:false,meta:null,note:''}},
  {id:'r2',values:{name:'U1',value:2,flag:true,meta:{group:'edge'},note:'<img src=x onerror=alert(1)>'}},
  {id:'r3',values:{name:'U3',value:0,flag:false,meta:[],note:'正常'}},
  {id:'r4',values:{name:'U0'}}
 ]
},{id:'P',kind:'table',label:'对象投影',columns:[{field:'label',label:'名称',type:'string'},{field:'attributes.count',label:'数量',type:'number'}],rows:[{id:'projection',objectId:'device'}]}]};
export const tableBody=`{% section id="table:home" title="交互表格" %}
{% data-table id="T" /%}

{% page id="docs/index" anchor="r4" label="定位缺失行" /%}
{% reference id="r1" label="行事实" /%}
[其他文章](other.mdoc)

{% section id="table:repeat" title="重复展示" collapsed=true %}
{% data-table id="T" /%}
{% /section %}

{% data-table id="T" sortable=false filterable=false /%}
{% data-table id="P" /%}

| 普通表 | 不增强 |
| --- | --- |
| 正文 | 不创建交互 |
{% /section %}`;
export function tableFixture(t:any){const p=specimen(t,tableBody,JSON.stringify({data:tableData}));p.write('docs/other.mdoc','# 其他文章\n独立阅读。');return p;}
