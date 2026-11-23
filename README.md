# 回忆匣 · Gemini

把当前 Gemini 对话中可读取的上下文和可下载的附件打包带走。换到新聊天时，可以把导出的 Markdown 和需要的附件作为背景资料，接着上次的进度继续。

导出在浏览器本机完成，ZIP 提供离线 HTML、Markdown 和原始 JSON，并保留消息与附件的对应关系。

## 安装

下面以电脑端 Chrome 和脚本猫（ScriptCat）为例。

### 1. 在 Chrome 里安装脚本猫

1. 打开扩展商店的脚本猫页面，点「添加至 Chrome」，再在弹窗里点「添加扩展程序」。[脚本猫（Chrome 应用商店）](https://chromewebstore.google.com/detail/scriptcat/ndcooeababalnlpkfedmmbbbgkljhpjf?hl=zh-CN)
2. 点击 Chrome 右上角的拼图图标「扩展程序」，找到「脚本猫」。可以点旁边的图钉，把它固定到工具栏。

### 2. 允许脚本猫运行用户脚本

1. 在 Chrome 地址栏输入 `chrome://extensions/` 并回车，找到脚本猫，确认扩展已启用。
2. **Chrome 138 及以上**，在脚本猫卡片上点「详细信息」，打开「允许用户脚本」。**Chrome 120–137**，打开扩展管理页右上角的「开发者模式」。[Chrome 用户脚本权限说明](https://developer.chrome.com/docs/extensions/reference/api/userScripts#enable_usage_of_the_userscripts_api)

### 3. 安装回忆匣脚本

1. 如果装过旧版回忆匣，先到原来的脚本管理器里停用旧版。1.0.4 使用了新的脚本标识，安装后需要重新设置偏好。
2. 用刚装好脚本猫的 Chrome 打开下面的安装链接。出现脚本猫的确认页后，核对名称是「回忆匣 · Gemini」、版本是 `1.0.4`，然后点「安装」。[安装回忆匣 · Gemini](https://raw.githubusercontent.com/yhyg2/gemini-memory-box/main/gemini-memory-box.user.js)
3. 点击工具栏上的脚本猫，再点齿轮进入管理面板。找到「回忆匣 · Gemini」，确认这一项的开关已打开。

如果安装链接只显示源码或下载了 `.user.js`，可以手动添加。复制网页上的完整源码，或用文本编辑器打开下载的文件并复制全部内容。打开脚本猫管理面板，点右上角的「新建脚本」，选择普通脚本，用复制的源码替换编辑器里的模板，再按 `Ctrl+S` 保存。回到管理面板确认脚本已启用。[脚本猫的手动安装说明](https://docs.scriptcat.org/docs/use/script_installation/#手动安装脚本)

已经在用 Tampermonkey（油猴）的读者也可以用同一个安装链接。回忆匣在一个脚本管理器里启用即可。

### 4. 打开 Gemini，刷新后确认按钮出现

1. 用安装了脚本猫的同一个 Chrome 用户资料打开 Gemini，登录后从左侧历史列表进入要导出的对话。[打开 Gemini 网页](https://gemini.google.com/)
2. **如果安装脚本前就已经打开了 Gemini，回到这个标签页，按 `F5` 或 `Ctrl+R` 刷新**，也可以点地址栏左侧的刷新按钮。如果 Gemini 正在回复，等回复完成再刷新。修改脚本权限或重新启用脚本后，也在 Gemini 标签页刷新一次。
3. 页面加载后，右下角出现「回忆匣 · Gemini」按钮，就可以点开导出面板。

如果右下角没看到按钮，留在 Gemini 标签页，点击工具栏的脚本猫图标，找「显示回忆匣 · Gemini」菜单项。如果菜单里也没有，检查脚本是否启用、Chrome 是否已允许脚本猫运行用户脚本，以及脚本猫是否有权访问 `gemini.google.com`。设置好后回到 Gemini 再刷新。

### 5. 导出 ZIP 并离线打开

1. 等当前回复结束，点击「回忆匣 · Gemini」→「导出当前对话 · ZIP」。弹出保存窗口时，选好文件夹并点「保存」。使用浏览器默认下载方式时，可以按 `Ctrl+J` 查找 ZIP。
2. 等回忆匣提示导出完成或 ZIP 已保存。找到 ZIP 后，右键选择「全部解压缩」，打开解压后目录里的 `打开我.html`。如果提示有待核对项，可以从这个页面查看导出报告和附件失败清单。

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
