import {figureFail} from '../../figure/errors.ts';
import type {AddressCoordinate} from './types.ts';
export const hex = (value: bigint) => (value < 0n ? value.toString() : '0x' + value.toString(16)).toUpperCase().replace('0X', '0x');
export function addressInteger(value: string, id: string): bigint {
  if (typeof value !== 'string' || !/^(0[xX][0-9a-fA-F]+|[0-9]+)$/.test(value)) return figureFail('ADDRESS_INTEGER', id, '地址量必须是十进制或十六进制非负整数字符串');
  return BigInt(value);
}
export function positive(value: string, id: string): bigint {
  const n = addressInteger(value, id);
  if (!n) figureFail('ADDRESS_SIZE', id, 'size/stride/alignment 必须大于零');
  return n;
}
export function exactUnits(bits: bigint, unitBits: number, id: string): bigint {
  const unit = BigInt(unitBits);
  if (bits % unit) figureFail('ADDRESS_UNIT', id, `位区间 ${bits} 无法精确换算为 ${unitBits} bit 地址单位`);
  return bits / unit;
}
export function coordinate(bits: bigint, unitBits: number): AddressCoordinate {
  if (bits < 0n) figureFail('ADDRESS_RANGE', '<coordinate>', '地址坐标不能为负');
  const unit = BigInt(unitBits), remainder = bits % unit;
  return {bitPosition: hex(bits), unitIndex: hex(bits / unit), subUnitBitOffset: remainder.toString(), addressUnitBits: unitBits, ...(remainder === 0n ? {address: hex(bits / unit)} : {})};
}
export function repetitionSpan(entry: {id: string; count?: number; stride?: string}, span: bigint) {
  const n = entry.count ?? 1;
  if (!Number.isSafeInteger(n) || n < 1) figureFail('ADDRESS_COUNT', entry.id, 'count 必须是安全正整数');
  if (n > 1 && entry.stride === undefined) figureFail('ADDRESS_STRIDE', entry.id, '数组必须显式声明 stride');
  const stride = entry.stride === undefined ? span : positive(entry.stride, entry.id);
  if (n > 1 && stride < span) figureFail('ADDRESS_OVERLAP', entry.id, 'stride 小于每个实例的分配范围');
  return {count: BigInt(n), stride, total: BigInt(n - 1) * stride + span};
}
export function instanceIndex(step: {index?: number}, entry: {id: string; count?: number}): bigint {
  const n = entry.count ?? 1;
  if (n === 1 && step.index === undefined) return 0n;
  if (!Number.isSafeInteger(step.index) || step.index! < 0 || step.index! >= n) figureFail('ADDRESS_INDEX', entry.id, '实例需要范围内的显式安全整数索引');
  return BigInt(step.index!);
}
