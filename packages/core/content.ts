import Markdoc from '@markdoc/markdoc';
// 已投影的 AST 转回可读 Markdoc；内部来源、作用域与渲染键不进入用户正文。
const prose=(value:any):string=>typeof value==='string'||typeof value==='number'?String(value):Array.isArray(value)?value.map(prose).join(''):Markdoc.Tag.isTag(value)?prose(value.children):'';
export function copyContent(node:any,visit?:(node:any)=>boolean):any{
 if(visit?.(node)===false)return;
 const result=new Markdoc.Ast.Node(node.type,Object.fromEntries(Object.entries(node.attributes).filter(([key])=>!key.startsWith('__edoc'))),[...Object.values(node.slots??{}),...node.children??[]].map(child=>copyContent(child,visit)).filter(Boolean),node.tag);
 if(result.type==='text'&&typeof result.attributes.content!=='string')result.attributes.content=prose(result.attributes.content);
 result.inline=node.inline;result.annotations=node.annotations.filter((a:any)=>!a.name?.startsWith('__edoc'));
 if(result.type==='fence'&&result.attributes.process===false){result.annotations=result.annotations.filter((a:any)=>a.name!=='process');result.annotations.push({type:'attribute',name:'process',value:false});}
 return result;
}
export const formatContent=(nodes:any[],visit?:(node:any)=>boolean)=>Markdoc.format(nodes.map(node=>copyContent(node,visit)).filter(Boolean)).trim();
