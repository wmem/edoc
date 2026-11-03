import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {licenses} from './licenses.ts';
import {build} from 'vite';
import type {Graph} from '../core/types.ts';
import {renderDocument} from '../doc-theme/render.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../render-graph/index.ts';
import {renderTOC} from '../doc-theme/toc.ts';
const directory=dirname(fileURLToPath(import.meta.url));
const scripts=new Map<boolean,string>();
async function client(interfaces:boolean){
 if(scripts.has(interfaces))return scripts.get(interfaces)!;
 const extension=import.meta.url.endsWith('.ts')?'ts':'js';
 const result:any=await build({configFile:false,logLevel:'error',build:{write:false,minify:true,target:'es2022',lib:{entry:resolve(directory,`../doc-theme/${interfaces?'client-interface-entry':'client-entry'}.${extension}`),formats:['iife'],name:'edoc'}}});
 const chunks=result.output??result[0]?.output;
 const script=chunks.filter((c:any)=>c.type==='chunk').map((c:any)=>c.code).join('\n');
 if(!script)throw new Error('浏览器资源打包失败');scripts.set(interfaces,script);return script;
}
export async function html(graph:Graph,title:string,options:{compactIndex?:boolean}={}){
 const doc=await renderDocument(graph,title,options);
 const toc=renderTOC(doc.outline),printTOC=renderTOC(doc.outline,false);
 const json=JSON.stringify({scenes:doc.scenes,entities:doc.entities}).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 const css=readFileSync(resolve(directory,'../doc-theme/style.css'),'utf8');
 const result=`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'"><title>${esc(title)}</title><style>${fontCSS()}${css}</style></head><body><nav class="sidebar"><div class="brand">edoc</div><div class="version">V1 · IR ${esc(graph.manifest.irVersion)} · tags 1.0<br>Adapter ${esc(graph.manifest.adapterVersion??'manual')}</div><input type="search" id="search" placeholder="搜索章节、对象与引脚" aria-label="搜索"><div id="results"></div><div id="toc">${toc}</div></nav><main><header class="cover"><div class="eyebrow">ENGINEERING DOCUMENT</div><h1>${esc(title)}</h1><p>${esc(graph.manifest.projectId)} · 同源工程事实 / 图形 / 查询</p><p>离线单文件 · 只读 · IR ${esc(graph.manifest.irVersion)}</p></header><div class="print-toc"><p class="print-toc-title">目录</p>${printTOC}</div>${doc.chapters}<section class="appendix${options.compactIndex?' compact':''}"><h2>工程对象索引</h2>${doc.facts}</section></main><aside class="properties"><h3>对象属性</h3><p>点击节点或连线查看来源与完整关系。</p><a id="object-link" hidden>跳转到工程对象</a><div id="selection-actions"></div><pre id="properties">选择图中对象查看工程属性</pre></aside><script id="edoc-licenses" type="application/json">${JSON.stringify(licenses()).replace(/</g,'\\u003c')}</script><script id="edoc-data" type="application/json">${json}</script><script>${(await client(Object.values(doc.scenes).some(s=>!!s.interfaceModel))).replace(/<\/script/gi,'<\\/script')}</script></body></html>`;
 assertSelfContained(result);return result;
}
export function assertSelfContained(document:string){
 if(/<(?:script|link|iframe|object|embed|source)\b[^>]*(?:src|href|data)\s*=\s*["'](?!data:|#)/i.test(document))throw new Error('HTML 含外部运行资源');
 if(/url\(\s*["']?(?!data:|#)[^)]/i.test(document.replace(/<script[\s\S]*?<\/script>/gi,'')))throw new Error('CSS 含外部资源');
 if(/<img\b[^>]*src=["'](?!data:)/i.test(document))throw new Error('图片未内联');
}
