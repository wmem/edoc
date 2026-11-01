#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, loadIR, query, summary, EngDocError } from '../core/index.ts';
import type { Diagnostic } from '../core/types.ts';

const help = `EngDoc 0.1.0 / IR 1.0（P0）
用法：
  engdoc validate --config engdoc.config.json [--format json|text]
  engdoc query --config engdoc.config.json --id ID [--depth 0..10] [--max-items 1..10000] [--format json|text]
  engdoc validate|query --ir PATH [--project-root PATH] ...

--config 与 --ir 二选一。配置文件所在目录是允许的工程范围。
--ir 模式默认以 IR 目录为工程范围，可用 --project-root 指定祖先目录。
默认查询不递归展开，保留所有直接连接及完整端点。
P0 不运行 Adapter，不支持 build/export；后续阶段增加。
退出码：0 成功；1 IR/文件校验失败；2 命令用法错误；3 查询 ID 不存在。
`;

class UsageError extends Error {}

export function main(argv: string[]): number {
  let format = argv.includes('json') ? 'json' : 'text';
  try {
    if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) { process.stdout.write(help); return 0; }
    if (argv.length === 1 && argv[0] === '--version') { process.stdout.write('EngDoc 0.1.0 / IR 1.0\n'); return 0; }
    const [command, ...tokens] = argv;
    if (!['validate', 'query'].includes(command)) throw new UsageError('P0 仅支持 validate/query；使用 --help 查看用法');
    const allowed = new Set(['--config', '--ir', '--project-root', '--format', ...(command === 'query' ? ['--id', '--depth', '--max-items'] : [])]);
    const options: Record<string, string> = {};
    for (let i = 0; i < tokens.length; i += 2) {
      const key = tokens[i];
      if (!allowed.has(key)) throw new UsageError(`未知选项 ${key}`);
      if (Object.hasOwn(options, key)) throw new UsageError(`重复选项 ${key}`);
      if (tokens[i + 1] === undefined || tokens[i + 1].startsWith('--')) throw new UsageError(`${key} 缺少值`);
      options[key] = tokens[i + 1];
    }
    format = options['--format'] ?? (command === 'query' ? 'json' : 'text');
    if (!['json', 'text'].includes(format)) throw new UsageError('--format 只能是 json 或 text');
    if (Boolean(options['--config']) === Boolean(options['--ir'])) throw new UsageError('--config 与 --ir 必须且只能提供一个');
    if (options['--config'] && options['--project-root']) throw new UsageError('--project-root 只适用于 --ir');
    if (command === 'query' && !options['--id']) throw new UsageError('query 需要 --id');
    const integer = (key: string, fallback: number, low: number, high: number): number => {
      const input = options[key];
      if (input === undefined) return fallback;
      if (!/^(0|[1-9][0-9]*)$/.test(input) || Number(input) < low || Number(input) > high) throw new UsageError(`${key} 必须为 ${low}–${high} 的整数`);
      return Number(input);
    };
    const depth = integer('--depth', 0, 0, 10);
    const maxItems = integer('--max-items', 1000, 1, 10000);
    const config = options['--config'] ? loadConfig(options['--config'])
      : { irDirectory: resolve(options['--ir']), projectRoot: options['--project-root'] ? resolve(options['--project-root']) : undefined };
    const graph = loadIR(config.irDirectory, config);
    const result = command === 'validate' ? summary(graph) : query(graph, options['--id'], { depth, maxItems });
    if (format === 'json') process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    else if (command === 'validate') process.stdout.write(`校验通过：${graph.manifest.projectId} / IR ${graph.manifest.irVersion} / ${graph.index.size} 个可引用实体\n`);
    else process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  } catch (error) {
    const diagnostics: Diagnostic[] = error instanceof EngDocError ? error.diagnostics : [{
      code: error instanceof UsageError ? 'USAGE' : 'FILE_IO', file: '<cli>', path: '',
      message: error instanceof Error ? error.message : String(error),
    }];
    process.stderr.write(format === 'json' ? JSON.stringify({ valid: false, diagnostics }, null, 2) + '\n'
      : diagnostics.map(d => `${d.code} ${d.file}${d.path}${d.id ? ` [${d.id}]` : ''}: ${d.message}`).join('\n') + '\n');
    if (error instanceof UsageError) return 2;
    if (diagnostics.some(d => d.code === 'QUERY_NOT_FOUND')) return 3;
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = main(process.argv.slice(2));
