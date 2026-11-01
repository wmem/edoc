import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import WaveDrom from 'wavedrom';
import type {Waveform} from '../packages/core/types.ts';
import {waveform} from '../packages/render-wave/index.ts';
import {html} from '../packages/pack-html/index.ts';
import {fixture,save,repository} from './helpers.ts';
const data=JSON.parse(readFileSync(join(repository,'examples/fpga-mac/project/handshake.json'),'utf8'));
const wave:Waveform={id:'wave:handshake',kind:'waveform',label:'握手与反压',format:'wavejson',semantic:'specification',data,source:{file:'examples/fpga-mac/project/handshake.json'}};

test('波形图元保留真实 skin 描边与总线填色，输出不产生全局样式',()=>{
 const output=waveform(wave,0);
 assert.ok(!output.includes('<style'));
 assert.match(output,/<path[^>]*class="s1"[^>]*style="[^"]*fill:none;stroke:#000;stroke-width:1/);
 assert.match(output,/class="s8"[^>]*style="[^"]*fill:#ffffb4/);
 assert.ok(output.includes('规范示意'));assert.ok(output.includes('frame data'));
});

test('重复波形实例的 defs、use 和箭头引用隔离，不修改数据或共享 skin',()=>{
 const original=structuredClone(wave),skin=structuredClone(WaveDrom.waveSkin);
 const marked={...wave,data:{...data,signal:data.signal.map((s:any,i:number)=>({...s,...(i===1?{node:'.a......'}:i===2?{node:'....b...'}:{})})),edge:['a~>b handshake']}};
 const markedOriginal=structuredClone(marked);
 const outputs=[waveform(marked,3),waveform(marked,4)],sets=outputs.map(s=>new Set([...s.matchAll(/\sid="([^"]+)"/g)].map(m=>m[1])));
 assert.ok(sets[0].size>20);assert.equal([...sets[0]].filter(id=>sets[1].has(id)).length,0);
 for(let i=0;i<outputs.length;i++){
  for(const m of outputs[i].matchAll(/(?:xlink:href|href)="#([^"]+)"/g))assert.ok(sets[i].has(m[1]),m[1]);
  for(const m of outputs[i].matchAll(/url\(#([^)]+)\)/g))assert.ok(sets[i].has(m[1]),m[1]);
 }
 assert.deepEqual(marked,markedOriginal);assert.deepEqual(wave,original);assert.deepEqual(WaveDrom.waveSkin,skin);
});

test('Chromium 实际像素保留时钟阶梯与浅色总线，双实例和打印不丢样式',{timeout:40000},async t=>{
 const f=fixture(t);writeFileSync(join(f.root,'trace.json'),JSON.stringify(data));
 save(join(f.ir,'waveforms.json'),{waveforms:[{...wave,source:{file:'trace.json'}}]});
 f.edit('manifest',d=>{d.resources.push({type:'waveforms',path:'waveforms.json'});d.entryDocuments=['docs/waves.mdoc'];});
 writeFileSync(join(f.root,'docs/waves.mdoc'),'{% section id="waves" title="重复波形" %}\n{% waveform id="wave:handshake" /%}\n{% waveform id="wave:handshake" /%}\n{% /section %}');
 const dir=mkdtempSync(join(tmpdir(),'engdoc-wave-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'waves.html');writeFileSync(file,await html(f.load(),'波形回归'));
 const browser=await chromium.launch({executablePath:process.env.ENGDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());
 const context=await browser.newContext({offline:true,viewport:{width:1600,height:1000}}),page=await context.newPage();
 await page.goto(pathToFileURL(file).href);await page.waitForFunction(()=>window.EngDocReady);
 const result=await page.evaluate(async()=>{
  const samples=[];
  for(const svg of document.querySelectorAll<SVGSVGElement>('.wave svg')){
   const uses=[...svg.querySelectorAll<SVGUseElement>('use')],ref=(u:SVGUseElement)=>u.getAttribute('href')??u.getAttribute('xlink:href')!;
   for(const u of uses){const target=document.getElementById(ref(u).slice(1));if(!target||target.closest('svg')!==svg)throw new Error('use 引用了其他波形或不存在的图元');}
   const pclk=uses.find(u=>ref(u).endsWith('-pclk'))!,bus=uses.find(u=>ref(u).endsWith('-vvv-3'))!;
   const point=(use:SVGUseElement,x:number,y:number)=>new DOMPoint(x,y).matrixTransform(svg.getCTM()!.inverse().multiply(use.getCTM()!));
   const positions=[point(pclk,5,5),point(pclk,10,0),point(bus,10,10)];
   const blob=new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}),url=URL.createObjectURL(blob),img=new Image();img.src=url;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=svg.viewBox.baseVal.width;canvas.height=svg.viewBox.baseVal.height;const ctx=canvas.getContext('2d')!;ctx.drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);
   samples.push(positions.map(p=>[...ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data]));
  }
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);
  const foreign=document.createElementNS('http://www.w3.org/2000/svg','svg'),text=document.createElementNS(foreign.namespaceURI,'text');text.setAttribute('class','h1');text.textContent='正文外图形';foreign.append(text);document.body.append(foreign);
  return {samples,unique:ids.length===new Set(ids).size,normalSize:getComputedStyle(text).fontSize,bodySize:getComputedStyle(document.body).fontSize};
 });
 assert.equal(result.samples.length,2);assert.equal(result.unique,true);assert.equal(result.normalSize,result.bodySize);
 for(const [inside,stroke,bus]of result.samples){assert.ok(inside.slice(0,3).every(c=>c>240),'时钟路径内部应为空白，不能被填成黑色三角形');assert.ok(stroke.slice(0,3).every(c=>c<100),'时钟边界必须保留真实描边');assert.ok(bus[0]>230&&bus[1]>230&&bus[2]>80&&bus[2]<230,'总线应为 skin 浅色填充，不能变成黑色块');}
 await page.emulateMedia({media:'print'});
 assert.ok(await page.locator('.wave svg defs .s1').evaluateAll(paths=>paths.every(p=>getComputedStyle(p).fill==='none'&&getComputedStyle(p).stroke==='rgb(0, 0, 0)')));
});
