import {realpathSync,statSync} from 'node:fs';
import {relative,extname,dirname,resolve} from 'node:path';
import {loadProject,resolveProjectConfig} from './project.ts';
import type {LoadedProject,ResolvedConfig} from './project.ts';
import {projectPath} from './paths.ts';
import {failure} from './errors.ts';
import {prepareOutline} from './outline.ts';
import {anchor} from './identity.ts';
import {directoryOrders,orderDirectory} from './directory-order.ts';

export type ProjectNode=LoadedProject&{children:Map<string,ProjectNode>};
export type Book={root:ProjectNode;projects:Map<string,ProjectNode>;inputs:string[]};
export type Navigation={label:string;project:string;page:string;anchor?:string;children:Navigation[];source?:{file:string;line:number};id?:string;sectionId?:string;level?:number;depth?:number;parentId?:string;childrenOmitted?:number};
export {routeHash} from './routes.ts';
export type {Route} from './routes.ts';
export const pageId=(file:string)=>file.slice(0,-extname(file).length);
export const pageGraph=(node:ProjectNode,document:LoadedProject['documents']['documents'][number])=>({...node.graph,documentPlan:{...node.documents,documents:[document]}});
export async function loadBook(config:ResolvedConfig,options:{onInputs?:(inputs:string[])=>void}={}):Promise<Book>{
 const projects=new Map<string,ProjectNode>(),seen=new Set<string>(),inputs=new Set<string>();
 const load=async(current:ResolvedConfig,chain:string[]):Promise<ProjectNode>=>{
  const identity=realpathSync(current.file);if(chain.includes(identity))failure('PROJECT_CYCLE',current.file,'/children','工程组合构成循环');
  if(seen.has(identity))failure('PROJECT_DUPLICATE',current.file,'/children','同一真实配置被重复接入');seen.add(identity);
  if(projects.has(current.projectId))failure('PROJECT_ID_DUPLICATE',current.file,'/projectId',`项目 ID ${current.projectId} 已由 ${projects.get(current.projectId)!.config.file} 使用`);
  const local=await loadProject(current,{onInputs(files){files.forEach(f=>inputs.add(f));options.onInputs?.([...inputs]);}}),node:ProjectNode={...local,children:new Map()};projects.set(current.projectId,node);
  for(const document of local.documents.documents)for(const tag of document.ast.walk())if(tag.type==='tag'&&tag.tag==='include'&&tag.attributes.project!==undefined){
   const alias=tag.attributes.project;
   if(!Object.hasOwn(current.children,alias))failure('PROJECT_INCLUDE',document.file,`#L${document.locations.get(tag)?.line??1}`,'未声明子工程：'+alias);
   if(node.children.has(alias))failure('PROJECT_DUPLICATE',document.file,'','子工程被重复接入：'+alias);
   const path=projectPath(current.root,current.root,current.children[alias]);
   const child=await load(await resolveProjectConfig(path),[...chain,identity]);node.children.set(alias,child);
  }
  return node;
 };
 const root=await load(config,[]);return {root,projects,inputs:[...inputs]};
}
export function bookNavigation(book:Book):Navigation[]{
 const build=(node:ProjectNode):Navigation[]=>{const pages=node.documents.documents.map(document=>{
  const graph=pageGraph(node,document),plan=prepareOutline(graph),id=pageId(document.file),label=pageTitle(document),root:Navigation={label,project:node.config.projectId,page:id,children:[]},entries=new Map<string,Navigation>();
  const walk=(ast:any,section:Navigation)=>{
   const outline=plan.entries.get(ast);let context=section;
   if(outline&&outline===plan.flat[0]&&outline.label===label){Object.assign(root,{source:outline.source,anchor:outline.id,id:outline.id,...(outline.sectionId?{sectionId:outline.sectionId}:{}),level:outline.level,depth:0});entries.set(outline.id,root);context=root;}else if(outline){const entry:Navigation={...outline,label:outline.label,project:root.project,page:id,anchor:outline.id,children:[]};entries.set(outline.id,entry);(outline.parentId?entries.get(outline.parentId)?.children:root.children)?.push(entry);if(outline.kind==='section')context=entry;}
   if(ast.type==='tag'&&ast.tag==='include'&&ast.attributes.project){const child=node.children.get(ast.attributes.project)!;const pages=build(child);context.children.push({label:child.config.title,project:child.config.projectId,page:pageId(child.documents.documents[0].file),children:pages});}
   for(const child of [...Object.values(ast.slots??{}),...ast.children??[]])walk(child,context);
  };walk(document.ast,root);return root;
 });
 const roots:Navigation[]=[],folders=new Map<string,Navigation>(),keys=new Map<Navigation,string>();
 const configured=node.config.documents.filter(file=>statSync(resolve(node.config.root,file)).isDirectory()).map(file=>relative(node.config.root,resolve(node.config.root,file)).split('\\').join('/')||'.');
 let base=configured.length===1?configured[0]:dirname(node.documents.documents[0].file);
 while(base!=='.'&&node.documents.documents.some(d=>d.file!==base&&!d.file.startsWith(base+'/')))base=dirname(base);
 const folder=(path:string):Navigation[]=>{if(!path||path==='.')return roots;const existing=folders.get(path);if(existing)return existing.children;const parent=folder(dirname(path)),entry:Navigation={label:path.split('/').at(-1)!,project:node.config.projectId,page:'',children:[]};folders.set(path,entry);keys.set(entry,path.split('/').at(-1)!+'/');parent.push(entry);return entry.children;};
 pages.forEach((entry,index)=>{const file=node.documents.documents[index].file,local=base==='.'?file:file.startsWith(base+'/')?file.slice(base.length+1):file,path=dirname(local);const siblings=folder(path),name=local.split('/').at(-1)!;if(/^index\.(md|mdoc)$/i.test(name)&&path!=='.'){const group=folders.get(path)!,children=group.children;Object.assign(group,{...entry,children:[...entry.children,...children]});}else{if(!/^index\.(md|mdoc)$/i.test(name))keys.set(entry,name);siblings.push(entry);}});
 for(const [directory,items]of directoryOrders(node.documents)){
  const path=directory===base?'.':base==='.'?directory:directory.slice(base.length+1),siblings=path==='.'?roots:folders.get(path)?.children;
  if(siblings)orderDirectory(siblings,items,entry=>keys.get(entry));
 }
 return roots;};return build(book.root);
}
export function pageTitle(document:LoadedProject['documents']['documents'][number]):string{
 const plain=(v:any):string=>typeof v==='string'||typeof v==='number'?String(v):Array.isArray(v)?v.map(plain).join(''):'';
 const text=(node:any):string=>node.type==='text'||node.type==='code'?plain(node.attributes.content):[...Object.values(node.slots??{}),...node.children??[]].map(text).join('');
 const nodes=[...document.ast.walk()],heading=nodes.find(n=>n.type==='heading'),section=nodes.find(n=>n.type==='tag'&&n.tag==='section');
 const first=nodes.find(n=>n.type==='heading'||n.type==='tag'&&n.tag==='section'&&n.attributes.title);return first?.type==='heading'?text(first).trim():first?.attributes.title??(heading?text(heading).trim():undefined)??section?.attributes.title??document.file;
}
export type OutlineOptions={project?:string;id?:string;depth?:number};
export function projectOutline(book:Book,options:OutlineOptions={}){
 return selectOutline(bookNavigation(book),book.root.config.projectId,[...book.projects.keys()],options);
}
// 预构建手册与实时工程共用目录选择，不执行配置或重新发现源文件。
export function selectOutline(navigation:Navigation[],rootProject:string,projects:string[],options:OutlineOptions={}){
 if(options.depth!==undefined&&(!Number.isInteger(options.depth)||options.depth<0||options.depth>10))failure('OUTLINE_DEPTH','<outline>','/depth','目录深度必须为 0–10 的整数');
 if(options.project!==undefined&&!projects.includes(options.project))failure('QUERY_NOT_FOUND','<outline>','/project','当前组合中没有此工程：'+options.project);
 const collect=(nodes:Navigation[],match:(node:Navigation)=>boolean):Navigation[]=>nodes.flatMap(node=>[...(match(node)?[node]:[]),...collect(node.children,match)]);
 const inProject=(nodes:Navigation[]):Navigation[]=>nodes.flatMap(node=>node.project===options.project?[{...node,children:inProject(node.children)}]:inProject(node.children));
 let chapters=options.project?inProject(navigation):navigation;
 if(options.id){chapters=collect(chapters,node=>node.sectionId===options.id);if(!chapters.length)failure('QUERY_NOT_FOUND','<outline>','/id','当前目录中没有此章节：'+options.id);if(chapters.length>1)failure('OUTLINE_AMBIGUOUS','<outline>','/id','多个工程存在同名章节，请用 --project 指定：'+options.id);}
 const trim=(nodes:Navigation[],depth=0):Navigation[]=>nodes.map(node=>({...node,children:options.depth!==undefined&&depth>=options.depth?[]:trim(node.children,depth+1),...(options.depth!==undefined&&depth>=options.depth&&node.children.length?{childrenOmitted:node.children.length}:{})}));
 return {projectId:options.project??rootProject,projects:options.project?[options.project]:projects,chapters:trim(chapters),...(options.depth!==undefined?{maxDepth:options.depth}:{})};
}
