// 虚构板级 CSV → edoc；数值只来自项目源，不硬编码引脚或 Net。
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=process.cwd(),out=resolve(process.env.EDOC_IR_OUTPUT);mkdirSync(out,{recursive:true});
// 样例 CSV 支持引号、转义引号、字段内换行和 CRLF；不推断缺失字段。
function csvrows(name){
 const text=readFileSync(join(root,'board',name),'utf8'),rows=[],row=[];let field='',quoted=false,started=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'&&(quoted||!field)){started=true;if(quoted&&text[i+1]==='"'){field+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c===','||c==='\n'||c==='\r')){row.push(field);field='';if(c===',')started=true;else{if(started)rows.push(row.splice(0));else row.length=0;started=false;if(c==='\r'&&text[i+1]==='\n')i++;}}
  else{field+=c;started=true;}
 }
 if(quoted)throw Error('CSV 引号没有闭合');if(started||row.length){row.push(field);rows.push(row);}
 const header=rows.shift();return rows.map(values=>Object.fromEntries(header.map((key,i)=>[key,values[i]??''])));
}
const src=(name,selector)=>({file:'board/'+name,selector}),save=(name,data)=>writeFileSync(join(out,name),JSON.stringify(data,null,2)+'\n');
const devices=csvrows('devices.csv'),pins=csvrows('pins.csv'),nets=csvrows('nets.csv');
for(const rows of [devices,pins,nets])if(new Set(rows.map(r=>r.id)).size!==rows.length)throw Error('项目源存在重复 ID');
const objects=new Map(devices.map(d=>[d.id,{id:d.id,kind:'node',label:d.label,ports:[],source:src('devices.csv',d.id)}]));
const relations=new Map(nets.map(n=>[n.id,{id:n.id,kind:'connection',class:n.class,label:n.label,endpoints:[],source:src('nets.csv',n.id)}]));
const numbering=new Map(devices.map(d=>[d.id,d.numbering]));
for(const p of pins){
 if(!objects.has(p.device)||!relations.has(p.net))throw Error('源网表引用了未声明器件或 Net');
 if(!p.direction)throw Error('方向缺失，必须显式填写 unknown');
 const field=numbering.get(p.device);if(!['ball','pin'].includes(field)||!p[field])throw Error('物理编号缺失，请明确填写 unknown 或已知编号');
 const port={id:p.id,label:p.label,direction:p.direction,attributes:Object.fromEntries(['ball','pin','function'].filter(k=>p[k]).map(k=>[k,p[k]])),source:src('pins.csv',p.id)};
 if(p.width){if(!/^[+-]?\d+$/.test(p.width.trim()))throw Error('width 需要整数');port.width=Number(p.width);}
 objects.get(p.device).ports.push(port);relations.get(p.net).endpoints.push(p.id);
}
const projection=JSON.parse(readFileSync(join(root,'docs/projections.json'),'utf8')),views=JSON.parse(readFileSync(join(root,'docs/views.json'),'utf8'));
save('objects.json',{objects:[...objects.values(),...projection.groups]});save('relations.json',{relations:[...relations.values()]});save('views.json',views);save('tables.json',{tables:projection.tables});
save('manifest.json',{irVersion:'1.0',projectId:'demo-board',adapterVersion:'1.0',resources:['objects','relations','views','tables'].map(type=>({type,path:type+'.json'})),entryDocuments:['docs/README.md','docs/ARCH.mdoc']});
