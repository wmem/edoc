export const controlTags:Record<string,any> = Object.fromEntries(['state-diagram','flowchart'].map(name=>[name,{render:'div',selfClosing:true,attributes:{id:{type:String,required:true},view:{type:String}}}]));
export const controlTargets = {'state-diagram':['state-machine'],flowchart:['flowchart']} as const;
export const controlResources = {stateMachines:'state-machine',flowcharts:'flowchart'} as const;
