import {failure} from './errors.ts';

export function validateReadRange(offset:number,maxChars:number){
 if(!Number.isSafeInteger(offset)||offset<0)failure('READ_OFFSET','<read>','/offset','offset 必须是非负安全整数');
 if(!Number.isInteger(maxChars)||maxChars<1||maxChars>100000)failure('READ_LIMIT','<read>','/maxChars','maxChars 必须为 1–100000 的整数');
}
// 项目正文和预构建手册采用同一 Unicode 分页规则。
export function readRange(content:string,offset=0,maxChars=12000){
 validateReadRange(offset,maxChars);
 const characters=Array.from(content),end=Math.min(characters.length,offset+maxChars);
 if(offset>characters.length)failure('READ_OFFSET','<read>','/offset','offset 超过正文字符数');
 return {content:characters.slice(offset,end).join(''),range:{offset,returnedChars:end-offset,totalChars:characters.length,truncated:end<characters.length,nextOffset:end<characters.length?end:null}};
}
