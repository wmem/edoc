// 手册与旧 Gallery 共用样例源和 Adapter，不复制 Ball、Pin 或 RTL 位宽。
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import authoringConfig from './recipes/edoc.config.js';
import graphOptionsConfig from './recipes/graph-options.config.js';
import registersConfig from './recipes/registers.config.js';
import tableReadingConfig from './recipes/table-reading.config.js';

export function tutorialData({root}){
 const result={objects:[],relations:[],views:[],tables:[],waveforms:[],references:[],registers:[]};
 const json=file=>JSON.parse(readFileSync(join(root,file),'utf8'));
 const relocate=(value,prefix)=>{
  if(Array.isArray(value))return value.map(v=>relocate(v,prefix));
  if(value&&typeof value==='object'){
   const copy=Object.fromEntries(Object.entries(value).map(([key,v])=>[key,relocate(v,prefix)]));
   if(typeof copy.source?.file==='string')copy.source.file=prefix+'/'+copy.source.file;
   return copy;
  }
  return value;
 };
 for(const name of ['board-flash','fpga-mac']){
  const directory=mkdtempSync(join(tmpdir(),'edoc-manual-')),prefix='examples/'+name;
  try{
   try{execFileSync(process.execPath,['doc-adapter/convert.mjs'],{cwd:join(root,prefix),env:{...process.env,EDOC_IR_OUTPUT:directory},stdio:'pipe',timeout:30000});}
   catch(error){throw new Error(`手册图示转换失败 ${prefix}：${error.stderr?.toString()??error.message}`);}
   for(const type of Object.keys(result)){
    try{const data=JSON.parse(readFileSync(join(directory,type+'.json'),'utf8'));result[type].push(...relocate(data[type],prefix));}
    catch(error){if(error.code!=='ENOENT')throw error;}
   }
  }finally{rmSync(directory,{recursive:true,force:true});}
 }
 const buses=json('examples/gallery/interfaces.json');
 for(const type of ['objects','relations','views'])result[type].push(...buses[type]);
 result.views.push(...json('examples/gallery/constraints.json').views.map(v=>({...v,source:{file:'examples/gallery/constraints.json',selector:v.id}})));
 const layouts=json('examples/gallery/layouts.json'),layoutSource='examples/gallery/layouts.json';
 for(const type of ['objects','relations'])result[type].push(...layouts[type].map(entity=>({...entity,source:{file:layoutSource,selector:entity.id}})));
 for(const direction of layouts.directions)result.views.push({id:'gallery:layout-'+direction,kind:'architecture',label:'同一组关系 · '+direction,include:{objects:layouts.objects.slice(0,5).map(n=>n.id),relations:layouts.relations.slice(0,5).map(n=>n.id)},layout:{direction,routing:'orthogonal'},source:{file:layoutSource,selector:'directions'}});
 result.views.push({id:'gallery:fixed',kind:'architecture',label:'固定位置 · 障碍绕行',include:{objects:layouts.objects.slice(5).map(n=>n.id),relations:['gallery:bypass']},layout:{direction:'LR',routing:'orthogonal',positions:layouts.fixedPositions},source:{file:layoutSource,selector:'fixedPositions'}});
 const pipeline=json('docs/support/pipeline.json');
 for(const type of ['objects','relations'])result[type].push(...pipeline[type].map(entity=>({...entity,source:{file:'docs/support/pipeline.json',selector:entity.id}})));
 result.objects.push({id:'manual:pdf-source',kind:'node',label:'PDF 定位示例文件',source:{file:'docs/assets/location.pdf',selector:'DETAIL',attachment:{id:'location',target:'detail'}}});
 for(const file of ['objects','tables','waveforms','topology','layout','table-values','graph-options','interfaces','states','wiring','evidence']){
  const path=`docs/ir/authoring/${file}.json`,data=json(path);
  for(const type of Object.keys(result))result[type].push(...(data[type]??[]).map(entity=>({...entity,source:entity.source??{file:path,selector:entity.id}})));
 }
 result.registers.push(...registersConfig.data.registers);
 result.tables.push(...registersConfig.data.tables);
 result.tables.push(...tableReadingConfig.data.tables.map(table=>({...table,source:{file:'docs/support/recipes/table-reading.config.js',selector:table.id}})));
 result.views.push(...authoringConfig.views.map(view=>({...view,source:{file:'docs/support/recipes/edoc.config.js',selector:view.id}})));
 result.views.push(...graphOptionsConfig.views.map(view=>({...view,source:{file:'docs/support/recipes/graph-options.config.js',selector:view.id}})));
 return result;
}
