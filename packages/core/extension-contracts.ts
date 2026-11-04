import {documentTags} from '../extensions/document/contract.ts';
import {relationDiagramTags,relationDiagramTargets,relationDiagramResources,interfaceTableTargetError} from '../extensions/relation-diagram/contract.ts';
import {dataTableTags,dataTableTargets,dataTableResources} from '../extensions/data-table/contract.ts';
import {waveformTags,waveformTargets,waveformResources} from '../extensions/waveform/contract.ts';
import type {Graph,RecordEntry,ResourceType} from './types.ts';
import type {SchemaName} from './schema.ts';
import {validateRelationData} from '../extensions/relation-diagram/validate.ts';
import {validateTableData} from '../extensions/data-table/validate.ts';
import {validateWaveformData} from '../extensions/waveform/validate.ts';

// 内置能力按领域声明；这里只组合已定义的契约，不开放任意 IR 插件注册。
export const builtinTags={...documentTags,...relationDiagramTags,...dataTableTags,...waveformTags};
export const referenceTargets:Record<string,readonly RecordEntry['type'][]>={
 ...relationDiagramTargets,...dataTableTargets,...waveformTargets,
};
export const targetChecks:Record<string,((graph:Graph,entry:RecordEntry)=>string|undefined)|undefined>={
 'interface-table':interfaceTableTargetError,
};
export const resourceSchemas:Record<ResourceType,SchemaName>={
 ...relationDiagramResources,...dataTableResources,...waveformResources,references:'reference',
};
export const resourceTypes=Object.keys(resourceSchemas) as ResourceType[];
export const dataValidators=[validateRelationData,validateTableData,validateWaveformData];
export {dataLinkResolvers} from './extension-links.ts';
