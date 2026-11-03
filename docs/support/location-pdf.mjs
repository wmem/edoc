// 可重建的虚构 PDF 原文件；运行 node docs/support/location-pdf.mjs。
import {writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname} from 'node:path';
const target=fileURLToPath(new URL('../assets/location.pdf',import.meta.url));
const stream=text=>`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
const objects=[
 '<< /Type /Catalog /Pages 2 0 R /Names << /Dests << /Names [(DETAIL) [5 0 R /FitR 92 277 459 594]] >> >> >>',
 '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',
 stream('BT /F1 24 Tf 60 700 Td (edoc PDF location example) Tj 0 -50 Td /F1 14 Tf (Fictional reference file - not a circuit design.) Tj 0 -30 Td (The target DETAIL is on physical page 2.) Tj ET'),
 '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',
 stream('BT /F1 24 Tf 60 700 Td (Page 2 - DETAIL) Tj ET\n0.95 0.98 1 rg 92 277 367 317 re f\n0.1 0.4 0.6 RG 2 w 92 277 367 317 re S\n0.1 0.2 0.3 rg BT /F1 18 Tf 120 450 Td (Stable target: detail) Tj 0 -35 Td /F1 12 Tf (Normalized rectangle: 0.15 0.25 0.75 0.65) Tj 0 -35 Td (Use browser Back to return to the article.) Tj ET'),
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
];
let result='%PDF-1.7\n',offsets=[0];
objects.forEach((object,index)=>{offsets.push(Buffer.byteLength(result));result+=`${index+1} 0 obj\n${object}\nendobj\n`;});
const xref=Buffer.byteLength(result);
result+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
result+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
mkdirSync(dirname(target),{recursive:true});writeFileSync(target,result);
