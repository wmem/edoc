import {esc} from './html.ts';

// 保留构建期链接检查和条款别名；浏览器绘制时用真实 SVG 整体替换占位内容。
export function svgAnchors(html:string){
 return [...html.matchAll(/(?<![\w:-])id="([^"]+)"/g)].map(match=>`<span hidden id="${match[1]}"></span>`).join('');
}
export function namespacePendingSVG(html:string,namespace:string){
 return html.replace(/data-svg-namespace="([^"]*)"/g,(_all,previous)=>`data-svg-namespace="${esc(namespace)}${previous.startsWith(esc(namespace))?previous.slice(esc(namespace).length):previous}"`);
}
