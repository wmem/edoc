// 从交付的400字重子集生成度量；fontkit仅为开发依赖，运行时不解析字体。
import {openSync} from 'fontkit';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),root=dirname(require.resolve('@fontsource/noto-sans-sc/400.css'));
const widths=new Map();let ascent=0,descent=0,left=0,right=0;
for(const match of readFileSync(resolve(root,'400.css'),'utf8').matchAll(/url\(['"]?([^)'"\s]+\.woff2)['"]?\)/g)){
 const font=openSync(resolve(root,match[1])),unit=font.unitsPerEm;
 ascent=Math.max(ascent,font.ascent/unit);descent=Math.max(descent,-font.descent/unit);
 for(const code of font.characterSet){const glyph=font.glyphForCodePoint(code),box=glyph.bbox;
  widths.set(code,Math.round(glyph.advanceWidth/unit*1000));
  if(Number.isFinite(box.minX)){left=Math.max(left,-box.minX/unit);right=Math.max(right,(box.maxX-glyph.advanceWidth)/unit);ascent=Math.max(ascent,box.maxY/unit);descent=Math.max(descent,-box.minY/unit);}
 }
}
const ranges=[];for(const [code,width]of [...widths].sort((a,b)=>a[0]-b[0])){const last=ranges.at(-1);if(last&&last[1]+1===code&&last[2]===width)last[1]=code;else ranges.push([code,code,width]);}
const data={family:'Noto Sans SC',version:JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version,ascent,descent,left,right,ranges};
writeFileSync(new URL('../packages/render-graph/font-metrics.ts',import.meta.url),'// 由 scripts/font-metrics.mjs 生成，来源为随包Noto Sans SC/OFL字体。\nexport const fontMetrics='+JSON.stringify(data)+';\n');
console.error(`字体度量已生成：${widths.size} 个码点、${ranges.length} 段，运行时无需fontkit。`);
