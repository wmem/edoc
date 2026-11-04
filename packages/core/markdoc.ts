import Markdoc from '@markdoc/markdoc';
import './markdoc-types.ts';
import type {Config,Node,ConfigFunction,ParserArgs} from '@markdoc/markdoc';
import {failure,EdocError} from './errors.ts';

// 配置中的 AST/函数保留原生类型；片段也可用工程相对路径，方便追踪依赖。
export type MarkdocOptions={variables?:Record<string,unknown>;functions?:Record<string,ConfigFunction>;partials?:Record<string,string|Node|Node[]>;validation?:Config['validation'];tags?:Config['tags'];tokenizer?:ConstructorParameters<typeof Markdoc.Tokenizer>[0];parse?:Omit<ParserArgs,'file'>};
export function markdocOptions(value:unknown,file:string):MarkdocOptions{
 if(value===undefined)return {};
 const record=(v:any)=>v!==null&&typeof v==='object'&&!Array.isArray(v);
 if(!record(value))failure('CONFIG_TYPE',file,'/markdoc','markdoc 需要配置对象');
 const input=value as Record<string,any>;
 const isNode=(v:any)=>v?.$$mdtype==='Node'&&typeof v.walk==='function';
 for(const key of Object.keys(input))if(!['variables','functions','partials','validation','tags','tokenizer','parse'].includes(key))failure('CONFIG_FIELD',file,'/markdoc/'+key,'未知 Markdoc 配置项：'+key);
 for(const [key,item]of Object.entries(input))if(!record(item))failure('CONFIG_TYPE',file,'/markdoc/'+key,'需要对象');
 for(const [name,fn]of Object.entries(input.functions??{}) as [string,any][])if(!record(fn)||fn.transform!==undefined&&typeof fn.transform!=='function')failure('CONFIG_TYPE',file,'/markdoc/functions/'+name,'函数使用 Markdoc 函数定义对象');
 for(const [name,tag]of Object.entries(input.tags??{}) as [string,any][])if(!record(tag)||tag.transform!==undefined&&typeof tag.transform!=='function')failure('CONFIG_TYPE',file,'/markdoc/tags/'+name,'标签使用 Markdoc Schema 对象');
 for(const [name,part]of Object.entries(input.partials??{}))if(!(typeof part==='string'&&part.trim())&&!isNode(part)&&!(Array.isArray(part)&&part.every(isNode)))failure('CONFIG_TYPE',file,'/markdoc/partials/'+name,'片段需要工程相对路径或 Markdoc AST');
 return input;
}
export function nativeConfig(options:MarkdocOptions,tags:Record<string,any>):Config{
 return {...options,tags:{...Markdoc.tags,...options.tags,...tags},nodes:Markdoc.nodes,functions:{...Markdoc.functions,...options.functions}} as Config;
}
export function validateMarkdoc(ast:any,config:Config,file:string){
 const check=(results:any[])=>{
  // 上游 children 限制是 warning；不能把可正常使用的结构提升为构建错误。
  const errors=results.filter(e=>e.error.level==='error'||e.error.level==='critical');
  if(errors.length)throw new EdocError(errors.map(e=>({code:'DOCUMENT_TAG',file:e.location?.file??file,path:`#L${(e.lines?.[0]??0)+1}`,message:e.error.message})));
  return results;
 };
 const results=Markdoc.validate(ast,config);
 return results&&typeof (results as any).then==='function'?(results as any).then(check):check(results);
}
