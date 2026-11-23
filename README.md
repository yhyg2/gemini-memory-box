# 回忆匣 · Gemini

把当前 Gemini 对话中可读取的上下文和可下载的附件打包带走。换到新聊天时，可以把导出的 Markdown 和需要的附件作为背景资料，接着上次的进度继续。

导出在浏览器本机完成，ZIP 提供离线 HTML、Markdown 和原始 JSON，并保留消息与附件的对应关系。

## 安装

1. 下载或打开仓库根目录的 `gemini-memory-box.user.js`，导入脚本猫或 Tampermonkey。
2. 如果装过旧版回忆匣，请先停用旧脚本。1.0.4 使用新的脚本标识，偏好需要重新设置。
3. 打开 [Gemini 网页](https://gemini.google.com/)，进入已保存的聊天，等回复结束后点击右下角的「回忆匣 · Gemini」，再选择「导出当前对话 · ZIP」。
4. 完整解压导出的 ZIP，打开「打开我.html」。找不到入口时，可在脚本管理器菜单选择「显示回忆匣 · Gemini」。

## 导出范围

- **当前对话**。自动读取当前分支的分页历史。设置中可选 HTML、Markdown、图片、文件、音视频、已返回的思考摘要和生成源码。生成源码另存为文本。
- **附件状态**。原件不可用时可保存展示版，并标记原件待核实。未取得的资源列入失败清单。本机已有文件时，可在设置里选择文件补入当前对话。
- **保存位置**。浏览器支持文件选择器时可先选择保存位置。使用浏览器下载方式时，整包内存上限为 128 MiB。较大的备份建议使用文件选择器。
- **完整性**。报告说明所选范围、缺失项和待核实项，ZIP 内提供 SHA-256 校验清单。网页接口可能变化，删除、失效或未返回的内容可能无法取得。

## 隐私

导出由当前浏览器完成。脚本无遥测、第三方上传、远程脚本依赖或自动更新。读取当前对话使用当前 Gemini 登录上下文，附件请求限于明确允许的 Google 下载域名和路径。部分受限资源使用浏览器为目标域提供的 Cookie，脚本不将 Gemini 会话参数复制到附件下载请求。

诊断记录阶段、错误类型和计数。实际导出的 ZIP 含聊天、原始数据和附件，且未加密。提交 GitHub 问题时，请不要附上真实导出包、登录信息、原始响应或带签名的链接。

本项目是独立工具。需要账号范围的官方归档时，可使用 [Google Takeout](https://takeout.google.com/)。

## 开发

需要 Node.js 22+ 和 Python 3。浏览器脚本不需要安装开发依赖。

```sh
npm ci
npm test
python3 tests/static_validate.py
```

`npm run build` 从 `src/` 生成根目录用户脚本。`npm run preview` 重新生成离线界面预览 `preview.html`。`npm run test:browser` 运行合成浏览器场景，可用 `CHROMIUM_EXECUTABLE` 指定 Chromium，也可先运行 `npx playwright install chromium`。测试数据为合成输入。

协议和页面结构参考见 [SOURCES.md](SOURCES.md) 与 [GITHUB_REVIEW.md](GITHUB_REVIEW.md)。
