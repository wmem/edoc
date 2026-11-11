import {anchor} from '../core/identity.ts';
import {fontCSS} from '../render-graph/font.ts';
import {esc} from '../render-graph/svg.ts';
import {styles} from '../render-graph/styles.ts';
import type {DrawingScene, TextBox, Drawing} from './types.ts';
import {same} from '../render-graph/geometry.ts';

// 网页与独立 SVG 只读取相同的几何结果；导出不进行第二次布局。
export function drawingSVG(scene: DrawingScene, drawing: Drawing, embedFont = true, display: {showRelationLabels?: boolean; showPortAttributes?: boolean} = {}, instance = scene.id): string {
  const vb = scene.viewBox, labelsVisible = display.showRelationLabels ?? true, attributesVisible = display.showPortAttributes ?? true, marker = anchor(instance);
  const texts = (box: TextBox, bold = false) => `<g data-text="${esc(box.id)}">${box.lines.map((line, i) => `<text x="${box.x}" y="${box.y + box.size + i * (box.size + 7)}" font-size="${box.size}"${bold ? ' font-weight="700"' : ''}>${esc(line)}</text>`).join('')}</g>`;
  const paths = scene.connections.map(c => {
    const style = styles[drawing.connections.find(source => source.id === c.id)?.style ?? 'data'];
    return `<g data-connection="${esc(c.id)}" stroke="${style.color}" fill="none">${c.paths.map(p => {
      const first = c.ends.find(e => same(e, p.points[0])), last = c.ends.find(e => same(e, p.points.at(-1)!));
      return `<path data-path="${esc(p.id)}" d="M${p.points.map(v => `${v.x},${v.y}`).join('L')}" stroke-width="1.7" stroke-dasharray="${style.dash}"${first?.marker === 'arrow' ? ' marker-start="url(#${marker}-start)"' : ''}${last?.marker === 'arrow' ? ' marker-end="url(#${marker}-end)"' : ''}/>`;
    }).join('')}${c.junctions.map(p => `<circle cx="${p.x}" cy="${p.y}" r="3" fill="${style.color}"/>`).join('')}${c.ends.filter(e => e.marker === 'circle').map(e => `<circle cx="${e.x}" cy="${e.y}" r="4" fill="white"/>`).join('')}</g>`;
  }).join('');
  const boxes = scene.nodes.map(n => {
    const container = scene.nodes.some(child => child.parentId === n.id);
    return `<g data-node="${esc(n.id)}"><rect x="${n.x}" y="${n.y}" width="${n.width}" height="${n.height}" rx="6" fill="${container ? 'none' : '#fff'}" stroke="${container ? '#718b9e' : '#54748b'}" stroke-width="1.2"/>${texts(n.title, true)}${n.contents.map(t => texts(t)).join('')}${n.ports.map(p => p.appearance === 'slot' ? `<g data-port="${esc(p.id)}" data-side="${p.side}"/>` : `<g data-port="${esc(p.id)}" data-side="${p.side}"><circle cx="${p.x}" cy="${p.y}" r="3.5" fill="white" stroke="#527d97"/>${texts(p.text)}${p.annotation ? `<g data-port-annotation="${esc(p.id)}"${attributesVisible ? '' : ' display="none"'}>${texts(p.annotation)}</g>` : ''}</g>`).join('')}</g>`;
  }).join('');
  const labels = scene.connections.map(c => `<g data-labels="${esc(c.id)}" data-relation-label="${esc(c.id)}"${labelsVisible ? '' : ' display="none"'}>${c.labels.map(l => `<rect x="${l.x}" y="${l.y}" width="${l.width}" height="${l.height}" rx="3" fill="white"/>${texts({...l, x: l.x + 8, y: l.y + 3})}`).join('')}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.width} ${vb.height}" role="img" aria-label="${esc(scene.id)}" style="background:white;font-family:'Noto Sans SC',sans-serif;fill:#17324d"><title>${esc(scene.id)}</title>${embedFont ? `<style>${esc(fontCSS())}</style>` : ''}<metadata>${esc(JSON.stringify({format: 'edoc drawing prototype 1', scene, display: {showRelationLabels: labelsVisible, showPortAttributes: attributesVisible}}))}</metadata><defs><marker id="${marker}-end" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0L8,4L0,8Z" fill="#176c97"/></marker><marker id="${marker}-start" markerWidth="8" markerHeight="8" refX="1" refY="4" orient="auto-start-reverse"><path d="M0,0L8,4L0,8Z" fill="#176c97"/></marker></defs><text x="${vb.x + 24}" y="${vb.y + 26}" font-size="18" font-weight="700">${esc(scene.id)}</text>${paths}${boxes}${labels}</svg>`;
}
