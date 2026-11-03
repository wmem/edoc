import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
export function samplePdf(){
 const objects=[
 '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(core) [7 0 R /FitR 100 400 300 600]] >> >> >>',
 '<< /Type /Pages /Count 3 /Kids [3 0 R 5 0 R 7 0 R] >>'];
 for(let i=0;i<3;i++){objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] ${i===1?'/CropBox [20 30 580 780] /Rotate 90 ':''}/Resources << /Font << /F1 9 0 R >> >> /Contents ${4+i*2} 0 R >>`);const text=`BT /F1 24 Tf 80 720 Td (SCHEMATIC PAGE ${i+1}) Tj ET\n1 0 0 RG 3 w 100 400 200 200 re S\n0 0 0 RG 1 w 100 500 m 300 500 l S\nBT /F1 16 Tf 130 530 Td (POWER INPUT) Tj ET`;objects.push(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);}
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let pdf='%PDF-1.7\n',offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(pdf);
}
export function readerFixture(t?:{after:(fn:()=>void)=>void},directory?:string){
 const root=directory??mkdtempSync(join(tmpdir(),'edoc-reader-'));if(t)t.after(()=>rmSync(root,{recursive:true,force:true}));
 const write=(file:string,value:unknown)=>{const path=join(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.isBuffer(value)?value:typeof value==='string'?value:JSON.stringify(value,null,2));};
 const config=(id:string,extra='')=>`export default {projectId:'${id}',title:'${id} 工程',documents:'docs',${extra}};`;
 write('edoc.config.js',config('system',`children:{fpga:'fpga/edoc.config.js',board:'board/edoc.config.js'},`));
 write('docs/index.mdoc','{% section id="system-intro" title="仓库级说明" %}\n父工程自己的正文。\n\n[仓库架构](architecture.mdoc)\n{% /section %}\n{% section id="components" title="工程组成" %}\n{% include project="fpga" /%}\n{% include project="board" /%}\n{% /section %}');
 write('docs/architecture.mdoc','# 仓库架构\n父工程独立的第二篇正文。\n');
 write('fpga/edoc.config.js',config('fpga',`children:{core:'core/edoc.config.js'},attachments:{schematic:{type:'pdf',file:'source/schematic.pdf',title:'原理图原文',targets:{power:{page:3,rect:[.15,.2,.6,.55]},named:{destination:'core'},rotated:{page:2,rect:[.2,.2,.5,.5]}}}},`));
 write('fpga/docs/index.mdoc','{% section id="module" title="FPGA 概览" %}\nCHILD_LOCAL_ONLY\n\n[详细接口](interfaces.mdoc#握手)\n\n{% reference project="board" id="device" label="核对板卡器件" /%}\n\n{% reference project="unknown" id="missing" label="未包含的工程" /%}\n\n{% attachment id="schematic" target="power" label="核对电源原理图" /%}\n\n{% attachment id="schematic" target="named" label="命名位置" /%}\n\n{% attachment id="schematic" target="rotated" label="旋转页定位" /%}\n\n{% attachment project="board" id="absent" label="外部原理图" /%}\n\n{% diagram id="overview" /%}\n{% include project="core" /%}\n{% /section %}');
 write('fpga/docs/interfaces.mdoc','# 详细接口\n\n## 握手\n\nINTERFACE_PAGE_ONLY\n\n{% section id="fold" title="折叠参考" collapsed=true %}\n完整参考内容。\n{% /section %}\n');
 write('fpga/docs/protocols/index.mdoc','# 协议目录\n');write('fpga/docs/protocols/axi.mdoc','# AXI 规范\nPROTOCOL_ONLY\n');
 const facts=(name:string)=>({objects:[{id:'device',kind:'node',label:name,ports:[{id:'device.out',label:'OUT',direction:'out',width:8}],interfaces:[{id:'bus',label:'BUS',members:['device.out']}]},{id:'memory',kind:'node',label:'Memory',ports:[{id:'memory.in',label:'IN',direction:'in',width:8}],interfaces:[{id:'sink',label:'SINK',members:['memory.in']}]}],relations:[{id:'data',kind:'connection',class:'data',label:'DATA',endpoints:['device.out','memory.in'],direction:{sources:['device.out'],targets:['memory.in']}}],views:[{id:'overview',kind:'interface',display:{interfaceMode:'collapsed'},include:{objects:['device','memory'],relations:['data']}}]});
 const fpgaFacts=facts('FPGA DEVICE');(fpgaFacts.objects[0]as any).source={file:'source/original-netlist.txt',selector:'device',attachment:{id:'schematic',target:'power'}};write('fpga/docs/ir/design.json',fpgaFacts);write('fpga/source/schematic.pdf',samplePdf());
 write('fpga/core/edoc.config.js',config('core'));write('fpga/core/docs/index.mdoc','# 内核说明\nGRANDCHILD_ONLY\n');
 write('board/edoc.config.js',config('board'));write('board/docs/index.mdoc','# 板卡概览\nBOARD_ONLY\n\n{% reference project="fpga" id="device" label="返回 FPGA 器件" /%}\n\n{% diagram id="overview" /%}');write('board/docs/ir/design.json',facts('BOARD DEVICE'));
 return {root,write};
}
