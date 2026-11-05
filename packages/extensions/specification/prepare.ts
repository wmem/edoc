import {anchor} from '../../core/identity.ts';
import Markdoc from '@markdoc/markdoc';
import type {Graph,Specification,Source,Reference} from '../../core/types.ts';
import {documentAST,scanDocuments} from '../../core/documents.ts';
import type {DocumentPlan} from '../../core/documents.ts';
import {formatContent} from '../../core/content.ts';
import {failure} from '../../core/errors.ts';
import {validateSchema} from '../../core/schema.ts';
import {EdocError} from '../../core/errors.ts';

export const specificationNamespace=(id:string)=>'spec-definition-'+anchor(id)+'-';
type Document=DocumentPlan['documents'][number];
export type Definition={entity:Specification;node:any;document:Document};
export type Application={for:string;common:string[];specific:string[];source:Source};
export type SpecificationPlan={definitions:Map<string,Definition>;applications:Map<string,Application>};

// 机器源正文也经过同一 Markdoc 扫描器；不回调 data，不执行另一个工程配置。
export function prepareSpecificationDocuments(root:string,plan:DocumentPlan,specifications:Specification[]){
 plan.preparedSpecifications??=new Set();const encountered=new Set<string>();
 for(const spec of specifications){
  if(encountered.has(spec.id))failure('DUPLICATE_ID',spec.source.file,'','规范 ID 重复：'+spec.id);encountered.add(spec.id);
  if(plan.preparedSpecifications.has(spec.id))continue;plan.preparedSpecifications.add(spec.id);
  const parsed=scanDocuments(root,[],{markdoc:plan.options,projectRoots:plan.projectRoots,virtual:{file:spec.source.file,content:spec.body.content,line:spec.source.line}});
  const document=parsed.documents[0],wrapper=new Markdoc.Ast.Node('tag',{id:spec.id,title:spec.label},document.ast.children,'specification');
  document.scopes?.set(wrapper,plan.markdoc?.variables);
  document.locations.set(wrapper,{file:spec.source.file,line:spec.source.line??1});
  document.ast.children=[wrapper];document.file='__specifications__/'+encodeURIComponent(spec.id)+'.mdoc';document.hidden=true;
  const skipped=new Set(parsed.documents.slice(1).filter(d=>plan.documents.some(existing=>existing.file===d.file)).map(d=>d.file));
  plan.documents.push(...parsed.documents.filter(d=>d===document||!skipped.has(d.file)));plan.files=[...new Set([...plan.files,...parsed.files])];
  plan.checks??=[];plan.checks.push(...(parsed.checks??[]).filter(c=>!c.documentFile||!skipped.has(c.documentFile)));plan.references.push(...parsed.references.filter(r=>!skipped.has(r.file)));
  plan.pending??=[];plan.pending.push(...parsed.pending??[]);
  // validateDocuments 的全量依赖检查可从任一入口查到真实定义位置。
  for(const target of plan.documents)for(const check of plan.checks)target.locations.set(check.node,{file:check.file,line:check.line});
 }
}

export function prepareMachineSpecifications(graph:Graph){
 documentAST(graph);prepareSpecificationDocuments(graph.projectRoot,graph.documentPlan!,[...graph.index.values()].filter(e=>e.type==='specification').map(e=>e.entity as Specification));
}

export function registerSpecifications(graph:Graph){
 const definitions=new Map<string,Definition>(),applications=new Map<string,Application>();
 graph.specifications={definitions,applications};
 for(const document of documentAST(graph)){
  const visit=(node:any,inside=false)=>{
   const isSpec=node.type==='tag'&&node.tag==='specification',isList=node.type==='tag'&&node.tag==='spec-list';
   const source=document.locations.get(node)??{file:document.file,line:1};
   if(inside&&(isSpec||isList))failure('SPECIFICATION_NESTING',source.file,`#L${source.line}`,'规范正文不能嵌套 specification 或 spec-list');
   if(isSpec){
    const id=node.attributes.id;
    if(typeof id!=='string'||!id.trim()||typeof node.attributes.title!=='string'||!node.attributes.title.trim())failure('SPECIFICATION_ID',source.file,`#L${source.line}`,'规范需要非空 id 和 title');
    if(definitions.has(id)||!document.hidden&&graph.index.has(id))failure('DUPLICATE_ID',source.file,`#L${source.line}`,'规范 ID 已定义：'+id);
    const entity:Specification=document.hidden?graph.index.get(id)!.entity as Specification:{id,kind:'specification',label:node.attributes.title,body:{format:'markdoc',content:formatContent(node.children)},source:{...source,selector:id}};
    const errors=validateSchema('specification',{specifications:[entity]},source.file);if(errors.length)throw new EdocError(errors);
    if(!document.hidden)graph.index.set(id,{id,type:'specification',entity,location:{file:source.file,path:`#L${source.line}`}});
    definitions.set(id,{entity,node,document});
   }
   for(const child of [...Object.values(node.slots??{}),...node.children??[]])visit(child,inside||isSpec);
  };visit(document.ast);
 }
 const lists=graph.documentPlan?.checks?.filter(c=>c.node.type==='tag'&&c.node.tag==='spec-list')??[];
 const active=new Set(documentAST(graph).flatMap(d=>[...d.ast.walk()].filter(n=>n.type==='tag'&&n.tag==='spec-list')));
 // 隐藏分支也校验依赖；只有原生条件选中的声明派生适用关系。
 for(const {node,file,line}of lists){
  const a=node.attributes,id=a.for,target=graph.index.get(id);
  if(!target||target.type!=='document')failure('SPECIFICATION_BEHAVIOR',file,`#L${line}`,'for 必须指向已加载 section：'+id);
  if(a.common===undefined&&a.specific===undefined)continue;
  const all=new Set<string>();
  for(const role of ['common','specific'] as const){const items=a[role]??[];
   if(!Array.isArray(items))failure('SPECIFICATION_APPLICATION',file,`#L${line}`,'约束列表必须为 ID 数组');
   for(const specId of items){if(typeof specId!=='string'||!specId.trim()||!definitions.has(specId))failure('SPECIFICATION_REFERENCE',file,`#L${line}`,'规范缺失或类型不符：'+specId);
    if(all.has(specId))failure('SPECIFICATION_APPLICATION',file,`#L${line}`,'同一集合内规范重复或同时属于公共与专属：'+specId);all.add(specId);}
  }
  if(active.has(node)){
   if(applications.has(id))failure('SPECIFICATION_APPLICATION',file,`#L${line}`,'行为只能定义一次适用集合：'+id);
   applications.set(id,{for:id,common:[...a.common??[]],specific:[...a.specific??[]],source:{file,line}});
  }
 }
 for(const {node,file,line}of lists)if(node.attributes.common===undefined&&node.attributes.specific===undefined&&!applications.has(node.attributes.for))failure('SPECIFICATION_APPLICATION',file,`#L${line}`,'复用的行为尚未定义约束集合：'+node.attributes.for);
 for(const set of applications.values())for(const role of ['common','specific'] as const)for(const id of set[role]){
  const referenceId='spec-application:'+JSON.stringify([set.for,role,id]);
  if(graph.index.has(referenceId))failure('DUPLICATE_ID',set.source.file,'','派生适用关系 ID 冲突：'+referenceId);
  const reference:Reference={id:referenceId,kind:'reference',fromId:set.for,targetId:id,class:'applies-'+role,source:set.source};
  graph.index.set(referenceId,{id:referenceId,type:'reference',entity:reference,location:{file:set.source.file,path:`#L${set.source.line}`}});
 }
}

// 仅生成展示 AST；原始 AST、稳定实体和适用关系不随展示次数复制。
export function presentationGraph(graph:Graph):Graph{
 const plan=graph.documentPlan;if(!plan||!graph.specifications?.definitions.size)return graph;
 let occurrence=0,scopeCounter=0;const renderScopes=new Map<string,any>();
 const documents=plan.documents.map(document=>{
  const locations=new WeakMap<object,{file:string;line:number}>();
  const copy=(node:any,origin:Document,namespace=''):any=>{
   const result=Object.assign(new Markdoc.Ast.Node(),node,{attributes:{...node.attributes},children:[],slots:{}});
   const variablesAtSource=origin.scopes?.get(node);if((namespace||node.tag==='specification')&&variablesAtSource!==undefined){const key=String(++scopeCounter);renderScopes.set(key,variablesAtSource);result.attributes.__edocScopeKey=key;}
   locations.set(result,origin.locations.get(node)??{file:origin.file,line:1});
   if(namespace){result.attributes.__edocNamespace=namespace;if(node.tag==='reference'&&node.attributes.project===undefined)result.attributes.project=graph.manifest.projectId;}
   if(node.type==='tag'&&node.tag==='spec-list'){
    const set=graph.specifications!.applications.get(node.attributes.for)!;
    result.tag='__spec-list';result.attributes={for:set.for};
    for(const role of ['common','specific'] as const)for(const id of set[role]){
     const definition=graph.specifications!.definitions.get(id)!,ns='spec-instance-'+(++occurrence)+'-';
     const child=copy(definition.node,definition.document,ns);
     child.attributes.collapsed=node.attributes.collapsed??true;child.attributes.__edocApplicationRole=role;child.attributes.__edocBehavior=set.for;result.children.push(child);
    }
    return result;
   }
   if(node.type==='tag'&&node.tag==='specification'){
    result.tag='section';result.attributes.__edocSpecification=node.attributes.id;
    result.attributes.__edocBodyNamespace=namespace||specificationNamespace(node.attributes.id);
   }
   const bodyNamespace=result.attributes.__edocBodyNamespace??namespace;
   result.children=(node.children??[]).map((child:any)=>copy(child,origin,bodyNamespace));
   result.slots=Object.fromEntries(Object.entries(node.slots??{}).map(([key,slot])=>[key,copy(slot,origin,bodyNamespace)]));return result;
  };
  return {...document,ast:copy(document.ast,document),locations};
 });
 return {...graph,documentPlan:{...plan,documents,renderScopes}};
}
