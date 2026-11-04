import type {Graph,RecordEntry,Group} from '../../core/types.ts';
// 标签描述展示职责；Node、Port、Interface 等事实类型不是正文标签。
export const relationDiagramTags:Record<string,any>={
 'relation-diagram':{render:'div',selfClosing:true,attributes:{id:{type:String,required:true}}},
 'interface-table':{render:'div',selfClosing:true,attributes:{id:{type:String,required:true},mode:{type:String,matches:['overview','detailed'],default:'detailed'}}},
};
export const relationDiagramTargets={
 'relation-diagram':['view'],
 'interface-table':['node','group','interface'],
} as const;
export const relationDiagramResources={objects:'object',relations:'relation',views:'view'} as const;
export function interfaceTableTargetError(graph:Graph,entry:RecordEntry):string|undefined{
 if(entry.type==='group'&&(entry.entity as Group).members.some(id=>graph.index.get(id)?.type!=='port'))return 'interface-table 的 Group 必须直接包含端口，不能引用模块或嵌套分组：'+entry.id;
}
