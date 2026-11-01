import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
let cached='';
export function fontCSS(){
 if(cached)return cached;
 const path=require.resolve('@fontsource/noto-sans-sc/400.css');
 cached='/* '+readFileSync(resolve(dirname(path),'LICENSE'),'utf8').replace(/\*\//g,'* /')+' */\n'+readFileSync(path,'utf8').replace(/, url\([^)]*\.woff\) format\('woff'\)/g,'').replace(/url\(['"]?([^)'"\s]+)['"]?\)/g,(_m,url)=>`url(data:font/woff2;base64,${readFileSync(resolve(dirname(path),url)).toString('base64')})`);
 return cached;
}
