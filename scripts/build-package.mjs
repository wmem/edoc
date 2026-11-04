// Git/npm 安装前构建可直接执行的 JS；不要求使用者修补 node_modules 或安装 TS 启动器。
import {readFileSync,writeFileSync,readdirSync,mkdirSync,rmSync,cpSync,chmodSync} from 'node:fs';
import {dirname,resolve,join,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {stripTypeScriptTypes} from 'node:module';
import {createRequire} from 'node:module';
import {browserScript} from '../packages/pack-html/runtime.ts';
import {licenses} from '../packages/pack-html/licenses.ts';

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
// 文档与模板由 npm files 收录一次；CLI 的 guide 在模块相对路径保留同源正文。
const guide='docs/usage/engineering/guide.mdoc';
mkdirSync(dirname(join(output,guide)),{recursive:true});cpSync(join(root,guide),join(output,guide));
const runtime=join(output,'runtime');mkdirSync(runtime,{recursive:true});
for(const pdf of [false,true])for(const interfaces of [false,true]){
 const name=`reader-${pdf}-${interfaces}`;
 writeFileSync(join(runtime,name+'.js'),await browserScript(name,'reader-entry',{__EDOC_PDF__:String(pdf),__EDOC_INTERFACES__:String(interfaces)}));
}
for(const interfaces of [false,true]){
 const name='client-'+interfaces;
 writeFileSync(join(runtime,name+'.js'),await browserScript(name,interfaces?'client-interface-entry':'client-entry'));
}
// 仅携带当前渲染使用的 400 字重 WOFF2 子集，避免安装全部字重与重复 WOFF。
const require=createRequire(import.meta.url),fontRoot=dirname(require.resolve('@fontsource/noto-sans-sc/400.css'));
const fonts=join(runtime,'fonts');mkdirSync(join(fonts,'files'),{recursive:true});
const css=readFileSync(join(fontRoot,'400.css'),'utf8').replace(/, url\([^)]*\.woff\) format\('woff'\)/g,'');
writeFileSync(join(fonts,'400.css'),css);cpSync(join(fontRoot,'LICENSE'),join(fonts,'LICENSE'));
for(const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g))cpSync(join(fontRoot,match[1]),join(fonts,match[1]));
writeFileSync(join(runtime,'licenses.json'),JSON.stringify(licenses()));
chmodSync(join(output,'packages/cli/edoc.js'),0o755);
console.error(`edoc 安装包已生成：${count} 个 JS 模块、预编译前端、字体子集及许可证。`);
