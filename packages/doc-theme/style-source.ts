// 离线页内嵌样式，预览页复用同源样式资源；SVG 导出均携带实际字体规则。
export function documentStyle(){
 const element=document.getElementById('edoc-document-style');
 return element instanceof HTMLLinkElement?[...element.sheet?.cssRules??[]].map(rule=>rule.cssText).join('\n'):element?.textContent??'';
}
