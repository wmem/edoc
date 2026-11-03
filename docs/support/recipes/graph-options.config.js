// 保存为自己工程的 docs/edoc.config.js；先准备 graph-options.json。
export default {
  documents: 'docs',
  views: [
    {
      id: 'author:hierarchy', kind: 'architecture', label: '父子层级与逻辑选集',
      include: {objects: ['author:control', 'author:subsystem', 'author:workers'], relations: ['author:configure', 'author:transmit', 'author:notify']},
      layout: {direction: 'LR', positions: [{objectId: 'author:control', x: 0, y: 180}, {objectId: 'author:rx', x: 400, y: 0}, {objectId: 'author:tx', x: 400, y: 260}]}
    },
    {
      id: 'author:group-overview', kind: 'architecture', label: '逻辑集合初始总览',
      include: {objects: ['author:control', 'author:subsystem', 'author:workers'], relations: ['author:configure', 'author:transmit', 'author:notify']},
      layout: {direction: 'LR', positions: [{objectId: 'author:control', x: 0, y: 180}, {objectId: 'author:rx', x: 400, y: 0}, {objectId: 'author:tx', x: 400, y: 260}]},
      display: {collapsedGroups: ['author:workers']}
    },
    {
      id: 'author:interface-default', kind: 'interface', label: '接口默认总览',
      include: {objects: ['author:host', 'author:device'], relations: ['author:command', 'author:ready', 'author:payload']},
      layout: {direction: 'LR'}, display: {interfaceMode: 'collapsed'}
    },
    {
      id: 'author:interface-override', kind: 'interface', label: '接口排序、侧边与局部展开',
      include: {objects: ['author:host', 'author:device'], relations: ['author:command', 'author:ready', 'author:payload']},
      layout: {
        direction: 'LR',
        portOrder: ['author:host.ready', 'author:host.command', 'author:device.ready', 'author:device.command'],
        interfaceOrder: ['author:host.stream', 'author:host.ctrl', 'author:device.stream', 'author:device.ctrl'],
        interfaceSides: {'author:host.ctrl': 'right', 'author:host.stream': 'right', 'author:device.ctrl': 'left', 'author:device.stream': 'left'}
      },
      display: {interfaceMode: 'collapsed', interfaceOverrides: {'author:host.ctrl': 'expanded'}, showPortAttributes: true, portAttributes: ['purpose']}
    }
  ]
};
