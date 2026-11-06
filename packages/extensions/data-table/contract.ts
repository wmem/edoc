export const dataTableTags:Record<string,any>={
 'data-table':{render:'div',selfClosing:true,attributes:{id:{type:String,required:true},sortable:{type:Boolean,default:true},filterable:{type:Boolean,default:true}}},
};
export const dataTableTargets={'data-table':['table']} as const;
export const dataTableResources={tables:'table'} as const;
