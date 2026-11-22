import {anchor} from '../../core/identity.ts';
import Markdoc from '@markdoc/markdoc';
import type {Graph,Clause,Source,Reference} from '../../core/types.ts';
import {documentAST,scanDocuments} from '../../core/documents.ts';
import type {DocumentPlan} from '../../core/documents.ts';
import {formatContent} from '../../core/content.ts';
import {failure} from '../../core/errors.ts';
import {validateSchema} from '../../core/schema.ts';
import {EdocError} from '../../core/errors.ts';

export const clauseNamespace=(id:string)=>'clause-definition-'+anchor(id)+'-';
type Document=DocumentPlan['documents'][number];
export type Definition={entity:Clause;node:any;document:Document};
export type Application={for:string;ids:string[];source:Source};
export type ClausePlan={definitions:Map<string,Definition>;applications:Map<string,Application>};

// 机器源正文也经过同一 Markdoc 扫描器；不回调 data，不执行另一个工程配置。
export function prepareClauseDocuments(root:string,plan:DocumentPlan,clauses:Clause[]){
 plan.preparedClauses??=new Set();const encountered=new Set<string>();
 for(const spec of clauses){
  if(encountered.has(spec.id))failure('DUPLICATE_ID',spec.source.file,'','条款 ID 重复：'+spec.id);encountered.add(spec.id);
  if(plan.preparedClauses.has(spec.id))continue;plan.preparedClauses.add(spec.id);
  const parsed=scanDocuments(root,[],{markdoc:plan.options,projectRoots:plan.projectRoots,virtual:{file:spec.source.file,content:spec.body.content,line:spec.source.line}});
  const document=parsed.documents[0],wrapper=new Markdoc.Ast.Node('tag',{id:spec.id,title:spec.label},document.ast.children,'clause');
  document.scopes?.set(wrapper,plan.markdoc?.variables);
  document.locations.set(wrapper,{file:spec.source.file,line:spec.source.line??1});
  document.ast.children=[wrapper];document.file='__clauses__/'+encodeURIComponent(spec.id)+'.mdoc';document.hidden=true;
  const skipped=new Set(parsed.documents.slice(1).filter(d=>plan.documents.some(existing=>existing.file===d.file)).map(d=>d.file));
  plan.documents.push(...parsed.documents.filter(d=>d===document||!skipped.has(d.file)));plan.files=[...new Set([...plan.files,...parsed.files])];
  plan.checks??=[];plan.checks.push(...(parsed.checks??[]).filter(c=>!c.documentFile||!skipped.has(c.documentFile)));plan.references.push(...parsed.references.filter(r=>!skipped.has(r.file)));
  plan.pending??=[];plan.pending.push(...parsed.pending??[]);
  // validateDocuments 的全量依赖检查可从任一入口查到真实定义位置。
  for(const target of plan.documents)for(const check of plan.checks)target.locations.set(check.node,{file:check.file,line:check.line});
 }
}

export function prepareMachineClauses(graph:Graph){
 documentAST(graph);prepareClauseDocuments(graph.projectRoot,graph.documentPlan!,[...graph.index.values()].filter(e=>e.type==='clause').map(e=>e.entity as Clause));
}

export function registerClauses(graph:Graph){
 const definitions=new Map<string,Definition>(),applications=new Map<string,Application>();
 graph.clauses={definitions,applications};
 for(const document of documentAST(graph)){
  const visit=(node:any,inside=false)=>{
   const isSpec=node.type==='tag'&&node.tag==='clause',isList=node.type==='tag'&&node.tag==='clause-list';
   const source=document.locations.get(node)??{file:document.file,line:1};
   if(inside&&(isSpec||isList))failure('CLAUSE_NESTING',source.file,`#L${source.line}`,'条款正文不能嵌套 clause 或 clause-list');
   if(isSpec){
    const id=node.attributes.id;
    if(typeof id!=='string'||!id.trim()||typeof node.attributes.title!=='string'||!node.attributes.title.trim())failure('CLAUSE_ID',source.file,`#L${source.line}`,'条款需要非空 id 和 title');
    if(definitions.has(id)||!document.hidden&&graph.index.has(id))failure('DUPLICATE_ID',source.file,`#L${source.line}`,'条款 ID 已定义：'+id);
    const entity:Clause=document.hidden?graph.index.get(id)!.entity as Clause:{id,kind:'clause',label:node.attributes.title,body:{format:'markdoc',content:formatContent(node.children)},source:{...source,selector:id}};
    const errors=validateSchema('clause',{clauses:[entity]},source.file);if(errors.length)throw new EdocError(errors);
    if(!document.hidden)graph.index.set(id,{id,type:'clause',entity,location:{file:source.file,path:`#L${source.line}`},semanticKind:'clause',...(node.attributes.__edocOwnerId?{ownerId:node.attributes.__edocOwnerId}:{})});
    if(document.hidden)graph.index.get(id)!.semanticKind='clause';
    definitions.set(id,{entity,node,document});
   }
   for(const child of [...Object.values(node.slots??{}),...node.children??[]])visit(child,inside||isSpec);
  };visit(document.ast);
 }
 const lists=graph.documentPlan?.checks?.filter(c=>c.node.type==='tag'&&c.node.tag==='clause-list')??[];
 const active=new Set(documentAST(graph).flatMap(d=>[...d.ast.walk()].filter(n=>n.type==='tag'&&n.tag==='clause-list')));
 // 隐藏分支也校验依赖；只有原生条件选中的声明派生适用关系。
 for(const {node,file,line}of lists){
  const a=node.attributes,id=a.for,target=graph.index.get(id);
  if(!target||target.type!=='document')failure('CLAUSE_BEHAVIOR',file,`#L${line}`,'for 必须指向已加载 section：'+id);
  if(a.ids===undefined)continue;
  const all=new Set<string>();
  const items=a.ids;
  if(!Array.isArray(items))failure('CLAUSE_APPLICATION',file,`#L${line}`,'条款列表必须为 ID 数组');
  for(const clauseId of items){
   if(typeof clauseId!=='string'||!clauseId.trim()||!definitions.has(clauseId))failure('CLAUSE_REFERENCE',file,`#L${line}`,'条款缺失或类型不符：'+clauseId);
   if(all.has(clauseId))failure('CLAUSE_APPLICATION',file,`#L${line}`,'同一集合内条款重复：'+clauseId);all.add(clauseId);
  }
  if(active.has(node)){
   if(applications.has(id))failure('CLAUSE_APPLICATION',file,`#L${line}`,'行为只能定义一次适用集合：'+id);
   applications.set(id,{for:id,ids:[...a.ids],source:{file,line}});
  }
 }
 for(const {node,file,line}of lists)if(node.attributes.ids===undefined&&!applications.has(node.attributes.for))failure('CLAUSE_APPLICATION',file,`#L${line}`,'复用的行为尚未定义条款集合：'+node.attributes.for);
 for(const set of applications.values())for(const id of set.ids){
  if(graph.index.get(id)?.ownerId===set.for)failure('CLAUSE_APPLICATION',set.source.file,'','本地条款已在行为正文中，不应再次列入引用集合：'+id);
  const referenceId='clause-application:'+JSON.stringify([set.for,id]);
  if(graph.index.has(referenceId))failure('DUPLICATE_ID',set.source.file,'','派生适用关系 ID 冲突：'+referenceId);
  const reference:Reference={id:referenceId,kind:'reference',fromId:set.for,targetId:id,class:'applies-clause',source:set.source};
  graph.index.set(referenceId,{id:referenceId,type:'reference',entity:reference,location:{file:set.source.file,path:`#L${set.source.line}`}});
 }
}

// 仅生成展示 AST；原始 AST、稳定实体和适用关系不随展示次数复制。
export function presentationGraph(graph:Graph):Graph{
 const plan=graph.documentPlan;if(!plan||!graph.clauses?.definitions.size)return graph;
 let occurrence=0,scopeCounter=0;const renderScopes=new Map<string,any>(plan.renderScopes);
 const documents=plan.documents.map(document=>{
  const locations=new WeakMap<object,{file:string;line:number}>();
  const copy=(node:any,origin:Document,namespace=''):any=>{
   const result=Object.assign(new Markdoc.Ast.Node(),node,{attributes:{...node.attributes},children:[],slots:{}});
   const variablesAtSource=origin.scopes?.get(node);if((namespace||node.tag==='clause')&&variablesAtSource!==undefined){const key=String(++scopeCounter);renderScopes.set(key,variablesAtSource);result.attributes.__edocScopeKey=key;}
   locations.set(result,origin.locations.get(node)??{file:origin.file,line:1});
   if(namespace){result.attributes.__edocNamespace=namespace;if(node.tag==='reference'&&node.attributes.project===undefined)result.attributes.project=graph.manifest.projectId;}
   if(node.type==='tag'&&node.tag==='clause-list'){
    const set=graph.clauses!.applications.get(node.attributes.for)!;
    result.tag='__clause-list';result.attributes={for:set.for};
    for(const id of set.ids){
     const definition=graph.clauses!.definitions.get(id)!,ns='clause-instance-'+(++occurrence)+'-';
     const child=copy(definition.node,definition.document,ns);
     child.attributes.collapsed=node.attributes.collapsed??true;child.attributes.__edocSemanticKind='clause';
     result.children.push(child);
    }
    return result;
   }
   if(node.type==='tag'&&node.tag==='clause'){
    result.tag='section';result.attributes.__edocClause=node.attributes.id;
    result.attributes.__edocBodyNamespace=namespace||clauseNamespace(node.attributes.id);
   }
   const bodyNamespace=result.attributes.__edocBodyNamespace??namespace;
   result.children=(node.children??[]).map((child:any)=>copy(child,origin,bodyNamespace));
   result.slots=Object.fromEntries(Object.entries(node.slots??{}).map(([key,slot])=>[key,copy(slot,origin,bodyNamespace)]));return result;
  };
  return {...document,ast:copy(document.ast,document),locations};
 });
 return {...graph,documentPlan:{...plan,documents,renderScopes}};
}
