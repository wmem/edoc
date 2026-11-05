import type {Reference,Source} from '../core/types.ts';
import {routeHash} from '../core/routes.ts';

const esc=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
// Reference 只表达数据声明的语义关联，不转换成硬件连接或验证结论。
export function semanticReferencesHTML(project:string,records:{entity:unknown}[],entities:Record<string,any>){
 const endpoint=(id:string)=>`<a href="${esc(routeHash({kind:'entity',project,id}))}">${esc(Object.hasOwn(entities,id)?entities[id].label??id:id)}</a><code class="reference-endpoint-id">${esc(id)}</code>`;
 const source=(value?:Source)=>value?`<code>${esc(value.file)}</code>${value.line?`<span>行 ${value.line}</span>`:''}${value.selector?`<span>定位：${esc(value.selector)}</span>`:''}${value.attachment?`<a href="${esc(routeHash({kind:'pdf',project:value.attachment.project??project,id:value.attachment.id,...(value.attachment.target?{target:value.attachment.target}:{})}))}">原始 PDF</a>`:''}`:'未声明';
 const rows=records.map(record=>record.entity as Reference).map(ref=>`<tr data-reference-id="${esc(ref.id)}"><td data-label="关联类别"><code>${esc(ref.class)}</code><a class="reference-record" href="${esc(routeHash({kind:'entity',project,id:ref.id}))}">关联详情</a></td><td data-label="方向与对象">${endpoint(ref.fromId)}<span class="reference-arrow" aria-label="关联指向">→</span>${endpoint(ref.targetId)}</td><td data-label="说明与证据范围">${ref.label?esc(ref.label):'未声明'}</td><td class="reference-source" data-label="来源">${source(ref.source)}</td></tr>`).join('');
 return `<section class="semantic-references" data-semantic-references><h2>语义引用（${records.length}）</h2><p class="reference-note">类别、说明与证据范围按数据原文显示；不据此推断验证结果，未声明的范围不作补全。</p>${rows?`<table><thead><tr><th>关联类别</th><th>方向与对象</th><th>说明与证据范围</th><th>来源</th></tr></thead><tbody>${rows}</tbody></table>`:'<p>当前对象没有语义引用。</p>'}</section>`;
}
