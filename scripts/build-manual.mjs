// 手册在安装构建阶段同源预生成；安装后的查询无需仓库源、转换器或用户配置。
import {mkdirSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
import {resolveProjectConfig,loadBook} from '../dist/packages/core/index.js';
import {compileManual} from '../dist/packages/core/manual.js';
import {bookHTML} from '../dist/packages/pack-html/book.js';
const directory=fileURLToPath(new URL('../dist/manual/',import.meta.url));mkdirSync(directory,{recursive:true});
const book=await loadBook(await resolveProjectConfig(fileURLToPath(new URL('../docs/edoc.config.js',import.meta.url))));
writeFileSync(directory+'/index.html',await bookHTML(book));
writeFileSync(directory+'/index.json.gz',gzipSync(JSON.stringify(compileManual(book))));
console.error('完整工具手册 HTML 与章节/事实查询索引已生成。');
