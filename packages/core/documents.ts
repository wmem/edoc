import {readFileSync,realpathSync,statSync,readdirSync,existsSync} from 'node:fs';
import {extname,relative,resolve,dirname,sep,isAbsolute} from 'node:path';
import Markdoc from '@markdoc/markdoc';
import type {Graph,DocumentEntity} from './types.ts';
import {projectPath,requireFile} from './paths.ts';
import {EdocError,failure} from './errors.ts';
import {nativeConfig,validateMarkdoc} from './markdoc.ts';
import type {MarkdocOptions} from './markdoc.ts';
import {builtinTags,referenceTargets,targetChecks} from './extension-contracts.ts';
import {directoryOrders} from './directory-order.ts';
export const tags=builtinTags;
export type DocumentReference={id:string;tag:string;file:string;line:number;project?:string;target?:string};
export type DocumentPlan={media?:Map<string,import('./media.ts').ImageAsset>;documents:{file:string;ast:any;locations:WeakMap<object,{file:string;line:number}>}[];files:string[];references:DocumentReference[];checks?:{node:any;file:string;line:number;documentFile?:string;direct?:boolean}[];warnings?:any[];pending?:Promise<unknown>[];markdoc?:import('@markdoc/markdoc').Config};
// 正文解析不再要求先建立工程数据图；先完整展开 include，再收集所有 Tabs/折叠中的引用。
export function scanDocuments(projectRoot:string,entryDocuments:string[],options:{projectRoots?:string[];markdoc?:MarkdocOptions;configFile?:string}={}):DocumentPlan{
 const roots=(options.projectRoots??[]).filter(p=>resolve(p)!==resolve(projectRoot)).map(p=>existsSync(p)?realpathSync(p):resolve(p));
 const blocked=(file:string)=>{const path=resolve(projectRoot,file),target=existsSync(path)?realpathSync(path):path;return roots.some(root=>{const local=relative(root,target);return local===''||!isAbsolute(local)&&local!=='..'&&!local.startsWith('..'+sep);});};
 const locations=new WeakMap<object,{file:string;line:number}>(),files=new Set<string>(),checks:NonNullable<DocumentPlan['checks']>=[],warnings:any[]=[],pending:Promise<unknown>[]=[];
 const enqueue=(promise:Promise<unknown>)=>{pending.push(promise);void promise.catch(()=>{});};
 const configured=options.markdoc??{},base=nativeConfig(configured,tags);
 for(const key of Object.keys(configured.tags??{}))if(Object.hasOwn(tags,key)||Object.hasOwn(Markdoc.tags,key))failure('CONFIG_FIELD',options.configFile??'<markdoc>','/markdoc/tags/'+key,'扩展标签不能覆盖原生或 edoc 保留名称：'+key);
 const location=(node:any,cfg:any)=>({file:node.location?.file??cfg.__edocFile,line:(node.location?.start.line??0)+1});
 const track=(node:any,cfg:any)=>{const source=location(node,cfg);locations.set(node,source);checks.push({node,...source,documentFile:cfg.__edocDocument,direct:cfg.__edocChain.length===1});return node;};
 function rawFile(file:string,chain:string[]){
  if(blocked(file))failure('DOCUMENT_PROJECT_SCOPE',file,'','正文属于已声明的子工程；使用 project include 组合或稳定项目 ID 跳转');
  const absolute=projectPath(projectRoot,projectRoot,file);requireFile(absolute);const identity=realpathSync(absolute);
  if(chain.includes(identity))failure('DOCUMENT_INCLUDE_CYCLE',file,'','正文 include/partial 构成循环');
  if(chain.length>=32)failure('DOCUMENT_INCLUDE_DEPTH',file,'','正文 include/partial 嵌套最多 32 层');
  files.add(file);
  return {ast:Markdoc.parse(new Markdoc.Tokenizer(configured.tokenizer).tokenize(readFileSync(absolute,'utf8')),{...configured.parse,file}),chain:[...chain,identity]};
 }
 function inspect(ast:any,cfg:any){
  // 仅显式 process=false 的围栏隔离；其余保留原生 process=true 行为。
  for(const node of ast.walk())if(node.type==='fence'&&node.attributes.process===false)node.children=[];
  const result=validateMarkdoc(ast,cfg,cfg.__edocFile),collect=(items:any[])=>warnings.push(...items.filter(e=>e.error.level==='warning'));
  if(result&&typeof result.then==='function')enqueue(result.then(collect));else collect(result);
 }
 function engineAttributes(node:any,cfg:any){
  if(node.type==='tag'&&Object.hasOwn(tags,node.tag??'')){const check=Object.assign(new Markdoc.Ast.Node(),node,{attributes:Object.fromEntries(Object.entries(node.attributes).filter(([,v])=>v!==undefined)),children:[]});validateMarkdoc(check,cfg,location(node,cfg).file);}
 }
 function capture(node:any,cfg:any):any{
  engineAttributes(node,cfg);
  const children=node.type==='fence'&&node.attributes.process===false?[]:node.transformChildren(cfg);
  const slots=Object.fromEntries(Object.entries(node.slots).map(([key,slot]:[string,any])=>[key,slot.transform(cfg)]));
  const copy=Object.assign(new Markdoc.Ast.Node(),node,{children,slots});
  if(node.type==='link')copy.attributes={...copy.attributes,__edocSourceFile:location(node,cfg).file};
  if(copy.type==='text'&&copy.attributes.content&&typeof copy.attributes.content.then==='function')enqueue(Promise.resolve(copy.attributes.content).then(value=>{copy.attributes={...copy.attributes,content:value};}));
  track(copy,cfg);return copy;
 }
 // 原生条件负责选择分支；先投影全部子树，使未选择分支也参与依赖与工程引用检查。
 function conditional(node:any,cfg:any){
  const projected=capture(node,cfg);
  const identity=(n:any)=>n;
  const stable={...cfg,nodes:Object.fromEntries(Object.keys(Markdoc.nodes).map(k=>[k,{transform:identity}])),tags:Object.fromEntries(Object.keys(cfg.tags).map(k=>[k,{transform:identity}]))};
  return Markdoc.tags.if.transform!(projected,stable) as any;
 }
 function include(node:any,cfg:any){
  engineAttributes(node,cfg);
  const {file,project}=node.attributes,source=location(node,cfg);
  if((typeof file==='string')===(typeof project==='string')||file===''||project==='')failure('DOCUMENT_INCLUDE',source.file,`#L${source.line}`,'include 必须且只能指定 file 或 project');
  if(project!==undefined)return capture(node,cfg);
  if(!['.md','.mdoc'].includes(extname(file)))failure('DOCUMENT_INCLUDE',source.file,`#L${source.line}`,'include 只读取项目范围内的 .md / .mdoc 正文');
  const loaded=rawFile(file,cfg.__edocChain),next={...cfg,__edocFile:file,__edocChain:loaded.chain};
  inspect(loaded.ast,next);return (Markdoc.transform(loaded.ast,next) as any).children;
 }
 function code(node:any,cfg:any){
  engineAttributes(node,cfg);
  const target=node.attributes.file,absolute=projectPath(projectRoot,projectRoot,target),source=location(node,cfg);requireFile(absolute);
  if(statSync(absolute).size>128*1024)failure('DOCUMENT_CODE_SIZE',source.file,`#L${source.line}`,'源码示例最多 128 KiB；请引用较小的独立源文件');
  let content:string;try{content=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(absolute));if(content.includes('\0'))throw new Error('包含 NUL');}catch{failure('DOCUMENT_CODE_TEXT',source.file,`#L${source.line}`,'源码示例必须为不含 NUL 的 UTF-8 文本');}
  const fence=new Markdoc.Ast.Node('fence',{content,language:node.attributes.language??extname(target).slice(1),process:false});
  fence.location={file:target,start:{line:0},end:{line:0}};files.add(target);return track(fence,cfg);
 }
 function partial(node:any,cfg:any){
  const alias=node.attributes.file,part=configured.partials?.[alias],source=location(node,cfg);
  const identity='partial:'+alias;
  if(cfg.__edocChain.includes(identity))failure('DOCUMENT_INCLUDE_CYCLE',source.file,`#L${source.line}`,'正文 partial 构成循环：'+alias);
  if(cfg.__edocChain.length>=32)failure('DOCUMENT_INCLUDE_DEPTH',source.file,`#L${source.line}`,'正文 include/partial 嵌套最多 32 层');
  let ast:any,file=options.configFile?relative(projectRoot,options.configFile).split('\\').join('/'):source.file,chain=[...cfg.__edocChain,identity];
  if(typeof part==='string'){file=part;const loaded=rawFile(file,chain);ast=loaded.ast;chain=loaded.chain;}
  else {
   ast=part;
   for(const item of Array.isArray(ast)?ast:[ast])for(const n of [item,...item.walk()])if(n.location?.file){const sourceFile=n.location.file,absolute=projectPath(projectRoot,projectRoot,sourceFile,false);if(existsSync(absolute)){if(blocked(sourceFile))failure('DOCUMENT_PROJECT_SCOPE',sourceFile,'','片段来源属于子工程');requireFile(absolute);files.add(sourceFile);}}
  }
  const scoped={...cfg,__edocFile:file,__edocChain:chain,variables:{...cfg.variables,...node.attributes.variables,['$$partial:filename']:alias}};
  for(const item of Array.isArray(ast)?ast:[ast])inspect(item,scoped);
  // 交由原生 partial 实现作用域合并和片段转换，不复制其变量覆盖规则。
  return Markdoc.tags.partial.transform!(node,{...cfg,__edocFile:file,__edocChain:chain,partials:{...cfg.partials,[alias]:ast}}) as any;
 }
 const projection:any={...base,
  nodes:Object.fromEntries(Object.entries(Markdoc.nodes).map(([key,value])=>[key,{...value,transform:capture}])),
  tags:Object.fromEntries(Object.entries(base.tags??{}).map(([key,value])=>[key,{...value,transform:key==='if'?conditional:key==='partial'?partial:key==='include'?include:key==='code'?code:capture}]))};
 const entries:string[]=[];
 const discover=(file:string)=>{if(blocked(file))return;const path=projectPath(projectRoot,projectRoot,file);if(statSync(path).isDirectory()){for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>Number(/^index\.(md|mdoc)$/i.test(b.name))-Number(/^index\.(md|mdoc)$/i.test(a.name))||a.name.localeCompare(b.name))){if(entry.name.startsWith('.')||['ir','_partials','node_modules','output'].includes(entry.name))continue;const child=relative(projectRoot,resolve(path,entry.name)).split('\\').join('/');if(entry.isDirectory())discover(child);else if(entry.isFile()&&['.md','.mdoc'].includes(extname(child)))entries.push(child);}}else entries.push(relative(projectRoot,path).split('\\').join('/'));};entryDocuments.forEach(discover);
 const documents:DocumentPlan['documents']=[],seen=new Set<string>();
 for(let i=0;i<entries.length;i++){
  const file=entries[i],identity=realpathSync(projectPath(projectRoot,projectRoot,file));if(seen.has(identity))continue;seen.add(identity);
  const raw=rawFile(file,[]),cfg={...projection,__edocFile:file,__edocDocument:file,__edocChain:raw.chain};inspect(raw.ast,cfg);
  const ast=Markdoc.transform(raw.ast,cfg);documents.push({file,ast,locations});
  // 同时发现条件隐藏的文档链接，依赖校验不由当前显示分支决定。
  for(const check of checks)if(check.node.type==='link'){const href=check.node.attributes.href;if(typeof href==='string'&&!/^(#|https?:|mailto:)/i.test(href)){const target=localDocumentLink(projectRoot,check.file,href);if(target&&!entries.includes(target.file))entries.push(target.file);}}
 }
 const references:DocumentReference[]=[];
 for(const {node,file,line}of checks){
  if(node.type==='tag'&&(Object.hasOwn(referenceTargets,node.tag??'')||['reference','page','attachment'].includes(node.tag??'')))references.push({id:node.attributes.id,tag:node.tag!,file,line,...(node.attributes.project!==undefined?{project:node.attributes.project}:{}),...(node.attributes.target!==undefined?{target:node.attributes.target}:{})});
  if(node.type==='image'||node.type==='tag'&&base.tags?.[node.tag!]?.render==='img'){
   const src=node.type==='image'?node.attributes.src:node.transformAttributes(base).src;
   try{const target=projectPath(projectRoot,projectRoot,src);requireFile(target);files.add(src);}catch(error){if(error instanceof EdocError)throw new EdocError(error.diagnostics.map(d=>({...d,code:d.code==='PATH_SCOPE'?'DOCUMENT_IMAGE':d.code,file,path:`#L${line}`})));throw error;}
  }
 }
 return {documents,files:[...files],references,checks,warnings,pending,markdoc:base};
}
export function documentAST(graph:Graph){graph.documentPlan??=scanDocuments(graph.projectRoot,graph.manifest.entryDocuments);return graph.documentPlan.documents;}
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
 directoryOrders(graph.documentPlan??{documents:documentAST(graph),files:[],references:[]});
 const errors:any[]=[];
 const types=referenceTargets;
 for(const [documentIndex,{file:entryFile,ast,locations}] of documentAST(graph).entries()){
  const file=entryFile;
  const containers=(node:any,parent?:any)=>{if(node.type==='tag'&&node.tag==='tab'&&parent?.tag!=='tabs')errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tab 必须直接位于 tabs 中'});if(node.type==='tag'&&node.tag==='tabs'){const tabs=node.children.filter((c:any)=>c.type==='tag'&&c.tag==='tab');if(!tabs.length||node.children.some((c:any)=>c.type!=='tag'||c.tag!=='tab')||new Set(tabs.map((c:any)=>c.attributes.name)).size!==tabs.length)errors.push({code:'DOCUMENT_CONTAINER',file,path:'',message:'tabs 必须包含名称唯一的 tab'});}for(const child of [...Object.values(node.slots??{}),...node.children??[]])containers(child,node);};containers(ast);
  const checks=graph.documentPlan?.checks;
  if(checks&&documentIndex>0)continue;
  for(const node of checks?checks.map(c=>c.node):ast.walk()){
   const file=locations.get(node)?.file??entryFile;
   if(node.type==='tag'&&Object.hasOwn(tags,node.tag??'')){
    const id=node.attributes.id;
    if(node.attributes.project!==undefined&&(typeof node.attributes.project!=='string'||!node.attributes.project.trim()))errors.push({code:'DOCUMENT_PROJECT',file,path:`#L${locations.get(node)?.line??1}`,message:'project 必须是非空稳定项目 ID'});
    if(['reference','page','attachment'].includes(node.tag??'')&&typeof id==='string'&&!id.trim())errors.push({code:'DOCUMENT_REFERENCE_ID',file,path:`#L${locations.get(node)?.line??1}`,message:'跳转目标 ID 不能空白'});
    if(node.tag==='attachment'&&node.attributes.target!==undefined&&(typeof node.attributes.target!=='string'||!node.attributes.target.trim()))errors.push({code:'DOCUMENT_REFERENCE_ID',file,path:`#L${locations.get(node)?.line??1}`,message:'PDF 位置 ID 不能空白，省略 target 才表示首页'});
    if(node.tag==='attachment'&&(!node.attributes.project||node.attributes.project===graph.manifest.projectId)){const attachment=graph.attachments?.[id];if(!attachment||node.attributes.target&&!Object.hasOwn(attachment.targets,node.attributes.target))errors.push({code:'ATTACHMENT_REFERENCE',file,path:`#L${locations.get(node)?.line??1}`,id,message:'PDF 附件或位置不存在：'+id});}
    if((node.tag==='reference'||types[node.tag??''])&&typeof id==='string'&&(!node.attributes.project||node.attributes.project===graph.manifest.projectId)){
     const entity=graph.index.get(id);
     if(!entity||(types[node.tag??'']&&!types[node.tag!].includes(entity.type)))errors.push({code:'DOCUMENT_REFERENCE',file,path:`#L${locations.get(node)?.line??1}`,id,message:`标签 ${node.tag} 引用缺失或类型不符：${id}`});
     else {const message=targetChecks[node.tag!]?.(graph,entity);if(message)errors.push({code:'DOCUMENT_REFERENCE',file,path:`#L${locations.get(node)?.line??1}`,id,message});}
    }
   }
   if(node.type==='link'||node.type==='image'){
    const value=node.attributes.href??node.attributes.src??'';
    if(node.type==='link'&&!/^(#|https?:|mailto:)/i.test(value)&&!localDocumentLink(graph.projectRoot,file,value))errors.push({code:'DOCUMENT_LINK',file,path:'',message:'文档链接只允许内部锚点、https/http、mailto'});
    if(node.type==='image') {try{projectPath(graph.projectRoot,graph.projectRoot,value);}catch(e:any){errors.push({code:'DOCUMENT_IMAGE',file,path:'',message:e.message});}}
   }
  }
 }
 if(errors.length)throw new EdocError(errors);
}

// 普通文档链接相对实际源文件；只在当前工程内发现，不打开其他配置。
export function localDocumentLink(root:string,source:string,href:string):{file:string;anchor:string}|undefined{
 if(/^(#|https?:|mailto:)/i.test(href))return;
 const [encoded,fragment='']=href.split('#',2);let file:string,anchor:string;try{file=decodeURIComponent(encoded);anchor=decodeURIComponent(fragment);}catch{failure('DOCUMENT_LINK',source,'','文档链接编码错误');}
 if(!['.md','.mdoc'].includes(extname(file)))return;
 const absolute=projectPath(root,resolve(root,dirname(source)),file);requireFile(absolute);return {file:relative(root,absolute).split('\\').join('/'),anchor};
}
