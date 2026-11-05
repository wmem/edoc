import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadBook} from '../packages/core/book.ts';
import {resolveProjectConfig} from '../packages/core/project.ts';
export const definitions=`{% section id="specs" title="规范库" %}
{% specification id="CLOCK" title="时钟条件" %}
只在 **有效时钟** 下推进 😀。

- 适用条件：时钟可运行。
- 例外：停钟时等待。

## 例子 {% #clock-example %}
[本条示例](#clock-example)
[内部细节](#CLOCK-DETAIL)
{% reference id="CLOCK-DETAIL" label="细节原文" /%}
[规范库](#specs)

{% section id="CLOCK-DETAIL" title="完整细节" %}必须携带的子章节。{% /section %}
{% /specification %}
{% specification id="REQUEST" title="清零请求" %}
上一笔未完成时，不得覆盖请求。
{% /specification %}
{% /section %}`;
export const behavior=`{% section id="behavior" title="整组清零" %}
清零完成后返回新的代数。
{% spec-list for="behavior" common=["CLOCK"] specific=["REQUEST"] /%}
{% /section %}
{% section id="other" title="其他行为" %}
{% spec-list for="other" common=["CLOCK"] /%}
{% spec-list for="behavior" /%}
{% /section %}`;
export function specimen(t:any,text=behavior,config='{}'){
 const root=mkdtempSync(join(tmpdir(),'edoc-spec-'));t.after(()=>rmSync(root,{recursive:true,force:true}));mkdirSync(join(root,'docs'));
 const write=(file:string,body:string)=>writeFileSync(join(root,file),body);
 write('docs/index.mdoc',text);write('docs/specs.mdoc',definitions);write('docs/edoc.config.js',`export default ${config};`);
 const load=async()=>loadBook(await resolveProjectConfig(join(root,'docs/edoc.config.js')));
 return {root,write,load};
}
