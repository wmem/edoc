export const specificationTags:Record<string,any>={
 specification:{attributes:{id:{type:String,required:true},title:{type:String,required:true}}},
 'spec-list':{selfClosing:true,attributes:{for:{type:String,required:true},common:{type:Array},specific:{type:Array}}},
};
