import Markdoc from '@markdoc/markdoc';
import {DOMParser} from '@xmldom/xmldom';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {repository} from './helpers.ts';

type Recipe = {file: string; section: string; destination: string; id: string; kind: string};
const recipes: Recipe[] = [
  {file: 'behavior/flowchart.mdoc', section: 'use:flowchart-create', destination: 'docs/ir/authoring/device-initialization.json', id: 'tutorial:device-init', kind: 'flowchart'},
  {file: 'behavior/flowchart.mdoc', section: 'use:flowchart-complex', destination: 'docs/ir/authoring/control-complex.json', id: 'example:fulfillment', kind: 'flowchart'},
  {file: 'records/plots.mdoc', section: 'use:plot-data', destination: 'docs/ir/authoring/measurements.json', id: 'plot:load-trend', kind: 'plot'},
  {file: 'records/tables.mdoc', section: 'use:table-records-create', destination: 'docs/ir/authoring/measurements.json', id: 'table:measurements', kind: 'table'},
  {file: 'timing/sequences.mdoc', section: 'use:sequence-simple', destination: 'docs/ir/sequence-minimal.json', id: 'recipe:sequence', kind: 'sequence'},
  {file: 'data-layout/binary-layouts.mdoc', section: 'use:binary-simple', destination: 'docs/ir/binary-minimal.json', id: 'recipe:header', kind: 'binary-layout'},
  {file: 'data-layout/registers.mdoc', section: 'use:register-map-simple', destination: 'docs/ir/register-map-minimal.json', id: 'recipe:register-block', kind: 'register-block'},
  {file: 'records/plots.mdoc', section: 'use:plot-simple', destination: 'docs/ir/plot-minimal.json', id: 'recipe:plot', kind: 'plot'},
  {file: 'diagrams/drawing.mdoc', section: 'use:drawing.auto', destination: 'docs/ir/authoring/drawing.json', id: 'manual:drawing-auto', kind: 'architecture'},
  {file: 'behavior/state-advanced.mdoc', section: 'use:state-advanced:views', destination: 'docs/ir/authoring/state-hierarchy.json', id: 'example:microwave', kind: 'state-machine'},
  {file: 'data-layout/registers.mdoc', section: 'use:registers:create', destination: 'docs/ir/authoring/fpga-register-handbook.json', id: 'fpga:csr', kind: 'address-space'},
  {file: 'diagrams/drawing.mdoc', section: 'use:drawing.nested', destination: 'docs/ir/authoring/drawing-nested.json', id: 'study:drawing-nested', kind: 'architecture'},
  {file: 'diagrams/architecture.mdoc', section: 'use:architecture-minimal', destination: 'docs/ir/authoring/objects.json', id: 'system:overview', kind: 'architecture'},
  {file: 'diagrams/architecture.mdoc', section: 'use:architecture-create', destination: 'docs/ir/authoring/structure-system.json', id: 'study:system', kind: 'architecture'},
  {file: 'diagrams/layout.mdoc', section: 'use:layout-create', destination: 'docs/ir/authoring/structure-system.json', id: 'study:layout-intent', kind: 'architecture'},
  {file: 'diagrams/architecture.mdoc', section: 'use:architecture-groups-create', destination: 'docs/ir/authoring/graph-options.json', id: 'author:hierarchy', kind: 'architecture'},
  {file: 'diagrams/interfaces.mdoc', section: 'use:interface-create', destination: 'docs/ir/authoring/interfaces.json', id: 'simple:stream', kind: 'interface'}
];

for (const recipe of recipes) {
  test('教程完整配方独立构建、查询和导出：' + recipe.section, {timeout: 45000}, t => {
    const sourceFile = 'docs/charts/' + recipe.file;
    const ast = Markdoc.parse(readFileSync(join(repository, sourceFile), 'utf8'), {file: sourceFile});
    const section = [...ast.walk()].find(node => node.type === 'tag' && node.tag === 'section' && node.attributes.id === recipe.section);
    assert.ok(section, '创建步骤必须有稳定章节入口');
    const nodes = [...section.walk()];
    const data = nodes.filter(node => node.type === 'tag' && node.tag === 'code' && node.attributes.language === 'json');
    const bodies = nodes.filter(node => node.type === 'fence' && node.attributes.language === 'text');
    const configs = nodes.filter(node => (node.type === 'fence' || node.type === 'tag' && node.tag === 'code') && node.attributes.language === 'javascript');
    assert.ok(data.length >= 1, '配方应提供完整、同源 JSON 及引用文件');
    assert.equal(bodies.length, 1, '正文标签须可独立复制');
    assert.equal(bodies[0].attributes.process, false, '字面正文标签不参与手册执行');
    assert.ok(configs.length <= 1);

    const root = mkdtempSync(join(tmpdir(), 'edoc-chart-recipe-'));
    t.after(() => rmSync(root, {recursive: true, force: true}));
    const write = (file: string, value: string) => {
      mkdirSync(dirname(join(root, file)), {recursive: true});
      writeFileSync(join(root, file), value);
    };
    const config = configs[0]?.attributes.file ? readFileSync(join(repository, configs[0].attributes.file), 'utf8') : configs[0]?.attributes.content ?? 'export default {};';
    write('docs/edoc.config.js', config);
    write('docs/index.mdoc', bodies[0].attributes.content);
    for (const [index, node] of data.entries()) write(index === 0 ? recipe.destination : node.attributes.file, readFileSync(join(repository, node.attributes.file), 'utf8'));
    const cli = (args: string[]) => {
      const result = spawnSync(process.execPath, [join(repository, 'packages/cli/edoc.ts'), ...args], {
        cwd: root, encoding: 'utf8', timeout: 30000
      });
      assert.equal(result.status, 0, result.stderr || result.error?.message || 'CLI 未成功退出');
      return result.stdout;
    };
    cli([]);
    assert.match(readFileSync(join(root, 'output/index.html'), 'utf8'), recipe.kind === 'table' ? /<table\b/ : /<svg\b/);
    const facts = JSON.parse(cli(['query', '--id', recipe.id]));
    assert.equal(facts.target.entity.kind, recipe.kind);
    if (!['architecture', 'interface', 'table'].includes(recipe.kind)) {
      assert.equal(JSON.parse(cli(['read', '--id', recipe.id])).id, recipe.id);
    }
    if (recipe.kind === 'table') {
      assert.equal(facts.target.entity.rows.length, 48);
      const missing = JSON.parse(cli(['query', '--id', 'measurement:A:11']));
      assert.equal(missing.target.entity.values.latency, undefined);
      return;
    }
    const selection = ['architecture', 'interface', 'plot', 'state-machine', 'flowchart'].includes(recipe.kind) ? '--view' : '--id';
    cli(['export', selection, recipe.id, '--format', 'svg', '--output', 'chart.svg']);
    const svg = readFileSync(join(root, 'chart.svg'), 'utf8');
    assert.match(svg, /<svg\b/);
    // CLI 导出内嵌字体，base64 中的偶然字母组合不能当作几何错误。
    const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const geometry = new Set(['x', 'y', 'width', 'height', 'x1', 'x2', 'y1', 'y2', 'd', 'points', 'viewBox', 'transform']);
    for (const element of Array.from(xml.getElementsByTagName('*'))) {
      for (const attribute of Array.from(element.attributes)) {
        if (geometry.has(attribute.name)) assert.doesNotMatch(attribute.value, /NaN|Infinity/);
      }
    }

    if (recipe.kind === 'sequence') {
      const reply = JSON.parse(cli(['query', '--id', recipe.id, '--element', 'reply']));
      assert.equal(reply.target.replyTo, 'request');
      assert.equal(facts.target.entity.steps.length, 2);
    } else if (recipe.kind === 'binary-layout') {
      assert.equal(facts.binaryLayout.size.value, 16);
      assert.equal(facts.binaryLayout.rows.find((row: any) => row.id === 'length').offset.value, 8);
    } else if (recipe.kind === 'register-block') {
      assert.equal(facts.registerMap.addressUnitBits, 8);
      assert.deepEqual(facts.registerMap.rows.map((row: any) => [row.relativeOffset.address, row.range.sizeBits, row.definitionId]),
        [['0x0', '0x20', 'recipe:control']]);
    } else if (recipe.kind === 'plot' && recipe.id === 'recipe:plot') {
      assert.equal(facts.plot.inputCount, 2);
      assert.deepEqual(facts.plot.projection.rows.map((row: any) => [row.values.elapsed, row.values.latency]), [[0, 8], [1, 12]]);
      assert.equal(facts.plot.projection.units.y, 'us');
    } else if (recipe.id === 'plot:load-trend') {
      assert.equal(facts.plot.inputCount, 48);
      assert.equal(facts.plot.projection.rows.length, 12);
      for (const id of ['plot:distribution', 'plot:load-quantile']) cli(['export', '--view', id, '--format', 'svg', '--output', 'extra.svg']);
    } else if (facts.target.entity.drawing) {
      const drawing = facts.target.entity.drawing;
      if (recipe.id === 'manual:drawing-auto') {
        assert.equal(drawing.nodes.length, 3);
        assert.equal(drawing.connections.length, 2);
      } else {
        assert.equal(drawing.nodes.filter((node: any) => node.parentId === 'recorder').length, 2);
        assert.equal(drawing.connections.filter((connection: any) => connection.ends[0].node === 'buffer').length, 2);
      }
      assert.ok(!drawing.layout?.constraints?.some((constraint: any) => ['place', 'fixedRoute'].includes(constraint.type)));
    } else if (recipe.id.startsWith('study:')) {
      const query = (id: string) => JSON.parse(cli(['query', '--id', id]));
      assert.equal(query('study:sample').target.entity.parentId, 'study:recorder');
      assert.equal(query('study:recorder.control').target.entity.members.length, 2);
      assert.deepEqual(query('study:status').target.entity.endpoints, ['study:recorder.status', 'study:host.status']);
      assert.deepEqual(query('study:layout-default').target.entity.include, query('study:layout-intent').target.entity.include);
      // 同一资源的接口、内部视图与默认布局同样必须能实际导出。
      for (const id of ['study:boundary', 'study:control', 'study:inside', 'study:layout-default']) {
        cli(['export', '--view', id, '--format', 'svg', '--output', 'extra.svg']);
      }
    } else if (recipe.id === 'author:hierarchy') {
      assert.equal(JSON.parse(cli(['query', '--id', 'author:rx'])).target.entity.parentId, 'author:subsystem');
    } else if (recipe.kind === 'interface') {
      assert.equal(JSON.parse(cli(['query', '--id', 'simple:source.stream'])).target.entity.members.length, 2);
    } else if (recipe.kind === 'state-machine') {
      assert.equal(facts.target.entity.states.find((state: any) => state.id === 'oven').kind, 'parallel');
      assert.equal(facts.target.entity.regions.filter((region: any) => region.owner === 'oven').length, 2);
    }
  });
}

test('教学控制接口总览、单端及全展开均保持控制在左且保留原两条关系', async () => {
  const {graphFromResources} = await import('../packages/core/graph.ts');
  const {prepareInterfaceModel, initialInterfaceState} = await import('../packages/render-graph/interfaces.ts');
  const {drawingInterfaceScene} = await import('../packages/drawing/interface-scene.ts');
  const {solveDrawing} = await import('../packages/drawing/solve.ts');
  const {svg} = await import('../packages/render-graph/index.ts');
  const data = JSON.parse(readFileSync(join(repository, 'docs/ir/authoring/structure-system.json'), 'utf8'));
  const graph = graphFromResources(Object.entries(data).map(([type, values]) => ({
    type: type as import('../packages/core/types.ts').ResourceType,
    data: {[type]: values}, file: 'structure-system.json'
  })), {projectId: 'tutorial', irVersion: '2.0', requiredFeatures: ['interface-groups', 'layout-intent'], resources: [], entryDocuments: []}, {root: repository, strict: true});
  const model = prepareInterfaceModel(graph, 'study:control')!;
  for (const expanded of [[], ['study:host.control'], ['study:recorder.control'], ['study:host.control', 'study:recorder.control']]) {
    const state = initialInterfaceState(model);
    for (const id of expanded) state.modes[id] = 'expanded';
    const result = await drawingInterfaceScene(model, state, solveDrawing);
    assert.match(svg(result), /<svg\b/);
    const host = result.nodes.find(node => node.id === 'study:host')!;
    const recorder = result.nodes.find(node => node.id === 'study:recorder')!;
    assert.ok(host.x + host.width < recorder.x, '展开任一端后控制者仍应在记录模块左侧');
    const relations = result.nets.flatMap(net => net.sourceRelations?.map(relation => relation.id) ?? [net.id]);
    assert.deepEqual([...new Set(relations)].sort(), ['study:start', 'study:status']);
  }
});
