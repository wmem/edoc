import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { validateSchema } from './schema.ts';
import type { SchemaName } from './schema.ts';
import type { Connection, Diagnostic, Entity, Graph, Manifest, RecordEntry, ResourceType } from './types.ts';
import { EngDocError, failure } from './errors.ts';
import { projectPath, requireFile } from './paths.ts';
import {runAdapter} from './adapter.ts';
import { registerDocuments, validateDocuments } from './documents.ts';
import { validateRelations } from './relations.ts';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
export const SUPPORTED_IR_VERSION = '1.0';

function finiteJson(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  if (value && typeof value === 'object') return Object.values(value).every(finiteJson);
  return true;
}

export function readJson(file: string, schema: SchemaName,compatible=false): any {
  requireFile(file);
  if (statSync(file).size > MAX_JSON_BYTES) failure('FILE_SIZE', file, '', '单个 JSON 分片不得超过 16 MiB，请拆分资源');
  let data: unknown;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))); }
  catch { failure('JSON_PARSE', file, '', '不是有效的 UTF-8 JSON'); }
  if (!finiteJson(data)) failure('JSON_NUMBER', file, '', '数值超出有限 JSON 数值范围');
  const minor= schema==='manifest'&&typeof (data as any)?.irVersion==='string'?Number((data as any).irVersion.split('.')[1]):0;
  const errors = validateSchema(schema, data, file,compatible||minor>0);
  if (errors.length) throw new EngDocError(errors);
  return data;
}

export function loadConfig(file: string): { irDirectory: string; projectRoot: string; projectId: string; title?:string; chromiumExecutable?:string } {
  const configFile = realpathSync(resolve(file));
  const projectRoot = dirname(configFile);
  const config = readJson(configFile, 'config');
  const irDirectory = projectPath(projectRoot, projectRoot, config.irDirectory,false);
  runAdapter(projectRoot,irDirectory,config,stage=>{const graph=loadIR(stage,{projectRoot,projectId:config.projectId});if(graph.manifest.adapterVersion!==config.adapter.version)failure('ADAPTER_VERSION',file,'/adapter/version','Adapter 与 manifest 版本不一致');});
  return { irDirectory, projectRoot, projectId: config.projectId,title:config.title,chromiumExecutable:config.chromiumExecutable?projectPath(projectRoot,projectRoot,config.chromiumExecutable):undefined };
}

export function loadIR(irDirectory: string, options: { projectRoot?: string; projectId?: string } = {}): Graph {
  const root = realpathSync(resolve(options.projectRoot ?? irDirectory));
  const requested = resolve(irDirectory);
  const ir = projectPath(root, root, relative(root, requested) || '.');
  const manifestFile = projectPath(root, ir, 'manifest.json');
  const manifest = readJson(manifestFile, 'manifest') as Manifest;
  for(const feature of manifest.requiredFeatures??[])if(!['graph','documents','tables','wavejson','references'].includes(feature))failure('IR_FEATURE',manifestFile,'/requiredFeatures',`未支持的必需能力：${feature}`);
  // 同 major 的 minor 接受兼容新增的可选字段；必需能力逐项协商，未知类型仍失败。
  if (manifest.irVersion.split('.')[0] !== '1')
    failure('IR_VERSION', manifestFile, '/irVersion', `当前仅支持 IR ${SUPPORTED_IR_VERSION}，收到 ${manifest.irVersion}`);
  if (options.projectId !== undefined && manifest.projectId !== options.projectId)
    failure('PROJECT_ID', manifestFile, '/projectId', 'manifest 与配置 projectId 不一致');
  for (const [i, doc] of manifest.entryDocuments.entries()) {
    try { requireFile(projectPath(root, root, doc)); }
    catch (error) {
      if (error instanceof EngDocError) throw new EngDocError(error.diagnostics.map(d => ({ ...d, file: manifestFile, path: `/entryDocuments/${i}` })));
      throw error;
    }
  }
  const index = new Map<string, RecordEntry>();
  const connections = new Map<string, Connection>();
  const diagnostics: Diagnostic[] = [];
  const add = (entity: Entity, type: RecordEntry['type'], file: string, path: string, ownerId?: string) => {
    if (index.has(entity.id)) {
      diagnostics.push({ code: 'DUPLICATE_ID', file, path: `${path}/id`, id: entity.id, message: `稳定 ID 已在 ${index.get(entity.id)!.location.file}${index.get(entity.id)!.location.path} 定义` });
      return;
    }
    index.set(entity.id, { id: entity.id, entity, type, location: { file, path }, ...(ownerId ? { ownerId } : {}) });
    if (type === 'connection') connections.set(entity.id, entity as Connection);
  };
  const schemas: Record<ResourceType, SchemaName> = { objects: 'object', relations: 'relation', views: 'view', tables:'table', waveforms:'waveform', references:'reference' };
  const loaded = new Set<string>();
  for (const [resourceIndex, resource] of manifest.resources.entries()) {
    const file = projectPath(root, ir, resource.path);
    const identity = realpathSync(file);
    if (loaded.has(identity)) failure('DUPLICATE_RESOURCE', manifestFile, `/resources/${resourceIndex}/path`, '同一资源文件重复声明');
    loaded.add(identity);
    let data: any;
    try { data = readJson(file, schemas[resource.type],Number(manifest.irVersion.split('.')[1])>0); }
    catch (error) {
      if (error instanceof EngDocError) { diagnostics.push(...error.diagnostics); continue; }
      throw error;
    }
    for (const [i, entity] of data[resource.type].entries()) {
      const path = `/${resource.type}/${i}`;
      add(entity, resource.type === 'views' ? 'view' : entity.kind, file, path);
      if (entity.kind === 'table') entity.rows.forEach((row: Entity, p:number)=>add(row,'row',file,`${path}/rows/${p}`,entity.id));
      if (entity.kind === 'node') entity.ports?.forEach((port: Entity, p: number) => add(port, 'port', file, `${path}/ports/${p}`, entity.id));
    }
  }
  // 结构不合法时不运行语义遍历，避免把无效数据当成类型完整的 IR。
  if (diagnostics.length) throw new EngDocError(diagnostics);
  const graph: Graph = { manifest, irDirectory: ir, projectRoot: root, index, connections, adjacency: new Map() };
  registerDocuments(graph);
  validateRelations(graph);
  validateDocuments(graph);
  for (const connection of connections.values()) {
    for (const id of connection.endpoints) {
      const ids = [id, index.get(id)!.ownerId].filter(Boolean) as string[];
      for (const target of ids) {
        if (!graph.adjacency.has(target)) graph.adjacency.set(target, new Set());
        graph.adjacency.get(target)!.add(connection.id);
      }
    }
  }
  return graph;
}
