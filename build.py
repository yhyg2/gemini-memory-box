from pathlib import Path
import re
from ui_template import compile_ui

ROOT=Path(__file__).resolve().parent
HEADER='''// ==UserScript==
// @name         回忆匣 · Gemini
// @namespace    gemini-memory-box
// @version      {VERSION}
// @description  当前 Gemini 对话与附件本机打包 ZIP；仅导出、设置、脱敏诊断；无上传、统计或远程依赖。
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      self
// @connect      googleusercontent.com
// @connect      usercontent.google.com
// @connect      lh1.google.com
// @connect      lh2.google.com
// @connect      lh3.google.com
// @connect      lh4.google.com
// @connect      lh5.google.com
// @connect      lh6.google.com
// @connect      lh7.google.com
// @updateURL    none
// @downloadURL  none
// ==/UserScript==

(() => {
'use strict';
'''
FOOTER='''
if(typeof module!=='undefined'&&module.exports&&typeof window==='undefined'){
 module.exports={VERSION,DEFAULTS,settingsOf,ExportError,errorCode,explain,safeName,scrub,makeLogger,readLimited,
 geminiRoute,configFields,configFromHTML,approvedResource,responseShape,parseBatchResponse,parseHistoryPage,makeGeminiNetwork,
 collectHistory,selectTurns,discoverResources,canonicalResource,fullSizeURL,imageMime,acquireResource,publicResource,structuredSources,thoughtSummary,
 ZipWriter,memorySink,sha256,fileSink,uniqueFile,resourceFilename,exportArchive,checkCurrentAttachments,
 locateGeminiChat,metadataIDs,domMarkdown,collectPage,createPageCache,scanPageArea,htmlDocument,markdownDocument,UI_HTML,UI_CSS,mountApp,createUI,bootstrapApp};
}else if(typeof document!=='undefined'){
 bootstrapApp();
}
})();
'''
version=re.search(r"const VERSION='([^']+)'",(ROOT/'src/base.js').read_text(encoding='utf-8'))[1]
output=ROOT/'gemini-memory-box.user.js'
output.parent.mkdir(exist_ok=True)
output.write_text(HEADER.replace('{VERSION}',version)+'\n'.join((ROOT/'src'/name).read_text(encoding='utf-8') for name in ['base.js','common.js','protocol.js','attachments.js','page.js','export.js','style.js','ui.js'])+'\n'+compile_ui(ROOT,version)+(ROOT/'src/ui-dom.js').read_text(encoding='utf-8')+'\n'+(ROOT/'src/boot.js').read_text(encoding='utf-8')+FOOTER, encoding='utf-8', newline='\n')
print(output.name)
