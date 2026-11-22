import test from 'node:test';
import assert from 'node:assert/strict';
import {graphFromResources} from '../packages/core/graph.ts';
import {query, queryElement, summary} from '../packages/core/query.ts';
import {createAddressResolver, ResourceResolver} from '../packages/extensions/register-map/resolver.ts';
import {registerMapProjection, registerLeafProjection, intervalsOverlap} from '../packages/extensions/register-map/model.ts';
import type {ResourceType} from '../packages/core/types.ts';

export const regionStep = (regionId: string, index?: number) => ({kind:'region' as const,regionId,...(index===undefined?{}:{index})});
export const entryStep = (entryId: string, index?: number) => ({kind:'entry' as const,entryId,...(index===undefined?{}:{index})});
export function soc() {
 return {registers:[{id:'r',kind:'register',label:'CTRL',width:32,fields:[{id:'r.en',label:'EN',msb:0,lsb:0,access:'RW',enums:{'0':'关闭','1':'使能'},readEffect:'none',writeEffect:'normal'}]},{id:'wide',kind:'register',label:'WIDE',width:64,fields:[]},{id:'small',kind:'register',label:'SMALL',width:12,fields:[]}],registerBlocks:[{id:'ip',kind:'register-block',label:'IP',addressUnitBits:8,size:'0x100',entries:[{id:'ctrl',register:'r',offset:'0'},{id:'wide',register:'wide',offset:'8'},{id:'small',register:'small',offset:'16'}]}],memories:[{id:'ram',kind:'memory',label:'RAM',capacityBytes:'0x1000',memoryType:'ram'}],addressSpaces:[{id:'cpu',kind:'address-space',label:'CPU',addressWidth:64,addressUnitBits:8,base:'0',size:'0x10000000000000000',regions:[{id:'uart0',kind:'resource',label:'UART0',base:'0x1000',size:'0x1000',target:{id:'ip'}},{id:'uart1',kind:'resource',label:'UART1',base:'0x2000',size:'0x1000',target:{id:'ip'}},{id:'sram',kind:'resource',label:'SRAM',base:'0x4000',size:'0x100',resourceOffset:'0x200',target:{id:'ram'}},{id:'reserved',kind:'reserved',label:'保留',base:'0x5000',size:'0x100'}]}]} as any;
}
export function graph(data: any = soc(), deferAddressTargets = false, projectId = 'soc') {
 return graphFromResources(Object.entries(data).map(([type,items])=>({type:type as ResourceType,data:{[type]:items},file:'facts.json'})),{projectId,irVersion:'2.0',resources:[],entryDocuments:[],requiredFeatures:['registers','register-maps']},{root:process.cwd(),strict:true,deferAddressTargets});
}
const at = (g: ReturnType<typeof graph>, root: string, path: any[]) => queryElement(g,root,JSON.stringify(path)) as any;
const rejects = (mutate:(d:any)=>void, code:string) => {const d=soc();mutate(d);assert.throws(()=>graph(d),new RegExp(code));};

test('IR2 三段范围、局部身份、相邻分配和两个模板实例',()=>{
 const g=graph(),r=createAddressResolver(g).resolveRegion('soc','cpu','uart0');
 assert.equal(r.mappedBits,0x100n*8n);assert.equal(r.region.size,'0x1000');
 assert.equal(at(g,'cpu',[regionStep('uart0'),entryStep('ctrl')]).address,'0x1000');
 assert.equal(at(g,'cpu',[regionStep('uart1'),entryStep('ctrl')]).address,'0x2000');
 assert.equal(at(g,'ip',[entryStep('small')]).range.sizeBits,'0x10');
 assert.equal(at(g,'ip',[entryStep('wide')]).range.sizeBits,'0x40');
 assert.equal(at(g,'ip',[entryStep('wide')]).address,undefined);
 assert.equal(g.index.has('uart0'),false);
 assert.equal(at(g,'cpu',[regionStep('reserved')]).definitionId,undefined);
 assert.equal(at(g,'cpu',[regionStep('reserved')]).kind,'region');
});
test('碰撞使用项目 size，半开相邻不撞，非零空间下界不重复相加',()=>{
 rejects(d=>d.addressSpaces[0].regions[1].base='0x1100','ADDRESS_OVERLAP');
 const d=soc();d.addressSpaces[0].base='0x1000';d.addressSpaces[0].size='0x5000';assert.equal(at(graph(d),'cpu',[regionStep('uart0'),entryStep('ctrl')]).address,'0x1000');
 rejects(d=>{d.addressSpaces[0].base='1';},'ADDRESS_RANGE');
});
test('空块、非法目标、窗口/块循环与严格判别联合拒绝',()=>{
 rejects(d=>d.addressSpaces[0].regions[0].target.id='missing','ADDRESS_REFERENCE');
 rejects(d=>d.addressSpaces[0].regions[0].target.id='r','ADDRESS_REFERENCE');
 rejects(d=>{d.registerBlocks[0].entries=[];delete d.registerBlocks[0].size;},'ADDRESS_MAPPING_SIZE');
 rejects(d=>d.registerBlocks[0].entries=[{id:'loop',block:'ip',offset:'0'}],'ADDRESS_CYCLE');
 rejects(d=>d.addressSpaces[0].regions[3].target={id:'ram'},'SCHEMA');
 rejects(d=>{d.addressSpaces[0].mappings=[];},'SCHEMA');
 rejects(d=>d.addressSpaces[0].regions.push({id:'loop',kind:'window',label:'loop',base:'0x6000',size:'0x100',target:{id:'cpu'},targetBase:'0'}),'ADDRESS_CYCLE');
});
test('空间/数组上下界、对齐及 stride 的符号校验',()=>{
 rejects(d=>d.addressSpaces[0].size='0x1000','ADDRESS_RANGE');
 rejects(d=>d.addressSpaces[0].regions[0].alignment='0','ADDRESS_SIZE');
 rejects(d=>{d.addressSpaces[0].regions[0].count=2;},'ADDRESS_STRIDE');
 rejects(d=>{d.addressSpaces[0].regions[0].count=2;d.addressSpaces[0].regions[0].stride='0x100';},'ADDRESS_OVERLAP');
 rejects(d=>{const r=d.addressSpaces[0].regions[0];r.count=2;r.stride='0x3000';r.alignment='0x2000';},'ADDRESS_ALIGNMENT');
 rejects(d=>{d.addressSpaces[0].size='0x10000000000000001';},'ADDRESS_RANGE');
});
test('Block 原生单位：完整子块边界精确，内部子单位坐标保留',()=>{
 const d=soc();d.registers=[{id:'r',kind:'register',label:'R',width:8,fields:[]}];d.registerBlocks=[{id:'leaf',kind:'register-block',label:'leaf',addressUnitBits:8,size:'4',entries:[{id:'r',register:'r',offset:'1'}]},{id:'ip',kind:'register-block',label:'word',addressUnitBits:32,size:'1',entries:[{id:'child',block:'leaf',offset:'0'}]}];d.addressSpaces[0].addressUnitBits=32;
 const g=graph(d),result=at(g,'cpu',[regionStep('uart0'),entryStep('child'),entryStep('r')]);
 assert.equal(result.address,undefined);assert.equal(result.coordinate.unitIndex,'0x1000');assert.equal(result.coordinate.subUnitBitOffset,'8');assert.equal(result.range.lastAddress,undefined);assert.equal(result.range.lastBit.subUnitBitOffset,'15');
 assert.equal(createAddressResolver(g).resolveRegion('soc','cpu','uart0').mappedBits,32n);
 d.registerBlocks[0].size='3';assert.throws(()=>graph(d),/ADDRESS_UNIT/);
});
test('mappedSize 按位比较；Memory 默认长度使用空间单位',()=>{
 const d=soc();d.registerBlocks[0].addressUnitBits=32;d.registerBlocks[0].size='4';d.registerBlocks[0].entries=[{id:'ctrl',register:'r',offset:'0'}];d.addressSpaces[0].regions[0].mappedSize='16';
 assert.equal(createAddressResolver(graph(d)).resolveRegion('soc','cpu','uart0').mappedBits,128n);
 d.addressSpaces[0].regions[0].mappedSize='4';assert.throws(()=>graph(d),/ADDRESS_BLOCK_SLICE/);
 rejects(d=>d.addressSpaces[0].regions[0].resourceOffset='1','ADDRESS_BLOCK_SLICE');
 rejects(d=>d.addressSpaces[0].regions[2].mappedSize='0x101','ADDRESS_MAPPING_SIZE');
 rejects(d=>d.addressSpaces[0].regions[2].resourceOffset='0xFF0','ADDRESS_MEMORY_RANGE');
});
test('Memory 直接 alias 包括重复数组，同空间不重叠切片合法',()=>{
 rejects(d=>d.addressSpaces[0].regions.push({...d.addressSpaces[0].regions[2],id:'alias',base:'0x7000'}),'ADDRESS_MEMORY_ALIAS');
 rejects(d=>{const r=d.addressSpaces[0].regions[2];r.count=2;r.stride='0x1000';},'ADDRESS_MEMORY_ALIAS');
 const d=soc();d.addressSpaces[0].regions.push({...d.addressSpaces[0].regions[2],id:'second',base:'0x7000',resourceOffset:'0x300'});assert.equal(summary(graph(d)).counts.memory,1);
});
function bridge(data:any, mappedSize='0x100') {
 data.addressSpaces.push({id:'bridge',kind:'address-space',label:'Bridge',addressWidth:64,addressUnitBits:8,base:'0',size:'0x10000',regions:[{id:'win',kind:'window',label:'窗口',base:'0x8000',size:'0x1000',mappedSize,target:{id:'cpu'},targetBase:'0x1000'}]});return data;
}
test('Window 截断 Register 诊断，Block 可部分，完整槽位才能使用',()=>{
 const g=graph(bridge(soc(),'12'));
 const block=at(g,'bridge',[regionStep('win'),regionStep('uart0')]);assert.equal(block.partial,true);
 assert.equal(at(g,'bridge',[regionStep('win'),regionStep('uart0'),entryStep('ctrl')]).address,'0x8000');
 assert.throws(()=>at(g,'bridge',[regionStep('win'),regionStep('uart0'),entryStep('wide')]),/PARTIAL_REGISTER_WINDOW.*0x40040/);
 const full=graph(bridge(soc(),'16'));assert.equal(at(full,'bridge',[regionStep('win'),regionStep('uart0'),entryStep('wide')]).address,'0x8008');
});
test('多跳 Window 保留各空间、余数和交集，支持目标空洞/Reserved',()=>{
 const d=bridge(soc());d.addressSpaces.push({id:'outer',kind:'address-space',label:'outer',addressWidth:32,addressUnitBits:32,base:'0',size:'0x10000',regions:[{id:'out',kind:'window',label:'外层',base:'0x100',size:'0x40',target:{id:'bridge'},targetBase:'0x8000'}]});
 const result=at(graph(d),'outer',[regionStep('out'),regionStep('win'),regionStep('uart0'),entryStep('wide')]);
 assert.equal(result.address,'0x102');assert.deepEqual(result.coordinateChain.map((x:any)=>x.addressSpaceId),['outer','bridge','cpu']);
 const reserved=bridge(soc());reserved.addressSpaces[1].regions[0].targetBase='0x5000';assert.equal(at(graph(reserved),'bridge',[regionStep('win'),regionStep('reserved')]).entity.kind,'reserved');
 reserved.addressSpaces[1].regions[0].targetBase='0x6000';assert.doesNotThrow(()=>graph(reserved));
});
test('Window 到同一 Memory 是显式多路径，不构成直接 alias',()=>{
 const d=bridge(soc());d.addressSpaces[1].regions[0].targetBase='0x4000';d.addressSpaces[1].regions.push({id:'direct',kind:'resource',label:'直接',base:'0x1000',size:'0x100',resourceOffset:'0x200',target:{id:'ram'}});
 const g=graph(d),window=at(g,'bridge',[regionStep('win'),regionStep('sram')]),direct=at(g,'bridge',[regionStep('direct')]);assert.equal(window.definitionId,direct.definitionId);assert.equal(window.definitionId,'ram');
});
test('Window 重复目标必须精确、非重叠；所有末项边界符号计算',()=>{
 for(const stride of [undefined,'0','8']){const d=bridge(soc());const w=d.addressSpaces[1].regions[0];w.count=2;w.stride='0x1000';w.targetStride=stride;assert.throws(()=>graph(d),/ADDRESS_TARGET_STRIDE|ADDRESS_SIZE/);}
 const d=bridge(soc());d.addressSpaces[0].addressUnitBits=32;d.addressSpaces[1].regions[0].mappedSize='3';const partial=graph(d);assert.equal(createAddressResolver(partial).resolveRegion('soc','bridge','win').mappedBits,24n);assert.throws(()=>at(partial,'bridge',[regionStep('win'),regionStep('uart0'),entryStep('ctrl')]),/PARTIAL_REGISTER_WINDOW/);
});
test('十亿数组末项与有限投影，不先展开、不用 Number 计算地址', {timeout:3000},()=>{
 const d=soc();d.registerBlocks[0].entries=[{id:'ctrl',register:'r',offset:'0',count:1000000000,stride:'8'}];d.registerBlocks[0].size='0x200000000';d.addressSpaces[0].regions=[{id:'huge',kind:'resource',label:'huge',base:'0x1000000000000000',size:'0x200000000',target:{id:'ip'}}];
 const g=graph(d),r=at(g,'cpu',[regionStep('huge'),entryStep('ctrl',999999999)]);
 assert.equal(BigInt(r.address),0x1000000000000000n+999999999n*8n);
 const p=registerMapProjection(g,'ip',3),leaf=registerLeafProjection(g,'cpu',3);assert.equal(p.total,'1000000000');assert.equal(p.rows.length,3);assert.equal(leaf.directRegisterTotal,'1000000000');assert.equal(leaf.rows.length,3);
 assert.throws(()=>at(g,'ip',[entryStep('ctrl',1000000000)]),/ADDRESS_INDEX/);assert.throws(()=>at(g,'cpu',['huge','ctrl']),/ADDRESS_PATH/);
});
test('策略逐字段继承，alignment 保留声明单位；enums/effects 事实可查询',()=>{
 const d=soc();d.registerBlocks[0].accessPolicy={alignment:'4',allowedTransferBits:[32],readConsistency:'whole-register',splitOrder:'low-first'};
 d.registerBlocks.push({id:'parent',kind:'register-block',label:'父',addressUnitBits:32,accessPolicy:{byteOrder:'big'},entries:[{id:'ip',block:'ip',offset:'0'}]});
 const r=at(graph(d),'parent',[entryStep('ip'),entryStep('ctrl')]);assert.equal(r.accessPolicy.alignment.bitAlignment,'0x20');assert.equal(r.accessPolicy.alignment.addressUnitBits,8);assert.equal(r.accessPolicy.byteOrder,'big');assert.equal(r.accessPolicy.readConsistency,'whole-register');
 const f=query(graph(d),'r.en');assert.equal((f.target.entity as any).enums['1'],'使能');assert.equal((f.target.entity as any).readEffect,'none');
 d.registerBlocks[1].accessPolicy.alignment='4';delete d.registerBlocks[0].accessPolicy.alignment;const inherited=at(graph(d),'parent',[entryStep('ip'),entryStep('ctrl')]);assert.equal(inherited.accessPolicy.alignment.bitAlignment,'0x80');
});
test('枚举重复/越界、空 policy 覆盖与旧 atomic 严格拒绝',()=>{
 rejects(d=>d.registers[0].fields[0].enums={'1':'a','0x1':'b'},'REGISTER_ENUM_DUPLICATE');
 rejects(d=>d.registers[0].fields[0].enums={'2':'a'},'REGISTER_ENUM_RANGE');
 for(const policy of [{atomic:true},{alignment:'0'},{byteOrder:null},{allowedTransferBits:[32,32]}]) rejects(d=>d.registerBlocks[0].accessPolicy=policy,'SCHEMA|ADDRESS_SIZE');
});
test('外部引用仅内部 deferred；公开加载/query/summary 不能声称完整',()=>{
 const d=soc();d.addressSpaces[0].regions[0].target={project:'ip-project',id:'ip'};
 assert.throws(()=>graph(d),/ADDRESS_BOOK_CONTEXT/);
 const prepared=graph(d,true);assert.equal(prepared.addressValidation?.status,'deferred');assert.throws(()=>query(prepared,'cpu'),/ADDRESS_BOOK_CONTEXT/);assert.throws(()=>summary(prepared),/ADDRESS_BOOK_CONTEXT/);
 const remote=soc();delete remote.addressSpaces;delete remote.memories;
 const r=new ResourceResolver(new Map([['soc',prepared],['ip-project',graph(remote,false,'ip-project')]]));
 assert.equal(r.resolveInstance('soc','cpu',[regionStep('uart0'),entryStep('ctrl')]).definitionProjectId,'ip-project');
});
test('独立小枚举核验区间碰撞，含稀疏空洞与相邻边界',()=>{
 for(let a=0;a<9;a++)for(let b=0;b<9;b++)for(let n=1;n<5;n++){
  const left={start:BigInt(a),span:2n,count:BigInt(n),stride:5n},right={start:BigInt(b),span:1n,count:3n,stride:3n};let expected=false;
  for(let i=0n;i<left.count;i++)for(let j=0n;j<right.count;j++)if(left.start+i*5n<right.start+j*3n+1n&&right.start+j*3n<left.start+i*5n+2n)expected=true;
  assert.equal(intervalsOverlap(left,right),expected);
 }
});

test('地址点查询区分空洞/保留/未映射尾部，跨单位窗口余数不丢失',()=>{
 const d=soc();d.addressSpaces[0].regions[0].mappedSize='0x100';
 d.addressSpaces.push({id:'byte',kind:'address-space',label:'byte',addressWidth:32,addressUnitBits:8,base:'0',size:'0x10000',regions:[{id:'window',kind:'window',label:'window',base:'0x8000',size:'0x100',target:{id:'word'},targetBase:'0'}]},{id:'word',kind:'address-space',label:'word',addressWidth:32,addressUnitBits:32,base:'0',size:'0x100',regions:[]});
 const g=graph(d),point=(id:string,address:string)=>(queryElement(g,id,JSON.stringify({kind:'address',address})) as any).addressPoint;
 assert.equal(point('cpu','0x5000').status,'reserved');assert.equal(point('cpu','0x6000').status,'unallocated');assert.equal(point('cpu','0x1100').status,'unmapped');
 const fraction=point('byte','0x8001');assert.equal(fraction.coordinateChain[1].coordinate.unitIndex,'0x0');assert.equal(fraction.coordinateChain[1].coordinate.subUnitBitOffset,'8');assert.equal(fraction.coordinateChain[1].coordinate.address,undefined);
});
test('Memory 在窗口交集内返回物理切片，映射尾部不是可见 Memory',()=>{
 const d=bridge(soc(),'16');d.addressSpaces[1].regions[0].targetBase='0x4080';
 const memory=at(graph(d),'bridge',[regionStep('win'),regionStep('sram')]);
 assert.equal(memory.memorySlice.startBit,'0x1400');assert.equal(memory.memorySlice.endExclusiveBit,'0x1480');assert.equal(memory.partial,true);
});
test('公开 schema/入口拒绝旧 IR，而新资源可独立发现',()=>{
 const d=soc();assert.throws(()=>graphFromResources([{type:'registers',data:{registers:d.registers},file:'old.json'}],{projectId:'old',irVersion:'1.8',resources:[],entryDocuments:[]},{root:process.cwd()}),/IR_VERSION/);
});

test('稀疏交错数组的有限叶列表按地址归并，不先走完一个十亿数组', {timeout:3000},()=>{
 const d=soc();d.registerBlocks[0].entries=[{id:'a',register:'r',offset:'0',count:1000000000,stride:'8'},{id:'b',register:'r',offset:'4',count:1000000000,stride:'8'}];d.registerBlocks[0].size='0x200000000';d.addressSpaces=[];
 const p=registerLeafProjection(graph(d),'ip',4);assert.equal(p.directRegisterTotal,'2000000000');assert.deepEqual(p.rows.map(r=>r.relativeOffset!.address),['0x0','0x4','0x8','0xC']);
});

test('十亿 Window 目标末项由 targetStride 推导，目标余数可穿过第二个 Window', {timeout:3000},()=>{
 const d=soc();d.addressSpaces.push({id:'many',kind:'address-space',label:'many',addressWidth:64,addressUnitBits:8,base:'0',size:'0x10000000000000000',regions:[{id:'w',kind:'window',label:'w',base:'0x1000000000000000',size:'16',count:1000000000,stride:'256',target:{id:'cpu'},targetBase:'0',targetStride:'16'}]});
 const g=graph(d),p=(queryElement(g,'many',JSON.stringify({kind:'address',address:'0x'+(0x1000000000000000n+999999999n*256n+2n).toString(16)})) as any).addressPoint;
 assert.equal(BigInt(p.coordinateChain[1].coordinate.address),999999999n*16n+2n);assert.equal(registerMapProjection(g,'many',2).rows.length,2);
 const data=soc();data.addressSpaces=[{id:'a',kind:'address-space',label:'a',addressWidth:8,addressUnitBits:8,base:'0',size:'16',regions:[{id:'w',label:'w',kind:'window',base:'0',size:'16',target:{id:'b'},targetBase:'0'}]},{id:'b',kind:'address-space',label:'b',addressWidth:8,addressUnitBits:32,base:'0',size:'4',regions:[{id:'w',label:'w',kind:'window',base:'0',size:'4',target:{id:'c'},targetBase:'0'}]},{id:'c',kind:'address-space',label:'c',addressWidth:8,addressUnitBits:16,base:'0',size:'8',regions:[{id:'ram',label:'ram',kind:'resource',base:'0',size:'8',target:{id:'ram'}}]}];
 const q=(queryElement(graph(data),'a',JSON.stringify({kind:'address',address:'1'})) as any).addressPoint;
 assert.equal(q.status,'resource');assert.deepEqual(q.coordinateChain.map((x:any)=>x.coordinate.subUnitBitOffset),['0','8','8']);assert.equal(q.resourcePoint.address,'0x1');
});

test('Window 长度可落在目标地址单位内部；单跳/多跳按位包含，截断槽位严格诊断',()=>{
 const d=soc();d.registerBlocks.push({id:'tiny',kind:'register-block',label:'4字节块',addressUnitBits:8,size:'4',entries:[{id:'r',register:'r',offset:'0'}]});
 d.addressSpaces.push({id:'word-target',kind:'address-space',label:'32-bit目标',addressWidth:8,addressUnitBits:32,base:'0',size:'4',regions:[{id:'csr',kind:'resource',label:'CSR',base:'0',size:'1',target:{id:'tiny'}}]},
 {id:'half-middle',kind:'address-space',label:'16-bit中间',addressWidth:8,addressUnitBits:16,base:'0',size:'8',regions:[{id:'bridge',kind:'window',label:'转译',base:'2',size:'2',target:{id:'word-target'},targetBase:'0'}]},
 {id:'byte-source',kind:'address-space',label:'8-bit来源',addressWidth:8,addressUnitBits:8,base:'0',size:'8',regions:[{id:'single',kind:'window',label:'1字节',base:'2',size:'1',target:{id:'word-target'},targetBase:'0'},{id:'multi',kind:'window',label:'多跳1字节',base:'4',size:'1',target:{id:'half-middle'},targetBase:'2'}]});
 const g=graph(d),resolver=createAddressResolver(g);assert.equal(resolver.resolveRegion('soc','byte-source','single').mappedBits,8n);
 for(const [path,start]of [[[regionStep('single'),regionStep('csr'),entryStep('r')],16n],[[regionStep('multi'),regionStep('bridge'),regionStep('csr'),entryStep('r')],32n]] as const){
  assert.throws(()=>resolver.resolveInstance('soc','byte-source',[...path]),(error:any)=>{assert.equal(error.code,'PARTIAL_REGISTER_WINDOW');assert.equal(BigInt(error.details.visible.startBit),start);assert.equal(BigInt(error.details.visible.endExclusiveBit),start+8n);assert.equal(BigInt(error.details.slot.endExclusiveBit)-BigInt(error.details.slot.startBit),32n);return true;});
 }
 d.addressSpaces.at(-1).regions=[{id:'beyond',kind:'window',label:'超界',base:'0',size:'5',target:{id:'word-target'},targetBase:'3'}];assert.throws(()=>graph(d),/ADDRESS_RANGE/);
});

test('子单位 Window 阵列仍精确验证 targetStride，完整范围查询给出明确末地址',()=>{
 const d=soc();d.addressSpaces.push({id:'target-word',kind:'address-space',label:'word',addressWidth:8,addressUnitBits:32,base:'0',size:'8',regions:[]},{id:'source-byte',kind:'address-space',label:'byte',addressWidth:8,addressUnitBits:8,base:'0',size:'16',regions:[{id:'w',kind:'window',label:'重复窗口',base:'0',size:'1',count:2,stride:'2',targetStride:'1',target:{id:'target-word'},targetBase:'0'}]});
 const g=graph(d),r=createAddressResolver(g).resolveInstance('soc','source-byte',[regionStep('w',1)]);assert.equal(r.coordinate.address,'0x2');assert.equal(r.range.lastAddress,'0x2');assert.equal(r.range.lastBit!.bitPosition,'0x17');
 d.addressSpaces.at(-1).regions[0].size='5';d.addressSpaces.at(-1).regions[0].stride='5';assert.throws(()=>graph(d),/ADDRESS_TARGET_STRIDE/);
 const reg=at(graph(),'cpu',[regionStep('uart0'),entryStep('ctrl')]);assert.equal(reg.range.endExclusive.address,'0x1004');assert.equal(reg.range.lastAddress,'0x1003');
});
