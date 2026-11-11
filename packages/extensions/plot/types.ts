import type {Source} from '../../core/common-types.ts';
export type PlotMark='line'|'point'|'bar'|'area'|'rule'|'errorbar'|'boxplot';
export type PlotEncoding={field?:string;type?:'quantitative'|'nominal'|'ordinal'|'temporal';aggregate?:'count'|'sum'|'mean'|'median'|'min'|'max';bin?:boolean|{step:number};sort?:'ascending'|'descending'|null;title?:string};
export type PlotTransform=
 {filter:{field:string;equal?:string|number|boolean;range?:[number,number];oneOf?:(string|number|boolean)[]}}|
 {aggregate:{op:'count'|'sum'|'mean'|'median'|'min'|'max';field?:string;as:string}[];groupby?:string[]}|
 {bin:{step:number};field:string;as:[string,string]}|
 {quantile:string;probs:number[];as:[string,string];groupby?:string[];method:'linear'};
export type PlotSpec={mark?:PlotMark;encoding?:Partial<Record<'x'|'y'|'x2'|'y2'|'color'|'detail'|'tooltip'|'order',PlotEncoding>>;transform?:PlotTransform[];layer?:PlotSpec[];facet?:{field:string;columns?:number};spec?:PlotSpec};
export type PlotView=PlotSpec&{id:string;kind:'plot';label?:string;data:string;source?:Source;width?:number;height?:number};
