import type {Graph,RecordEntry,Node,Port,Connection,Group,Interface,RelationView} from '../../core/types.ts';
export function relationLinks(graph:Graph,entry:RecordEntry):string[]|undefined{
 const adjacent=[...(graph.adjacency.get(entry.id)??[])];
  if (entry.type === 'node') {
    const node = entry.entity as Node;
    return [...adjacent, ...(node.ports ?? []).map(p => p.id),...(node.interfaces??[]).map(i=>i.id), ...(node.parentId ? [node.parentId] : [])];
  }
  if (entry.type === 'port') {
    const port = entry.entity as Port;
    return [...adjacent, entry.ownerId!, ...[port.groupId, port.clockDomainId,graph.interfaceByPort?.get(entry.id)].filter(Boolean) as string[]];
  }
  if (entry.type === 'connection') return (entry.entity as Connection).endpoints;
  if (entry.type === 'group') return (entry.entity as Group).members;
  if (entry.type === 'interface') return [...adjacent,entry.ownerId!,...(entry.entity as Interface).members];
  if(entry.type==='view'){const view=entry.entity as RelationView;return [...view.include.objects,...view.include.relations];}
  return undefined;
}
