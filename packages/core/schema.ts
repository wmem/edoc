import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Diagnostic } from './types.ts';
import { failure } from './errors.ts';

type Schema = boolean | { [key: string]: any };
const directory = resolve(dirname(fileURLToPath(import.meta.url)), '../schema');
const names = ['common', 'manifest', 'object', 'relation', 'view', 'config'] as const;
export type SchemaName = typeof names[number];
const registry = new Map<string, Schema>();
// 只实现并接受本仓库使用的断言；不能静默忽略未来增加的校验规则。
const keywords = new Set(['$schema', '$id', '$defs', '$ref', 'title', 'description',
  'type', 'const', 'enum', 'required', 'properties', 'additionalProperties',
  'items', 'minItems', 'uniqueItems', 'minimum', 'minLength', 'pattern', 'oneOf']);
const escapePointer = (s: string) => s.replace(/~/g, '~0').replace(/\//g, '~1');
const isObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

export function checkSchemaDefinition(schema: Schema, file = '<schema>'): void {
  if (typeof schema === 'boolean') return;
  if (!isObject(schema)) failure('SCHEMA_DEFINITION', file, '', 'Schema 必须为对象或布尔值');
  for (const key of Object.keys(schema)) {
    if (!keywords.has(key)) failure('SCHEMA_KEYWORD', file, '', `不支持的 Schema 关键字：${key}`);
  }
  for (const s of Object.values(schema.$defs ?? {})) checkSchemaDefinition(s as Schema, file);
  for (const s of Object.values(schema.properties ?? {})) checkSchemaDefinition(s as Schema, file);
  for (const s of schema.oneOf ?? []) checkSchemaDefinition(s, file);
  if (schema.items !== undefined) checkSchemaDefinition(schema.items, file);
  if (schema.additionalProperties !== undefined) checkSchemaDefinition(schema.additionalProperties, file);
  if (schema.pattern) new RegExp(schema.pattern, 'u');
}

for (const name of names) {
  const schema = JSON.parse(readFileSync(resolve(directory, `${name}.schema.json`), 'utf8'));
  checkSchemaDefinition(schema, name);
  registry.set(`${name}.schema.json`, schema);
}

function dereference(ref: string, document: Schema): { schema: Schema; document: Schema } {
  const [file, pointer = ''] = ref.split('#');
  const target = file ? registry.get(file) : document;
  if (target === undefined || (pointer && !pointer.startsWith('/')))
    failure('SCHEMA_REFERENCE', '<schema>', '', `无法解析 Schema 引用：${ref}`);
  let result: any = target;
  for (const token of pointer.split('/').slice(1)) result = result?.[token.replace(/~1/g, '/').replace(/~0/g, '~')];
  if (result === undefined) failure('SCHEMA_REFERENCE', '<schema>', '', `Schema 指针不存在：${ref}`);
  return { schema: result, document: target };
}

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && equal(a[k], b[k]));
  }
  return false;
}

function inspect(schema: Schema, data: any, file: string, path: string, document: Schema, inheritedId?: string): Diagnostic[] {
  const id = isObject(data) && typeof data.id === 'string' ? data.id : inheritedId;
  const issue = (message: string, at = path): Diagnostic => ({ code: 'SCHEMA', file, path: at, message, ...(id ? { id } : {}) });
  if (schema === true) return [];
  if (schema === false) return [issue('不允许此值')];
  const errors: Diagnostic[] = [];
  if (schema.$ref) {
    const resolved = dereference(schema.$ref, document);
    errors.push(...inspect(resolved.schema, data, file, path, resolved.document, id));
  }
  if (schema.oneOf) {
    const branches = schema.oneOf.map((s: Schema) => inspect(s, data, file, path, document, id));
    if (branches.filter((b: Diagnostic[]) => b.length === 0).length !== 1) {
      errors.push(issue('必须恰好匹配一个对象类型'));
      // 具体字段诊断保留在最接近的分支，避免只报告 oneOf 失败。
      if (branches.every((b: Diagnostic[]) => b.length)) errors.push(...branches.sort((a: Diagnostic[], b: Diagnostic[]) => a.length - b.length)[0]);
    }
  }
  if (schema.type) {
    const matches = schema.type === 'object' ? isObject(data)
      : schema.type === 'array' ? Array.isArray(data)
      : schema.type === 'integer' ? Number.isSafeInteger(data)
      : schema.type === 'number' ? typeof data === 'number' && Number.isFinite(data)
      : typeof data === schema.type;
    if (!matches) return [...errors, issue(`需要类型 ${schema.type}`)];
  }
  if (Object.hasOwn(schema, 'const') && !equal(data, schema.const)) errors.push(issue(`需要固定值 ${JSON.stringify(schema.const)}`));
  if (schema.enum && !schema.enum.some((v: unknown) => equal(v, data))) errors.push(issue(`值必须属于 ${JSON.stringify(schema.enum)}`));
  if (typeof data === 'string') {
    if (schema.minLength !== undefined && [...data].length < schema.minLength) errors.push(issue('字符串过短'));
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(data)) errors.push(issue(`不匹配模式 ${schema.pattern}`));
  }
  if (typeof data === 'number' && schema.minimum !== undefined && data < schema.minimum) errors.push(issue(`数值必须 ≥ ${schema.minimum}`));
  if (Array.isArray(data)) {
    if (schema.minItems !== undefined && data.length < schema.minItems) errors.push(issue(`至少需要 ${schema.minItems} 项`));
    if (schema.uniqueItems && data.some((v, i) => data.slice(0, i).some(previous => equal(v, previous)))) errors.push(issue('数组项不能重复'));
    if (schema.items !== undefined) data.forEach((v, i) => errors.push(...inspect(schema.items, v, file, `${path}/${i}`, document, id)));
  }
  if (isObject(data)) {
    for (const key of schema.required ?? []) if (!Object.hasOwn(data, key)) errors.push(issue(`缺少必需字段 ${key}`, `${path}/${escapePointer(key)}`));
    for (const [key, value] of Object.entries(data)) {
      const subPath = `${path}/${escapePointer(key)}`;
      if (Object.hasOwn(schema.properties ?? {}, key)) errors.push(...inspect(schema.properties[key], value, file, subPath, document, id));
      else if (schema.additionalProperties === false) errors.push(issue(`未知字段 ${key}`, subPath));
      else if (isObject(schema.additionalProperties)) errors.push(...inspect(schema.additionalProperties, value, file, subPath, document, id));
    }
  }
  return errors;
}

export function validateSchema(name: SchemaName, data: unknown, file = '<memory>'): Diagnostic[] {
  const schema = registry.get(`${name}.schema.json`)!;
  return inspect(schema, data, file, '', schema);
}
