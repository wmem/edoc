import {readFileSync,realpathSync,statSync,readdirSync,existsSync} from 'node:fs';
import {extname,relative,resolve,dirname,sep,isAbsolute} from 'node:path';
import Markdoc from '@markdoc/markdoc';
import type {Graph,DocumentEntity} from './types.ts';
import {projectPath,requireFile} from './paths.ts';
import {EngDocError,failure} from './errors.ts';
const attributes=(defs:Record<string,any>)=>defs;
export const tags:Record<string,any>={
 section:{render:'section',attributes:attributes({id:{type:String,required:true},title:{type:String},collapsed:{type:Boolean}})},
 columns:{render:'div',attributes:{ratio:{type:String,matches:['1:1','2:1','1:2','1:1:1'],default:'1:1'}}},
 panel:{render:'div',attributes:{title:{type:String}}},tabs:{render:'div'},tab:{render:'div',attributes:{name:{type:String,required:true}}},
 diagram:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 interface:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true},mode:{type:String,matches:['overview','detailed'],default:'detailed'}}},
 table:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 waveform:{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 reference:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String}}},
 page:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String},anchor:{type:String}}},
 attachment:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},target:{type:String},project:{type:String},label:{type:String}}},
 include:{selfClosing:true,attributes:{file:{type:String},project:{type:String}}},
};
export type DocumentReference={id:string;tag:string;file:string;line:number;project?:string;target?:string};
export type DocumentPlan={documents:{file:string;ast:any;locations:WeakMap<object,{file:string;line:number}>}[];files:string[];references:DocumentReference[]};
// 正文解析不再要求先建立工程数据图；先完整展开 include，再收集所有 Tabs/折叠中的引用。
export function scanDocuments(projectRoot:string,entryDocuments:string[],options:{projectRoots?:string[]}={}):DocumentPlan{
 const roots=(options.projectRoots??[]).filter(p=>resolve(p)!==resolve(projectRoot)).map(p=>existsSync(p)?realpathSync(p):resolve(p));
 const blocked=(file:string)=>{const path=resolve(projectRoot,file),target=existsSync(path)?realpathSync(path):path;return roots.some(root=>{const local=relative(root,target);return local===''||!isAbsolute(local)&&local!=='..'&&!local.startsWith('..'+sep);});};
 const locations=new WeakMap<object,{file:string;line:number}>();
 const files=new Set<string>();
 function parse(file:string,chain:string[]):any{
  if(blocked(file))failure('DOCUMENT_PROJECT_SCOPE',file,'','正文属于已声明的子工程；使用 project include 组合或稳定项目 ID 跳转');
  const absolute=projectPath(projectRoot,projectRoot,file),identity=realpathSync(absolute);
  requireFile(absolute);
  files.add(file);
  if(chain.includes(identity))failure('DOCUMENT_INCLUDE_CYCLE',file,'','正文 include 构成循环');
  if(chain.length>=32)failure('DOCUMENT_INCLUDE_DEPTH',file,'','正文 include 嵌套最多 32 层');
  const ast=Markdoc.parse(readFileSync(absolute,'utf8'));
  // Markdoc 默认处理 fence 内标签；工程手册中的代码样例必须保持字面内容。
  // 先移除解析出的样例子树，避免校验、依赖扫描、include 和索引将示例当输入。
  for(const node of ast.walk())if(node.type==='fence'){node.children=[];node.attributes.process=false;}
  const errors=Markdoc.validate(ast,{tags});
  if(errors.length)throw new EngDocError(errors.map(e=>({code:'DOCUMENT_TAG',file,path:`#L${(e.lines?.[0]??0)+1}`,message:e.error.message})));
  for(const node of ast.walk()){locations.set(node,{file,line:(node.location?.start.line??0)+1});if(node.type==='link')node.attributes.__engdocSourceFile=file;}
  const expand=(node:any)=>{
   node.children=node.children.flatMap((child:any)=>{
    if(child.type==='tag'&&child.tag==='include'){
     const {file:target,project}=child.attributes;
     if((typeof target==='string')===(typeof project==='string')||target===''||project==='')failure('DOCUMENT_INCLUDE',file,`#L${locations.get(child)!.line}`,'include 必须且只能指定 file 或 project');
     if(project!==undefined)return [child];
     if(!['.md','.mdoc'].includes(extname(target)))failure('DOCUMENT_INCLUDE',file,`#L${locations.get(child)!.line}`,'include 只读取项目范围内的 .md / .mdoc 正文');
     return parse(target,[...chain,identity]).children;
    }
    expand(child);return [child];
   });
  };
  expand(ast);return ast;
 }
 const entries:string[]=[];
 const discover=(file:string)=>{if(blocked(file))return;const path=projectPath(projectRoot,projectRoot,file);if(statSync(path).isDirectory()){for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>Number(/^index\.(md|mdoc)$/i.test(b.name))-Number(/^index\.(md|mdoc)$/i.test(a.name))||a.name.localeCompare(b.name))){if(entry.name.startsWith('.')||['ir','_partials','node_modules','output'].includes(entry.name))continue;const child=relative(projectRoot,resolve(path,entry.name)).split('\\').join('/');if(entry.isDirectory())discover(child);else if(entry.isFile()&&['.md','.mdoc'].includes(extname(child)))entries.push(child);}}else entries.push(relative(projectRoot,path).split('\\').join('/'));};entryDocuments.forEach(discover);
 const documents:DocumentPlan['documents']=[],seen=new Set<string>();
 for(let i=0;i<entries.length;i++){const file=entries[i],identity=realpathSync(projectPath(projectRoot,projectRoot,file));if(seen.has(identity))continue;seen.add(identity);const ast=parse(file,[]);documents.push({file,ast,locations});for(const node of ast.walk())if(node.type==='link'){const href=node.attributes.href;if(typeof href==='string'&&!/^(#|https?:|mailto:)/i.test(href)){const source=locations.get(node)!.file,target=localDocumentLink(projectRoot,source,href);if(target)entries.push(target.file);}}}
 const references:DocumentReference[]=[];
 for(const {ast}of documents)for(const node of ast.walk()){
  if(node.type==='tag'&&['diagram','interface','table','waveform','reference','page','attachment'].includes(node.tag??''))references.push({id:node.attributes.id,tag:node.tag!,...locations.get(node)!,...(node.attributes.project!==undefined?{project:node.attributes.project}:{}),...(node.attributes.target!==undefined?{target:node.attributes.target}:{})});
  if(node.type==='image'){
   const location=locations.get(node)!;
   try{const target=projectPath(projectRoot,projectRoot,node.attributes.src);requireFile(target);files.add(node.attributes.src);}catch(error){if(error instanceof EngDocError)throw new EngDocError(error.diagnostics.map(d=>({...d,code:d.code==='PATH_SCOPE'?'DOCUMENT_IMAGE':d.code,file:location.file,path:`#L${location.line}`})));throw error;}
  }
 }
 return {documents,files:[...files],references};
}
export function documentAST(graph:Graph){return graph.documentPlan?.documents??scanDocuments(graph.projectRoot,graph.manifest.entryDocuments).documents;}
export function registerDocuments(graph:Graph){
 for(const {file,ast,locations} of documentAST(graph))for(const node of ast.walk())if(node.type==='tag'&&node.tag==='section'){
  const id=node.attributes.id;if(typeof id!=='string'||!id.trim())continue;
  const location=locations.get(node)!;
  if(graph.index.has(id))failure('DUPLICATE_ID',location.file,`#L${location.line}`,`章节 ID 已定义：${id}`);
  const entity:DocumentEntity={id,kind:'document',label:node.attributes.title??id,source:{...location,selector:id}};
  graph.index.set(id,{id,type:'document',entity,location:{file:location.file,path:`#L${entity.source.line}`}});
 }
}
export function validateDocuments(graph:Graph){
 const errors:any[]=[];
 const types:Record<string,string[]>= {diagram:['view'],interface:['view','node','group','interface'],table:['table'],waveform:['waveform']};
 for(const {file:entryFile,ast,locations} of documentAST(graph)){
  const file=entryFile;
  const containers=(node:any,parent?:any)=>{if(node.type==='tag'&&node.tag==='tab'&&parent?.tag!=='tabs')errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tab 必须直接位于 tabs 中'});if(node.type==='tag'&&node.tag==='tabs'){const tabs=node.children.filter((c:any)=>c.type==='tag'&&c.tag==='tab');if(!tabs.length||node.children.some((c:any)=>c.type!=='tag'||c.tag!=='tab')||new Set(tabs.map((c:any)=>c.attributes.name)).size!==tabs.length)errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tabs 必须包含名称唯一的 tab'});}for(const child of node.children??[])containers(child,node);};containers(ast);
  for(const error of Markdoc.validate(ast,{tags,nodes:{link:{...Markdoc.nodes.link,attributes:{...Markdoc.nodes.link.attributes,__engdocSourceFile:{type:String}}}}})) errors.push({code:'DOCUMENT_TAG',file,path:`#L${(error.lines?.[0]??0)+1}`,message:error.error.message});
  for(const node of ast.walk()){
   const file=locations.get(node)?.file??entryFile;
   if(node.type==='tag'){
    for(const key of Object.keys(node.attributes))if(key!=='__engdocOutlineId'&&!Object.hasOwn(tags[node.tag??'']?.attributes??{},key))errors.push({code:'DOCUMENT_ATTRIBUTE',file,path:'',message:`标签 ${node.tag} 不支持属性 ${key}`});
    const id=node.attributes.id;
    if(node.attributes.project!==undefined&&(typeof node.attributes.project!=='string'||!node.attributes.project.trim()))errors.push({code:'DOCUMENT_PROJECT',file,path:`#L${locations.get(node)?.line??1}`,message:'project 必须是非空稳定项目 ID'});
    if(['reference','page','attachment'].includes(node.tag??'')&&typeof id==='string'&&!id.trim())errors.push({code:'DOCUMENT_REFERENCE_ID',file,path:`#L${locations.get(node)?.line??1}`,message:'跳转目标 ID 不能空白'});
    if(node.tag==='attachment'&&node.attributes.target!==undefined&&(typeof node.attributes.target!=='string'||!node.attributes.target.trim()))errors.push({code:'DOCUMENT_REFERENCE_ID',file,path:`#L${locations.get(node)?.line??1}`,message:'PDF 位置 ID 不能空白，省略 target 才表示首页'});
    if(node.tag==='attachment'&&(!node.attributes.project||node.attributes.project===graph.manifest.projectId)){const attachment=graph.attachments?.[id];if(!attachment||node.attributes.target&&!Object.hasOwn(attachment.targets,node.attributes.target))errors.push({code:'ATTACHMENT_REFERENCE',file,path:`#L${locations.get(node)?.line??1}`,id,message:'PDF 附件或位置不存在：'+id});}
    if((node.tag==='reference'||types[node.tag??''])&&typeof id==='string'&&(!node.attributes.project||node.attributes.project===graph.manifest.projectId)){
     const entity=graph.index.get(id);
     if(!entity||(types[node.tag??'']&&!types[node.tag!].includes(entity.type)))errors.push({code:'DOCUMENT_REFERENCE',file,path:`#L${locations.get(node)?.line??1}`,id,message:`标签 ${node.tag} 引用缺失或类型不符：${id}`});
    }
   }
   if(node.type==='link'||node.type==='image'){
    const value=node.attributes.href??node.attributes.src??'';
    if(node.type==='link'&&!/^(#|https?:|mailto:)/i.test(value)&&!localDocumentLink(graph.projectRoot,file,value))errors.push({code:'DOCUMENT_LINK',file,path:'',message:'文档链接只允许内部锚点、https/http、mailto'});
    if(node.type==='image') {try{projectPath(graph.projectRoot,graph.projectRoot,value);}catch(e:any){errors.push({code:'DOCUMENT_IMAGE',file,path:'',message:e.message});}}
   }
  }
 }
 if(errors.length)throw new EngDocError(errors);
}

// 普通文档链接相对实际源文件；只在当前工程内发现，不打开其他配置。
export function localDocumentLink(root:string,source:string,href:string):{file:string;anchor:string}|undefined{
 if(/^(#|https?:|mailto:)/i.test(href))return;
 const [encoded,fragment='']=href.split('#',2);let file:string,anchor:string;try{file=decodeURIComponent(encoded);anchor=decodeURIComponent(fragment);}catch{failure('DOCUMENT_LINK',source,'','文档链接编码错误');}
 if(!['.md','.mdoc'].includes(extname(file)))return;
 const absolute=projectPath(root,resolve(root,dirname(source)),file);requireFile(absolute);return {file:relative(root,absolute).split('\\').join('/'),anchor};
}
