import type {Graph} from './types.ts';
import {EdocError} from './errors.ts';
import {projectPath} from './paths.ts';
import {validationContext} from './validation-context.ts';
import {dataValidators} from './extension-contracts.ts';
export function validateResources(graph:Graph){
 const {errors,report,reference}=validationContext(graph),checkedSources=new Set<string>();
 for(const entry of graph.index.values()){
    if (entry.entity.source && !checkedSources.has(entry.entity.source.file)) {
      try { projectPath(graph.projectRoot, graph.projectRoot, entry.entity.source.file, false); checkedSources.add(entry.entity.source.file); }
      catch (error) {
        if (error instanceof EdocError) for (const d of error.diagnostics) report(entry, d.code, '/source/file', d.message);
        else throw error;
      }
    }
    const attachment=entry.entity.source?.attachment;if(attachment&&(!attachment.project||attachment.project===graph.manifest.projectId)){const resource=graph.attachments?.[attachment.id];if(!resource||attachment.target&&!Object.hasOwn(resource.targets,attachment.target))report(entry,'ATTACHMENT_REFERENCE','/source/attachment','原始 PDF 附件或位置不存在：'+attachment.id);}
    if(entry.type==='reference') { const e=entry.entity as any; const types=[...new Set([...graph.index.values()].map(e=>e.type))];reference(entry,e.fromId,'/fromId',types);reference(entry,e.targetId,'/targetId',types);}
 }
 for(const validate of dataValidators)errors.push(...validate(graph));
 if(errors.length)throw new EdocError(errors);
}
