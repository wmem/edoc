#!/usr/bin/env node
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
import {realpathSync} from 'node:fs';
import {main} from './project.ts';
export {main};
if(process.argv[1]&&import.meta.url===pathToFileURL(realpathSync(resolve(process.argv[1]))).href)process.exitCode=await main(process.argv.slice(2));
