import type {Graph} from '@antv/x6';
import type {Scene,SceneNode} from '../render-graph/scene.ts';

export function nodeHeading(node:SceneNode){
 const markup:any[]=[],attrs:Record<string,any>={};
 for(const [i,line]of (node.titleLines??[node.label]).entries()){const selector=i?'title'+i:'title';markup.push({tagName:'text',selector});attrs[selector]={refX:0,refY:0,textAnchor:'start',x:16,y:27+i*22,text:line,fontSize:node.titleSize,fontWeight:700,fill:'#17324d',fontFamily:'Noto Sans SC'};}
 return {markup,attrs};
}
export function addPortLeads(graph:Graph,scene:Scene){
 for(const node of scene.nodes)for(const port of node.ports){const lead=port.lead;if(!lead)continue;
  const color=lead.aggregate?'#315f91':'#447599';
  graph.addEdge({zIndex:0,source:lead.points[0],target:lead.points[1],attrs:{line:{stroke:color,strokeWidth:lead.aggregate?4:1.6,sourceMarker:lead.startArrow?{name:'block',width:6,height:5}:null,targetMarker:lead.endArrow?{name:'block',width:6,height:5}:null,'data-port-lead':port.id,'data-interface-boundary':lead.aggregate?'true':'false'}},data:{entityId:port.id,ownerId:node.id,portLead:true}});
 }
}

// 初始显示保住12px主要文字；完整适配是用户可选择的另一种总览。
export function readableViewport(graph:Graph,scene:Scene,holder:HTMLElement,mode:'readable'|'fit'|'actual'='readable'){
 graph.zoomToFit({padding:26,maxScale:1});
 const fitted=graph.zoom(),mainSize=Math.min(...scene.nodes.flatMap(n=>[n.titleSize,...n.ports.filter(p=>!p.slot).map(()=>14)]),14),minimum=mode==='actual'?1:Math.min(1,12/mainSize);
 if(mode!=='fit'&&fitted<minimum){
  graph.zoomTo(minimum);const x=Math.min(...scene.nodes.map(n=>n.x-30)),y=Math.min(...scene.nodes.map(n=>n.y));
  graph.translate(26-x*minimum,26-y*minimum);
 }
 let note=holder.querySelector<HTMLElement>(':scope > .viewport-note');
 if(!note){note=document.createElement('p');note.className='viewport-note';note.setAttribute('role','status');holder.insertBefore(note,graph.container);}
 const clipped=mode==='readable'&&fitted<minimum;
 note.hidden=!clipped;note.textContent=clipped?'当前按可读比例显示局部图，拖动画布查看其余内容；点击“适配画布”查看完整总览。':'';holder.dataset.viewportMode=mode;
}
