export const documentTags:Record<string,any>={
 section:{render:'section',attributes:{id:{type:String,required:true},title:{type:String},collapsed:{type:Boolean}}},
 columns:{render:'div',attributes:{ratio:{type:String,matches:['1:1','2:1','1:2','1:1:1'],default:'1:1'}}},
 panel:{render:'div',attributes:{title:{type:String}}},tabs:{render:'div'},tab:{render:'div',attributes:{name:{type:String,required:true}}},
 reference:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String}}},
 page:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String},anchor:{type:String}}},
 attachment:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},target:{type:String},project:{type:String},label:{type:String}}},
 include:{selfClosing:true,attributes:{file:{type:String},project:{type:String}}},
 code:{selfClosing:true,attributes:{file:{type:String,required:true},language:{type:String}}},
};
