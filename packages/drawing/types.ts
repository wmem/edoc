// Drawing 1.0：与工程事实分离的原生绘图契约。
export type Point = {x: number; y: number};
export type Rect = Point & {width: number; height: number};
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Direction = 'LR' | 'RL' | 'TB' | 'BT';
export type Content = {id: string; kind: 'text'; text: string; role?: 'body' | 'note' | 'code'} | {id: string; kind: 'stack'; axis: 'x' | 'y'; children: Content[]};
export type DrawingPort = {id: string; label?: string; annotation?: string; appearance?: 'normal' | 'header' | 'slot'; originIds?: string[]};
export type Node = {id: string; label: string; parentId?: string; ports?: DrawingPort[]; portGroups?: {id: string; ports: string[]; header?: string}[]; content?: Content[]; originIds?: string[]};
export type End = {id: string; node: string; port?: string; marker?: 'none' | 'arrow' | 'circle'};
export type Connection = {id: string; ends: End[]; labels?: {id: string; text: string}[]; style?: string; originIds?: string[]};
export type Target = {node: string; port?: string; edge?: 'start' | 'center' | 'end'};
export type RouteRef = {end: string} | {junction: string};
export type Constraint =
  | {id: string; type: 'order'; axis: 'x' | 'y'; nodes: string[]; gap?: number}
  | {id: string; type: 'align'; axis: 'x' | 'y'; targets: Target[]}
  | {id: string; type: 'place'; node: string; x: number; y: number}
  | {id: string; type: 'size'; node: string; width?: number; height?: number}
  | {id: string; type: 'port'; node: string; port: string; side?: Side; order?: number; offset?: number}
  | {id: string; type: 'route'; connection: string; from: string; to: string; frame?: string; via: Point[]}
  | {id: string; type: 'fixedRoute'; connection: string; frame?: string; junctions?: (Point & {id: string})[]; paths: {id: string; from: RouteRef; to: RouteRef; via?: Point[]}[]}
  | {id: string; type: 'label'; connection: string; label: string; nearEnd: string; toEnd?: string; fraction?: number};
export type Spacing = {node?: number; layer?: number; edge?: number; port?: number; padding?: number};
export type Drawing = {
  schemaVersion: '1.0'; id: string; nodes: Node[]; connections: Connection[];
  layout?: {direction?: Direction; routing?: 'orthogonal' | 'polyline'; spacing?: Spacing; containers?: Record<string, {direction?: Direction; spacing?: Spacing}>; constraints?: Constraint[]; hints?: {main?: string[]; channels?: {connection: string; side: Side; container?: string}[]}};
};
export type TextBox = Rect & {id: string; lines: string[]; size: number};
export type PortGeometry = Point & {id: string; label: string; side: Side; text: TextBox; annotation?: TextBox; appearance?: DrawingPort['appearance']; originIds: string[]};
export type NodeGeometry = Rect & {id: string; parentId?: string; contentBox: Rect; title: TextBox; contents: TextBox[]; ports: PortGeometry[]; originIds: string[]};
export type ConnectionGeometry = {id: string; originIds: string[]; ends: (End & Point & {side: Side})[]; paths: {id: string; points: Point[]}[]; junctions: Point[]; labels: TextBox[]};
export type DrawingScene = {id: string; nodes: NodeGeometry[]; connections: ConnectionGeometry[]; width: number; height: number; viewBox: Rect; effectiveLayout: Drawing['layout']; satisfiedConstraints: string[]; diagnostics: {code: string; message: string; id?: string}[]; durationMs: number};
export class DrawingError extends Error {
  code: string; stage: string; ids: string[]; path: string;
  constructor(code: string, stage: string, ids: string[], message: string, path = '') { super(message); this.name = 'DrawingError'; this.code = code; this.stage = stage; this.ids = ids; this.path = path; }
}
