import {readFileSync} from 'node:fs';
import {extname} from 'node:path';
import {DOMParser} from '@xmldom/xmldom';
import * as css from 'css-tree';
import {projectPath,requireFile} from './paths.ts';
import {failure} from './errors.ts';

export type ImageAsset={mime:string;data:string};
const svgNamespace='http://www.w3.org/2000/svg',htmlNamespace='http://www.w3.org/1999/xhtml';
const svgElements=new Set(('svg g defs desc title metadata symbol use view switch a path rect circle ellipse line polyline polygon text tspan textPath image foreignObject linearGradient radialGradient stop pattern clipPath mask marker filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence style').split(' '));
const htmlElements=new Set('div span p br strong em b i u s sub sup small code pre table tbody thead tr th td ul ol li dl dt dd h1 h2 h3 h4 h5 h6 img'.split(' '));

// 保留原SVG字节；检查后始终作为独立img文档使用，不将其DOM合入阅读器。
export function validateSVG(source:string,file:string):void{
 const reject=(code:string,message:string):never=>failure(code,file,'',message);
 let doc:ReturnType<DOMParser['parseFromString']>;
 try{doc=new DOMParser({onError:(_level,message)=>{throw new Error(message);}}).parseFromString(source,'image/svg+xml');}
 catch(error){reject('DOCUMENT_SVG_XML','SVG XML 无法解析：'+String(error));}
 if(doc!.documentElement?.localName!=='svg'||doc!.documentElement?.namespaceURI!==svgNamespace)reject('DOCUMENT_SVG_XML','SVG 根必须是 SVG 命名空间中的 svg 元素');
 // 标准绘图器的外部DOCTYPE仅作为声明保留，解析器不加载DTD；不接受实体声明。
 if(doc!.doctype&&(doc!.doctype.name!=='svg'||doc!.doctype.internalSubset))reject('DOCUMENT_SVG_XML','SVG 不支持内部 DTD 或自定义实体');
 const resource=(value:string)=>{
  value=value.trim();
  if(value.startsWith('#'))return;
  if(/^data:(?:image\/(?:png|jpeg|webp)|font\/(?:woff2?|ttf|otf)|application\/(?:font-woff|x-font-ttf|x-font-opentype));base64,[a-z\d+/=\s]+$/i.test(value))return;
  reject('DOCUMENT_SVG_RESOURCE','SVG 资源只允许内部 #ID 或内嵌的 PNG/JPEG/WebP/字体 data URL：'+value.slice(0,160));
 };
 const checkCSS=(value:string,context:'stylesheet'|'declarationList'|'value')=>{
  try{
   const tree=css.parse(value,{context,parseCustomProperty:true,onParseError:error=>{throw error;}});
   css.walk(tree,node=>{
    if(node.type==='Raw')reject('DOCUMENT_SVG_STYLE','SVG 样式包含无法静态检查的 CSS');
    if(node.type==='Url')resource(node.value);
    if(node.type==='Atrule'&&!['font-face','media','supports','layer'].includes(css.ident.decode(node.name).toLowerCase()))reject('DOCUMENT_SVG_STYLE','SVG 不支持此 CSS 规则：@'+node.name);
    if(node.type==='Function'&&['url','expression','image','image-set','-webkit-image-set','src','paint','element','-moz-element'].includes(css.ident.decode(node.name).toLowerCase()))reject('DOCUMENT_SVG_STYLE','SVG 不支持此 CSS 函数：'+node.name);
    if(node.type==='Declaration'&&['behavior','-moz-binding'].includes(css.ident.decode(node.property).toLowerCase()))reject('DOCUMENT_SVG_STYLE','SVG 不支持主动 CSS 属性：'+node.property);
   });
  }catch(error){if(error instanceof Error&&error.name==='EdocError')throw error;reject('DOCUMENT_SVG_STYLE','SVG CSS 无法解析：'+String(error));}
 };
 const visit=(node:any)=>{
  if(node.nodeType===7&&node.target!=='xml')reject('DOCUMENT_SVG_ACTIVE','SVG 不支持处理指令：'+node.target);
  if(node.nodeType===1){
   const name=node.localName,namespace=node.namespaceURI;
   if(!(namespace===svgNamespace&&svgElements.has(name)||namespace===htmlNamespace&&htmlElements.has(name)))reject('DOCUMENT_SVG_ACTIVE','SVG 不支持的元素：'+node.nodeName);
   for(const attr of Array.from(node.attributes) as any[]){
    const key=attr.localName.toLowerCase(),value=attr.value;
    if(/^on/i.test(key)||['srcdoc','base'].includes(key))reject('DOCUMENT_SVG_ACTIVE','SVG 不支持主动属性：'+attr.name);
    if(['href','src','poster','background'].includes(key))resource(value);
    if(['srcset','ping'].includes(key))reject('DOCUMENT_SVG_RESOURCE','SVG 不支持多资源属性：'+attr.name);
    if(key==='style')checkCSS(value,'declarationList');
    else if(['fill','stroke','filter','clip-path','mask','cursor','marker','marker-start','marker-mid','marker-end'].includes(key))checkCSS(value,'value');
   }
   if(namespace===svgNamespace&&name==='style')checkCSS(node.textContent??'','stylesheet');
  }
  for(let child=node.firstChild;child;child=child.nextSibling)visit(child);
 };
 visit(doc!);
}

export function loadImageAsset(root:string,src:string):ImageAsset{
 const file=projectPath(root,root,src);requireFile(file);
 const mime:Record<string,string>={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
 const type=mime[extname(file).toLowerCase()];
 if(!type)failure('DOCUMENT_IMAGE_FORMAT',src,'','文档图片只支持 PNG/JPEG/WebP/SVG');
 const bytes=readFileSync(file);
 if(type==='image/svg+xml'){
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{failure('DOCUMENT_SVG_XML',src,'','SVG 必须是 UTF-8 文本');}
  validateSVG(text!,src);
 }
 return {mime:type,data:bytes.toString('base64')};
}
