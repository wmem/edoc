"""限定 ANSI 声明子集的 RTL 文档 Adapter；不声称自动理解任意 SystemVerilog。"""
import json,re,os,ast
from pathlib import Path
root=Path.cwd();out=Path(os.environ['ENGDOC_IR_OUTPUT']);out.mkdir(parents=True,exist_ok=True)
text=(root/'rtl/mac_example.sv').read_text();params={k:int(v)for k,v in re.findall(r'parameter\s+(\w+)\s*=\s*(\d+)',text)}
sem=json.loads((root/'project/semantics.json').read_text())
def expr(expression):
 def calc(n):
  if isinstance(n,ast.Constant)and isinstance(n.value,int):return n.value
  if isinstance(n,ast.Name):return params[n.id]
  if isinstance(n,ast.BinOp)and isinstance(n.op,(ast.Add,ast.Sub,ast.Mult)):return {ast.Add:lambda a,b:a+b,ast.Sub:lambda a,b:a-b,ast.Mult:lambda a,b:a*b}[type(n.op)](calc(n.left),calc(n.right))
  raise ValueError('未支持的参数表达式')
 return calc(ast.parse(expression,mode='eval').body)
ports=[]
for direction,rng,name in re.findall(r'^\s*(input|output|inout)\s+logic\s*(\[[^\]]+\])?\s*(\w+)\s*[,)]?',text,re.M):
 p={'id':'mac:top.'+name,'label':name,'direction':{'input':'in','output':'out','inout':'inout'}[direction],'source':{'file':'rtl/mac_example.sv','selector':'mac_example.'+name}}
 if rng:
  a,b=rng[1:-1].split(':');p['widthExpr']=rng;p['parameterContext']=params
  try:p['width']=abs(expr(a)-expr(b))+1
  except(KeyError,ValueError,SyntaxError):pass
 else:p['width']=1
 if name not in ['clk','aresetn']:p['clockDomainId']='mac:top.'+sem['clock']
 ports.append(p)
if not ports:raise ValueError('未找到受支持的端口声明')
node={'id':'mac:top','kind':'node','label':'MAC component','ports':ports,'source':{'file':'rtl/mac_example.sv','selector':'mac_example'}}
table={'id':'mac:port-table','kind':'table','label':'RTL 接口投影','columns':[{'field':f,'label':l,'type':t}for f,l,t in [('label','信号','string'),('direction','方向','string'),('width','位宽','number'),('widthExpr','参数表达式','string')]],'rows':[{'id':'mac:row.'+p['label'],'objectId':p['id']}for p in ports]}
wave={'id':'mac:tx-handshake','kind':'waveform','label':'AXI-Stream 握手与反压','format':'wavejson','semantic':'specification','source':{'file':'project/handshake.json','selector':'handshake'},'data':json.loads((root/'project/handshake.json').read_text())}
resources={'objects':{'objects':[node]+sem['nodes']+sem['groups']},'relations':{'relations':sem['relations']},'views':{'views':sem['views']},'tables':{'tables':[table]},'waveforms':{'waveforms':[wave]},'references':{'references':sem['references']}}
for name,data in resources.items():(out/(name+'.json')).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(out/'manifest.json').write_text(json.dumps({'irVersion':'1.0','projectId':'mac-demo','adapterVersion':'1.0','resources':[{'type':n,'path':n+'.json'}for n in resources],'entryDocuments':['docs/README.mdoc','docs/SPEC.mdoc','docs/ARCH.mdoc','docs/VERIFY.mdoc']},indent=2)+'\n')
