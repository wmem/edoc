import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
export function licenses(){
 const root=resolve(dirname(require.resolve('@antv/x6/package.json')),'../..');
 const packages=['@antv/x6','lodash-es','dom-align','mousetrap','tslib','@fontsource/noto-sans-sc','wavedrom'];
 return packages.map(name=>{const directory=resolve(root,name);const pkg=JSON.parse(readFileSync(resolve(directory,'package.json'),'utf8'));const filename=['LICENSE','LICENSE.md','LICENSE.txt','license','OFL.txt'].find(file=>existsSync(resolve(directory,file)));return {name,version:pkg.version,license:pkg.license,text:filename?readFileSync(resolve(directory,filename),'utf8'):pkg.license};});
}
