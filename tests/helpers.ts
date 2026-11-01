import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { EngDocError, loadIR } from '../packages/core/index.ts';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sample = join(repository, 'examples/board-flash');
export const json = (file: string): any => JSON.parse(readFileSync(file, 'utf8'));
export const save = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

export function fixture(t: { after: (fn: () => void) => void }) {
  const workspace = mkdtempSync(join(tmpdir(), 'engdoc-test-'));
  const root = join(workspace, 'project');
  cpSync(sample, root, { recursive: true });
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  return { root, ir: join(root, 'ir'), workspace,
    edit: (name: string, mutate: (data: any) => void) => {
      const file = join(root, 'ir', name + '.json');
      const data = json(file); mutate(data); save(file, data);
    },
    load: () => loadIR(join(root, 'ir'), { projectRoot: root }),
  };
}

export function expectCode(run: () => unknown, code: string, pointer?: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof EngDocError, String(error));
    assert.ok(error.diagnostics.some(d => d.code === code && (pointer === undefined || d.path === pointer)), JSON.stringify(error.diagnostics));
    return true;
  });
}
