import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function licenses(){
 const root=resolve(dirname(require.resolve('@antv/x6/package.json')),'../..');
 const packages=['@antv/x6','lodash-es','dom-align','mousetrap','tslib','@fontsource/noto-sans-sc','wavedrom','pdfjs-dist'];
 const entries=packages.map(name=>{const directory=resolve(root,name);const pkg=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));const filename=['LICENSE','LICENSE.md','LICENSE.txt','license','OFL.txt'].find(file=>existsSync(resolve(directory,file)));return {name,version:pkg.version,license:pkg.license,text:filename?readFileSync(resolve(directory,filename),'utf8'):pkg.license};});
 const pdfRoot=dirname(require.resolve('pdfjs-dist/package.json'));for(const dir of ['cmaps','standard_fonts','wasm','iccs'])for(const file of (require('node:fs') as typeof import('node:fs')).readdirSync(resolve(pdfRoot,dir)))if(file.startsWith('LICENSE'))entries.push({name:'pdfjs-dist/'+dir+'/'+file,version:'bundled',license:'see text',text:readFileSync(resolve(pdfRoot,dir,file),'utf8')});return entries;
}
