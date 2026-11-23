# 协议核对来源

核对日期：2026-11-01。

代码中的 ZIP、文件保存、离线阅读与界面样式来自回忆匣的本地实现。Gemini 适配器单独实现；以下为核对网页协议与页面结构时使用的维护者原始资料，不作为运行时依赖。

- Google Gemini 帮助：下载 Gemini Apps 数据，官方备份范围和流程。<https://support.google.com/gemini/answer/16920332?hl=en>
- dikelps / gemini-conversation-exporter：作者源码与说明，历史 RPC `hNvQHb`、分页游标、多账号路径和消息字段。<https://github.com/dikelps/gemini-conversation-exporter>
- 同一作者发布的脚本源码。<https://greasyfork.org/en/scripts/588720-gemini-conversation-exporter/code>
- Gemini Imgen Enhancer 作者源码：原文件 RPC `c8o8Fe`、图片媒体令牌、`gg`/`gg-dl` 路径及原文件 URL 的对应关系。<https://greasyfork.org/en/scripts/592510-gemini-imgen-enhancer/code>
- dlqn / gemini-markdown-exporter：作者记录的 `user-query`、`model-response`、`message-content` 和聊天历史 DOM 结构。<https://github.com/dlqn/gemini-markdown-exporter>
- MDN innerHTML 文档：强制 Trusted Types、无默认策略时字符串赋值会抛出 TypeError；1.0.1 据此补充启动限制回归。<https://developer.mozilla.org/en-US/docs/Web/API/Element/innerHTML>
- Google 官方中文数据导出说明，包含“我的活动记录 → Gemini 应用”、邮件链接和 ZIP 选项。<https://support.google.com/gemini/answer/16920332?hl=zh-Hans>

这些网页协议没有稳定的官方兼容承诺。当前脚本只使用明确列出的读取通路，未引入上述项目的上传、编辑、配额修改、分享或远程执行能力。

1.0.2 另核对了 OTLFrostA/gemini-exporter 的选择器及原生附件解析，以及 Liksu/llm-chat-exporter-extension 的 Gemini 内容入口和上传元数据布局。文件路径、内容快照 SHA 和修复对应关系见 GITHUB_REVIEW.md。
