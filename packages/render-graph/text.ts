import {fontMetrics as metrics} from './font-metrics.ts';
export {fontMetrics} from './font-metrics.ts';
export function measureText(text:string,size:number):number{
 let total=0;
 for(const char of text){const code=char.codePointAt(0)!;let low=0,high=metrics.ranges.length-1,width=1000;
  while(low<=high){const middle=(low+high)>>1,[start,end,value]=metrics.ranges[middle];if(code<start)high=middle-1;else if(code>end)low=middle+1;else{width=value;break;}}
  total+=width;
 }
 return total*size/1000;
}
export function wrapText(text:string,size:number,maxWidth:number):string[]{
 const lines:string[]=[];let current='';
 for(const char of text){
  if(char==='\n'){lines.push(current);current='';continue;}
  if(current&&measureText(current+char,size)>maxWidth&&!/^[，。！？、；：）》」』】”’!?.,;:)]$/.test(char)){
   const word=current.match(/([A-Za-z_$][A-Za-z0-9_$]*)$/)?.[1];
   if(/[A-Za-z0-9_$]/.test(char)&&word&&word.length<current.length&&measureText(word+char,size)<=maxWidth){
    let prefix=current.slice(0,-word.length),opening=/[（《「『【“‘(]$/.test(prefix)?prefix.at(-1)!:'';
    if(opening)prefix=prefix.slice(0,-1);if(prefix)lines.push(prefix);current=opening+word+char;continue;
   }
   const opening=/[（《「『【“‘(]$/.test(current)?current.at(-1)!:'';
   if(opening)current=current.slice(0,-1);
   if(current)lines.push(current);current=opening;
  }
  current+=char;
 }
 lines.push(current);return lines;
}
