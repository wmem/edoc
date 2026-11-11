import {readFileSync} from 'node:fs';
import {Ajv2020} from 'ajv/dist/2020.js';
import {DrawingError} from './types.ts';
import {validateDrawingModel} from './validate-model.ts';
import type {Drawing} from './types.ts';

const schema = JSON.parse(readFileSync(new URL('./drawing.schema.json', import.meta.url), 'utf8'));
const shape = new Ajv2020({strict: true, allErrors: true}).compile(schema);
export function validateDrawing(input: unknown): asserts input is Drawing {
  if (!shape(input)) {
    const error=shape.errors?.[0],path=(error?.instancePath??'')+(error?.keyword==='required'?'/'+error.params.missingProperty:error?.keyword==='additionalProperties'?'/'+error.params.additionalProperty:'');
    throw new DrawingError('DRAWING_SCHEMA','validate',[],shape.errors?.map(e=>`${e.instancePath}: ${e.message}`).join('; ')??'结构错误',path);
  }
  validateDrawingModel(input as Drawing);
}
