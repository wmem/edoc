export const documentTags:Record<string,any>={
 'resource-directory':{selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},mount:{type:String,required:true}}},
 'resource-content':{selfClosing:true,attributes:{target:{type:Object,required:true},section:{type:String,required:true}}},
 'resource-link':{selfClosing:true,attributes:{target:{type:Object,required:true},mount:{type:String},anchor:{type:String},label:{type:String}}},
 'directory-order':{selfClosing:true,attributes:{items:{type:Array,required:true}}},
 section:{render:'section',attributes:{id:{type:String,required:true},title:{type:String},collapsed:{type:Boolean}}},
 columns:{render:'div',attributes:{ratio:{type:String,matches:['1:1','2:1','1:2','1:1:1'],default:'1:1'}}},
 panel:{render:'div',attributes:{title:{type:String}}},tabs:{render:'div'},tab:{render:'div',attributes:{name:{type:String,required:true}}},
 reference:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String}}},
 page:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},project:{type:String},label:{type:String},anchor:{type:String}}},
 attachment:{render:'a',selfClosing:true,attributes:{id:{type:String,required:true},target:{type:String},project:{type:String},label:{type:String}}},
 include:{selfClosing:true,attributes:{file:{type:String},project:{type:String}}},
 code:{selfClosing:true,attributes:{file:{type:String,required:true},language:{type:String}}},
};
