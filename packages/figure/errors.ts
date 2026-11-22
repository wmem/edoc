export class FigureError extends Error{
 code:string;id:string;path:string;
 details?:unknown;
 constructor(code:string,id:string,message:string,path='',details?:unknown){super(message);this.name='FigureError';this.code=code;this.id=id;this.path=path;this.details=details;}
}
export function figureFail(code:string,id:string,message:string,path=''):never{throw new FigureError(code,id,message,path);}
