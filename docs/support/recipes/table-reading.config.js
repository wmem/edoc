// 虚构数据，仅用于表格阅读操作与规模验收。
export default {
  data: {
    tables: [{
      id: 'author:channels', kind: 'table', label: '1000 行虚构通道参数',
      columns: [
        {field: 'name', label: '通道', type: 'string'},
        {field: 'rate', label: '采样率', type: 'number', unit: 'Hz'},
        {field: 'enabled', label: '启用', type: 'boolean'},
        {field: 'detail', label: '补充数据', type: 'json'},
        {field: 'note', label: '说明', type: 'string'}
      ],
      rows: Array.from({length: 1000}, (_, i) => ({
        id: 'author:channel:' + (i + 1),
        values: {
          name: '通道 ' + (i + 1), rate: [2, 10, 100, 1000][i % 4],
          enabled: i % 3 !== 0,
          detail: {direction: i % 2 ? 'TX' : 'RX', group: Math.floor(i / 32)},
          ...(i % 7 === 0 ? {} : {note: i % 11 === 0 ? 'unknown' : '虚构参数'})
        }
      }))
    }]
  }
};
