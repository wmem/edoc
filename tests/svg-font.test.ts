import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {fontCSS} from '../packages/render-graph/font.ts';
import {registerSVG} from '../packages/extensions/register/render.ts';
import type {Register} from '../packages/extensions/register/types.ts';

test('CLI与浏览器共用寄存器SVG入口按XML转义字体，完整保留授权与字体数据', async t => {
  const root = mkdtempSync(join(tmpdir(), 'edoc-svg-font-'));
  t.after(() => rmSync(root, {recursive: true, force: true}));
  mkdirSync(join(root, 'docs'));
  const register: Register = {id: 'reg', kind: 'register', label: '控制寄存器', width: 32, fields: []};
  writeFileSync(join(root, 'docs/edoc.config.js'), 'export default ' + JSON.stringify({data: {registers: [register], registerBlocks: [{id: 'map', kind: 'register-block', label: '字体布局', entries: [{id: 'ctrl', register: 'reg', offset: '0'}]}]}}) + ';');
  writeFileSync(join(root, 'docs/index.mdoc'), '{% section id="home" title="字体SVG回归" %}\n{% register-map id="map" /%}\n{% /section %}');
  const outputs: {name: string; xml: string}[] = [];
  for (const id of ['map', 'reg']) {
    const target = join(root, id + '.svg');
    const result = spawnSync(process.execPath, [resolve('packages/cli/edoc.ts'), 'export', '--config', join(root, 'docs/edoc.config.js'), '--id', id, '--format', 'svg', '--output', target], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stdout + result.stderr);
    outputs.push({name: 'CLI/' + id, xml: readFileSync(target, 'utf8')});
  }
  const css = fontCSS();
  assert.match(css, /PERMISSION & CONDITIONS/, '原始CSS保留授权文本，HTML仍使用它');
  // 浏览器下载也调用registerSVG；加入XML敏感文本，确保接口按原文保留CSS。
  const browserCSS = css + '\n/* <字体> & 授权 ]]> */';
  outputs.push({name: '浏览器共用入口', xml: registerSVG(register, {fontCSS: browserCSS})});
  const browser = await chromium.launch({executablePath: process.env.EDOC_CHROMIUM, args: ['--no-sandbox']});
  t.after(() => browser.close());
  const page = await browser.newPage();
  const strict = await page.evaluate(() => !!new DOMParser().parseFromString('<svg xmlns="http://www.w3.org/2000/svg"><style>/* & */</style></svg>', 'image/svg+xml').querySelector('parsererror'));
  assert.equal(strict, true, '负例证明使用严格XML解析，而非宽容HTML解析');
  for (const output of outputs) {
    const parsed = await page.evaluate(xml => {
      const document = new DOMParser().parseFromString(xml, 'image/svg+xml');
      return {error: document.querySelector('parsererror')?.textContent, style: document.querySelector('style')?.textContent, namespace: document.documentElement.namespaceURI};
    }, output.xml);
    assert.equal(parsed.error, undefined, output.name + ': ' + parsed.error);
    assert.equal(parsed.namespace, 'http://www.w3.org/2000/svg');
    const expected = output.name === '浏览器共用入口' ? browserCSS : css;
    assert.ok(parsed.style!.startsWith(expected), output.name + ' 原文授权和所有fontdata必须逐字保留');
  }
});
