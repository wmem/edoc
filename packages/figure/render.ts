import type {Graph,Sequence,BinaryLayout,PlotView,SequenceView,BinaryView} from '../core/types.ts';
import {sequenceSVG} from '../extensions/sequence/render.ts';
import {binarySVG} from '../extensions/binary-layout/render.ts';
import {plotSVG} from '../extensions/plot/render.ts';
import {registerMapSVG} from '../extensions/register-map/render.ts';
import {figureFail} from './errors.ts';
import {escape as esc} from './svg.ts';
export function isEngineering(graph:Graph,id:string){const e=graph.index.get(id);return !!e&&(['sequence','binary-layout','register-block','address-space'].includes(e.type)||e.type==='view'&&['sequence','binary-layout','plot'].includes(('kind'in e.entity?e.entity.kind??'':'')));}
export async function engineeringSVG(graph:Graph,id:string,full=false){const entry=graph.index.get(id);if(!entry)figureFail('QUERY_NOT_FOUND',id,'图形不存在');const view=entry.type==='view'?entry.entity:undefined,model=view&&'model'in view?graph.index.get(view.model)?.entity:entry.entity;if(!model)figureFail('FIGURE_MODEL',id,'图形模型不存在');
 if('kind'in model&&model.kind==='sequence')return sequenceSVG(graph,model as Sequence,full?{...view as SequenceView,collapsed:[]}:view as SequenceView);
 if('kind'in model&&model.kind==='binary-layout')return binarySVG(graph,model as BinaryLayout,full?{...view as BinaryView,collapsed:[]}:view as BinaryView);
 if('kind'in model&&model.kind==='plot')return plotSVG(graph,model as PlotView);
 if('kind'in model&&model.kind==='register-block'||'kind'in model&&model.kind==='address-space')return registerMapSVG(graph,model.id);
 return figureFail('EXPORT_TYPE',id,'该对象没有工程图呈现');
}
export function engineeringHTML(id:string,current:string,full:string,details=''){return `<figure class="engineering-figure" data-engineering-figure="${esc(id)}"><div class="engineering-toolbar" role="toolbar" aria-label="工程图操作"><button type="button" data-figure-action="out" aria-label="缩小">−</button><button type="button" data-figure-action="in" aria-label="放大">＋</button><button type="button" data-figure-action="fit">适配</button><button type="button" data-figure-action="actual">100%</button><input data-figure-search placeholder="定位局部 ID" aria-label="定位局部 ID"/><button type="button" data-figure-action="find">定位</button><button type="button" data-figure-action="fold">折叠/展开所选</button><button type="button" data-figure-action="expand">展开全部</button><button type="button" data-figure-action="collapse">恢复视图</button><button type="button" data-figure-action="current">当前 SVG</button><button type="button" data-figure-action="full">完整 SVG</button><button type="button" data-figure-action="data">数据与来源</button><output data-figure-status aria-live="polite"></output></div><div class="engineering-viewport" tabindex="0">${current}</div><template data-figure-current>${current}</template><template data-figure-full>${full}</template><pre data-figure-detail hidden></pre>${details}</figure>`;}
