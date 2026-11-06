import type {Book,ProjectNode} from './book.ts';
import Markdoc from '@markdoc/markdoc';
import {pageGraph,pageId} from './book.ts';
import {prepareOutline} from './outline.ts';
import {anchor,anchorCandidates} from './identity.ts';
import {localDocumentLink,tags} from './documents.ts';
import {loadImageAsset} from './media.ts';
import type {ImageAsset} from './media.ts';
import {EdocError} from './errors.ts';
import type {Diagnostic} from './types.ts';

// 仅分析已解析正文与声明式数据，不执行用户transform，也不启动图形布局或HTML打包。
export function preflightBook(book:Book):{deferredAnchors:Diagnostic[]}{
 const errors:Diagnostic[]=[],deferredAnchors:Diagnostic[]=[];
 for(const node of book.projects.values()){
  const plan=node.documents,media=new Map<string,ImageAsset>();
  for(const check of plan.checks??[]){
   const {node:element,file,line}=check;
   if(element.type!=='image'&&!(element.type==='tag'&&plan.markdoc?.tags?.[element.tag]?.render==='img'))continue;
   const src=element.type==='image'?element.attributes.src:element.transformAttributes(plan.markdoc).src;
   if(media.has(src))continue;
   try{media.set(src,loadImageAsset(node.config.root,src));}
   catch(error){if(error instanceof EdocError)errors.push(...error.diagnostics.map(d=>({...d,file,path:`#L${line}`,message:`${src}：${d.message}`})));else throw error;}
  }
  plan.media=media;
  checkAnchors(node,errors,deferredAnchors);
 }
 if(errors.length)throw new EdocError(errors);
 return {deferredAnchors};
}

function checkAnchors(node:ProjectNode,errors:Diagnostic[],deferred:Diagnostic[]){
 const pages=new Map<string,{ids:Set<string>;opaque:boolean}>(),sections=new Set<string>();
 const walk=(element:any,visit:(element:any)=>void)=>{visit(element);for(const child of [...Object.values(element.slots??{}),...element.children??[]])walk(child,visit);};
 for(const document of node.documents.documents){
  const id=pageId(document.file);
  if(pages.has(id)){errors.push({code:'PAGE_DUPLICATE',file:document.file,path:'',message:'文档路由重复：'+id});continue;}
  const graph=pageGraph(node,document),outline=prepareOutline(graph),page={ids:new Set(outline.all.map(entry=>entry.id)),opaque:false};
  pages.set(id,page);
  walk(document.ast,element=>{
   const {type,tag,attributes:a={}}=element;
   if(type==='tag'&&['section','specification'].includes(tag)){sections.add(a.id);return;}
   if(type==='tag'&&tag==='register-field-table'){const register=graph.index.get(a.id)?.entity;if(register&&'fields' in register)for(const field of register.fields)page.ids.add(anchor(field.id));return;}
   if(type==='tag'&&tag==='data-table'){
    const table=graph.index.get(a.id)?.entity;if(table&&'rows' in table)for(const row of table.rows??[])page.ids.add(anchor(row.id));return;
   }
   // 标准容器和原生节点的ID按原值渲染；不猜测自定义transform最终输出。
   if(type!=='tag'||['columns','panel','tabs','tab'].includes(tag))if(typeof a.id==='string')page.ids.add(a.id);
   const nativeNode=Markdoc.nodes[type as keyof typeof Markdoc.nodes];
   const schema=type==='tag'?node.documents.markdoc?.tags?.[tag]:node.documents.markdoc?.nodes?.[type as keyof typeof Markdoc.nodes];
   if(schema?.transform&&schema!==nativeNode&&!(type==='tag'&&Object.hasOwn(tags,tag))&&!(type==='tag'&&['if','else','partial'].includes(tag)))page.opaque=true;
   if(type==='tag'&&!Object.hasOwn(tags,tag)&&!['if','else','partial'].includes(tag)&&schema?.render)page.opaque=true;
  });
 }
 const project=node.config.projectId;
 const check=(pageId:string,fragment:string,file:string,line:number)=>{
  const page=pages.get(pageId),diagnostic:Diagnostic={code:page?'DOCUMENT_ANCHOR':'DOCUMENT_PAGE',file,path:`#L${line}`,message:page?`本地锚点不存在：${fragment}（${pageId}）`:`本地文档不存在：${pageId}`};
  if(!page){errors.push(diagnostic);return;}
  if(!fragment||anchorCandidates(fragment).some(id=>page.ids.has(id)))return;
  if(page.opaque)deferred.push({...diagnostic,code:'DOCUMENT_ANCHOR_DEFERRED',message:`目标页含自定义转换，锚点留待 build 校验：${fragment}（${pageId}）`});else errors.push(diagnostic);
 };
 for(const entry of node.graph.index.values())if(entry.type==='row'&&'links' in entry.entity)for(const target of Object.values(entry.entity.links??{}))if(target.kind==='page'&&(!target.project||target.project===project))check(target.id,target.anchor??'',entry.location.file,0);
 for(const document of node.documents.documents)walk(document.ast,element=>{
  const a=element.attributes??{},location=document.locations.get(element)??{file:document.file,line:1};
  const file=a.__edocSourceFile??location.file;
  if(element.type==='tag'&&element.tag==='page'&&(!a.project||a.project===project))check(a.id,a.anchor??'',file,location.line);
  if(element.type!=='link'||typeof a.href!=='string')return;
  try{
   if(a.href.startsWith('#')){
    const fragment=decodeURIComponent(a.href.slice(1));
    // section与实体具有工程级稳定身份；普通标题/容器仍在本页定位。
    if([...sections].some(id=>fragment===id||fragment===anchor(id))||[...node.graph.index.keys()].some(id=>fragment===anchor(id))||fragment.startsWith('edoc='))return;
    check(pageId(document.file),fragment,file,location.line);
   }else{
    const target=localDocumentLink(node.config.root,file,a.href);if(target)check(pageId(target.file),target.anchor,file,location.line);
   }
  }catch(error){if(error instanceof EdocError)errors.push(...error.diagnostics);else if(error instanceof URIError)errors.push({code:'DOCUMENT_LINK',file,path:`#L${location.line}`,message:'文档链接编码错误'});else throw error;}
 });
}
