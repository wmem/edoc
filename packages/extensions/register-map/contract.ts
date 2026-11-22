import type {Graph} from '../../core/types.ts';
import {registerMapDefinitions} from './model.ts';
import {DeferredAddressReference} from './resolver.ts';
export type RegisterMapPresentation = {mode?: 'all' | 'regions' | 'registers'; definitions?: Record<string, string>; register?: string};
export const registerMapTags: Record<string, any> = {
  'register-map': {render: 'div', selfClosing: true, attributes: {
    id: {type: String, required: true},
    mode: {type: String, matches: ['all', 'regions', 'registers'], default: 'all'},
    definitions: {type: Object},
    register: {type: String}
  }}
};
export const registerMapTargets = {'register-map': ['register-block', 'address-space']} as const;
export const registerMapResources = {registerBlocks: 'register-block', addressSpaces: 'address-space', memories: 'memory'} as const;
// 呈现链接显式指定章节，不根据某个寄存器图首次出现的位置猜归属。
export function registerMapPresentationErrors(graph: Graph, id: string, attributes: RegisterMapPresentation, deferAddressTargets = false): string[] {
  const entry = graph.index.get(id);
  if (!entry || !['register-block', 'address-space'].includes(entry.type)) return [];
  const errors: string[] = [];
  let used: Set<string> | undefined;
  if (attributes.register !== undefined || attributes.definitions !== undefined) {
    try { used = registerMapDefinitions(graph, id); }
    catch (error) { if (!(deferAddressTargets && error instanceof DeferredAddressReference)) throw error; }
  }
  if (attributes.register !== undefined && (typeof attributes.register !== 'string' || !attributes.register.trim() || attributes.mode !== 'registers' || used && !used.has(attributes.register))) {
    errors.push('register 仅用于 registers 模式，且必须是在该地址模型中使用的 Register：' + attributes.register);
  }
  if (attributes.definitions !== undefined) {
    if (!attributes.definitions || typeof attributes.definitions !== 'object' || Array.isArray(attributes.definitions)) return [...errors, 'definitions 必须是寄存器 ID 到本工程章节 ID 的对象'];
    for (const [register, target] of Object.entries(attributes.definitions)) {
      if (graph.index.get(register)?.type !== 'register' || used && !used.has(register)) errors.push('definitions 的键必须是在该地址模型中使用的 Register：' + register);
      if (typeof target !== 'string' || graph.index.get(target)?.type !== 'document') errors.push('definitions 的目标必须是本工程已参与发布的章节或文档 ID：' + String(target));
    }
    if (attributes.mode === 'regions' && Object.keys(attributes.definitions).length) errors.push('regions 模式不使用 definitions；定义链接用于寄存器列表');
  }
  return errors;
}
