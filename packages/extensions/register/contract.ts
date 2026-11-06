export const registerTags:Record<string,any>={
 'register-diagram':{selfClosing:true,attributes:{id:{type:String,required:true}}},
 'register-field-table':{selfClosing:true,attributes:{id:{type:String,required:true}}},
};
export const registerTargets={'register-diagram':['register'],'register-field-table':['register']} as const;
export const registerResources={registers:'register'} as const;
