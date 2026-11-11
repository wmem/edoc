import { binaryLayoutResources, binaryLayoutTags, binaryLayoutTargets } from '../extensions/binary-layout/contract.ts';
import { plotResources, plotTags, plotTargets } from '../extensions/plot/contract.ts';
import { registerMapResources, registerMapTags, registerMapTargets } from '../extensions/register-map/contract.ts';
import { sequenceResources, sequenceTags, sequenceTargets } from '../extensions/sequence/contract.ts';

// 共用入口只组合领域声明，不维护各模型的契约。
export const engineeringTags = {
  ...sequenceTags,
  ...binaryLayoutTags,
  ...plotTags,
  ...registerMapTags
};
export const engineeringTargets = {
  ...sequenceTargets,
  ...binaryLayoutTargets,
  ...plotTargets,
  ...registerMapTargets
};
export const engineeringResources = {
  ...sequenceResources,
  ...binaryLayoutResources,
  ...plotResources,
  ...registerMapResources
};
