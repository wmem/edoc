import type {Graph,Node,Port,Group,Interface,Connection,RelationView,RecordEntry} from '../../core/types.ts';
import {validationContext} from '../../core/validation-context.ts';
import {validateViewLayout} from '../../core/view-layout.ts';
export function validateRelationData(graph:Graph){
 const {errors,report,reference}=validationContext(graph),interfaceOwners=new Map<string,string>();
 for(const entry of graph.index.values()){
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
      const view = entry.entity as RelationView;
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
    const links = (e: import('../../core/types.ts').RecordEntry): string[] => type === 'node'
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
 return errors;
}
