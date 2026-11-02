import type {Navigation} from '../core/book.ts';
import {targetKey} from '../core/routes.ts';

/** 左侧只组织阅读页；移除页内小节时保留其中接入的子工程与其他文章。 */
export function sidebarNavigation(nodes:Navigation[],parents:ReadonlySet<string>=new Set()):Navigation[]{
 return nodes.flatMap(node=>{
  const key=node.page?targetKey(node.project,node.page):undefined;
  if(key&&parents.has(key))return sidebarNavigation(node.children,parents);
  const descendants=new Set(parents);if(key)descendants.add(key);
  const {anchor:ignored,...entry}=node;
  return [{...entry,children:sidebarNavigation(node.children,descendants)}];
 });
}
