// 限定 ANSI 声明子集的 RTL Adapter；不声称理解任意 SystemVerilog。
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
const root=process.cwd(),out=resolve(process.env.EDOC_IR_OUTPUT);mkdirSync(out,{recursive:true});
const text=readFileSync(join(root,'rtl/mac_example.sv'),'utf8'),params=Object.fromEntries([...text.matchAll(/parameter\s+(\w+)\s*=\s*(\d+)/g)].map(m=>[m[1],Number(m[2])]));
const sem=JSON.parse(readFileSync(join(root,'project/semantics.json'),'utf8'));
// 只解释原样例支持的整数、参数名、括号和 + - *，不执行 RTL/JavaScript。
function expr(expression){
 const tokens=expression.match(/\d+|[A-Za-z_]\w*|[()+*-]|\S/g)??[];let i=0;
 const atom=()=>{const t=tokens[i++];if(t==='('){const value=sum();if(tokens[i++]!==')')throw Error('表达式括号不闭合');return value;}if(/^\d+$/.test(t??''))return Number(t);if(Object.hasOwn(params,t))return params[t];throw Error('未支持的参数表达式');};
 const product=()=>{let v=atom();while(tokens[i]==='*'){i++;v*=atom();}return v;};
 const sum=()=>{let v=product();while(tokens[i]==='+'||tokens[i]==='-'){const op=tokens[i++],r=product();v=op==='+'?v+r:v-r;}return v;};
 const value=sum();if(i!==tokens.length||!Number.isSafeInteger(value))throw Error('未支持的参数表达式');return value;
}
const ports=[];
for(const [,direction,rng,name]of text.matchAll(/^\s*(input|output|inout)\s+logic\s*(\[[^\]]+\])?\s*(\w+)\s*[,)]?/gm)){
 const p={id:'mac:top.'+name,label:name,direction:{input:'in',output:'out',inout:'inout'}[direction],source:{file:'rtl/mac_example.sv',selector:'mac_example.'+name}};
 if(rng){const [a,b]=rng.slice(1,-1).split(':');p.widthExpr=rng;p.parameterContext=params;try{p.width=Math.abs(expr(a)-expr(b))+1;}catch{/* 未解析宽度保留表达式，不猜测。 */}}
 else p.width=1;
 if(!['clk','aresetn'].includes(name))p.clockDomainId='mac:top.'+sem.clock;ports.push(p);
}
if(!ports.length)throw Error('未找到受支持的端口声明');
const node={id:'mac:top',kind:'node',label:'MAC component',ports,source:{file:'rtl/mac_example.sv',selector:'mac_example'}};
const table={id:'mac:port-table',kind:'table',label:'RTL 接口投影',columns:[['label','信号','string'],['direction','方向','string'],['width','位宽','number'],['widthExpr','参数表达式','string']].map(([field,label,type])=>({field,label,type})),rows:ports.map(p=>({id:'mac:row.'+p.label,objectId:p.id}))};
const wave={id:'mac:tx-handshake',kind:'waveform',label:'AXI-Stream 握手与反压',format:'wavejson',semantic:'specification',source:{file:'project/handshake.json',selector:'handshake'},data:JSON.parse(readFileSync(join(root,'project/handshake.json'),'utf8'))};
const resources={objects:{objects:[node,...sem.nodes,...sem.groups]},relations:{relations:sem.relations},views:{views:sem.views},tables:{tables:[table]},waveforms:{waveforms:[wave]},references:{references:sem.references}};
for(const [name,data]of Object.entries(resources))writeFileSync(join(out,name+'.json'),JSON.stringify(data,null,2)+'\n');
writeFileSync(join(out,'manifest.json'),JSON.stringify({irVersion:'1.0',projectId:'mac-demo',adapterVersion:'1.0',resources:Object.keys(resources).map(type=>({type,path:type+'.json'})),entryDocuments:['docs/README.mdoc','docs/SPEC.mdoc','docs/ARCH.mdoc','docs/VERIFY.mdoc']},null,2)+'\n');
