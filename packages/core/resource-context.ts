import type {Graph, Manifest, RecordEntry, Connection, Interface, AddressSpace} from './types.ts';
import {ResourceResolver} from '../extensions/register-map/resolver.ts';
import {validateRegisterMaps} from '../extensions/register-map/validate.ts';
import {EdocError, failure} from './errors.ts';

export function assertResourceContext(graph: Graph) {
  if(graph.resourceCatalog?.status==='deferred')throw new EdocError(graph.resourceCatalog.deferred.map(item=>({code:'RESOURCE_BOOK_CONTEXT',file:item.source.file,path:'#L'+item.source.line,message:'工程 '+item.source.projectId+' 的资源声明目标 '+JSON.stringify(item.target)+' 需要完整 Book 上下文'})));
  if (graph.addressValidation?.deferred.length) throw new EdocError(graph.addressValidation.deferred.map(reference => {
    const record = graph.index.get(reference.addressSpaceId), space = record?.type === 'address-space' ? record.entity as AddressSpace : undefined;
    const index = space?.regions.findIndex(region => region.id === reference.regionId) ?? -1;
    return {code: 'ADDRESS_BOOK_CONTEXT', file: record?.location.file ?? '<resources>', path: (record?.location.path ?? '') + (index >= 0 ? `/regions/${index}/target` : ''), message: `工程 ${reference.projectId}/${reference.addressSpaceId}/${reference.regionId} 的目标 ${reference.target.project ?? reference.projectId}/${reference.target.id} 尚未通过终校验，需要有效 Book 上下文`};
  }));
  if (graph.addressValidation && graph.addressValidation.status !== 'complete') failure('ADDRESS_BOOK_CONTEXT', '<resources>', '', `工程 ${graph.manifest.projectId} 的地址资源尚未通过终校验，需要有效 Book 上下文`);
}

// Book、离线 Reader 和随包手册共用；各工程仍持有独立索引，不复制到父 Graph。
export function connectResourceGraphs(projects: ReadonlyMap<string, Graph>) {
  const resolver = new ResourceResolver(projects);
  for (const graph of projects.values()) graph.addressResolver = resolver;
  const errors = [...projects.values()].flatMap(graph => validateRegisterMaps(graph, {allowDeferred: false}));
  if (errors.length) {
    for (const graph of projects.values()) graph.addressValidation!.status = 'invalid';
    throw new EdocError(errors);
  }
  return resolver;
}

export type ProjectFacts = {manifest: Manifest; records: RecordEntry[]; attachments?: Graph['attachments']};

export function resourceContextFacts(graph: Graph): ProjectFacts[] {
  assertResourceContext(graph);
  return [...(graph.addressResolver?.projects.values() ?? [graph])].map(project => {
    assertResourceContext(project);
    return {manifest: project.manifest, records: [...project.index.values()], attachments: project.attachments};
  });
}

// 只消费已发布事实，不执行配置、访问文件系统或发现外部工程。
export function hydrateProjectGraphs(projects: Iterable<ProjectFacts>): Map<string, Graph> {
  const graphs = new Map<string, Graph>();
  for (const {manifest, records, attachments} of projects) {
    if (!/^2\.\d+$/.test(manifest.irVersion)) failure('IR_VERSION', '<published-resources>', '/irVersion', `工程 ${manifest.projectId} 仅接受 IR2 已发布事实`);
    if (graphs.has(manifest.projectId)) failure('PROJECT_ID_DUPLICATE', '<published-resources>', '/projectId', `工程 ${manifest.projectId} 重复，不能合并独立命名空间`);
    const index = new Map(records.map(record => [record.id, record]));
    const connections = new Map(records.filter(record => record.type === 'connection').map(record => [record.id, record.entity as Connection]));
    const interfaceByPort = new Map<string, string>(), adjacency = new Map<string, Set<string>>();
    for (const record of records) if (record.type === 'interface') for (const port of (record.entity as Interface).members) interfaceByPort.set(port, record.id);
    for (const connection of connections.values()) for (const endpoint of connection.endpoints) for (const id of [endpoint, index.get(endpoint)?.ownerId, interfaceByPort.get(endpoint)]) if (id) {
      if (!adjacency.has(id)) adjacency.set(id, new Set());
      adjacency.get(id)!.add(connection.id);
    }
    graphs.set(manifest.projectId, {manifest, projectRoot: '', irDirectory: '', index, connections, interfaceByPort, adjacency, attachments});
  }
  connectResourceGraphs(graphs);
  return graphs;
}
