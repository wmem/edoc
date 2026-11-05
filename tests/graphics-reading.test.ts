import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import {fixture} from './helpers.ts';
import {scene,svg} from '../packages/render-graph/index.ts';
import {html} from '../packages/pack-html/index.ts';
import {measureText} from '../packages/render-graph/text.ts';
import {initialInterfaceState,prepareInterfaceModel,interfaceScene} from '../packages/render-graph/interfaces.ts';

function setup(t:{after:(fn:()=>void)=>void}){
 const f=fixture(t),ports=['in','out','inout','passive','unknown'].map((direction,i)=>({id:'module.p'+i,label:'signal_'+direction,direction,width:i===2?8:1,...(i===4?{width:undefined,widthExpr:'DATA_W'}:{})}));
 f.edit('objects',d=>d.objects=[{id:'module',kind:'node',label:'带方向和参数化位宽的独立模块',ports}]);f.edit('relations',d=>d.relations=[]);
 f.edit('views',d=>d.views=[{id:'single',kind:'interface',label:'单框接口',include:{objects:['module'],relations:[]},display:{showPortAttributes:true}}]);f.edit('manifest',d=>d.entryDocuments=[]);return f;
}
test('单框五类端口展示引线与范围，真实关系和方向不变',async t=>{
 const f=setup(t),graph=f.load(),before=JSON.stringify([...graph.index]);const result=await scene(graph,'single'),ports=result.nodes[0].ports;
 for(const [i,arrows]of [[false,true],[true,false],[true,true],[false,false],[false,false]].entries()){const lead=ports[i].lead!;assert.ok(lead);assert.deepEqual([lead.startArrow,lead.endArrow],arrows);assert.ok(lead.points.every(p=>p.x>=0&&p.x<=result.width&&p.y>=0&&p.y<=result.height));}
 assert.equal(ports[2].displayLabel,'signal_inout [7:0]');assert.equal(ports[4].displayLabel,'signal_unknown [(DATA_W)-1:0]');assert.equal(result.nets.length,0);assert.equal(graph.connections.size,0);assert.equal(JSON.stringify([...graph.index]),before);
 const output=svg(result,false);assert.equal((output.match(/data-port-lead=/g)??[]).length,5);assert.equal((output.match(/data-relation=/g)??[]).length,0);
 assert.match(output,/>signal_inout \[7:0\]<\/text>/);assert.match(output,/>signal_unknown \[\(DATA_W\)-1:0\]<\/text>/);
});
test('已有可见连接的端口不重复引线，分组反向握手展开保持真实方向',async t=>{
 const f=setup(t);f.edit('objects',d=>{d.objects[0].interfaces=[{id:'bus',label:'REQ_RESP',role:'target',members:['module.p0','module.p1']}];d.objects.push({id:'peer',kind:'node',label:'对端',ports:[{id:'peer.out',label:'req',direction:'out'}]});});
 f.edit('relations',d=>d.relations=[{id:'req',kind:'connection',class:'control',endpoints:['peer.out','module.p0'],direction:{sources:['peer.out'],targets:['module.p0']}}]);
 f.edit('views',d=>d.views[0].include.relations=['req']);f.edit('manifest',d=>{d.irVersion='1.1';d.requiredFeatures=['interface-groups'];});
 const graph=f.load(),model=prepareInterfaceModel(graph,'single')!,state=initialInterfaceState(model);state.modes.bus='expanded';const expanded=await interfaceScene(model,state),a=expanded.nodes.find(n=>n.id==='module')!;
 assert.equal(a.ports.find(p=>p.id==='module.p0')!.lead,undefined);assert.equal(expanded.nodes.find(n=>n.id==='peer')!.ports[0].lead,undefined);assert.equal(a.ports.find(p=>p.id==='module.p1')!.lead!.startArrow,true);assert.equal(new Set(a.ports.filter(p=>p.interfaceId==='bus').map(p=>p.side)).size,1);
 // 无对端关系时，聚合接口可双向，但不把真实in/out改成RTL inout。
 f.edit('relations',d=>d.relations=[]);f.edit('views',d=>{d.views[0].include.relations=[];d.views[0].display.interfaceMode='collapsed';});const collapsed=await scene(f.load(),'single'),bus=collapsed.nodes[0].ports.find(p=>p.id==='bus')!;
 assert.deepEqual([bus.lead!.startArrow,bus.lead!.endArrow,bus.lead!.aggregate],[true,true,true]);assert.equal(collapsed.interfaceModel!.nodes[0].ports![0].direction,'in');
});
test('默认节点按内容缩减并换行，标题完整且端口避开多行标题',async t=>{
 const f=setup(t);f.edit('objects',d=>{d.objects[0].label='这个模块标题很长，需要在保留完整含义的情况下换行显示，不能裁切';d.objects[0].ports=d.objects[0].ports.slice(0,2);});const result=await scene(f.load(),'single'),node=result.nodes[0];
 assert.ok(node.width<340);assert.ok(node.titleLines!.length>1);assert.equal(node.titleLines!.join(''),node.label);for(const line of node.titleLines!)assert.ok(measureText(line,node.titleSize)+32<=node.width);assert.ok(node.ports.every(p=>p.y>node.y+node.headerHeight!));
});
test('有子节点和约束的父框仍保留自身长端口所需宽度',async t=>{
 const f=setup(t);f.edit('objects',d=>{d.objects[0].ports[0].label='LONG_INTERFACE_SIGNAL_NAME_'.repeat(4);for(const id of ['a','b'])d.objects.push({id,kind:'node',label:id,parentId:'module'});});f.edit('views',d=>{d.views[0].include.objects.push('a','b');d.views[0].layout={constraints:[{type:'order',axis:'x',nodes:['a','b']}]};});f.edit('manifest',d=>{d.irVersion='1.2';d.requiredFeatures=['layout-intent'];});
 const result=await scene(f.load(),'single'),parent=result.nodes.find(n=>n.id==='module')!;assert.ok(parent.width>=measureText(parent.ports[0].displayLabel!,14)+30);assert.ok(result.nodes.filter(n=>n.parentId==='module').every(n=>n.y>=parent.y+parent.headerHeight!));
});
test('初始主要文字可读、完整适配可显式切换、单框网页与SVG方向引线一致',{timeout:60000},async t=>{
 const f=setup(t);f.edit('objects',d=>{for(let i=0;i<4;i++)d.objects.push({id:'n'+i,kind:'node',label:'处理模块 '+i,ports:[{id:'n'+i+'.in',label:'REQUEST_IN',direction:'in'},{id:'n'+i+'.out',label:'RESPONSE_OUT',direction:'out'}]});});
 f.edit('relations',d=>d.relations=Array.from({length:3},(_,i)=>({id:'r'+i,kind:'connection',class:'data',label:'请求/结果',endpoints:['n'+i+'.out','n'+(i+1)+'.in']})));
 f.edit('views',d=>d.views.unshift({id:'default',kind:'architecture',label:'默认阅读',include:{objects:['n0','n1','n2','n3'],relations:['r0','r1','r2']}}));f.edit('manifest',d=>d.entryDocuments=['docs/reading.mdoc']);writeFileSync(join(f.root,'docs/reading.mdoc'),'{% relation-diagram id="default" /%}\n{% relation-diagram id="single" /%}');
 const root=mkdtempSync(join(tmpdir(),'edoc-reading-'));t.after(()=>rmSync(root,{recursive:true,force:true}));writeFileSync(join(root,'index.html'),await html(f.load(),'图形阅读'));const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(pathToFileURL(join(root,'index.html')).href);await page.waitForFunction(()=>window.EdocReady);
 const info=()=>page.evaluate(()=>{const g=window.EdocGraphs.find(g=>g.container.closest('[data-diagram]')?.getAttribute('data-diagram')==='default')!;return {zoom:g.zoom(),width:g.container.clientWidth};});
 const first=await info();assert.ok(first.zoom*14>=11.99);const holder=page.locator('[data-diagram="default"]');assert.equal(await holder.getAttribute('data-viewport-mode'),'readable');assert.ok(await holder.locator('.viewport-note').isVisible());
 await holder.locator('[data-action=fit]').click();assert.ok((await info()).zoom<first.zoom);assert.ok(await holder.locator('.viewport-note').isHidden());await holder.locator('[data-action=read]').click();assert.equal((await info()).zoom,1);
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);assert.equal((await info()).zoom,1);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
 const single=page.locator('[data-diagram="single"]');await single.scrollIntoViewIfNeeded();assert.equal(await single.locator('.canvas [data-port-lead]').count(),5);assert.equal(await single.locator('.static-svg [data-port-lead]').count(),5);assert.deepEqual(errors,[]);
});

test('单模块、有接口分组、零连线可显示、合并展开及下载当前/完整SVG',{timeout:40000},async t=>{
 const f=setup(t);f.edit('objects',d=>d.objects[0].interfaces=[{id:'call',label:'CALL',role:'target',members:['module.p0','module.p1']}]);f.edit('manifest',d=>{d.irVersion='1.1';d.requiredFeatures=['interface-groups'];d.entryDocuments=['docs/zero.mdoc'];});writeFileSync(join(f.root,'docs/zero.mdoc'),'{% relation-diagram id="single" /%}');
 const dir=mkdtempSync(join(tmpdir(),'edoc-zero-interface-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));writeFileSync(join(dir,'index.html'),await html(f.load(),'零连线接口'));
 const browser=await chromium.launch({executablePath:process.env.EDOC_CHROMIUM,args:['--no-sandbox']});t.after(()=>browser.close());const context=await browser.newContext({offline:true}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(pathToFileURL(join(dir,'index.html')).href);await page.waitForFunction(()=>window.EdocReady);
 const figure=page.locator('[data-diagram="single"]');assert.equal(await figure.locator('[data-display=relation-labels]').count(),0);assert.equal(await figure.locator('.canvas .x6-node').count(),1);assert.equal(await figure.locator('.canvas [data-port-lead]').count(),5);
 const leadPoint=await figure.locator('.canvas [data-port-lead="module.p0"]').evaluate(element=>{const path=element as SVGGeometryElement,point=path.getPointAtLength(path.getTotalLength()/2).matrixTransform(path.getScreenCTM()!);return {x:point.x,y:point.y};});await page.mouse.click(leadPoint.x,leadPoint.y);assert.equal(JSON.parse(await page.locator('#properties').innerText()).direction,'in');
 for(const state of ['collapsed','expanded']){await figure.locator('[data-interface-toggle="call"]').click();await page.waitForFunction(state=>window.EdocInterfaceViews[0].state.modes.call===state&&window.EdocInterfaceViews[0].holder.dataset.busy==='false',state);assert.equal(await figure.locator('.canvas .x6-node').count(),1);}
 for(const action of ['svg-current','svg']){const pending=page.waitForEvent('download');await figure.locator(`[data-action="${action}"]`).click();const download=await pending,content=readFileSync((await download.path())!,'utf8');assert.equal((content.match(/data-port-lead=/g)??[]).length,5);assert.equal((content.match(/data-relation=/g)??[]).length,0);assert.match(content,/data:font\/woff2;base64,/);}
 const facts=await page.evaluate(()=>{const v=window.EdocInterfaceViews[0];return {relations:v.scene.nets.length,originals:v.scene.interfaceModel!.relations.length};});assert.deepEqual(facts,{relations:0,originals:0});assert.deepEqual(errors,[]);
});
