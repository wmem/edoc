import type {Source} from '../../core/common-types.ts';

export type ResourceReference = {project?: string; id: string};
export type AccessPolicy = {
  allowedTransferBits?: number[];
  alignment?: string;
  byteOrder?: 'little' | 'big';
  splitOrder?: 'low-first' | 'high-first';
  readConsistency?: 'whole-register' | 'per-transfer' | 'not-guaranteed';
  writeAtomicity?: 'whole-register' | 'per-transfer' | 'not-guaranteed';
};
export type EffectiveAccessPolicy = Omit<AccessPolicy, 'alignment'> & {
  alignment?: {value: string; addressUnitBits: number; bitAlignment: string; declaredBy: string};
};
type Repetition = {count?: number; stride?: string};
export type AddressEntry = Repetition & {id: string; label?: string; register?: string; block?: string; offset: string; span?: string; source?: Source};
export type RegisterBlock = {id: string; kind: 'register-block'; label: string; addressUnitBits?: number; size?: string; description?: string; entries: AddressEntry[]; accessPolicy?: AccessPolicy; source?: Source};
type RegionBase = Repetition & {id: string; label: string; base: string; size: string; alignment?: string; description?: string; source?: Source};
export type AddressRegion = RegionBase & (
  {kind: 'reserved'} |
  {kind: 'resource'; target: ResourceReference; resourceOffset?: string; mappedSize?: string} |
  {kind: 'window'; target: ResourceReference; targetBase: string; targetStride?: string; mappedSize?: string}
);
export type AddressSpace = {id: string; kind: 'address-space'; label: string; addressUnitBits: number; addressWidth: number; base: string; size: string; regions: AddressRegion[]; description?: string; source?: Source};
export type Memory = {id: string; kind: 'memory'; label: string; capacityBytes: string; memoryType: 'ram' | 'rom' | 'flash' | 'other'; readOnly?: boolean; description?: string; source?: Source};
export type RegionStep = {kind: 'region'; regionId: string; index?: number};
export type EntryStep = {kind: 'entry'; entryId: string; index?: number};
export type AddressStep = RegionStep | EntryStep;
export type AddressCoordinate = {bitPosition: string; unitIndex: string; subUnitBitOffset: string; addressUnitBits: number; address?: string};
export type AddressValidation = {status: 'complete' | 'deferred' | 'invalid'; deferred: {projectId: string; addressSpaceId: string; regionId: string; target: ResourceReference}[]};
