import {routeCandidates} from './route-candidates.ts';
import {prepareAlignment,hasPositionIntent} from './alignment.ts';
import {prepareLanes} from './lanes.ts';
import {shapeAnchor,shapeSegmentCrosses} from './shapes.ts';
import {layoutDrawing} from './layout.ts';
import {validateDrawingModel} from './validate-model.ts';
import {DrawingError} from './types.ts';
import type {Drawing, DrawingScene, Connection, ConnectionGeometry, NodeGeometry, Point, Rect, Side, TextBox, Constraint} from './types.ts';
import {orthogonal, simplify, crosses, intersects, placeLabel, same, distance} from '../render-graph/geometry.ts';
import {checkPaths} from './check-paths.ts';
import {extendConnectionTree} from './connection-tree.ts';
import {measureText, wrapText} from '../render-graph/text.ts';
import {styles} from '../render-graph/styles.ts';
import {verifyDrawingScene, trace} from './verify.ts';
import {solveCompound} from './compound.ts';
import {solveCurvedDrawing} from './curved-solver.ts';

const sign: Record<Side, Point> = {left: {x: -1, y: 0}, right: {x: 1, y: 0}, top: {x: 0, y: -1}, bottom: {x: 0, y: 1}};
async function solveAttempt(input: Drawing,autoEndpoints=false): Promise<DrawingScene> {
  const start = performance.now(); validateDrawingModel(input); const drawing: Drawing = structuredClone(input);
  const fail = (code: string, stage: string, ids: string[], message: string): never => { throw new DrawingError(code, stage, ids, message); };
  if (drawing.layout?.routing === 'polyline') fail('DRAWING_CAPABILITY', 'validate', [drawing.id], '原型尚未实现 polyline；不会忽略该字段');
  for (const c of drawing.connections) if (c.style && !Object.hasOwn(styles, c.style)) fail('DRAWING_STYLE', 'validate', [c.id, c.style], '未注册的主题样式');
  const nodes = await layoutDrawing(drawing), byId = new Map(nodes.map(n => [n.id, n]));
  const constraints = drawing.layout?.constraints ?? [], diagnostics: DrawingScene['diagnostics'] = [];
  const edgeGap = Math.max(drawing.layout?.spacing?.edge ?? 20, ...Object.values(drawing.layout?.containers ?? {}).map(c => c.spacing?.edge ?? 0));
  const isParent = (ancestor: string, descendant: string) => { let n: NodeGeometry | undefined = byId.get(descendant); while (n) { if (n.id === ancestor) return true; n = n.parentId ? byId.get(n.parentId) : undefined; } return false; };
  const container = (n: NodeGeometry) => nodes.some(c => c.parentId === n.id);
  const headers = (n: NodeGeometry): Rect => n.title;
  const allText = nodes.flatMap(n => [n.title, ...n.contents, ...n.ports.flatMap(p => [p.text, ...p.annotation ? [p.annotation] : []])]).filter(t => t.width && t.height);
  for (const n of nodes) {
    if (n.parentId) { const p = byId.get(n.parentId)!.contentBox; if (n.x < p.x - .01 || n.y < p.y - .01 || n.x + n.width > p.x + p.width + .01 || n.y + n.height > p.y + p.height + .01) fail('DRAWING_CONTAINMENT', 'geometry', [n.id, n.parentId], '子框超出父内容区'); }
    const texts = [n.title, ...n.contents, ...n.ports.flatMap(p => [p.text, ...p.annotation ? [p.annotation] : []])].filter(t => t.width && t.height);
    for (const t of texts) if (t.x < n.x || t.y < n.y || t.x + t.width > n.x + n.width || t.y + t.height > n.y + n.height) fail('DRAWING_TEXT', 'geometry', [n.id, t.id], '框内文字超出边界');
    for (const [i, a] of texts.entries()) for (const b of texts.slice(i + 1)) if (intersects(a, b, 2)) fail('DRAWING_TEXT', 'geometry', [n.id, a.id, b.id], '框内文字互相重叠');
  }
  for (const [i, a] of nodes.entries()) for (const b of nodes.slice(i + 1)) if (a.parentId === b.parentId && intersects(a, b)) fail('DRAWING_OVERLAP', 'geometry', [a.id, b.id], '兄弟框重叠');
  const frame = (id = 'root'): Point => id === 'root' ? {x: 0, y: 0} : byId.get(id)!.contentBox;
  const offset = (p: Point, base: Point): Point => ({x: p.x + base.x, y: p.y + base.y});
  const used: Point[][] = [], geometries: ConnectionGeometry[] = [],previewLabels=new Map<string,Rect>();
  function endpointSide(c:Connection,e:Connection['ends'][number],i:number):Side{
    const n=byId.get(e.node)!,others=c.ends.filter(o=>o.id!==e.id).map(o=>byId.get(o.node)!);
    const dx=others.reduce((sum,o)=>sum+o.x+o.width/2,0)/others.length-n.x-n.width/2;
    const dy=others.reduce((sum,o)=>sum+o.y+o.height/2,0)/others.length-n.y-n.height/2;
    if(autoEndpoints&&drawing.layout?.arrangement==='cyclic'&&c.ends.every(e=>e.node===n.id)){const states=nodes.filter(n=>n.shape!=='initial'&&n.shape!=='note'),cx=states.reduce((sum,n)=>sum+n.x+n.width/2,0)/states.length,cy=states.reduce((sum,n)=>sum+n.y+n.height/2,0)/states.length;return i?(n.y+n.height/2<cy?'top':'bottom'):(n.x+n.width/2<cx?'left':'right');}
    if(autoEndpoints&&drawing.layout?.arrangement==='cyclic'&&Math.abs(dx)>.01&&Math.abs(dy)>.01&&n.shape==='ellipse'&&others.every(n=>n.shape==='ellipse')){
      // 对角迁移使用外围两组通道，避免交叉回边挤在循环中心及椭圆角落。
      const states=nodes.filter(n=>n.shape==='ellipse'),cx=states.reduce((s,n)=>s+n.x+n.width/2,0)/states.length,cy=states.reduce((s,n)=>s+n.y+n.height/2,0)/states.length,first=byId.get(c.ends[0].node)!;
      const horizontal=(first.x+first.width/2-cx)*(first.y+first.height/2-cy)>=0;
      return horizontal?(n.x+n.width/2<cx?'left':'right'):(n.y+n.height/2<cy?'top':'bottom');
    }
    if(autoEndpoints&&drawing.layout?.arrangement!=='cyclic'&&c.ends.length===2&&c.ends[0].node!==c.ends[1].node){const direction=drawing.layout?.direction??'LR',axis=['LR','RL'].includes(direction)?'x':'y',sign=['RL','BT'].includes(direction)?-1:1,first=byId.get(c.ends[0].node)!,last=byId.get(c.ends[1].node)!,center=(n:NodeGeometry)=>n[axis]+(axis==='x'?n.width:n.height)/2;if((center(last)-center(first))*sign<-.01)return axis==='x'?'top':'right';}
    if(n.shape==='bar')return ['TB','BT'].includes(drawing.layout?.direction??'LR')?(dy<0?'top':'bottom'):(dx<0?'left':'right');
    return !dx&&!dy?(i?'bottom':'right'):Math.abs(dx)>=Math.abs(dy)?dx<0?'left':'right':dy<0?'top':'bottom';
  }
  const anonymous=new Map<string,{c:Connection;e:Connection['ends'][number];i:number;side:Side}[]>(),anchors=new Map<string,Point>();
  const terminalKey=(connection:string,end:string)=>JSON.stringify([connection,end]);
  if(autoEndpoints)for(const c of drawing.connections)for(const [i,e]of c.ends.entries())if(!e.port){const side=endpointSide(c,e,i),key=JSON.stringify([e.node,side]);if(!anonymous.has(key))anonymous.set(key,[]);anonymous.get(key)!.push({c,e,i,side});}
  for(const group of anonymous.values()){
    const n=byId.get(group[0].e.node)!,side=group[0].side,axis=side==='left'||side==='right'?'y':'x',size=axis==='x'?n.width:n.height,center=n[axis]+size/2,margin=Math.min(20,size/5),min=n[axis]+margin,max=n[axis]+size-margin,gap=edgeGap+4;
    const desired=(item:typeof group[number])=>{const others=item.c.ends.filter(e=>e.id!==item.e.id).map(e=>byId.get(e.node)!);return Math.round(others.reduce((sum,n)=>sum+n[axis]+(axis==='x'?n.width:n.height)/2,0)/others.length*1e6)/1e6;};
    const occupied:number[]=[];
    const ordered=group.slice().sort((a,b)=>Number(a.c.ends.every(e=>e.node===n.id))-Number(b.c.ends.every(e=>e.node===n.id))||Math.abs(desired(a)-center)-Math.abs(desired(b)-center)||a.c.id.localeCompare(b.c.id));
    for(const item of ordered){
      const preferred=Math.max(min,Math.min(max,desired(item))),candidates=[preferred,center];for(let i=1;i<=group.length+2;i++)candidates.push(preferred+i*gap,preferred-i*gap,center+i*gap,center-i*gap);
      const at=candidates.filter(p=>p>=min&&p<=max&&!occupied.some(q=>Math.abs(p-q)<gap-.01)).sort((a,b)=>Math.abs(a-preferred)-Math.abs(b-preferred))[0];
      if(at===undefined)throw new DrawingError('DRAWING_ENDPOINT_SPACE','route',group.map(g=>g.c.id),'当前节点边长不足以分开全部独立挂点');
      occupied.push(at);const point={x:side==='left'?n.x:side==='right'?n.x+n.width:at,y:side==='top'?n.y:side==='bottom'?n.y+n.height:at};anchors.set(terminalKey(item.c.id,item.e.id),shapeAnchor(n,point,{x:point.x+sign[side].x*24,y:point.y+sign[side].y*24}));
    }
  }
  function terminals(c: Connection): ConnectionGeometry['ends'] {
    return c.ends.map((e,i)=>{
      const n=byId.get(e.node)!;
      if(e.port){const p=n.ports.find(p=>p.id===e.port)!;return {...e,x:p.x,y:p.y,side:p.side};}
      const side=endpointSide(c,e,i),fixed=anchors.get(terminalKey(c.id,e.id));if(fixed)return {...e,side,...fixed};
      const group=drawing.connections.flatMap(other=>other.ends.map((end,index)=>({other,end,index}))).filter(v=>v.end.node===n.id&&!v.end.port&&endpointSide(v.other,v.end,v.index)===side);
      const rank=group.findIndex(v=>v.other.id===c.id&&v.end.id===e.id),fraction=(rank+1)/(group.length+1);
      const at={x:side==='left'?n.x:side==='right'?n.x+n.width:n.x+n.width*fraction,y:side==='top'?n.y:side==='bottom'?n.y+n.height:n.y+n.height*fraction};
      return {...e,side,...shapeAnchor(n,at,{x:at.x+sign[side].x*24,y:at.y+sign[side].y*24})};
    });
  }
  function obstacles(c: Connection): Rect[] {
    return nodes.map(n => {
      if (n.shape!=='lane'&&(!container(n) || !c.ends.some(e => isParent(n.id, e.node)))) return n;
      return headers(n);
    }).map(n => ({x: n.x - 8, y: n.y - 8, width: n.width + 16, height: n.height + 16}));
  }
  // 所有端口先保留出线段；顺序布线不能封住尚未处理的端点。
  const terminalSets = new Map(drawing.connections.map(c => [c.id, terminals(c)]));
  const lead = (e: ConnectionGeometry['ends'][number]) => {const n=byId.get(e.node)!;return {x:e.side==='left'?n.x-24:e.side==='right'?n.x+n.width+24:e.x,y:e.side==='top'?n.y-24:e.side==='bottom'?n.y+n.height+24:e.y};};
  function reserved(c: Connection): Rect[] {
    const own = terminalSets.get(c.id)!;
    return [...terminalSets].filter(([id]) => id !== c.id).flatMap(([, ends]) => ends.filter(e => !own.some(o => same(o, e))).map(e => {
      const p = lead(e);
      return {x: Math.min(e.x, p.x) - 6, y: Math.min(e.y, p.y) - 6, width: Math.abs(e.x - p.x) + 12, height: Math.abs(e.y - p.y) + 12};
    }));
  }
  const primary = drawing.layout?.hints?.main ?? [];
  const ordered = drawing.connections.slice().sort((a, b) => Number(!primary.includes(a.id)) - Number(!primary.includes(b.id)) || (autoEndpoints&&drawing.layout?.arrangement==='cyclic'?Number(a.ends.some(e=>byId.get(e.node)?.shape==='initial'))-Number(b.ends.some(e=>byId.get(e.node)?.shape==='initial'))||a.id.localeCompare(b.id):0));
  for (const c of ordered) {
    const ends = terminals(c), locked = constraints.filter((r): r is Extract<Constraint, {type: 'fixedRoute'}> => r.type === 'fixedRoute' && r.connection === c.id);
    if (locked.length > 1) fail('DRAWING_CONSTRAINT', 'route', locked.map(r => r.id), '原型要求每条连接最多一份完整固定路线');
    const geometry: ConnectionGeometry = {id: c.id, originIds: c.originIds ?? [], ends, paths: [], junctions: [], labels: []};
    if (locked.length) {
      const r = locked[0], base = frame(r.frame), junctions = new Map((r.junctions ?? []).map(j => [j.id, offset(j, base)]));
      const at = (ref: import('./types.ts').RouteRef) => 'end' in ref ? ends.find(e => e.id === ref.end)! : junctions.get(ref.junction)!;
      geometry.paths = r.paths.map(p => ({id: p.id, points: [at(p.from), ...(p.via ?? []).map(p => offset(p, base)), at(p.to)].map(p => ({x: p.x, y: p.y}))}));
      geometry.junctions = [...junctions.values()];
    } else {
      const route = constraints.filter((r): r is Extract<Constraint, {type: 'route'}> => r.type === 'route' && r.connection === c.id);
      if (route.length > 1) fail('DRAWING_CAPABILITY', 'route', route.map(r => r.id), '原型尚未合并多份经过点约束');
      const a = route.length ? ends.find(e => e.id === route[0].from)! : ends[0], b = route.length ? ends.find(e => e.id === route[0].to)! : ends[1];
      const from = lead(a), to = lead(b), waypoints = route.length ? route[0].via.map(p => offset(p, frame(route[0].frame))) : [];
      const internal=nodes.filter(n=>autoEndpoints&&container(n)&&c.ends.every(e=>e.node!==n.id&&isParent(n.id,e.node)));
      const walls=internal.flatMap(n=>{const b=n.contentBox;return [{x:b.x-12,y:b.y-12,width:b.width+24,height:8},{x:b.x-12,y:b.y+b.height+4,width:b.width+24,height:8},{x:b.x-12,y:b.y-12,width:8,height:b.height+24},{x:b.x+b.width+4,y:b.y-12,width:8,height:b.height+24}];});
      const blocked = [...obstacles(c), ...reserved(c),...walls,...previewLabels.values()];
      const future = ends.filter(e => e !== a && e !== b).map(e => { const p = lead(e); return {x: Math.min(e.x, p.x) - edgeGap, y: Math.min(e.y, p.y) - edgeGap, width: Math.abs(e.x - p.x) + edgeGap * 2, height: Math.abs(e.y - p.y) + edgeGap * 2}; });
      const pathThrough = (via: Point[]) => {
        const targets = [from, ...via, to]; let path: Point[] = [{x: a.x, y: a.y}, from];
        for (let i = 1; i < targets.length; i++) path.push(...orthogonal(targets[i - 1], targets[i], [...blocked, ...future], [...used, path], {contacts: targets, clearance: edgeGap}).slice(1));
        path.push({x: b.x, y: b.y}); return simplify(path);
      };
      const channel = drawing.layout?.hints?.channels?.find(h => h.connection === c.id);
      let path: Point[] | undefined;
      if(drawing.nodes.some(n=>n.shape)&&c.ends.length===2&&!waypoints.length&&!route.length)path=routeCandidates(a,from,to,b,blocked,geometries,geometry,edgeGap,path=>{try{const boxes:Rect[]=[];for(const label of c.labels??[]){const lines=wrapText(label.text,14,200),box={x:0,y:0,width:Math.max(...lines.map(l=>measureText(l,14)))+16,height:lines.length*21+8,lines};boxes.push(placeLabel(box,[path],[...nodes.filter(n=>!container(n)),...nodes.filter(container).map(n=>n.title),...(autoEndpoints?reserved(c):[])],[...previewLabels.values(),...boxes],used));}if(autoEndpoints)(c.labels??[]).forEach((label,i)=>previewLabels.set(JSON.stringify([c.id,label.id]),boxes[i]));return true;}catch{return false;}});
      if (channel && !waypoints.length) {
        const box = channel.container ? byId.get(channel.container)! : {x: Math.min(...nodes.map(n => n.x)) - 40, y: Math.min(...nodes.map(n => n.y)) - 40, width: Math.max(...nodes.map(n => n.x + n.width)) + 80, height: Math.max(...nodes.map(n => n.y + n.height)) + 80};
        const vertical = channel.side === 'left' || channel.side === 'right';
        const coordinate = channel.side === 'left' ? box.x + 20 : channel.side === 'right' ? box.x + box.width - 20 : channel.side === 'top' ? box.y + 20 : box.y + box.height - 20;
        try {
          const preferred = pathThrough(vertical ? [{x: coordinate, y: from.y}, {x: coordinate, y: to.y}] : [{x: from.x, y: coordinate}, {x: to.x, y: coordinate}]);
          const direct = pathThrough([]), length = (p: Point[]) => p.slice(1).reduce((sum, b, i) => sum + distance(p[i], b), 0);
          if (length(preferred) <= length(direct) * 1.5 + 80) path = preferred;
        } catch { /* 偏好不是硬约束，交由常规路径重新求解。 */ }
        if (!path) diagnostics.push({code: 'DRAWING_CHANNEL_RELAXED', id: c.id, message: '偏好通道不可用或导致明显绕行，保留全部硬约束重新布线'});
      }
      try { path ??= pathThrough(waypoints); } catch (error) { fail('DRAWING_ROUTE', 'route', [c.id, ...route.map(r => r.id)], `没有合法通道：${String(error)}`); }
      geometry.paths = [{id: 'main', points: path!}];
      if (ends.length > 2) extendConnectionTree(geometry, ends.filter(e => e !== a && e !== b), lead, blocked, used, edgeGap);
    }
    // 锁定路径同样执行几何检查，不能靠 fixedRoute 绕过正确性。
    for (const path of geometry.paths) for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1], b = path.points[i];
      if (a.x !== b.x && a.y !== b.y) fail('DRAWING_ORTHOGONAL', 'geometry', [c.id, path.id], '正交路线含斜线');
      for (const n of nodes) {
        const obstacle = n.shape==='lane'?headers(n):container(n) && c.ends.some(e => isParent(n.id, e.node)) ? headers(n) : n;
        if (obstacle===n?shapeSegmentCrosses(n,a,b):crosses(a,b,obstacle)) fail('DRAWING_PATH_COLLISION', 'geometry', [c.id, n.id], '路径穿过实体或容器标题');
      }
      for (const t of allText) if (crosses(a, b, t)) fail('DRAWING_PATH_COLLISION', 'geometry', [c.id, t.id], '路径穿过框内文字');
    }
    used.push(...geometry.paths.map(p => p.points)); geometries.push(geometry);
  }
  checkPaths(geometries, edgeGap);
  for (const c of geometries) for (const e of c.ends) for (const path of c.paths) {
    const points = same(path.points[0], e) ? path.points : same(path.points.at(-1)!, e) ? path.points.slice().reverse() : undefined;
    if (points) {
      const delta = {x: points[1].x - e.x, y: points[1].y - e.y};
      if (delta.x * sign[e.side].x + delta.y * sign[e.side].y <= 0) fail('DRAWING_ENDPOINT', 'geometry', [c.id, e.id], '路线没有沿端口侧边朝外离开');
    }
  }
  const labelNodes: Rect[] = nodes.flatMap(n => container(n) ? [headers(n), {x: n.x - 2, y: n.y, width: 4, height: n.height}, {x: n.x + n.width - 2, y: n.y, width: 4, height: n.height}, {x: n.x, y: n.y + n.height - 2, width: n.width, height: 4}] : [n]);
  const placed: TextBox[] = [];
  for (const c of drawing.connections) {
    const g = geometries.find(g => g.id === c.id)!;
    for (const label of c.labels ?? []) {
      const labelRules = constraints.filter(r => r.type === 'label' && r.connection === c.id && r.label === label.id);
      if (labelRules.length > 1) fail('DRAWING_CAPABILITY', 'labels', labelRules.map(r => r.id), '原型尚未合并同一标签的多份位置约束');
      const rule = constraints.find((r): r is Extract<Constraint, {type: 'label'}> => r.type === 'label' && r.connection === c.id && r.label === label.id);
      const lines = wrapText(label.text, 14, 200), box = {x: 0, y: 0, width: Math.max(...lines.map(l => measureText(l, 14))) + 16, height: lines.length * 21 + 8, lines};
      const otherPaths = geometries.filter(other => other !== g).flatMap(other => other.paths.map(p => p.points));
      let paths = g.paths.map(p => p.points);
      if (rule) { const e = g.ends.find(e => e.id === rule.nearEnd)!; paths = paths.filter(p => same(p[0], e) || same(p.at(-1)!, e)); }
      try {
        let p;
        if (rule?.fraction !== undefined) {
          const points = trace(g, rule.nearEnd, rule.toEnd ?? g.ends.find(e => e.id !== rule.nearEnd)!.id);
          const lengths = points.slice(1).map((b, i) => distance(points[i], b));
          let remain = lengths.reduce((a, b) => a + b, 0) * rule.fraction;
          for (let i = 0; i < lengths.length; i++) {
            if (remain > lengths[i]) { remain -= lengths[i]; continue; }
            const a = points[i], b = points[i + 1], ratio = lengths[i] ? remain / lengths[i] : 0, point = {x: a.x + (b.x - a.x) * ratio, y: a.y + (b.y - a.y) * ratio}, vertical = a.x === b.x;
            const candidate={...box,x:point.x-box.width/2,y:point.y-box.height/2};
            p = ![...labelNodes,...placed].some(obstacle=>intersects(candidate,obstacle,4)) && !otherPaths.some(path=>path.slice(1).some((end,i)=>crosses(path[i],end,candidate))) ? candidate : undefined;
            if (!p) throw new Error('指定路径比例处没有合法标签位置');
            break;
          }
        } else if (rule) {
          const end = g.ends.find(e => e.id === rule.nearEnd)!;
          const segments = paths.flatMap(path => {
            const oriented = same(path[0], end) ? path : path.slice().reverse();
            return oriented.slice(1).map((b, i) => [oriented[i], b]);
          });
          for (const segment of segments) { try { p = placeLabel(box, [segment], labelNodes, placed, otherPaths); break; } catch { /* 从参考端逐段寻找合法位置。 */ } }
          if (!p) throw new Error('参考端附近没有合法标签位置');
        } else {const preview=previewLabels.get(JSON.stringify([c.id,label.id]));p = placeLabel(box, paths, labelNodes, placed, otherPaths,preview?{x:preview.x+preview.width/2,y:preview.y+preview.height/2}:undefined);}
        if (!p) throw new Error('没有满足约束的标签位置');
        const t = {...p, id: label.id, size: 14}; g.labels.push(t); placed.push(t);
      }
      catch (error) { fail('DRAWING_LABEL', 'labels', [c.id, label.id, ...rule ? [rule.id] : []], String(error)); }
    }
  }
  // 端点始终引用求解后的锚点，不能出现线段遗漏某个声明端。
  for (const c of geometries) for (const e of c.ends) if (!c.paths.some(p => same(p.points[0], e) || same(p.points.at(-1)!, e))) fail('DRAWING_ENDPOINT', 'geometry', [c.id, e.id], '路线未挂接声明端点');
  for (const c of geometries) for (const n of nodes.filter(n => container(n) && c.ends.every(e => isParent(n.id, e.node)))) {
    const box = n.contentBox;
    for (const p of [...c.paths.flatMap(path => path.points), ...c.labels.flatMap(l => [{x: l.x, y: l.y}, {x: l.x + l.width, y: l.y + l.height}])]) {
      if (p.x < box.x - .01 || p.y < box.y - .01 || p.x > box.x + box.width + .01 || p.y > box.y + box.height + .01) fail('DRAWING_ROUTE', 'geometry', [c.id, n.id], '容器内容区无法包含内部路线或标签');
    }
  }
  const points = [...nodes.flatMap(n => [{x: n.x, y: n.y}, {x: n.x + n.width, y: n.y + n.height}]), ...geometries.flatMap(c => [...c.paths.flatMap(p => p.points), ...c.labels.flatMap(l => [{x: l.x, y: l.y}, {x: l.x + l.width, y: l.y + l.height}])])];
  const minX = Math.min(...points.map(p => p.x)) - 24, minY = Math.min(...points.map(p => p.y)) - 60;
  const width = Math.max(...points.map(p => p.x)) - minX + 24, height = Math.max(...points.map(p => p.y)) - minY + 24;
  return {id: drawing.id, nodes, connections: geometries, width, height, viewBox: {x: minX, y: minY, width, height}, effectiveLayout: {direction: 'LR', routing: 'orthogonal', ...drawing.layout, spacing: {node: 64, layer: 100, edge: 20, port: 28, padding: 40, ...drawing.layout?.spacing}}, satisfiedConstraints: [], diagnostics, durationMs: performance.now() - start};
}

export async function solveDrawingModel(input: Drawing): Promise<DrawingScene> {
  validateDrawingModel(input); const start = performance.now();
  if(input.layout?.routing==='curved')return solveCurvedDrawing(input);
  const original=input;input=await prepareAlignment(await prepareLanes(input));
  for (const c of input.connections) if (c.style && !Object.hasOwn(styles, c.style)) throw new DrawingError('DRAWING_STYLE', 'validate', [c.id, c.style], '未注册的主题样式');
  // 大二端图采用联合求解；精确路径/位置仍走支持这些硬约束的受控求解器。
  const compactRelations = input.connections.length > 0 && input.nodes.some(n => n.ports?.length) && input.nodes.every(n => (n.ports ?? []).every(p => p.appearance === 'slot'));
  if ((input.connections.length > 3 || compactRelations || input.nodes.some(n=>n.shape)) && input.layout?.routing !== 'polyline' && input.connections.every(c => c.ends.length === 2) && !(input.layout?.constraints ?? []).some(r => !['port', 'size'].includes(r.type))) {try{return await solveCompound(input);}catch(error){if(!(error instanceof DrawingError)||!['DRAWING_PATH_CONTACT','DRAWING_PATH_CLEARANCE','DRAWING_LABEL'].includes(error.code))throw error;}}
  for (let attempt = 0; attempt < 4; attempt++) {
    let drawing = structuredClone(original);
    if (attempt) {
      drawing.layout ??= {}; drawing.layout.spacing ??= {};
      drawing.layout.spacing.node = Math.max(64, drawing.layout.spacing.node ?? 0) * 2 ** attempt;
      if(original.layout?.alignment==='auto'&&!original.nodes.some(n=>n.shape==='lane')&&!hasPositionIntent(original))drawing.layout.spacing.padding=Math.max(40,drawing.layout.spacing.padding??0)*2**attempt;
      drawing.layout.spacing.layer = Math.max(100, drawing.layout.spacing.layer ?? 0) * 2 ** attempt;
    }
    drawing=await prepareAlignment(await prepareLanes(drawing));
    try {
      const scene = await solveAttempt(drawing,original.layout?.alignment==='auto'&&!hasPositionIntent(original)&&(!original.nodes.some(n=>n.parentId)||original.nodes.some(n=>n.shape==='lane'))); scene.durationMs = performance.now() - start;
      scene.satisfiedConstraints = verifyDrawingScene(original, scene);
      if (attempt) scene.diagnostics.push({code: 'DRAWING_SPACING_EXPANDED', message: `为路径和标签增加最小空白，使用 ${attempt + 1} 次布局尝试；固定位置和经过点保持不变`});
      return scene;
    } catch (error) {
      if (!(error instanceof DrawingError) || !['DRAWING_LABEL', 'DRAWING_ROUTE', 'DRAWING_PATH_CLEARANCE'].includes(error.code) || attempt === 3) throw error;
    }
  }
  throw new Error('不可达的布局状态');
}
