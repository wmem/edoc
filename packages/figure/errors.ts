export class FigureError extends Error{
 code:string;id:string;path:string;
 constructor(code:string,id:string,message:string,path=''){super(message);this.name='FigureError';this.code=code;this.id=id;this.path=path;}
}
export function figureFail(code:string,id:string,message:string,path=''):never{throw new FigureError(code,id,message,path);}
