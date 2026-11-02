#!/usr/bin/env node
// 仓库手册的静态预览；项目用户直接运行 engdoc，无需此脚本。
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {main} from '../packages/cli/project.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),target=resolve(root,'output/index.html');
const result=await main(['build','--config',resolve(root,'engdoc.config.js'),'--format','html','--output',target]);
if(result)process.exit(result);
const port=Number(process.env.ENGDOC_DOCS_PORT??5175);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('ENGDOC_DOCS_PORT 范围 1–65535');
const server=createServer((request,response)=>{
 const path=new URL(request.url??'/','http://localhost').pathname;
 if(path==='/favicon.ico'){response.writeHead(204);response.end();return;}
 if(!['/','/index.html'].includes(path)){response.writeHead(404);response.end('Not found');return;}
 response.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});response.end(readFileSync(target));
});
server.on('error',error=>{console.error(error.message);process.exitCode=1;});
server.listen(port,'127.0.0.1',()=>console.log(`手册预览：http://127.0.0.1:${port}/（静态预览，修改后重建并刷新）`));
process.on('SIGINT',()=>server.close());process.on('SIGTERM',()=>server.close());
