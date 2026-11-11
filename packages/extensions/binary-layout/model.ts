import type {Graph} from '../../core/types.ts';
import type {BinaryLayout,BinaryElement,BinaryView,Length} from './types.ts';
import {figureFail} from '../../figure/errors.ts';
export type Scalar={value?:number;expression:string};
export type BinaryRow={id:string;modelId:string;path:string[];label:string;kind:string;offset:Scalar;size:Scalar;definition?:string;description?:string;source?:unknown;conditional?:string;active?:boolean;depth:number;byteOrder?:string;bitOrder?:string};
const scalar=(n:number):Scalar=>({value:n,expression:String(n)});
function arithmetic(op:string,args:Scalar[],id:string):Scalar{
 if(args.every(a=>a.value!==undefined)){const a=args.map(a=>a.value!),value=op==='add'?a.reduce((x,y)=>x+y,0):op==='sub'?a[0]-a[1]:op==='mul'?a.reduce((x,y)=>x*y,1):op==='div'?a[0]/a[1]:op==='min'?Math.min(...a):Math.max(...a);if(!Number.isSafeInteger(value)||value<0)figureFail('BINARY_LENGTH',id,'长度运算必须得到非负安全整数位长');return scalar(value);}
 if(op==='add'){const nonzero=args.filter(a=>a.value!==0);if(nonzero.length===1)return nonzero[0];}
 if(op==='mul'){if(args.some(a=>a.value===0))return scalar(0);const nonunit=args.filter(a=>a.value!==1);if(nonunit.length===1)return nonunit[0];}
 return {expression:op==='min'||op==='max'?`${op}(${args.map(a=>a.expression).join(', ')})`:'('+args.map(a=>a.expression).join({add:' + ',sub:' − ',mul:' × ',div:' / '}[op]??', ')+')'};
}
export function binaryModel(graph:Graph,id:string):BinaryLayout{const entry=graph.index.get(id);if(entry?.type!=='binary-layout')figureFail('BINARY_REFERENCE',id,'协议布局引用不存在或类型错误：'+id);return entry.entity as BinaryLayout;}
export function binaryProjection(graph:Graph,id:string,view:Partial<BinaryView>={}){
 const root=binaryModel(graph,id),rows:BinaryRow[]=[],symbols:Record<string,{offset:Scalar;size:Scalar;end:Scalar}>={},limit=2000;let truncated=false,visited=0;
 const plus=(a:Scalar,b:Scalar)=>arithmetic('add',[a,b],id);
 const layout=(model:BinaryLayout,start:Scalar,path:string[],depth:number,stack:string[],condition?:string,active?:boolean):Scalar=>{
  if(stack.includes(model.id))figureFail('BINARY_CYCLE',id,'协议结构引用成环');if(stack.length>16)figureFail('BINARY_LIMIT',id,'协议引用深度不能超过 16');
  const unit=model.unit==='byte'?8:1;
  const scenario=(field:string)=>view.values?.[model.id===root.id?field:JSON.stringify([...path,field])];
  const length=(value:Length,factor=unit):Scalar=>{
   type Quantity={n?:bigint;d:bigint;expression:string};
   const known=(n:bigint,d=1n):Quantity=>({n,d,expression:d===1n?String(n):String(n)+'/'+String(d)});
   const evaluate=(v:Length):Quantity=>{
    if(typeof v==='number')return known(BigInt(v));
    if('field'in v){const actual=scenario(v.field),scale=v.unit==='byte'?8:v.unit==='bit'?1:factor;if(actual!==undefined){if(typeof actual!=='number'||!Number.isSafeInteger(actual)||actual<0)figureFail('BINARY_VALUE',id,'长度字段场景值必须为非负安全整数：'+v.field);return known(BigInt(actual)*BigInt(scale),BigInt(factor));}return {d:1n,expression:v.field+(scale===factor?'':` × ${scale}/${factor}`)};}
    const args=v.args.map(evaluate);if(v.op==='div'&&args[1]?.n===0n)figureFail('BINARY_LENGTH',id,'长度除数不能为零');
    if(args.every(a=>a.n!==undefined)){
     const add=(a:Quantity,b:Quantity,subtract=false)=>known(a.n!*b.d+(subtract?-1n:1n)*b.n!*a.d,a.d*b.d);
     if(v.op==='add')return args.reduce((a,b)=>add(a,b),known(0n));
     if(v.op==='sub')return add(args[0],args[1],true);
     if(v.op==='mul')return args.reduce((a,b)=>known(a.n!*b.n!,a.d*b.d),known(1n));
     if(v.op==='div')return known(args[0].n!*args[1].d,args[0].d*args[1].n!);
     return args.reduce((a,b)=>(a.n!*b.d<b.n!*a.d)===(v.op==='min')?a:b);
    }
    return {d:1n,expression:v.op+'('+args.map(a=>a.expression).join(', ')+')'};
   };
   const result=evaluate(value);if(result.n!==undefined){const bits=result.n*BigInt(factor);if(result.d===0n||bits%result.d!==0n||bits/result.d<0n||bits/result.d>BigInt(Number.MAX_SAFE_INTEGER))figureFail('BINARY_LENGTH',id,'长度运算必须得到非负安全整数位长');return scalar(Number(bits/result.d));}
   return {expression:result.expression+(factor===1?'':` × ${factor}`)};
  };
  const append=(row:BinaryRow)=>{if(rows.length<limit)rows.push(row);else truncated=true;};
  // 子结构返回自身尺寸，绝对偏移只用于行投影，避免未知父偏移在相减中膨胀。
  const fields=(elements:BinaryElement[],base:Scalar,parent:string[],level:number,conditional?:string,enabled?:boolean):Scalar=>{
   let cursor=scalar(0);
   for(const e of elements){if(++visited>20000)figureFail('BINARY_LIMIT',id,'展开计算超过 20000 个元素；请分解结构');const p=[...parent,e.id],local=e.offset!==undefined?length(e.offset):cursor,at=plus(base,local);
    if(local.value!==undefined&&cursor.value!==undefined&&local.value<cursor.value)figureFail('BINARY_OVERLAP',id,'字段偏移与前序字段重叠：'+e.id);
    let size:Scalar=scalar(0);const row:BinaryRow={id:e.id,modelId:model.id,path:p,label:e.label??e.id,kind:e.kind??'field',offset:at,size,description:e.description,source:e.source??model.source,conditional,active:enabled,depth:level,byteOrder:'byteOrder'in e?e.byteOrder??model.byteOrder:model.byteOrder,bitOrder:'bitOrder'in e?e.bitOrder??model.bitOrder:model.bitOrder},index=rows.length;
    append(row);
    if(!e.kind||['field','padding','reserved'].includes(e.kind))size=length((e as any).size);
    else if(e.kind==='align'){const boundary=e.to*unit,aligned=local.value!==undefined?scalar(Math.ceil(local.value/boundary)*boundary):{expression:`align(${local.expression}, ${boundary})`};size=local.value!==undefined&&aligned.value!==undefined?scalar(aligned.value-local.value):{expression:`padding(${e.id}, ${boundary})`};}
    else if(e.kind==='ref')size=layout(binaryModel(graph,e.model),at,p,level+1,[...stack,model.id],conditional,enabled);
    else if(e.kind==='repeat'){const n=length(e.count,1),elementSize=fields([e.element],scalar(0),p,level+1,conditional,enabled);size=arithmetic('mul',[n,elementSize],id);row.description=[e.description,`重复 ${n.expression} 次；子项偏移相对单次实例`].filter(Boolean).join('；');}
    else if(e.kind==='optional'){const provided=scenario(e.condition),childEnabled=enabled===false||provided===false?false:provided===true?enabled:undefined,possible=fields(e.fields,at,p,level+1,[conditional,e.condition].filter(Boolean).join(' && '),childEnabled);size=provided===false?scalar(0):provided===true?possible:{expression:`if ${e.condition} then ${possible.expression} else 0`};}
    else if(e.kind==='choice'){const selector=scenario(e.selector),match=selector===undefined?undefined:e.branches.find(b=>b.when===selector)??e.branches.find(b=>b.otherwise),sizes=e.branches.map(b=>({branch:b,size:fields(b.fields,at,[...p,b.id],level+1,[conditional,b.otherwise?'otherwise':e.selector+' = '+String(b.when)].filter(Boolean).join(' && '),enabled===false||match&&match!==b?false:match===b?enabled:undefined)}));size=match?sizes.find(s=>s.branch===match)!.size:{expression:`choice(${e.selector}; ${sizes.map(s=>s.branch.id+': '+s.size.expression).join(', ')})`};if(selector!==undefined&&!match)figureFail('BINARY_CHOICE',id,'取值场景没有匹配分支：'+e.id);}
    row.size=size;if(e.kind==='ref')row.definition=e.model;if(rows[index]?.path===p)rows[index]=row;
    const end=plus(local,size);const symbol=p.length===1?p[0]:JSON.stringify(p);symbols[symbol]={offset:at,size,end:plus(base,end)};cursor=end.value===undefined?{expression:`end(${symbol})`}:end;
   }
   return cursor;
  };
  return fields(model.fields,start,path,depth,condition,active);
 };
 const size=layout(root,scalar(0),[],0,[]);
 return {verification:'已知区间校验；未知长度/条件依赖取值场景继续验证',modelId:id,unit:'bit' as const,size,scenario:view.values??null,rows,symbols,truncated,limit,byteOrder:root.byteOrder??null,bitOrder:root.bitOrder??null};
}
