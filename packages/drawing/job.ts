import type {Graph} from '../core/types.ts';
import type {Drawing,DrawingScene} from './types.ts';
import type {Scene} from '../render-graph/scene.ts';

// 只传布局消费的工程事实，不传正文 AST、函数、附件及工程解析上下文。
export type EngineeringGraph=Pick<Graph,'index'|'connections'>;
export type LayoutJob={kind:'drawing';input:Drawing}|{kind:'engineering';id:string;graph:EngineeringGraph};
export type LayoutResult=DrawingScene|Scene;
