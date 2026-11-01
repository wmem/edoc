# 环境记录

## 已验证

- Linux，Node.js 24.22.1；使用 Node 原生 TypeScript 类型擦除与内置 test runner。
- 运行与测试无第三方依赖，无需 npm install；包脚本仅调用 node。
- UTF-8 中文源码、JSON 和诊断正常；路径越界及 Linux 符号链接保护有自动测试。
- 可执行 CLI 文件必须保留 Git 的 executable 位；调用 `node packages/cli/engdoc.ts` 不依赖此位。

## 当前限制

- 环境未提供 tsc、Ajv 或其他第三方 JSON Schema 库；未执行 TypeScript 静态类型检查，原生执行成功不能替代它。
- 网络仅开放会话指定域名；未尝试绕过限制安装依赖。environment_status 工具和 /etc/codex/network-policy.json 在本环境未提供，未据此假设额外网络授权。
- P0 校验器覆盖仓库使用的 Schema 关键字，未知关键字拒绝加载，不是任意 JSON Schema 的完整实现。未来接入通用校验器时需要保持 IR 与诊断契约，并验证一致性。
- 当前一次加载全部分片，分片有单文件 16 MiB 保护；尚未验证超大工程的流式加载或性能。
- 未验证 Windows/macOS；Windows 用户先用 node 入口，不依赖 shebang 或 Unix 权限。符号链接及文件系统边界测试在目标平台还需复验。
- Chromium/X6/ELK/Markdoc/WaveDrom/Vite/Playwright 尚未安装或验证，不对绘图、离线 HTML 或 PDF 做成功声明。

## 构建状态

P0 的 validate/query 每次重新读取 IR，不保存增量状态或成功缓存，不使用文件内容 hash。工程恢复使用 Git commit/bundle，不把 Git 提交 ID 用作源文件变更检测。
