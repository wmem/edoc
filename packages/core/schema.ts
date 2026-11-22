import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import AjvModule from 'ajv/dist/2020.js';
import type { Diagnostic } from './types.ts';
import { failure } from './errors.ts';
const directory=resolve(dirname(fileURLToPath(import.meta.url)),'../schema');
const names=['resource-target','common','manifest','object','relation','view','table','waveform','reference','clause','register','config','state-machine','flowchart','sequence','sequence-view','binary-layout','binary-view','plot','register-block','address-space','memory'] as const;
export type SchemaName=typeof names[number];
const Ajv=AjvModule as unknown as typeof import('ajv/dist/2020.js').Ajv2020;
const ajv=new Ajv({allErrors:true,strict:true});

const schemas=new Map<string,any>();
const domains:Partial<Record<SchemaName,string>>={object:'relation-diagram',relation:'relation-diagram',view:'relation-diagram',table:'data-table',waveform:'waveform',clause:'clause',register:'register','state-machine':'control-diagram',flowchart:'control-diagram',sequence:'sequence','sequence-view':'sequence','binary-layout':'binary-layout','binary-view':'binary-layout',plot:'plot','register-block':'register-map','address-space':'register-map',memory:'register-map'};
const drawingSchema=JSON.parse(readFileSync(resolve(directory,'../drawing/drawing.schema.json'),'utf8'));ajv.addSchema(drawingSchema);
for(const name of names){const domain=domains[name],file=domain?resolve(directory,'../extensions',domain,`${name}.schema.json`):resolve(directory,`${name}.schema.json`);const s=JSON.parse(readFileSync(file,'utf8'));schemas.set(name,s);ajv.addSchema(s);}
export function checkSchemaDefinition(schema:any,file='<schema>'):void {
 try{new Ajv({strict:true}).compile(schema);}catch(e){failure('SCHEMA_KEYWORD',file,'',String(e));}
}
export function validateSchema(name:SchemaName,data:unknown,file='<memory>'):Diagnostic[]{
 const validate=ajv.getSchema(schemas.get(name).$id)!;
 if(validate(data))return [];
 return (validate.errors??[]).map(error=>{
  let value:any=data,id:string|undefined;
  const path=error.instancePath+(error.keyword==='required'?'/'+error.params.missingProperty:error.keyword==='additionalProperties'?'/'+error.params.additionalProperty:'');
  if(typeof value?.id==='string')id=value.id;
  for(const key of error.instancePath.split('/').slice(1)){value=value?.[key.replace(/~1/g,'/').replace(/~0/g,'~')];if(typeof value?.id==='string')id=value.id;}
  return {code:'SCHEMA',file,path,message:error.message??error.keyword,...(id?{id}:{})};
 });
}
