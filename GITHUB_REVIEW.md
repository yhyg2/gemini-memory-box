# GitHub 源码对照与修复记录

核对日期：2026-11-01。下面是读取维护者源码后核对的数据布局和页面标记，未把这些项目作为运行时依赖，也未引入上传、账号管理、分享或侧栏管理功能。

| 来源 | 阅读的文件与内容快照 SHA | 核对内容 | 本版处理 |
| --- | --- | --- | --- |
| [OTLFrostA/gemini-exporter](https://github.com/OTLFrostA/gemini-exporter) | `scripts/framework/selectors/gemini.py`，`369366ec9b65ff8de6f78a80c229d85fee27c953` | model-response-content、语义消息、data-test-id 和 model-response-text 等标记 | 增加有顺序的聊天区和正文定位，去除嵌套重复，启动自检报告消息数量 |
| 同上 | `src/l1/parsers/gemini/rpc/sourceAttachments.ts`，`4ba89b864496c25cfe5f6cc4e001c32e78a53800` | 正文中的普通 URL 不能当作上传附件；下载地址和缩略图有区别 | 提示词文字与附件元数据分别扫描，保留原数据，下载通路保持 Google 资源白名单 |
| [Liksu/llm-chat-exporter-extension](https://github.com/Liksu/llm-chat-exporter-extension) | `src/adapters/gemini/normalize.js`，`f6f486704958452faefe3f82282d18f8243f0289` | 用户上传位于提示词同层的 `[0][4]`；类型 1 图片、3 文本文件、16 普通文件；文件下载槽位为 `[7][1]` | 修复整层被清除造成上传附件丢失的问题；只取文件下载槽，不保存缩略图或请求上传地址 |
| 同上 | `src/adapters/gemini/content.js`，`bf2b703a3950ce7f113a74d727d5fcf54d3b07e3` | 多账号路径、分页历史优先，以及图片/文件实际取回后再打包 | 保留当前账号与分页逻辑；加强端到端模拟和附件计数核对 |
| [dlqn/gemini-markdown-exporter](https://github.com/dlqn/gemini-markdown-exporter) | `gemini-markdown-exporter.user.js`，实际读取该文件 | chat-window-content、query-content、message-content、正文及界面操作区 | 增加容器和正文回退，避免复制/编辑/表格按钮和思考面板混入正文 |

额外保留已核对的 `dikelps/gemini-conversation-exporter` 分页与前后链验证思路，图片原文件解析通路沿用当前回忆匣实现。

验证时使用独立合成数据重建相同类型的数据布局，不复制用户聊天，不假设 GitHub 项目可以保证用户账号中的全部附件可下载。
