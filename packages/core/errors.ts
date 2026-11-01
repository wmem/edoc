import type { Diagnostic } from './types.ts';

export class EngDocError extends Error {
  diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map(d => `${d.code} ${d.file}${d.path}: ${d.message}`).join('\n'));
    this.name = 'EngDocError';
    this.diagnostics = diagnostics;
  }
}

export function failure(code: string, file: string, path: string, message: string): never {
  throw new EngDocError([{ code, file, path, message }]);
}
