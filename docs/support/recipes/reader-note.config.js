import {Markdoc} from 'edoc';

// 可独立保存为项目 docs/edoc.config.js；不依赖本工具仓库的其他文件。
export default {
  markdoc: {
    parse: {slots:true},
    tags: {
      'reader-note': {
        attributes: {tone:{type:String,matches:['info','warning'],default:'info',render:'data-tone'}},
        slots: {title:{required:true,render:false}},
        transform(node,context) {
          return new Markdoc.Tag('aside',{class:'panel',...node.transformAttributes(context)},[
            new Markdoc.Tag('div',{class:'panel-title'},node.slots.title.transformChildren(context)),
            ...node.transformChildren(context)
          ]);
        }
      }
    }
  }
};
