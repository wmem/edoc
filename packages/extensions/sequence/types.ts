import type {Source} from '../../core/common-types.ts';
export type SequenceElement={id:string;label?:string;source?:Source};
export type Participant=SequenceElement&{ref?:string};
export type Occurrence={message:string;end:'send'|'receive'};
export type Message=SequenceElement&{kind?:'message';from:string;to:string;mode?:'call'|'signal'|'return';replyTo?:string;protocol?:string};
export type SequenceBranch=SequenceElement&{guard?:string;otherwise?:boolean;steps:SequenceStep[]};
export type SequenceStep=Message|SequenceElement&(
 {kind:'alt'|'par';branches:SequenceBranch[]}|
 {kind:'opt'|'loop'|'strict';steps:SequenceStep[];guard?:string;min?:number;max?:number}|
 {kind:'ref';model:string;participants:Record<string,string>}|
 {kind:'note';on:string[];text:string}|
 {kind:'activate'|'deactivate'|'create'|'destroy';participant:string}
);
export type SequenceConstraint=SequenceElement&({kind:'order';before:Occurrence;after:Occurrence}|{kind:'duration';from:Occurrence;to:Occurrence;min?:number;max?:number;unit:'ns'|'us'|'ms'|'s'|'cycles';clock?:string});
export type Sequence=SequenceElement&{kind:'sequence';participants:Participant[];steps:SequenceStep[];constraints?:SequenceConstraint[]};
export type SequenceView=SequenceElement&{kind:'sequence';model:string;participantOrder?:string[];collapsed?:string[];expandedCalls?:string[];spacing?:number;showLabels?:boolean};
export function sequenceElements(model:Sequence){
 const result:{element:SequenceElement;path:string}[]=model.participants.map((element,i)=>({element,path:'/participants/'+i}));
 const visit=(steps:SequenceStep[],path:string)=>steps.forEach((element,i)=>{const at=path+'/'+i;result.push({element,path:at});if('steps'in element)visit(element.steps,at+'/steps');if('branches'in element)element.branches.forEach((b,j)=>{result.push({element:b,path:at+'/branches/'+j});visit(b.steps,at+'/branches/'+j+'/steps');});});
 visit(model.steps,'/steps');model.constraints?.forEach((element,i)=>result.push({element,path:'/constraints/'+i}));return result;
}
