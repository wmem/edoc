export { loadIR, loadConfig, SUPPORTED_IR_VERSION } from './load.ts';
export { query, summary } from './query.ts';
export {readDocument} from './read.ts';
export type {ReadOptions} from './read.ts';
export { validateSchema, checkSchemaDefinition } from './schema.ts';
export { EdocError } from './errors.ts';
export { outline } from './outline.ts';
export {resolveProjectConfig,loadProject} from './project.ts';
export {scanDocuments} from './documents.ts';
export type {ProjectConfig,ResolvedConfig,LoadedProject,Dataset,DataContext} from './project.ts';
export type {OutlineEntry} from './outline.ts';
export type * from './types.ts';

export {loadBook,projectOutline,bookNavigation} from './book.ts';
export type {Book,ProjectNode,OutlineOptions} from './book.ts';
export type {AttachmentInput,PdfTargetInput} from './attachments.ts';

export type {MarkdocOptions} from './markdoc.ts';
export {default as Markdoc} from '@markdoc/markdoc';

export {preflightBook} from './document-preflight.ts';

export {resolveLinkTarget,entitySource} from './link-target.ts';
export {registerProjection,resetText} from '../extensions/register/model.ts';
