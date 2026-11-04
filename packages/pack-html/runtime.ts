import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const scripts=new Map<string,string>();
// 安装包直接读取 prepare 生成的脚本；源码模式按需编译，修改前端后无需先打包 npm 包。
export async function browserScript(name:string,entry:string,define:Record<string,string>={}){
 if(scripts.has(name))return scripts.get(name)!;
 let script:string;
 if(import.meta.url.endsWith('.js'))script=readFileSync(new URL(`../../runtime/${name}.js`,import.meta.url),'utf8');
 else{
  const {build}=await import('vite');
  const result:any=await build({configFile:false,logLevel:'error',define,build:{write:false,minify:true,target:'es2024',lib:{entry:fileURLToPath(new URL(`../doc-theme/${entry}.ts`,import.meta.url)),formats:['iife'],name:'EdocReader'}}});
  script=(result.output??result[0].output).filter((c:any)=>c.type==='chunk').map((c:any)=>c.code).join('\n');
 }
 if(!script)throw new Error('浏览器资源打包失败：'+name);
 scripts.set(name,script);return script;
}
