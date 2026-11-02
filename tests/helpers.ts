import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve,relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { EngDocError, loadIR,loadConfig } from '../packages/core/index.ts';

export const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const sample = join(repository, 'tests/fixtures/board-flash');
export const json = (file: string): any => JSON.parse(readFileSync(file, 'utf8'));
export const save = (file: string, data: unknown) => writeFileSync(file, JSON.stringify(data, null, 2) + '\n');

export function fixture(t: { after: (fn: () => void) => void }) {
  const workspace = mkdtempSync(join(tmpdir(), 'engdoc-test-'));
  const root = join(workspace, 'project');
  cpSync(sample, root, { recursive: true });
  t.after(() => rmSync(workspace, { recursive: true, force: true }));
  const syncConfig=()=>{
    const metadata=json(join(root,'ir/manifest.json'));
    writeFileSync(join(root,'engdoc.config.js'),'export default '+JSON.stringify({projectId:metadata.projectId,documents:metadata.entryDocuments,data:'ir'})+';\n');
  };
  syncConfig();
  return { root, ir: join(root, 'ir'), workspace,
    edit: (name: string, mutate: (data: any) => void) => {
      const file = join(root, 'ir', name + '.json');
      const data = json(file); mutate(data); save(file, data);if(name==='manifest')syncConfig();
    },
    load: () => loadIR(join(root, 'ir'), { projectRoot: root }),
  };
}

// 历史样例的原始转换器仅用于准备测试数据；真实 CLI 始终走新的 JS/自动扫描入口。
export function prepareExample(root:string){
 const config=loadConfig(join(root,'engdoc.config.json')),metadata=json(join(config.irDirectory,'manifest.json'));
 const file=join(root,'engdoc.config.js');writeFileSync(file,'export default '+JSON.stringify({projectId:metadata.projectId,title:config.title,documents:metadata.entryDocuments,data:relative(root,config.irDirectory).split('\\').join('/')})+';\n');return file;
}

export function expectCode(run: () => unknown, code: string, pointer?: string) {
  assert.throws(run, (error: unknown) => {
    assert.ok(error instanceof EngDocError, String(error));
    assert.ok(error.diagnostics.some(d => d.code === code && (pointer === undefined || d.path === pointer)), JSON.stringify(error.diagnostics));
    return true;
  });
}
