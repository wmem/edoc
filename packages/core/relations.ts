import type { Diagnostic, Graph, Node, Group, Port, Connection, View, RecordEntry,Interface } from './types.ts';
import { EngDocError } from './errors.ts';
import { projectPath } from './paths.ts';
import {validateViewLayout} from './view-layout.ts';

export function validateRelations(graph: Graph): void {
  const errors: Diagnostic[] = [];
  const checkedSources = new Set<string>();
  const interfaceOwners=new Map<string,string>();
  const report = (entry: RecordEntry, code: string, path: string, message: string) => errors.push({ code, file: entry.location.file, path: `${entry.location.path}${path}`, id: entry.id, message });
  const reference = (entry: RecordEntry, id: string, path: string, types: RecordEntry['type'][]) => {
    const target = graph.index.get(id);
    if (!target) report(entry, 'REFERENCE_MISSING', path, `引用不存在：${id}`);
    else if (!types.includes(target.type)) report(entry, 'REFERENCE_TYPE', path, `引用 ${id} 需要 ${types.join('/')}，实际为 ${target.type}`);
  };
  for (const entry of graph.index.values()) {
    if (entry.entity.source && !checkedSources.has(entry.entity.source.file)) {
      try { projectPath(graph.projectRoot, graph.projectRoot, entry.entity.source.file, false); checkedSources.add(entry.entity.source.file); }
      catch (error) {
        if (error instanceof EngDocError) for (const d of error.diagnostics) report(entry, d.code, '/source/file', d.message);
        else throw error;
      }
    }
    const attachment=entry.entity.source?.attachment;if(attachment&&(!attachment.project||attachment.project===graph.manifest.projectId)){const resource=graph.attachments?.[attachment.id];if(!resource||attachment.target&&!Object.hasOwn(resource.targets,attachment.target))report(entry,'ATTACHMENT_REFERENCE','/source/attachment','原始 PDF 附件或位置不存在：'+attachment.id);}
    if(entry.type==='row' && (entry.entity as any).objectId) reference(entry,(entry.entity as any).objectId,'/objectId',['node','port','connection','document','group','interface']);
    if(entry.type==='reference') { const e=entry.entity as any; const types=[...new Set([...graph.index.values()].map(e=>e.type))];reference(entry,e.fromId,'/fromId',types);reference(entry,e.targetId,'/targetId',types);}
    if(entry.type==='waveform') {
      const signals=(entry.entity as any).data.signal;
      const valid=(signal:any):boolean=>Array.isArray(signal)?typeof signal[0]==='string'&&signal.slice(1).every(valid):signal&&typeof signal==='object'&&(signal.name===undefined||typeof signal.name==='string')&&(signal.wave===undefined||typeof signal.wave==='string');
      if(!signals.every(valid))report(entry,'WAVEJSON','/data/signal','WaveJSON signal 必须是信号对象或命名分组');
    }
    if(entry.type==='table') { const table=entry.entity as any;
      for(const row of table.rows){const data=row.objectId?graph.index.get(row.objectId)?.entity:row.values;if(!data)continue;for(const column of table.columns){const value=column.field.split('.').reduce((v:any,k:string)=>v&&Object.hasOwn(v,k)?v[k]:undefined,data);if(value!==undefined&&column.type!=='json'&&typeof value!==column.type)report(entry,'TABLE_VALUE','/rows',`行 ${row.id} 的 ${column.field} 与列类型不符`);}}
    }
    if(entry.type==='table') { const cols=(entry.entity as any).columns.map((c:any)=>c.field);if(new Set(cols).size!==cols.length)report(entry,'TABLE_COLUMN','/columns','表格列字段重复'); }
    if (entry.type === 'node') {
      const node = entry.entity as Node;
      if (node.parentId) reference(entry, node.parentId, '/parentId', ['node']);
    }
    if (entry.type === 'port') {
      const port = entry.entity as Port;
      if (port.groupId) reference(entry, port.groupId, '/groupId', ['group']);
      if (port.clockDomainId) reference(entry, port.clockDomainId, '/clockDomainId', ['node', 'port', 'group']);
    }
    if (entry.type === 'group') {
      (entry.entity as Group).members.forEach((id, i) => reference(entry, id, `/members/${i}`, ['node', 'port', 'group']));
    }
    if(entry.type==='interface'){
      if(!graph.manifest.requiredFeatures?.includes('interface-groups'))report(entry,'IR_FEATURE_REQUIRED','','接口定义需要声明 requiredFeatures: interface-groups');
      (entry.entity as Interface).members.forEach((id,i)=>{
        reference(entry,id,`/members/${i}`,['port']);const target=graph.index.get(id);
        if(target?.type==='port'&&target.ownerId!==entry.ownerId)report(entry,'INTERFACE_OWNER',`/members/${i}`,'接口成员必须属于同一模块');
        if(interfaceOwners.has(id))report(entry,'INTERFACE_MEMBER',`/members/${i}`,`端口已归属接口 ${interfaceOwners.get(id)}`);
        else interfaceOwners.set(id,entry.id);
      });
    }
    if (entry.type === 'connection') {
      const connection = entry.entity as Connection;
      connection.endpoints.forEach((id, i) => reference(entry, id, `/endpoints/${i}`, ['node', 'port']));
      if (connection.direction) {
        for (const role of ['sources', 'targets'] as const) connection.direction[role].forEach((id, i) => {
          if (!connection.endpoints.includes(id)) report(entry, 'DIRECTION_ENDPOINT', `/direction/${role}/${i}`, `方向 ID 必须属于同一连接端点：${id}`);
        });
        if (connection.direction.sources.some(id => connection.direction!.targets.includes(id))) report(entry, 'DIRECTION_OVERLAP', '/direction', '同一端点不能同时是显式源和目标；双向连接请省略方向');
      }
    }
    if (entry.type === 'view') {
      const view = entry.entity as View;
      validateViewLayout(graph,entry,(code,path,message)=>report(entry,code,path,message));
      view.include.objects.forEach((id, i) => reference(entry, id, `/include/objects/${i}`, ['node', 'port', 'group','interface']));
      view.include.relations.forEach((id, i) => reference(entry, id, `/include/relations/${i}`, ['connection']));
      view.layout?.portOrder?.forEach((id, i) => reference(entry, id, `/layout/portOrder/${i}`, ['port']));
      view.layout?.interfaceOrder?.forEach((id,i)=>reference(entry,id,`/layout/interfaceOrder/${i}`,['interface']));
      for(const id of Object.keys(view.layout?.interfaceSides??{}))reference(entry,id,'/layout/interfaceSides/'+id,['interface']);
      for(const id of Object.keys(view.display?.interfaceOverrides??{}))reference(entry,id,'/display/interfaceOverrides/'+id,['interface']);
      view.display?.collapsedGroups?.forEach((id, i) => reference(entry, id, `/display/collapsedGroups/${i}`, ['group']));
      const positions = new Set<string>();
      view.layout?.positions?.forEach((pos, i) => {
        reference(entry, pos.objectId, `/layout/positions/${i}/objectId`, ['node', 'group']);
        if (positions.has(pos.objectId)) report(entry, 'POSITION_DUPLICATE', `/layout/positions/${i}/objectId`, '同一对象的位置提示重复');
        positions.add(pos.objectId);
      });
    }
  }
  // 迭代 DFS 避免深层图使用递归导致调用栈溢出；node 层级与 group 集合分别检查。
  for (const type of ['node', 'group'] as const) {
    const color = new Map<string, number>();
    const links = (e: RecordEntry): string[] => type === 'node'
      ? ((e.entity as Node).parentId ? [(e.entity as Node).parentId!] : [])
      : (e.entity as Group).members.filter(id => graph.index.get(id)?.type === 'group');
    for (const start of graph.index.values()) {
      if (start.type !== type || color.has(start.id)) continue;
      const stack: { entry: RecordEntry; exit: boolean }[] = [{ entry: start, exit: false }];
      while (stack.length) {
        const { entry, exit } = stack.pop()!;
        if (exit) { color.set(entry.id, 2); continue; }
        if (color.get(entry.id) === 2) continue;
        if (color.get(entry.id) === 1) { report(entry, 'RELATION_CYCLE', type === 'node' ? '/parentId' : '/members', `${type} 关系存在循环`); continue; }
        color.set(entry.id, 1);
        stack.push({ entry, exit: true });
        for (const id of links(entry).reverse()) {
          const target = graph.index.get(id);
          if (target?.type === type) stack.push({ entry: target, exit: false });
        }
      }
    }
  }
  if (errors.length) throw new EngDocError(errors);
}
