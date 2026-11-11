import {hardwareBoardMap} from './drawing-board-map.ts';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {styles} from '../packages/render-graph/styles.ts';
import type {Drawing, Constraint, Side} from '../packages/drawing/types.ts';
export type ProjectDrawing = {name: string; title: string; description: string; drawing: Drawing; sources: unknown; page?: string};

// 验收适配器只读项目已有定义；不把项目领域规则放入通用内核。
export function hardwareDrawings(root: string): ProjectDrawing[] {
  const file = 'board/v01/definition/architecture.json', source = JSON.parse(readFileSync(join(root, file), 'utf8'));
  return (['overview', 'management', 'support'] as const).flatMap(plane => (plane === 'overview' ? [false, true] : [true]).map(controlled => {
    const interactions = source.interactions.filter((r: any) => r.planes.includes(plane));
    const selected = new Set<string>(plane === 'overview' ? source.nodes.map((n: any) => n.key) : interactions.flatMap((r: any) => [r.from, r.to]));
    const constraints: Constraint[] = [];
    const nodes: Drawing['nodes'] = source.boards.map((b: any) => ({id: b.key, label: b.title, originIds: [file + '#boards/' + b.key]}));
    for (const n of source.nodes.filter((n: any) => selected.has(n.key))) {
      const ports: NonNullable<Drawing['nodes'][number]['ports']> = [];
      for (const r of interactions) for (const end of ['from', 'to'] as const) if (r[end] === n.key) {
        const cross = source.nodes.find((p: any) => p.key === r.from).board !== source.nodes.find((p: any) => p.key === r.to).board;
        // 同一BTB逻辑接口的内外两侧是不同显示锚点，保留相同原接口身份。
        const label = r[end + 'Port'], id = JSON.stringify([label, n.key.startsWith('interboard-') ? cross ? 'crossing' : 'internal' : 'interface']);
        if (!ports.some(p => p.id === id)) ports.push({id, label, originIds: [file + '#nodes/' + n.key + '/interface/' + label]});
        if (controlled && n.key.startsWith('interboard-')) { const side: Side = n.board === 'BOTTOM' ? cross ? 'right' : 'left' : cross ? 'left' : 'right'; constraints.push({id: JSON.stringify(['side', n.key, id]), type: 'port', node: n.key, port: id, side}); }
      }
      nodes.push({id: n.key, parentId: n.board, label: n.label, ports, originIds: [file + '#nodes/' + n.key]});
    }
    const connections = interactions.map((r: any) => ({id: r.key, originIds: [file + '#interactions/' + r.key], style: Object.hasOwn(styles, r.class) ? r.class : 'other', labels: [{id: 'name', text: r.label}], ends: (['from', 'to'] as const).map(end => { const cross = source.nodes.find((p: any) => p.key === r.from).board !== source.nodes.find((p: any) => p.key === r.to).board; return {id: end, node: r[end], port: JSON.stringify([r[end + 'Port'], r[end].startsWith('interboard-') ? cross ? 'crossing' : 'internal' : 'interface']), ...r.flow === 'forward' && end === 'to' ? {marker: 'arrow' as const} : {}}; })}));
    // 重复侧边要求去重仅按显示端身份，不以标签合并工程关系。
    const unique = [...new Map(constraints.map(r => [r.id, r])).values()];
    const name = 'hardware-' + plane + (plane === 'overview' ? controlled ? '-intent' : '-auto' : '');
    return {name, title: source.views[plane].label + (plane === 'overview' ? controlled ? '：布局意图' : '：自动布局' : ''), description: `来源为 KY3134 当前硬件定义。${plane === 'overview' ? '保留两板全部34个模块、75条交互。' : '只显示原定义中此主题的完整交互，未画的关系继续保留在总图与源数据。'} ${controlled ? '声明BTB内外两侧的阅读方向；没有逐框手写坐标。' : '未指定端口侧边或位置。'} 未声明流向的连接不补箭头。选中模块或连线可查看原定义身份；来源清单保留器件、装配选项和连接说明。`, drawing: {schemaVersion: '1.0', id: name, nodes, connections, layout: {direction: 'LR', spacing: {node: 64, layer: 120, edge: 20, port: 38, padding: 48}, constraints: unique}}, sources: {root, file, scope: source.scope, nodes: source.nodes.filter((n: any) => selected.has(n.key)), interactions}};
  }));
}

export async function fpgaDrawings(root: string): Promise<ProjectDrawing[]> {
  const file = 'docs/board-architecture-data.mjs', module = await import(pathToFileURL(join(root, file)).href), source = module.boardArchitecturePublication();
  const overall=source.views.find((v: any)=>v.id.endsWith('.overall'));
  const clock=source.relations.find((r: any)=>r.id.endsWith('.clocks'));
  if(overall&&clock)overall.include.relations.push(clock.id);
  return source.views.map((view: any) => {
    const selected = new Set(view.include.objects), relations = source.relations.filter((r: any) => view.include.relations.includes(r.id)), constraints: Constraint[] = [];
    const nodes: Drawing['nodes'] = source.objects.filter((n: any) => selected.has(n.id)).map((n: any) => ({id: n.id, label: n.label, parentId: selected.has(n.parentId) ? n.parentId : undefined, originIds: [n.id, n.source.file], ports: []}));
    const connections = relations.map((r: any) => ({id: r.id, originIds: [r.id, r.source.file, ...(r.attributes.projectsRelations ?? [])], style: Object.hasOwn(styles, r.class) ? r.class : 'other', labels: [{id: 'name', text: r.label}], ends: r.endpoints.map((endpoint: string, i: number) => {
      const n = nodes.find(n => n.id === endpoint)!; const port = r.id + '/' + i;
      n.ports!.push({id: port, label: r.label, originIds: [r.id, endpoint]});
      const side = view.layout?.relationHints?.[r.id]?.endpointSides?.[endpoint];
      if (side) constraints.push({id: port + '/side', type: 'port', node: n.id, port, side});
      return {id: String(i), node: endpoint, port, ...r.direction?.targets?.includes(endpoint) ? {marker: 'arrow' as const} : {}};
    })}));
    const name = 'fpga-' + view.id.split('.').at(-1);
    return {name, title: 'KY3133 FPGA · ' + view.label, description: ({'fpga-overall':'MCU通过SPI进入host_bridge：REG请求进入管理与统计，Stream8交接MCU帧。ethernet_datapath位于ethernet_spi内部，与system下另一支ethernet_media直接交换业务帧。时钟、复位和IO由board层支撑。管理/统计与时钟/复位/IO是有实际实例清单的归组。','fpga-datapath-data':'gate负责真实MAC、forward、MCU帧服务与下行TX队列之间的交接；forward负责DD00/DD01分类、Tag变换和上行仲裁。mcu内部保存MCU收发帧，q0..qN是各下行口的TX完整帧队列。反向READY与逐信号接线在本图省略，双向交接不补单向箭头。','fpga-datapath-registers':'父层管理APB进入frames自身的root/g路由，再访问ethernet_control和队列、IRQ、PHY复位GPIO等真实寄存器端点。端点归组在来源清单中保留实际实例，不是额外物理模块。','fpga-datapath-control':'ethernet_control向gate提供准入/清理控制，向forward提供映射配置，并取得相应状态。observe被动采样端口事件；MAC清理与media之间保留握手。配置请求与状态反馈的双向关系不以首条信号方向代替。'} as Record<string,string>)[name] + ' 模块与交互来自当前生产装配模型，点击对象或展开来源清单可以核对。', drawing: {schemaVersion: '1.0', id: name, nodes, connections, layout: {direction: 'LR', spacing: {node: 72, layer: 140, edge: 20, port: 38, padding: 48}, constraints}}, sources: {root, file, objects: source.objects.filter((n: any) => selected.has(n.id)), relations, view: {id: view.id, include: view.include}}};
  });
}

type ReadingModule = {id: string; label: string; parentId?: string; origins: string[]};
type ReadingRelation = {id: string; from: string; to: string; label: string; origins: string[]; style?: string};
// 总图的线是显示关系；匿名槽位仅承载几何，不创建工程引脚或猜测方向。
function relationshipDrawing(id: string, modules: ReadingModule[], relations: ReadingRelation[]): Drawing {
  const nodes: Drawing['nodes'] = modules.map(n=>({id:n.id,label:n.label,parentId:n.parentId,originIds:n.origins,ports:[]}));
  return {schemaVersion:'1.0',id,nodes,connections:relations.map(r=>({id:r.id,originIds:r.origins,style:r.style??'data',labels:[{id:'name',text:r.label}],ends:([r.from,r.to]).map((node,i)=>{
    const port=r.id+'/'+i;nodes.find(n=>n.id===node)!.ports!.push({id:port,label:'',appearance:'slot',originIds:r.origins});
    return {id:String(i),node,port};
  })})),layout:{direction:'LR',spacing:{node:48,layer:64,edge:20,port:32,padding:28}}};
}

export function hardwareReadingDrawings(root: string): ProjectDrawing[] {
  const file='board/v01/definition/architecture.json',policyFile='board/v01/definition/architecture-views.json';
  const source=JSON.parse(readFileSync(join(root,file),'utf8')),policy=JSON.parse(readFileSync(join(root,policyFile),'utf8'));
  const modules:ReadingModule[]=source.boards.map((b:any)=>({id:b.key,label:b.title,origins:[file+'#boards/'+b.key]}));
  for(const m of policy.overview.modules){
    const members=m.members.map((key:string)=>source.nodes.find((n:any)=>n.key===key));
    if(members.some((n:any)=>!n)||new Set(members.map((n:any)=>n.board)).size!==1)throw Error('显示模块缺少来源或跨板归组：'+m.id);
    modules.push({id:m.id,label:m.label??members[0].label,parentId:members[0].board,origins:members.map((n:any)=>file+'#nodes/'+n.key)});
  }
  const relations:ReadingRelation[]=policy.overview.relations.map((r:any)=>{
    const facts=r.sources.map((key:string)=>source.interactions.find((e:any)=>e.key===key));
    if(facts.some((r:any)=>!r||['power','clock'].includes(r.class)))throw Error('系统关系缺少来源或混入供电/时钟：'+r.id);
    return {id:r.id,from:r.from,to:r.to,label:r.label,origins:facts.map((f:any)=>file+'#interactions/'+f.key),style:facts.every((f:any)=>['control','event'].includes(f.class))?'control':'data'};
  });
  const drawing=relationshipDrawing('hardware-system',modules,relations);
  const intent=policy.overview.layout??{},constraints:Constraint[]=[];
  drawing.layout={...drawing.layout,direction:intent.direction??'TB',containers:intent.containers};
  for(const c of drawing.connections)if(intent.relationSides?.[c.id])c.ends.forEach((e,i)=>constraints.push({id:c.id+'/'+i+'/side',type:'port',node:e.node,port:e.port!,side:intent.relationSides[c.id][i]}));
  for(const [node,order]of Object.entries(intent.portOrder??{}))for(const [rank,id]of (order as string[]).entries()){
    const end=drawing.connections.find(c=>c.id===id)?.ends.find(e=>e.node===node);
    if(!end?.port)throw Error('总图端口排列引用不存在：'+node+'/'+id);
    constraints.push({id:node+'/'+id+'/order',type:'port',node,port:end.port,order:rank});
  }
  drawing.layout!.constraints=constraints;
  const main:ProjectDrawing={name:'hardware-system',title:policy.overview.label,page:'hardware',description:policy.overview.description,drawing,sources:{root,file,policyFile,policy,modules:source.nodes,interactions:source.interactions}};
  const full=hardwareDrawings(root).find(e=>e.name==='hardware-overview-intent')!;
  const details:ProjectDrawing[]=policy.details.map((v:any)=>{
    const nodeBoard=(id:string)=>source.nodes.find((n:any)=>n.key===id)?.board;
    const selected=source.interactions.filter((r:any)=>(v.plane?r.planes.includes(v.plane):v.board?nodeBoard(r.from)===v.board&&nodeBoard(r.to)===v.board:false)&&!(v.excludeClasses??[]).includes(r.class));
    const selectedIds=new Set(selected.map((r:any)=>r.key)),model=structuredClone(full.drawing);model.id=v.id;
    model.connections=model.connections.filter(c=>selectedIds.has(c.id));
    const needed=new Set(model.connections.flatMap(c=>c.ends.map(e=>e.node))),boards=new Set(source.nodes.filter((n:any)=>needed.has(n.key)).map((n:any)=>n.board));
    model.nodes=model.nodes.filter(n=>needed.has(n.id)||boards.has(n.id));
    for(const n of model.nodes)n.ports=n.ports?.filter(p=>model.connections.some(c=>c.ends.some(e=>e.node===n.id&&e.port===p.id)));
    model.layout!.constraints=model.layout!.constraints?.filter(r=>r.type==='port'&&model.nodes.find(n=>n.id===r.node)?.ports?.some(p=>p.id===r.port));
    return {name:v.id,title:v.label,page:'hardware-details',description:v.description??'只展开本主题的模块和实际接口，其他主题分别阅读。',drawing:model,sources:{root,file,policyFile,readingView:v,nodes:source.nodes.filter((n:any)=>needed.has(n.key)),interactions:selected}};
  });
  const reading:ProjectDrawing[]=policy.readingViews.map((v:any)=>{
    const ids=new Set(v.modules),selectedModules=modules.filter(n=>ids.has(n.id)||v.containers&&source.boards.some((b:any)=>b.key===n.id)).map(n=>({...n,label:v.moduleLabels?.[n.id]??n.label,parentId:v.containers?n.parentId:undefined}));
    const selectedRelations=relations.filter(r=>v.relations.includes(r.id)).map(r=>({...r,label:v.relationLabels?.[r.id]??r.label}));
    if(selectedRelations.length!==v.relations.length)throw Error('阅读视图关系不存在：'+v.id);
    const model=relationshipDrawing(v.id,selectedModules,selectedRelations);
    model.layout!.constraints=[];
    if(v.containers)for(const c of model.connections.filter(c=>c.id==='board-data'))c.ends.forEach((e,i)=>model.layout!.constraints!.push({id:c.id+'/'+i+'/parts-side',type:'port',node:e.node,port:e.port!,side:i?'left':'right'}));
    for(const c of model.connections)if(v.relationSides?.[c.id])c.ends.forEach((e,i)=>model.layout!.constraints!.push({id:c.id+'/'+i+'/reading-side',type:'port',node:e.node,port:e.port!,side:v.relationSides[c.id][i]}));
    return {...main,page:'hardware-parts',name:v.id,title:v.label,description:v.description,drawing:model,sources:{...(main.sources as object),readingView:v}};
  });
  return [hardwareBoardMap(root),...reading,...details];
}

export async function fpgaReadingDrawings(root:string):Promise<ProjectDrawing[]> {
  const raw=await fpgaDrawings(root),source:any=raw[0].sources;
  const policyFile='docs/architecture-views.json',policy=JSON.parse(readFileSync(join(root,policyFile),'utf8'));
  const selected=policy.overview.modules as string[];
  const selectedNodes=source.objects.filter((n:any)=>selected.some(key=>n.id.endsWith('.'+key)));
  const names:Record<string,string>=policy.overview.labels;
  const modules:ReadingModule[]=selectedNodes.map((n:any)=>({id:n.id,label:names[n.id.split('.').at(-1)!],origins:[n.id,n.source.file,...n.attributes.instancePath?[n.attributes.instancePath]:[]]}));
  const selectedRelations=source.relations.filter((r:any)=>policy.overview.relations.includes(r.id.slice(policy.namespace.length)));
  if(selectedNodes.length!==selected.length||selectedRelations.length!==policy.overview.relations.length)throw Error('FPGA阅读视图引用不存在的模块或关系');
  const drawing=relationshipDrawing('fpga-system',modules,selectedRelations.map((r:any)=>({id:r.id,from:r.endpoints[0],to:r.endpoints[1],label:r.label,style:r.class,origins:[r.id,r.source.file,...r.attributes.projectsRelations??[]]})));
  drawing.layout!.constraints=[];
  for(const c of drawing.connections){
    const key=c.id.split('.').at(-1)!;
    const sides:Side[]=policy.overview.relationSides[key];
    c.ends.forEach((e,i)=>drawing.layout!.constraints!.push({id:c.id+'/'+i+'/side',type:'port',node:e.node,port:e.port!,side:sides[i]}));
    const original=selectedRelations.find((r:any)=>r.id===c.id);c.ends.forEach(e=>{if(original.direction?.targets?.includes(e.node))e.marker='arrow';});
  }
  const main:ProjectDrawing={name:'fpga-system',title:'FPGA 主要模块与协作',page:'fpga',description:'先看两条主线：帧通过Host Bridge、帧处理与转发、MAC/媒体接口交接；寄存器请求由管理与统计访问相应模块。这里省略board/system/spi包装层与公共时钟复位扇出，真实实例归属保留在来源中。运行时准入、清理及状态反馈另见控制展开。',drawing,sources:{...source,policyFile,projection:policy}};
  const roles:Record<string,string>=policy.detailRoles;
  const details=raw.slice(1).map(e=>{const clone=structuredClone(e);clone.page='fpga';
    for(const n of clone.drawing.nodes){const role=roles[n.id.split('.').at(-1)!];if(role)n.label=role+'\n'+n.label;for(const p of n.ports??[]){p.appearance='slot';p.label='';}}
    return clone;
  });
  return [main,...details];
}
