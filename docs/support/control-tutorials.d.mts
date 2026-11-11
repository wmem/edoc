import type {Table, StateMachine, Waveform, LinkTarget} from '../../packages/core/types.ts';
type TutorialTable<Values> = Omit<Table, 'rows'> & {rows: {id: string; values: Values; links: Record<string, LinkTarget>}[]};
export type StateTraceValues = {cycle: number; din: number; before: string; transition: string; after: string; matched: number};
export type HandshakeValues = {cycle: number; valid: number; ready: number; data: string; accepted: string; reading: string};
export function stateTraceTable(model: StateMachine, input?: string): TutorialTable<StateTraceValues>;
export function handshakeBeatTable(waveform: Waveform): TutorialTable<HandshakeValues>;
export function controlTutorialData(context: {root: string}): {tables: Table[]};
