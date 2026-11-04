import {relationLinks} from '../extensions/relation-diagram/query.ts';
import {tableLinks} from '../extensions/data-table/query.ts';

// 浏览器与 CLI 共用纯数据查询；不能导入依赖文件系统的 Schema 和构建校验。
export const dataLinkResolvers=[relationLinks,tableLinks];
