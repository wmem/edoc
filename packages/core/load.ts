import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { validateSchema } from './schema.ts';
import type { SchemaName } from './schema.ts';
import type { Connection, Diagnostic, Entity, Graph, Manifest, RecordEntry, ResourceType } from './types.ts';
import { EngDocError, failure } from './errors.ts';
import { projectPath, requireFile } from './paths.ts';
import { validateRelations } from './relations.ts';

const MAX_JSON_BYTES = 16 * 1024 * 1024;
export const SUPPORTED_IR_VERSION = '1.0';

function finiteJson(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(finiteJson);
  if (value && typeof value === 'object') return Object.values(value).every(finiteJson);
  return true;
}

export function readJson(file: string, schema: SchemaName): any {
  requireFile(file);
  if (statSync(file).size > MAX_JSON_BYTES) failure('FILE_SIZE', file, '', '单个 JSON 分片不得超过 16 MiB，请拆分资源');
  let data: unknown;
  try { data = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readFileSync(file))); }
  catch { failure('JSON_PARSE', file, '', '不是有效的 UTF-8 JSON'); }
  if (!finiteJson(data)) failure('JSON_NUMBER', file, '', '数值超出有限 JSON 数值范围');
  const errors = validateSchema(schema, data, file);
  if (errors.length) throw new EngDocError(errors);
  return data;
}

export function loadConfig(file: string): { irDirectory: string; projectRoot: string; projectId: string } {
  const configFile = realpathSync(resolve(file));
  const projectRoot = dirname(configFile);
  const config = readJson(configFile, 'config');
  const irDirectory = projectPath(projectRoot, projectRoot, config.irDirectory);
  return { irDirectory, projectRoot, projectId: config.projectId };
}

export function loadIR(irDirectory: string, options: { projectRoot?: string; projectId?: string } = {}): Graph {
  const root = realpathSync(resolve(options.projectRoot ?? irDirectory));
  const requested = resolve(irDirectory);
  const ir = projectPath(root, root, relative(root, requested) || '.');
  const manifestFile = projectPath(root, ir, 'manifest.json');
  const manifest = readJson(manifestFile, 'manifest') as Manifest;
  // P0 尚未定义后续 minor 的能力协商，拒绝未经验证的版本，避免静默丢字段。
  if (manifest.irVersion !== SUPPORTED_IR_VERSION)
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
  const schemas: Record<ResourceType, SchemaName> = { objects: 'object', relations: 'relation', views: 'view' };
  const loaded = new Set<string>();
  for (const [resourceIndex, resource] of manifest.resources.entries()) {
    const file = projectPath(root, ir, resource.path);
    const identity = realpathSync(file);
    if (loaded.has(identity)) failure('DUPLICATE_RESOURCE', manifestFile, `/resources/${resourceIndex}/path`, '同一资源文件重复声明');
    loaded.add(identity);
    let data: any;
    try { data = readJson(file, schemas[resource.type]); }
    catch (error) {
      if (error instanceof EngDocError) { diagnostics.push(...error.diagnostics); continue; }
      throw error;
    }
    for (const [i, entity] of data[resource.type].entries()) {
      const path = `/${resource.type}/${i}`;
      add(entity, resource.type === 'views' ? 'view' : entity.kind, file, path);
      if (entity.kind === 'node') entity.ports?.forEach((port: Entity, p: number) => add(port, 'port', file, `${path}/ports/${p}`, entity.id));
    }
  }
  // 结构不合法时不运行语义遍历，避免把无效数据当成类型完整的 IR。
  if (diagnostics.length) throw new EngDocError(diagnostics);
  const graph: Graph = { manifest, irDirectory: ir, projectRoot: root, index, connections, adjacency: new Map() };
  validateRelations(graph);
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
