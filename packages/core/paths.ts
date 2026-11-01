import { existsSync, lstatSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { failure } from './errors.ts';

function within(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!isAbsolute(rel) && rel !== '..' && !rel.startsWith(`..${sep}`));
}

function hasPathEntry(path: string): boolean {
  try { lstatSync(path); return true; }
  catch (error: any) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false;
    throw error;
  }
}

// 工程内路径统一使用相对路径；检查实际路径，阻止符号链接逃逸。
export function projectPath(root: string, base: string, value: string, mustExist = true): string {
  if (!value || isAbsolute(value) || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value) || /[\\\x00]/.test(value))
    failure('PATH_SCOPE', value, '', '必须使用工程范围内的相对路径');
  const realRoot = realpathSync(root);
  const target = resolve(base, value);
  if (!within(realRoot, target)) failure('PATH_SCOPE', value, '', '路径超出工程范围');
  let existing = target;
  while (!hasPathEntry(existing) && dirname(existing) !== existing) existing = dirname(existing);
  let actual: string;
  try { actual = realpathSync(existing); }
  catch { failure('PATH_SCOPE', value, '', '路径包含无法解析的符号链接或无效祖先路径'); }
  if (!within(realRoot, actual)) failure('PATH_SCOPE', value, '', '符号链接指向工程范围外');
  if (mustExist && !existsSync(target)) failure('FILE_MISSING', value, '', '文件或目录不存在');
  return target;
}

export function requireFile(file: string): void {
  if (!statSync(file).isFile()) failure('FILE_TYPE', file, '', '需要普通文件');
}
