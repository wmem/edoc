"""虚构板级工程 CSV → EngDoc；数值只来自项目源，不硬编码引脚或 Net。"""
import csv,json,os
from pathlib import Path
root=Path.cwd();out=Path(os.environ['ENGDOC_IR_OUTPUT']);out.mkdir(parents=True,exist_ok=True)
def csvrows(name):
 with(root/'board'/name).open(encoding='utf-8',newline='')as f:return list(csv.DictReader(f))
def src(name,selector):return {'file':'board/'+name,'selector':selector}
def save(name,data):(out/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def unique(rows):
 ids=[r['id']for r in rows]
 if len(ids)!=len(set(ids)):raise ValueError('项目源存在重复 ID')
devices=csvrows('devices.csv');pins=csvrows('pins.csv');nets=csvrows('nets.csv')
for rows in [devices,pins,nets]:unique(rows)
objects={d['id']:{'id':d['id'],'kind':'node','label':d['label'],'ports':[],'source':src('devices.csv',d['id'])}for d in devices}
relations={n['id']:{'id':n['id'],'kind':'connection','class':n['class'],'label':n['label'],'endpoints':[],'source':src('nets.csv',n['id'])}for n in nets}
for p in pins:
 if p['device']not in objects or p['net']not in relations:raise ValueError('源网表引用了未声明器件或 Net')
 if not p['direction']:raise ValueError('方向缺失，必须显式填写 unknown')
 port={'id':p['id'],'label':p['label'],'direction':p['direction'],'attributes':{k:p[k]for k in ['ball','pin','function']if p[k]},'source':src('pins.csv',p['id'])}
 if p['width']:port['width']=int(p['width'])
 objects[p['device']]['ports'].append(port);relations[p['net']]['endpoints'].append(p['id'])
projection=json.loads((root/'docs/projections.json').read_text());views=json.loads((root/'docs/views.json').read_text())
save('objects.json',{'objects':list(objects.values())+projection['groups']});save('relations.json',{'relations':list(relations.values())});save('views.json',views);save('tables.json',{'tables':projection['tables']})
save('manifest.json',{'irVersion':'1.0','projectId':'demo-board','adapterVersion':'1.0','resources':[{'type':n,'path':n+'.json'}for n in ['objects','relations','views','tables']],'entryDocuments':['docs/README.md','docs/ARCH.mdoc']})
