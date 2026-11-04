import type MarkdownIt from 'markdown-it' with {'resolution-mode':'require'};

// Markdoc 0.5.11 的声明使用新版名称；以现有 Options 精确补齐别名，
// 保持 NodeNext/Bundler 都能解析的 CommonJS 声明，不引入额外解析器。
declare module 'markdown-it' {
 type MarkdownItOptions = MarkdownIt.Options;
}
