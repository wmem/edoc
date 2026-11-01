import {spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,mkdtempSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {dirname,relative,resolve,sep} from 'node:path';
import {projectPath,requireFile} from './paths.ts';
import {failure} from './errors.ts';
export function runAdapter(root:string,irDirectory:string,config:any,validate:(stage:string)=>void){
 const adapter=config.adapter;if(!adapter)return;
 const destination=projectPath(root,root,config.irDirectory,false);
 if(destination===root)failure('ADAPTER_OUTPUT',destination,'','IR 不能覆盖工程根目录');
 const inputs=adapter.inputs.map((path:string)=>projectPath(root,root,path));
 for(const input of inputs){requireFile(input);if(input===destination||input.startsWith(destination+sep))failure('ADAPTER_OUTPUT',input,'','IR 输出目录不能包含 Adapter 输入');}
 const before=inputs.map((file:string)=>{const s=statSync(file,{bigint:true});return [s.mtimeNs,s.size];});
 const parent=dirname(destination);mkdirSync(parent,{recursive:true});
 const stage=mkdtempSync(resolve(parent,'.engdoc-stage-'));
 const status=resolve(parent,'adapter-status.json');
 try{
 const result=spawnSync(adapter.command[0],adapter.command.slice(1),{cwd:root,env:{...process.env,ENGDOC_IR_OUTPUT:stage},encoding:'utf8',timeout:adapter.timeoutMs??30000,maxBuffer:2*1024*1024});
 if(result.error||result.status!==0)failure('ADAPTER_FAILED','engdoc.config.json','/adapter',result.error?.message??result.stderr??`退出 ${result.status}`);
 inputs.forEach((file:string,i:number)=>{const s=statSync(file,{bigint:true});if(s.mtimeNs!==before[i][0]||s.size!==before[i][1])failure('ADAPTER_INPUT_CHANGED',file,'','Adapter 改变了声明的源文件元数据');});
 validate(stage);
 if(existsSync(destination))rmSync(destination,{recursive:true});renameSync(stage,destination);
 writeFileSync(status,JSON.stringify({success:true,adapterVersion:adapter.version,inputs:inputs.map((file:string)=>({file:relative(root,file),mtimeMs:statSync(file).mtimeMs,size:statSync(file).size}))},null,2));
 }catch(e){rmSync(stage,{recursive:true,force:true});writeFileSync(status,JSON.stringify({success:false,adapterVersion:adapter.version}));throw e;}
}
