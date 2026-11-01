import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,cpSync,mkdtempSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {loadIR,loadConfig,query} from '../packages/core/index.ts';
import {fixture,expectCode,repository} from './helpers.ts';
import {renderDocument,tableHTML} from '../packages/doc-theme/render.ts';
import {anchor} from '../packages/core/identity.ts';
import {assertSelfContained} from '../packages/pack-html/index.ts';
function doc(t:any,text:string){const f=fixture(t);writeFileSync(join(f.root,'docs/test.mdoc'),text);f.edit('manifest',d=>d.entryDocuments=['docs/test.mdoc']);return f;}
test('普通 Markdown、深层容器与稳定章节引用',async t=>{
 const f=doc(t,'{% section id="SPEC-1" title="条款" %}\n{% columns ratio="2:1" %}\n{% panel %}\n## 标题\n\n- 列表\n\n> 引用\n\n{% reference id="board:U1" /%}\n{% /panel %}\n{% panel %}\n说明\n{% /panel %}\n{% /columns %}\n{% /section %}');
 const g=f.load(),d=await renderDocument(g,'demo');assert.match(d.chapters,/<ul>/);assert.match(d.chapters,/<blockquote>/);assert.match(d.chapters,/class="columns"/);assert.ok(d.chapters.includes(anchor('SPEC-1')));assert.equal(query(g,'SPEC-1').target.type,'document');
});
for(const [name,text,code] of [
 ['未知标签','{% mystery /%}','DOCUMENT_TAG'],['未知属性','{% panel css="color:red" %}text{% /panel %}','DOCUMENT_TAG'],
 ['缺失图引用','{% diagram id="missing" /%}','DOCUMENT_REFERENCE'],['错误图类型','{% diagram id="board:U1" /%}','DOCUMENT_REFERENCE'],
 ['悬空文档引用','{% reference id="missing" /%}','DOCUMENT_REFERENCE'],['非法布局比例','{% columns ratio="100:1" %}text{% /columns %}','DOCUMENT_TAG'],
['外部图片','![pic](https://example.com/a.png)','DOCUMENT_IMAGE'],
 ] as const)test(name,t=>{const f=doc(t,text);expectCode(f.load,code);});
test('同 major 兼容 minor，未知必需资源依然失败',t=>{const f=fixture(t);f.edit('manifest',d=>d.irVersion='1.9');assert.equal(f.load().manifest.irVersion,'1.9');f.edit('manifest',d=>d.resources.push({type:'unknown',path:'x.json'}));expectCode(f.load,'SCHEMA');});
test('危险原生标记按文本处理，锚点无需百分号解码',async t=>{const f=doc(t,'<script>alert(1)</script>\n\n{% section id="名字:1" title="名称" %}正文{% /section %}');const d=await renderDocument(f.load(),'x');assert.ok(!d.chapters.includes('<script>'));assert.match(anchor('名字:1'),/^ed-[0-9a-f]+$/);});
test('单文件静态扫描拒绝外部依赖',()=>{assert.throws(()=>assertSelfContained('<script src="https://cdn/x.js"></script>'));assert.throws(()=>assertSelfContained('<style>x{background:url(local.png)}</style>'));assertSelfContained('<a href="https://example.com">普通外链不是运行依赖</a>');});

test('Markdown 禁止 javascript 链接被解析为可执行 href',async t=>{const f=doc(t,'[link](javascript:alert)');const d=await renderDocument(f.load(),'x');assert.ok(!d.chapters.includes('href=\"javascript:'));});
test('未来兼容 minor 保留可选字段，拒绝未知必需能力',t=>{
 const f=fixture(t);f.edit('manifest',d=>{d.irVersion='1.1';d.futureOptional='metadata';});f.edit('objects',d=>d.objects[0].futureOptional=true);assert.equal((f.load().index.get('board:U1')?.entity as any).futureOptional,true);
 f.edit('manifest',d=>d.requiredFeatures=['future-executable']);expectCode(f.load,'IR_FEATURE');
});
