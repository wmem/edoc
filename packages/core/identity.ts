// 对稳定 ID 进行可逆 UTF-8 编码，避免 URL 百分号解码改变文内锚点；不是内容 hash。
export const anchor=(id:string)=>'ed-'+Array.from(new TextEncoder().encode(id),b=>b.toString(16).padStart(2,'0')).join('');
export const anchorCandidates=(id:string)=>[id,anchor(id),'heading-'+id.toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu,'-').replace(/^-|-$/g,'')];

// 源文规范的局部 ID 可从其他页面引用；实例自己的前缀 ID 仍精确定位。
export function resolveHTMLAnchor(html:string,id:string,aliases:Record<string,string>={}){
 const escaped=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
 for(const candidate of anchorCandidates(id))if(html.includes('id="'+escaped(candidate)+'"'))return candidate;
 for(const candidate of anchorCandidates(id))if(Object.hasOwn(aliases,candidate)&&html.includes('id="'+escaped(aliases[candidate])+'"'))return aliases[candidate];
}
