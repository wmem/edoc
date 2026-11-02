// Git/npm 安装前构建可直接执行的 JS；不要求使用者修补 node_modules 或安装 TS 启动器。
import {readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,cpSync,chmodSync,existsSync} from 'node:fs';
import {dirname,resolve,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),output=join(root,'dist');
rmSync(output,{recursive:true,force:true});mkdirSync(output,{recursive:true});
const walk=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(join(dir,e.name)):[join(dir,e.name)]);
let count=0;
for(const file of walk(join(root,'packages'))){
 if(file.endsWith('.d.ts'))continue;
 const target=join(output,relative(root,file));mkdirSync(dirname(target),{recursive:true});
 if(extname(file)==='.ts'){
  const code=stripTypeScriptTypes(readFileSync(file,'utf8'),{mode:'strip',sourceUrl:file}).replace(/((?:from\s*|import\s*)['"][^'"]+)\.ts(['"])/g,'$1.js$2');
  writeFileSync(target.slice(0,-3)+'.js',code.replace(/(\bimport\s*\(\s*['"][^'"]+)\.ts(['"]\s*\))/g,'$1.js$2'));count++;
 }else cpSync(file,target);
}
for(const name of ['docs','templates'])if(existsSync(join(root,name)))cpSync(join(root,name),join(output,name),{recursive:true});
chmodSync(join(output,'packages/cli/engdoc.js'),0o755);
console.error(`EngDoc 安装包已生成：${count} 个 JS 模块及 Schema、样式、指南和模板。`);
