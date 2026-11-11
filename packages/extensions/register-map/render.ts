import type {Graph} from '../../core/types.ts';
import {registerMapProjection} from './model.ts';
import type {RegisterMapPresentation} from './contract.ts';
import {escape as esc, rect, text, textWidth, svg} from '../../figure/svg.ts';
import {routeHash} from '../../core/routes.ts';

function wrap(value: string, width: number, size = 14): string[] {
  const lines: string[] = [];
  let line = '';
  for (const character of value) {
    if (line && (character === '\n' || textWidth(line + character, size) > width)) {lines.push(line); line = '';}
    if (character !== '\n') line += character;
  }
  if (line) lines.push(line);
  return lines;
}
export function registerMapSVG(graph: Graph, id: string) {
  const p = registerMapProjection(graph, id), model = graph.index.get(id)!.entity, width = 1040;
  let body = text(24, 34, model.label ?? id, 'font-size="18" font-weight="600"') +
    text(24, 60, `${p.relative ? '相对地址' : '绝对地址'} · 地址单位 ${p.addressUnitBits} bit · ${p.total} 个寄存器实例`, 'class="muted"');
  let y = 90;
  for (const range of p.intervals) {
    const title = range.label + ' · ' + range.start + (range.end ? '–' + range.end : '（空范围）');
    const details = [range.description, `count ${range.count} · stride ${range.stride} · span ${range.span}`].filter(Boolean).join(' · ');
    const titles = wrap(title, 950), lines = wrap(details, 950, 12), height = 20 + titles.length * 20 + lines.length * 18;
    body += `<g data-local="${esc(range.id)}">${rect(24, y, 992, height, 'class="frame" rx="5"')}${titles.map((line, i) => text(38, y + 23 + i * 20, line)).join('')}${lines.map((line, i) => text(38, y + 23 + titles.length * 20 + i * 18, line, 'class="muted"')).join('')}</g>`;
    y += height + 12;
  }
  body += text(24, y + 16, '实例名称 → 地址 → 用途', 'font-weight="600"'); y += 34;
  for (const row of p.rows) {
    const names = wrap(row.pathLabels?.join(' / ') ?? row.label ?? row.definition, 395);
    const descriptions = wrap(row.description ?? '用途未声明', 350);
    const addresses = wrap(row.address ?? row.offset, 180);
    const height = Math.max(names.length, descriptions.length, addresses.length) * 20 + 16;
    body += `<g data-local="${esc(JSON.stringify(row.path))}"><title>${esc(JSON.stringify(row.path) + ' → ' + row.definition)}</title>${rect(24, y, 992, height, 'style="fill:white;stroke:#dce4ed"')}${names.map((line, i) => text(38, y + 23 + i * 20, line)).join('')}${addresses.map((line, i) => text(450, y + 23 + i * 20, line)).join('')}${descriptions.map((line, i) => text(650, y + 23 + i * 20, line)).join('')}</g>`;
    y += height;
  }
  if (p.truncated) {body += text(24, y + 25, `仅展示前 ${p.limit} 个实例；query --element 可定位任意实例。`, 'class="muted"'); y += 40;}
  return svg(width, y + 25, body, {id, label: model.label, projection: p, source: model.source});
}
export function registerMapTable(graph: Graph, id: string, options: RegisterMapPresentation = {}) {
  const p = registerMapProjection(graph, id, 120, {register: options.register});
  const model = graph.index.get(id)!.entity;
  const regionMode = options.mode === 'regions';
  const caption = `${model.label ?? id} · ${regionMode ? '地址划分' : '寄存器列表'} · ${p.addressUnitBits} bit 地址单位`;
  const rows = regionMode ? p.intervals.map(range => `<tr><td>${esc(range.label)}</td><td><code>${esc(range.start)}</code></td><td><code>${esc(range.end ?? '空范围')}</code></td><td>${esc(range.description ?? '用途未声明')}${range.count !== '1' ? `<br/>${esc(range.count)} 个实例，stride ${esc(range.stride)}；范围含实例间空洞` : ''}</td></tr>`).join('') : p.rows.map(row => {
    const target = options.definitions && Object.hasOwn(options.definitions, row.definition) ? options.definitions[row.definition] : row.definition;
    const path = p.relative ? row.pathLabels : row.pathLabels?.slice(1);
    const name = path?.join(' / ') || row.label || row.definition;
    const href = routeHash({kind: 'entity', project: graph.manifest.projectId, id: target});
    return `<tr data-register-instance="${esc(JSON.stringify(row.path))}"><td>${esc(row.region ?? '')}</td><td><code>${esc(row.regionOffset ?? row.offset)}</code></td>${p.relative ? '' : `<td><code>${esc(row.address)}</code></td>`}<td><a href="${esc(href)}">${esc(name)}</a></td><td>${esc(row.description ?? '用途未声明')}<details><summary>身份与跨度</summary><code>${esc(JSON.stringify(row.path))}</code> → <code>${esc(row.definition)}</code> · span ${esc(row.span)}</details></td></tr>`;
  }).join('');
  const header = regionMode ? `<th>区域</th><th>起始${p.relative ? '偏移' : '地址'}</th><th>末${p.relative ? '偏移' : '地址'}（含）</th><th>用途</th>` : `<th>所属区域/块</th><th>${p.relative ? '块内偏移' : '区域内偏移'}</th>${p.relative ? '' : '<th>绝对地址</th>'}<th>寄存器</th><th>用途</th>`;
  const note = !regionMode ? `<p>共 ${p.total} 个寄存器实例${p.truncated ? '，以下仅展示前 ' + p.limit + ' 项' : ''}；${p.relative ? '偏移相对当前块起点' : '区域内偏移相对所属区域实例的起始地址'}。</p>` : '';
  return `<div class="register-map-table" data-register-map="${esc(id)}" data-map-mode="${regionMode ? 'regions' : 'registers'}">${note}<div class="register-map-scroll"><table><caption>${esc(caption)}</caption><thead><tr>${header}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
