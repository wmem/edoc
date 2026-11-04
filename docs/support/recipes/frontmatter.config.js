import {readFileSync} from 'node:fs';
import {Markdoc} from 'edoc';

const source=readFileSync(new URL('./index.mdoc',import.meta.url),'utf8');
const meta=JSON.parse(Markdoc.parse(source).attributes.frontmatter);
export default {markdoc:{variables:{meta}}};
