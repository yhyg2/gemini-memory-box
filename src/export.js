function safeMarkdown(text){
  return String(text||'').split(/(`{3,}[^\n]*\n[\s\S]*?\n`{3,}|~~~[\s\S]*?~~~|`[^`\n]*`)/g).map((part,i)=>i%2?part:part.replace(/!\[/g,'[原文图片引用] [').replace(/<\/?[A-Za-z][^>]*>/g,htmlEscape).replace(/\]\(\s*(?:javascript|data):[^)]*\)/gi,']（不执行的链接）')).join('');
}
function mdLabel(value){return htmlEscape(String(value||'').replace(/[\r\n]/g,' ').replace(/([\\`*_{}\[\]])/g,'\\$1'));}
function markdownDocument(title,messages,assets){
  const out=[`# ${mdLabel(title)}`,'','Gemini 对话。精确文本及服务器返回数据见「原始对话.json」；本阅读版不内嵌外部图片。',''];
  for(const m of messages){
    out.push(`## ${m.role==='user'?'你':'Gemini'}${m.time?' · '+m.time:''}`,'',safeMarkdown(m.text)||'（此消息的内容为附件或结构化数据。）','');
    if(m.thoughts)out.push('### 思考摘要','',safeMarkdown(m.thoughts),'');
    for(const s of m.sources||[])if(s.path)out.push(`[生成源码 · ${mdLabel(s.language)}](${mdPath(s.path)})`,'');
    for(const a of assets.filter(a=>a.occurrences.some(o=>o.message_id===m.message_id))){
      if(a.status==='saved')out.push(`${a.kind==='images'&&!/svg/i.test(a.mime||'')?'!':''}[${mdLabel(a.name||leafOf(a.path))}](${mdPath(a.path)})${a.providedLocally?'（本机补入，原文件一致性未核实）':a.kind==='images'&&!a.originalVerified?'（'+(a.pageCopy?'页面副本，原文件未核实':'原图未核实')+'）':''}`,'');
      else out.push(`> 附件：${mdLabel(a.name||'未命名附件')} — ${a.status==='excluded'?'按设置未下载':explain(a.error)}`,'');
    }
  }
  return out.join('\n')+'\n';
}
function htmlDocument(title,messages,assets,report){
  let body=`<h1>${htmlEscape(title)}</h1><div class="subtitle">回忆匣 · Gemini · ${messages.length} 条所选消息<br>离线阅读；附件保存在同一 ZIP 中。</div>`;
  if(report.result!=='complete')body+='<div class="notice">这份导出有未完成或待核实项。请查看「导出报告.json」和「附件失败清单.json」。页面模式不能证明历史完整。</div>';
  const shown=new Set();
  for(const m of messages){const linked=assets.filter(a=>a.occurrences.some(o=>o.message_id===m.message_id));linked.forEach(a=>shown.add(a.number));
    const thoughts=m.thoughts?`<details><summary>思考摘要</summary><div class="body">${htmlEscape(m.thoughts)}</div></details>`:'';
    const sources=(m.sources||[]).filter(s=>s.path).map(s=>`<p><a href="${htmlEscape(mdPath(s.path))}" download>生成源码 · ${htmlEscape(s.language)}（文本备份）</a></p>`).join('');
    body+=`<article class="turn ${m.role==='user'?'user':'assistant'}"><div class="label">${m.role==='user'?'你':'Gemini'}${m.time?' · '+htmlEscape(m.time):''}</div><div class="bubble"><div class="body">${htmlEscape(m.text||'（此消息为附件或结构化数据。）')}</div>${thoughts}${sources}${linked.map(a=>assetHTML(a)+(a.kind==='images'&&a.status==='saved'&&!a.originalVerified?'<div class="small">原图未核实，已在报告中标注。</div>':'')).join('')}</div></article>`;
  }
  const extra=assets.filter(a=>!shown.has(a.number));if(extra.length)body+=`<section class="index-card"><h2>页面补充及所选文字外的附件</h2>${extra.map(assetHTML).join('')}</section>`;
  return readerShell(title,body+'<footer>原始数据保留在 ZIP 中；该阅读页不执行脚本、不连接网络。</footer>');
}
function resourceFilename(a,file){
  let name=safeName(file.name||a.name||`附件_${a.number}`,'附件',120);
  if(a.kind==='images')name=name.replace(/\.[A-Za-z0-9]{1,10}$/,'')+(file.pageCopy?'_页面副本':'')+extensionFor(file.mime);
  else if(!/\.[A-Za-z0-9]{1,10}$/.test(name))name+=extensionFor(file.mime);
  return String(a.number).padStart(4,'0')+'_'+name;
}
function indexDocument(report){
  return readerShell('回忆匣 · Gemini · 打开我',`<h1>Gemini 的回忆，已经装好。</h1><div class="subtitle">回忆匣 Gemini ${VERSION}<br>${htmlEscape(report.created_at)}</div><div class="notice">${report.result==='complete'?'本次接口返回的所选范围已核对完成。':'ZIP 已生成，仍有未完成或待核实项。'}<br>历史 ${report.history_pages} 页 · ${report.turns} 轮 · 所选文字 ${report.messages} 条。<br>附件项保存 ${report.attachments_saved}/${report.attachments_selected}；实际文件 ${report.unique_attachment_files} 份；失败 ${report.attachments_failed}；未选 ${report.attachments_excluded}。<br>原图未核实 ${report.images_unverified}；本机补入待核实 ${report.local_files_unverified}；外部引用 ${report.references}。<br>思考摘要 ${report.thought_summaries_saved} 轮；生成源码 ${report.structured_sources_saved} 份。<br>先完整解压 ZIP，再打开聊天记录。</div><div class="index-card">${report.settings.html?'<p><a href="聊天记录.html">打开离线聊天记录</a></p>':''}${report.settings.markdown?'<p><a href="聊天记录.md">打开 Markdown</a></p>':''}${report.settings.thoughts?'<p><a href="思考摘要.txt">思考摘要文本</a></p>':''}<p><a href="生成内容清单.json">生成源码清单</a></p><p><a href="原始对话.json">原始数据</a> · <a href="导出报告.json">导出报告</a></p><p><a href="附件失败清单.json">未取得的附件</a> · <a href="附件待核实清单.json">已保存待核实的附件</a></p></div><footer>范围：当前对话的接口返回内容，包括已返回的摘要和源码；未返回的 Canvas 版本、外部产品内部文件、已删除内容及其他分支不在范围内。页面模式始终为部分记录。ZIP 没有加密，请按原聊天资料保管。</footer>`);
}
async function exportArchive({net,zip,route,settings:input,signal,log,progress,dom=[],pageMessages=[],localFiles=[],title='Gemini 对话'}){
  const settings=settingsOf(input),checks=[],contentFiles=new Map(),report={app:'回忆匣 Gemini',version:VERSION,created_at:new Date().toISOString(),result:'partial',settings,source_mode:settings.mode,history_complete:false,history_pages:0,turns:0,messages:0,warnings:[],attachments_selected:0,attachments_saved:0,attachments_failed:0,attachments_excluded:0,unique_attachment_files:0,duplicate_content_reused:0,images_unverified:0,local_files_unverified:0,original_download_failures:0,filename_references_ignored:0,internal_resources_ignored:0,thought_summaries_saved:0,structured_sources_saved:0,references:0,coverage:'当前已保存对话及返回中的展示摘要、结构化源码；历史模式读取当前分支。未返回的侧栏版本、已删除记录和分支不在范围内。'};
  const add=async(path,value)=>{const check=await zip.add(path,value);checks.push(check);return check;};
  try{
    if(!route)throw new ExportError('NO_CONVERSATION');
    if(!settings.includeUser&&!settings.includeGemini&&!settings.images&&!settings.files&&!settings.media&&!settings.thoughts&&!settings.sources)throw new ExportError('NO_CONTENT_SELECTED');
    let messages,raw;
    if(settings.mode==='history'){
      const history=await collectHistory({net,route,signal,log,progress}),selected=selectTurns(history.rawTurns,route);
      messages=selected.messages;report.warnings.push(...selected.warnings);report.history_complete=true;report.history_pages=history.pages.length;report.turns=selected.turns.length;
      raw={platform:'Gemini',version:VERSION,source:'history-rpc',conversation_id:route.id,account_slot:route.slot,order:'pages-newest-first',pages:history.pages};
    }else{
      if(!pageMessages.length)throw new ExportError('EMPTY_HISTORY');
      messages=pageMessages;report.warnings.push('PAGE_ONLY');report.turns=pageMessages.filter(m=>m.role==='user').length;
      raw={platform:'Gemini',version:VERSION,source:'loaded-page',conversation_id:route.id,note:explain('PAGE_ONLY'),messages:pageMessages.map(({raw,...m})=>m)};
    }
    await add('原始对话.json',jsonText(scrub(raw)));log.add('TEXT_CAPTURED',{total:messages.length});
    // Role switches control readable messages. Raw server payload is always retained.
    const sourceList=[],thoughts=[];
    for(const m of messages){
      if(settings.thoughts&&m.thoughts){thoughts.push({message_id:m.message_id,turn_number:m.turn_number,time:m.time,text:m.thoughts,raw:scrub(m.raw?.[37]||null)});}
      if(settings.sources)for(const [j,s]of (m.sources||[]).entries()){
        const language=safeName(s.language,'code',40),path=`生成内容/第${String(m.turn_number||1).padStart(4,'0')}轮_代码${String(j+1).padStart(3,'0')}.${language}.txt`;
        const check=await add(path,s.code);s.path=path;
        sourceList.push({message_id:m.message_id,turn_number:m.turn_number,language:s.language,path,also_in_message:Boolean(m.text?.includes(s.code)),size_bytes:check.size_bytes,sha256:check.sha256});
      }
    }
    report.thought_summaries_saved=thoughts.length;report.structured_sources_saved=sourceList.length;
    if(settings.thoughts){await add('思考摘要.json',jsonText(thoughts));await add('思考摘要.txt',thoughts.map(m=>`第 ${m.turn_number} 轮 · ${m.time}\n\n${m.text}`).join('\n\n')+'\n');}
    await add('生成内容清单.json',jsonText(sourceList));
    const visible=messages.filter(m=>m.role==='user'?settings.includeUser:settings.includeGemini).map(m=>({...m,thoughts:settings.thoughts?m.thoughts:'',sources:settings.sources?m.sources:[]}));report.messages=visible.length;
    const resources=discoverResources(messages,settings.pageAssist?dom:[]),references=resources.filter(a=>a.reference),assets=resources.filter(a=>!a.reference);
    for(const a of references){a.status='reference';a.error='EXTERNAL_REFERENCE';}
    report.filename_references_ignored=resources.inventory.filename_references;report.internal_resources_ignored=resources.inventory.internal_resources;report.context_cache_entries_ignored=resources.inventory.context_cache_entries;
    report.references=references.length;log.add('RESOURCE_INVENTORY',{total:assets.length,skipped:references.length+report.internal_resources_ignored+report.filename_references_ignored});
    log.add('CONTENT_EXTRAS_SAVED',{success:thoughts.length,total:sourceList.length});
    for(let i=0;i<assets.length;i++){
      checkAbort(signal);const a=assets[i];progress?.({stage:'attachment',asset:i+1,assetTotal:assets.length});
      if(!settings[a.kind]){a.status='excluded';report.attachments_excluded++;continue;}
      report.attachments_selected++;
      let file;try{file=await acquireResource(a,{net,route,settings,signal,log,localFiles});}
      catch(e){if(['CANCELLED','WRONG_PAGE'].includes(errorCode(e)))throw e;a.status='failed';a.error=errorCode(e);report.attachments_failed++;log.add(a.error,{index:i+1,status:e.status||0},'warn');continue;}
      const digest=await sha256(file.bytes),duplicate=contentFiles.get(digest+'|'+file.mime);
      const path=duplicate?duplicate.path:'附件/'+resourceFilename(a,file),check=duplicate?{size_bytes:file.bytes.length,sha256:digest}:await add(path,file.bytes);
      if(duplicate){a.content_reused_from=duplicate.number;report.duplicate_content_reused++;}else{contentFiles.set(digest+'|'+file.mime,{path,number:a.number});report.unique_attachment_files++;}
      Object.assign(a,{status:'saved',path,name:file.name||a.name||leafOf(path),mime:file.mime,size_bytes:check.size_bytes,sha256:check.sha256,pageCopy:Boolean(file.pageCopy),originalVerified:Boolean(file.originalVerified),providedLocally:Boolean(file.providedLocally),strategy:file.strategy});
      if(a.providedLocally)report.local_files_unverified++;
      if(a.kind==='images'&&!a.originalVerified)report.images_unverified++;
      report.attachments_saved++;log.add('ATTACHMENT_SAVED',{index:i+1,bytes:check.size_bytes,strategy:a.strategy});file=null;
    }
    report.original_download_failures=assets.reduce((n,a)=>n+(a.attempts||[]).filter(x=>x.strategy==='native-original').length,0);
    report.result=report.history_complete&&!report.warnings.length&&!report.attachments_failed&&!report.images_unverified&&!report.local_files_unverified&&!report.references?'complete':'partial';
    report.warnings=[...new Set(report.warnings)];report.warning_messages=report.warnings.map(explain);
    if(settings.markdown)await add('聊天记录.md',markdownDocument(title,visible,assets));
    if(settings.html)await add('聊天记录.html',htmlDocument(title,visible,assets,report));
    await add('附件清单.json',jsonText(assets.map(publicResource)));
    await add('资源引用清单.json',jsonText(references.map(publicResource)));
    await add('附件失败清单.json',jsonText(assets.filter(a=>a.status==='failed').map(publicResource)));
    await add('附件待核实清单.json',jsonText(assets.filter(a=>a.status==='saved'&&(a.providedLocally||a.kind==='images'&&!a.originalVerified)).map(publicResource)));
    await add('导出报告.json',jsonText(report));await add('打开我.html',indexDocument(report));
    await add('导出说明.txt',`回忆匣 Gemini ${VERSION}\n\n先完整解压 ZIP，再打开「打开我.html」。\n原始对话.json 保留本次返回的所有候选及消息，不受阅读版角色开关影响；独立凭据字段和 URL 查询签名脱敏。\n附件/ 中只有实际取到的文件。完全相同的文件共用存储路径，附件清单保留各自关联。\n附件失败清单.json 只列未取得的附件。附件待核实清单.json 单列已保存但原图或原文件一致性未核实的内容。\n导出报告.json 区分附件项、实际文件数、原图失败次数、引用元数据及内部资源。引用元数据和内部 sidecar 仍在原始 JSON 中，不按附件下载失败计数。\n思考摘要按设置保存展示文本及其原始字段。生成内容/ 按设置保存本次返回的结构化代码块，均使用 .txt 后缀，不自动执行。它们可能与正文代码块重复，不代表 Canvas 的全部版本已被取得。\n文件校验.json 提供各数据文件 SHA-256。\n日志诊断.json 只含阶段、计数、错误类型和允许的域名，不包含聊天正文、标题、文件名、链接路径、查询参数或登录凭据。\n\n图片原图通路失败后保留可下载的显示版，仍列为待核实。\n本机文件仅用于同名附件下载失败后的补入；始终标记来源，不能据此证明与平台原文件逐字节相同。多个同名文件不会自动配对。\n页面模式始终不是完整历史。未返回的 Canvas/Deep Research 版本、Drive/YouTube 等外部产品内部文件不会被自动读取。\nZIP 未加密；脚本不上传、不建立分享链接。\n`);
    log.add(report.result==='complete'?'EXPORT_VERIFIED':'EXPORT_INCOMPLETE',{success:report.attachments_saved,failed:report.attachments_failed});
    await add('日志诊断.json',jsonText(log.snapshot()));
    await zip.add('文件校验.json',jsonText({algorithm:'SHA-256',note:'所有数据文件；不包含清单自身和 ZIP 元数据。',files:checks}));
    progress?.({stage:'packaging'});await zip.finish();return report;
  }catch(e){await zip.abort().catch(()=>{});log.add(errorCode(e),{},'error');throw e;}finally{net.clear();}
}
async function checkCurrentAttachments({net,route,settings:input,signal,log,dom=[],pageMessages=[]}){
  const settings=settingsOf(input),results=[];
  try{
    const messages=settings.mode==='history'?selectTurns((await collectHistory({net,route,signal,log})).rawTurns,route).messages:pageMessages;
    const items=discoverResources(messages,settings.pageAssist?dom:[]).filter(a=>!a.reference&&settings[a.kind]),selected=[];
    for(const choose of [a=>a.media_token,a=>a.kind==='files',a=>true]){const a=items.find(a=>choose(a)&&!selected.includes(a));if(a&&selected.length<2)selected.push(a);}
    for(const a of selected){checkAbort(signal);try{
      const file=await acquireResource(a,{net,route,settings:{...settings,maxFileMiB:8},signal,log});
      results.push({kind:a.kind,status:'passed',bytes:file.bytes.length,original_verified:Boolean(file.originalVerified),page_copy:Boolean(file.pageCopy)});
    }catch(e){if(['CANCELLED','WRONG_PAGE'].includes(errorCode(e)))throw e;results.push({kind:a.kind,status:errorCode(e)==='FILE_TOO_LARGE'?'size-limit':'failed',code:errorCode(e)});}}
    const passed=results.filter(r=>r.status==='passed').length;log.add('ATTACHMENT_CHECK_DONE',{success:passed,total:results.length,failed:results.length-passed});return {passed,tested:results.length,results};
  }finally{net.clear();}
}
