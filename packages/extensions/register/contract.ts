export const registerTags:Record<string,any>={
 'register-diagram':{selfClosing:true,attributes:{id:{type:String,required:true},presentation:{type:String}}},
 'register-field-table':{selfClosing:true,attributes:{id:{type:String,required:true},presentation:{type:String}}},
};
export const registerTargets={'register-diagram':['register'],'register-field-table':['register']} as const;
export const registerResources={registers:'register'} as const;
