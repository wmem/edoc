import {readFileSync,readdirSync,statSync,realpathSync,existsSync} from 'node:fs';
import {resolve,dirname,basename,relative,extname} from 'node:path';
import {loadConfigFromFile} from 'vite';
import type {Graph,Manifest,ResourceType,RelationView,Table,Waveform,Reference} from './types.ts';
import {graphFromResources} from './graph.ts';
import type {ResourcePart} from './graph.ts';
import {scanDocuments} from './documents.ts';
import {markdocOptions} from './markdoc.ts';
import type {MarkdocOptions} from './markdoc.ts';
import type {DocumentPlan,DocumentReference} from './documents.ts';
import {projectPath,requireFile} from './paths.ts';
import {EdocError,failure} from './errors.ts';
import {loadAttachments,record} from './attachments.ts';
import type {AttachmentInput} from './attachments.ts';
import {SUPPORTED_IR_VERSION} from './load.ts';
import {resourceTypes} from './extension-contracts.ts';
import {directoryOrders} from './directory-order.ts';

export type Dataset=Partial<Record<ResourceType,unknown[]>>&{irVersion?:string;requiredFeatures?:string[];projectId?:string;adapterVersion?:string;attachments?:Record<string,AttachmentInput>};
export type DataContext={root:string;documents:readonly string[];references:readonly DocumentReference[]};
export type DataSource=string|string[]|Dataset;
export type ProjectConfig={markdoc?:MarkdocOptions;title?:string;projectId?:string;documents?:string|string[];data?:DataSource|((context:DataContext)=>DataSource|Promise<DataSource>);views?:RelationView[];tables?:Table[];waveforms?:Waveform[];references?:Reference[];output?:{html?:string|false;pdf?:string|false};chromiumExecutable?:string;compactIndex?:boolean;children?:Record<string,string>;attachments?:Record<string,AttachmentInput>};
export type ResolvedConfig={markdoc:MarkdocOptions;file:string;root:string;title:string;projectId:string;documents:string[];data:ProjectConfig['data'];views:RelationView[];tables:Table[];waveforms:Waveform[];references:Reference[];outputs:{format:'html'|'pdf';file:string}[];chromiumExecutable?:string;compactIndex:boolean;configInputs:string[];defaultData:boolean;children:Record<string,string>;attachments:Record<string,AttachmentInput>};
export type LoadedProject={config:ResolvedConfig;graph:Graph;documents:DocumentPlan;inputs:string[];dataFiles:string[]};
const features=['graph','documents','tables','wavejson','references','interface-groups','layout-intent','pdf-attachments'];
const pointer=(key:string)=>key.replace(/~/g,'~0').replace(/\//g,'~1');
const plain=(v:unknown):v is Record<string,any>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.prototype.toString.call(v)==='[object Object]';
// 标准 docs 配置属于上一级工程；其他显式配置保留配置目录作为工程根。
const configProjectRoot=(file:string)=>{const physical=existsSync(file)?realpathSync(file):resolve(file),directory=dirname(physical);return basename(directory)==='docs'&&/^edoc\.config\.(js|mjs|cjs)$/.test(basename(physical))?dirname(directory):directory;};

export async function resolveProjectConfig(requested?:string,cwd=process.cwd()):Promise<ResolvedConfig>{
 const selected=resolve(cwd,requested??'docs/edoc.config.js');
 if(!existsSync(selected))failure('CONFIG_MISSING',selected,'',requested?'指定的配置文件不存在':'当前项目没有 docs/edoc.config.js；可在该文件写 export default {}，或使用 --config 指定其他配置');
 requireFile(selected);const file=realpathSync(selected),root=configProjectRoot(file);
 if(!['.js','.mjs','.cjs'].includes(extname(file)))failure('CONFIG_FORMAT',file,'','配置使用 .js/.mjs/.cjs，直接导出配置内容');
 let loaded:Awaited<ReturnType<typeof loadConfigFromFile>>;
 try{loaded=await loadConfigFromFile({command:'build',mode:'production'},file,root,'silent');}catch(error){failure('CONFIG_LOAD',file,'',String(error));}
 if(!loaded||!plain(loaded.config))failure('CONFIG_TYPE',file,'','配置须导出对象，例如 export default {}');
 const input=loaded.config as ProjectConfig;
 const allowed=['title','projectId','documents','data','views','tables','waveforms','references','output','chromiumExecutable','compactIndex','children','attachments','markdoc'];
 for(const key of Object.keys(input))if(!allowed.includes(key))failure('CONFIG_FIELD',file,'/'+pointer(key),`未知配置项：${key}`);
 const text=(key:'title'|'projectId',fallback:string)=>{const value=input[key]??fallback;if(typeof value!=='string'||!value.trim())failure('CONFIG_TYPE',file,'/'+key,'需要非空字符串');return value;};
 if(input.documents==null){
  const entry=projectPath(root,root,'docs/index.mdoc',false);
  if(!existsSync(entry)||!statSync(entry).isFile())failure('DOCUMENT_ENTRY',entry,'/documents','默认文档首页不存在或不是文件；请创建 docs/index.mdoc，或显式设置 documents');
 }
 // 首页先加入，再发现整个 docs；扫描器去重，显式 documents 保留原来的文件/目录契约。
 const docs=input.documents??['docs/index.mdoc','docs'],documents=Array.isArray(docs)?docs:[docs];
 if(!documents.length||documents.some(v=>typeof v!=='string'||!v.trim())||new Set(documents).size!==documents.length)failure('CONFIG_DOCUMENTS',file,'/documents','需要非空的正文路径或有序且不重复的路径数组');
 for(const doc of documents){const path=projectPath(root,root,doc);if(statSync(path).isFile()&&!['.md','.mdoc'].includes(extname(doc)))failure('CONFIG_DOCUMENTS',file,'/documents','正文接受 .md/.mdoc 文件或目录');}
 if(input.children!==undefined&&(!plain(input.children)||Object.entries(input.children).some(([key,value])=>!key.trim()||typeof value!=='string'||!value.trim())))failure('CONFIG_CHILDREN',file,'/children','children 需要别名到子配置相对路径的对象');
 if(input.attachments!==undefined&&!plain(input.attachments))failure('CONFIG_TYPE',file,'/attachments','attachments 需要对象');
 const arrays={} as Record<'views'|'tables'|'waveforms'|'references',any[]>;
 for(const key of ['views','tables','waveforms','references'] as const){const value=input[key]??[];if(!Array.isArray(value))failure('CONFIG_TYPE',file,'/'+key,'需要数组');arrays[key]=value;}
 if(input.compactIndex!==undefined&&typeof input.compactIndex!=='boolean')failure('CONFIG_TYPE',file,'/compactIndex','需要布尔值');
 if(input.output!==undefined&&!plain(input.output))failure('CONFIG_TYPE',file,'/output','output 需要对象');
 for(const key of Object.keys(input.output??{}))if(!['html','pdf'].includes(key))failure('CONFIG_FIELD',file,'/output/'+pointer(key),`未知输出格式：${key}`);
 const outputs:ResolvedConfig['outputs']=[];
 for(const format of ['html','pdf'] as const){const value=input.output?.[format]??(format==='html'?'output/index.html':false);if(value===false)continue;if(typeof value!=='string'||!value.endsWith('.'+format))failure('CONFIG_OUTPUT',file,'/output/'+format,`需要 .${format} 输出路径或 false`);outputs.push({format,file:projectPath(root,root,value,false)});}
 if(!outputs.length)failure('CONFIG_OUTPUT',file,'/output','至少启用一种输出');
 if(input.chromiumExecutable!==undefined&&typeof input.chromiumExecutable!=='string')failure('CONFIG_TYPE',file,'/chromiumExecutable','需要可执行文件路径');
 const executable=input.chromiumExecutable?(input.chromiumExecutable.startsWith('/')||/^[A-Za-z]:/.test(input.chromiumExecutable)?input.chromiumExecutable:projectPath(root,root,input.chromiumExecutable)):undefined;
 return {file,root,markdoc:markdocOptions(input.markdoc,file),title:text('title',basename(root)||'工程文档'),projectId:text('projectId',basename(root)||'project'),documents,data:input.data??'docs/ir',...arrays,outputs,chromiumExecutable:executable,compactIndex:input.compactIndex??false,configInputs:[file,...loaded.dependencies.map(p=>resolve(root,p))],defaultData:input.data===undefined,children:input.children??{},attachments:input.attachments??{}};
}

// 配置、文档扫描先完成，再执行数据提供函数/扫描数据目录。无需用户手写资源清单。
export async function loadProject(config:ResolvedConfig,options:{onInputs?:(inputs:string[])=>void}={}):Promise<LoadedProject>{
 const documents=scanDocuments(config.root,config.documents,{markdoc:config.markdoc,configFile:config.file,projectRoots:Object.values(config.children).map(file=>configProjectRoot(resolve(config.root,file)))});await Promise.all(documents.pending??[]);if(!documents.documents.length)failure('DOCUMENT_EMPTY',config.file,'/documents','没有发现可发布的正文');directoryOrders(documents);const inputs=new Set<string>([...config.configInputs,...documents.files.map(p=>resolve(config.root,p))]);
 const dataFiles:string[]=[],parts:ResourcePart[]=[],required=new Set<string>(),versions=[SUPPORTED_IR_VERSION],seenFiles=new Set<string>(),seenDirectories=new Set<string>();
 const attachmentDefinitions:Record<string,AttachmentInput>=Object.assign(Object.create(null),config.attachments);
 const addDataset=(raw:unknown,file:string,prefix='',explicit=true)=>{
  if(!plain(raw)){if(!explicit)return;failure('DATA_FORMAT',file,prefix,'数据需要包含 objects/relations/views/tables/waveforms/references 数组的对象');}
  const keys=resourceTypes.filter(type=>Object.hasOwn(raw,type));
  if(!keys.length&&!Object.hasOwn(raw,'attachments')){if(explicit)failure('DATA_FORMAT',file,prefix,'文件没有可识别的工程数据数组');return;}
  const allowed=[...resourceTypes,'irVersion','requiredFeatures','projectId','adapterVersion','attachments'];
  for(const key of Object.keys(raw))if(!allowed.includes(key as any))failure('DATA_FIELD',file,prefix+'/'+pointer(key),'未知数据字段：'+key);
  if(raw.irVersion!==undefined){if(typeof raw.irVersion!=='string'||!/^1\.\d+$/.test(raw.irVersion))failure('IR_VERSION',file,prefix+'/irVersion','不支持的数据版本');versions.push(raw.irVersion);}
  if(raw.projectId!==undefined&&raw.projectId!==config.projectId)failure('PROJECT_ID',file,prefix+'/projectId','数据 projectId 与配置不一致');
  if(raw.requiredFeatures!==undefined){if(!Array.isArray(raw.requiredFeatures)||raw.requiredFeatures.some((f:unknown)=>typeof f!=='string'||!features.includes(f)))failure('IR_FEATURE',file,prefix+'/requiredFeatures','数据要求了未知或不支持的能力');raw.requiredFeatures.forEach((f:string)=>required.add(f));}
  if(raw.attachments!==undefined){if(!record(raw.attachments))failure('DATA_FORMAT',file,prefix+'/attachments','附件定义需要对象');for(const [id,attachment]of Object.entries(raw.attachments)){if(Object.hasOwn(attachmentDefinitions,id))failure('DUPLICATE_ID',file,prefix+'/attachments/'+id,'附件重复定义：'+id);attachmentDefinitions[id]=attachment;}}
  for(const type of keys){
   let data:any;try{data=JSON.parse(JSON.stringify({[type]:raw[type]},(_key,value)=>{if(['function','symbol','bigint'].includes(typeof value)||typeof value==='number'&&!Number.isFinite(value))throw new Error('数据必须是有限且可序列化的 JSON 值');return value;}));}catch(error){failure('DATA_VALUE',file,prefix+'/'+type,String(error));}
   parts.push({type,data,file,prefix});
   for(const e of Array.isArray(data[type])?data[type]:[]){
    if(e?.kind==='node'&&Array.isArray(e.interfaces)&&e.interfaces.length)required.add('interface-groups');
    if(type==='views'&&e?.layout&&(e.layout.constraints!==undefined||e.layout.relationHints!==undefined))required.add('layout-intent');
   }
  }
 };
 function readFile(file:string,explicit:boolean){
  const identity=realpathSync(file);if(seenFiles.has(identity))return;seenFiles.add(identity);requireFile(file);inputs.add(identity);
  if(statSync(file).size>16*1024*1024)failure('FILE_SIZE',file,'','单个数据文件最多 16 MiB，请按数据分片');
  let raw:unknown;try{raw=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(file)));}catch{failure('JSON_PARSE',file,'','不是有效 UTF-8 JSON');}
  const count=parts.length+Object.keys(attachmentDefinitions).length;addDataset(raw,file,'',explicit);if(parts.length+Object.keys(attachmentDefinitions).length>count)dataFiles.push(relative(config.root,file).split('\\').join('/'));
 }
 function scan(value:string,explicit:boolean){
  const path=projectPath(config.root,config.root,value,explicit);if(!existsSync(path))return;
  const stat=statSync(path);
  if(stat.isDirectory()){
   const identity=realpathSync(path);if(seenDirectories.has(identity))return;seenDirectories.add(identity);
   for(const entry of readdirSync(path,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){if(entry.name.startsWith('.')||entry.name==='node_modules')continue;const child=relative(config.root,resolve(path,entry.name)).split('\\').join('/');if(entry.isDirectory()||entry.isSymbolicLink())scan(child,true);else if(entry.isFile()&&extname(entry.name)==='.json')readFile(projectPath(config.root,config.root,child),false);}
  }else if(stat.isFile())readFile(path,explicit);else failure('FILE_TYPE',path,'','数据来源需要文件或目录');
 }
 let source:unknown=config.data;
 if(typeof source==='function')try{source=await source({root:config.root,documents:documents.files.slice(),references:documents.references.map(r=>({...r}))});}catch(error){if(error instanceof EdocError)throw error;failure('DATA_PROVIDER',config.file,'/data',String(error));}
 if(typeof source==='string')scan(source,!config.defaultData);
 else if(Array.isArray(source)){if(source.some(v=>typeof v!=='string'))failure('CONFIG_TYPE',config.file,'/data','路径数组只能包含字符串');source.forEach(p=>scan(p,true));}
 else addDataset(source,config.file,'/data');
 const inline:Dataset={};for(const key of ['views','tables','waveforms','references'] as const)if(config[key].length)inline[key]=config[key] as any;
 if(Object.keys(inline).length)addDataset(inline,config.file);
 // 仅在本次加载中复用已定位来源；下一次加载仍重新检查文件与符号链接边界。
 const inputSources=new Set<string>();
 for(const part of parts){const visit=(value:any)=>{if(!value||typeof value!=='object')return;if(plain(value.source)&&typeof value.source.file==='string'&&!inputSources.has(value.source.file)){inputs.add(projectPath(config.root,config.root,value.source.file,false));inputSources.add(value.source.file);}for(const [key,child]of Object.entries(value))if(key!=='source')if(Array.isArray(child))child.forEach(visit);else if(plain(child))visit(child);};visit(part.data);}
 const attachments=await loadAttachments(config.root,attachmentDefinitions,config.file,file=>inputs.add(file));
 if(Object.keys(attachments).length)required.add('pdf-attachments');
 const allInputs=[...inputs];options.onInputs?.(allInputs);
 const metadata:Manifest={projectId:config.projectId,irVersion:versions.sort((a,b)=>Number(b.split('.')[1])-Number(a.split('.')[1]))[0],requiredFeatures:[...required],resources:parts.map(p=>({type:p.type,path:relative(config.root,p.file).split('\\').join('/')})),entryDocuments:config.documents};
 const graph=graphFromResources(parts,metadata,{root:config.root,documents,strict:true,attachments});
 return {config,graph,documents,inputs:allInputs,dataFiles};
}

export function protectOutputs(outputs:{file:string}[],inputs:string[]){
 const identity=(file:string)=>{const target=resolve(file);let existing=target;while(!existsSync(existing)&&dirname(existing)!==existing)existing=dirname(existing);return resolve(realpathSync(existing),relative(existing,target));};
 const source=new Set(inputs.map(identity)),seen=new Set<string>();
 for(const {file}of outputs){const target=identity(file);if(source.has(target))failure('OUTPUT_SOURCE',file,'','输出会覆盖项目输入或配置');if(seen.has(target))failure('OUTPUT_DUPLICATE',file,'','多个输出不能写到同一路径');seen.add(target);}
}
