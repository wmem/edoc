export type Source = { file: string; selector?: string; line?: number;attachment?:{id:string;target?:string;project?:string} };
export type Attributes = Record<string, unknown>;
