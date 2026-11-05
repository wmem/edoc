import type {Navigation} from '../core/book.ts';
import type {ReadOptions} from '../core/read.ts';

export function outlineText(nodes:Navigation[],level=0):string[]{
 return nodes.flatMap(n=>['  '.repeat(level)+n.label+(n.sectionId?` [${n.project} / ${n.sectionId}]`:n.source?` [标题 ${n.source.file}:${n.source.line}]`:' [目录分组]')+(n.childrenOmitted?`（另有 ${n.childrenOmitted} 个子项）`:''),...outlineText(n.children,level+1)]);
}
export function readText(result:{title:string;source:{file:string;line:number};scope:NonNullable<ReadOptions['scope']>;content:string;children:{id:string;title:string}[];applications?:{for:string;common:string[];specific:string[]}[];range:{offset:number;returnedChars:number;totalChars:number;truncated:boolean;nextOffset:number|null}}){
 return `# ${result.title}\n来源：${result.source.file}:${result.source.line}\n范围：${result.scope}；字符 ${result.range.offset}–${result.range.offset+result.range.returnedChars}/${result.range.totalChars}\n`+
 (result.scope==='self'&&result.children.length?`仅本节正文；${result.children.length} 个子章节未展开，请按需读取其条件、例外与细节。\n`:'')+
 (result.applications?.length?'适用规范：'+result.applications.map(set=>`${set.for}（公共：${set.common.join('、')||'无'}；专属：${set.specific.join('、')||'无'}）`).join('；')+'\n':'')+
 `\n${result.content}\n`+(result.children.length?'\n子章节：'+result.children.map(c=>`${c.id}（${c.title}）`).join('、')+'\n':'')+(result.range.truncated?`\n正文已截断；继续：--offset ${result.range.nextOffset}\n`:'');
}
