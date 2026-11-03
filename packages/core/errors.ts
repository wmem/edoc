import type { Diagnostic } from './types.ts';

export class EdocError extends Error {
  diagnostics: Diagnostic[];
  constructor(diagnostics: Diagnostic[]) {
    super(diagnostics.map(d => `${d.code} ${d.file}${d.path}: ${d.message}`).join('\n'));
    this.name = 'EdocError';
    this.diagnostics = diagnostics;
  }
}

export function failure(code: string, file: string, path: string, message: string): never {
  throw new EdocError([{ code, file, path, message }]);
}
