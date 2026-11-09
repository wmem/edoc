export type SemanticKind='capability'|'behavior'|'clause';

// 语义正文复用章节与条款渲染；身份和归属来自原文，不另建清单。
export const semanticContentTags:Record<string,any>={
 capability:{attributes:{id:{type:String,required:true},title:{type:String,required:true},collapsed:{type:Boolean}}},
 behavior:{attributes:{id:{type:String,required:true},title:{type:String,required:true},collapsed:{type:Boolean}}},
 clause:{attributes:{id:{type:String,required:true},title:{type:String,required:true}}},
 'clause-list':{selfClosing:true,attributes:{ids:{type:Array},for:{type:String},collapsed:{type:Boolean}}},
};
