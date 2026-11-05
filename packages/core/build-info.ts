import {readFileSync,existsSync,realpathSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

export type BuildInfo={version:string;revision:string|null;dirty:boolean|null;builtAt?:string};
export const packageRoot=fileURLToPath(new URL(import.meta.url.endsWith('.ts')?'../../':'../../../',import.meta.url));
// Git仅用于源码构建的显式身份，不对文件内容做hash跟踪；安装版只读取随包元数据。
export function sourceBuildInfo(root=packageRoot):BuildInfo{
 const info:BuildInfo={version:JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version,revision:null,dirty:null};
 try{
  const git=(args:string[])=>execFileSync('git',['-C',root,...args],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
  if(realpathSync(git(['rev-parse','--show-toplevel']))===realpathSync(root)){info.revision=git(['rev-parse','HEAD']);info.dirty=git(['status','--porcelain']).length>0;}
 }catch{/* 源码归档不一定含Git元数据，明确返回未知。 */}
 return info;
}
export function buildInfo():BuildInfo{
 if(import.meta.url.endsWith('.ts'))return sourceBuildInfo();
 const file=resolve(packageRoot,'dist/build-info.json');
 return existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{version:JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8')).version,revision:null,dirty:null};
}
