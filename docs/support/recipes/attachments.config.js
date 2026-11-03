// 下载教程中的虚构 PDF，保存为项目 source/reference.pdf。
export default {
  attachments: {
    reference: {
      type: 'pdf', file: 'source/reference.pdf', title: '原文示例',
      targets: {home: {page: 1}}
    }
  }
};
