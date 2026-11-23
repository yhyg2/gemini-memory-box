const UI_HTML=`
<button class="launch" id="launch" aria-label="打开回忆匣 Gemini">${BOX_ICON}<span>回忆匣 · Gemini</span></button>
<section class="panel" id="panel" hidden aria-label="回忆匣 Gemini 导出面板">
  <header class="head"><div class="mark">${BOX_ICON}</div><div class="brand"><strong>回忆匣 · Gemini</strong><small>对话与附件导出</small></div><button class="icon" id="close" aria-label="收起">−</button></header>
  <nav class="nav" aria-label="功能"><button class="active" data-tab="home">导出</button><button data-tab="settings">设置</button><button data-tab="logs">日志诊断</button></nav>
  <div class="view" data-view="home"><h2 class="intro">把聊过的，好好留下。</h2><p class="lead">Gemini 的文字与附件，一起装进 ZIP。<br>完整解压后，就能离线翻看。</p>
    <div class="scope-card"><div class="kicker">当前 Gemini 对话</div><div class="current" id="current-title">请先打开聊天窗口</div><div class="meta" id="format-tags"></div></div>
    <div class="destination">${FOLDER_ICON}<span id="destination-summary">先选择 ZIP 保存位置</span></div><button class="primary" id="export">导出当前对话 · ZIP</button>
    <div class="status" id="status" hidden role="status" aria-live="polite"><div class="status-title" id="status-title"></div><div class="status-copy" id="status-copy"></div><progress id="progress" hidden aria-label="导出进度"></progress><button class="cancel" id="cancel" hidden>取消本次操作</button></div>
    <div class="privacy">${SHIELD_ICON}<span>本机打包 · 无上传与统计 · 无远程依赖</span></div>
  </div>
  <div class="view" data-view="settings" hidden><fieldset id="settings-fields">
    <section class="section"><h3>提取方式</h3><select class="form-control" data-setting="mode" aria-label="提取方式"><option value="history">当前对话的完整历史（推荐）</option><option value="page">页面补救：仅本次已加载消息</option></select><p class="subnote">历史模式自动读取分页并核对顺序，通常无需先划完整个窗口。页面补救模式始终标记为部分记录。只处理当前聊天，不读取历史列表。</p></section>
    <section class="section"><h3>ZIP 里放什么</h3><div class="choices"><label class="row"><input type="checkbox" data-setting="html"><span>离线聊天阅读版</span></label><label class="row"><input type="checkbox" data-setting="markdown"><span>Markdown 文字版</span></label><label class="row"><input type="checkbox" data-setting="images"><span>图片附件</span></label><label class="row"><input type="checkbox" data-setting="files"><span>文件与代码附件</span></label><label class="row"><input type="checkbox" data-setting="media"><span>音频与视频附件</span></label><label class="row"><input type="checkbox" data-setting="thoughts"><span>思考摘要<small>保存接口已返回的展示摘要。</small></span></label><label class="row"><input type="checkbox" data-setting="sources"><span>生成的小程序与代码源码<small>返回中的结构化代码块，另存为文本文件。</small></span></label></div><p class="subnote">原始 JSON、附件清单、完整性报告和诊断日志始终保留。原图优先；页面副本与缺失附件会注明。</p></section>
    <section class="section"><h3>补入下载失败的本机原文件</h3><div class="inline"><button class="secondary" id="choose-local-files">选择本机文件</button><button class="secondary" id="clear-local-files">清除选择</button><input id="local-files" type="file" multiple hidden></div><p class="small" id="local-files-summary">未选择本机文件</p><p class="subnote">只在对应附件下载失败时按文件名配对；多个同名文件不会自动配对。补入项标为“本机补入，原文件一致性未核实”。文件仅在本页使用，不上传；切换聊天或账号后清空。</p></section>
    <section class="section"><h3>阅读版显示谁的文字</h3><div class="choices"><label class="row"><input type="checkbox" data-setting="includeUser"><span>我的消息</span></label><label class="row"><input type="checkbox" data-setting="includeGemini"><span>Gemini 的回复</span></label></div><p class="subnote">只影响 HTML 和 Markdown 的文字显示。原始 JSON 保留本次接口返回的整段对话和候选回复；附件由上方开关选择。</p></section>
    <section class="section"><h3>页面图片补充</h3><label class="row"><input type="checkbox" data-setting="pageAssist"><span>记住本页已加载的图片<small>仅本页内存保存；切换账号、聊天或刷新后清空。</small></span></label><div class="inline"><button class="secondary" id="scan-page">辅助加载图片</button><span class="small" id="cache-summary">尚未收集</span></div><p class="subnote">需要补充页面图片时使用。分段滚动最多 5 分钟，可随时停止；不会使过期附件重新生成。页面补救模式仍只导出点击时加载的消息。</p></section>
    <section class="section"><h3>保存到哪里</h3><select class="form-control" data-setting="destination" aria-label="保存方式"><option value="ask">每次选择 ZIP 保存位置（推荐）</option><option value="folder">本页固定使用一个文件夹</option><option value="download">浏览器默认下载位置</option></select><div class="inline" id="folder-area" hidden><button class="secondary" id="choose-folder">选择文件夹</button><span class="small" id="folder-name">尚未选择</span></div><p class="subnote" id="save-note">先选择位置，再开始读取。固定文件夹仅本页记住，每次生成新的 ZIP。</p></section>
    <section class="section"><h3>单个附件大小上限</h3><select class="form-control" data-setting="maxFileMiB" aria-label="附件大小上限"><option value="64">64 MiB</option><option value="256">256 MiB（默认）</option><option value="512">512 MiB</option><option value="1024">1 GiB</option></select><p class="subnote">浏览器默认下载方式的整包缓存上限为 128 MiB。选择保存位置可逐个文件写入，整包超过 4 GiB 时使用 ZIP64。</p></section>
  </fieldset><div class="foot">设置保存在本机 · Gemini ${VERSION}</div></div>
  <div class="view" data-view="logs" hidden><div class="heading-line"><h3>本次页面的日志</h3><button class="secondary" id="clear-logs">清空</button></div><p class="small">只记录阶段、数量、错误类型与下载域名。没有聊天正文、标题、文件名、链接路径、查询参数或登录凭据。</p><div class="log-list" id="log-list" aria-live="polite"></div><div class="inline"><button class="secondary" id="run-diagnostics">检查本地功能</button><button class="secondary" id="check-attachments">检测当前附件</button><button class="secondary" id="save-diagnostics">保存诊断 JSON</button></div><div class="diag-result" id="diag-result"></div><div class="notice">附件检测最多实际取回两份样本，每份上限 8 MiB，不生成 ZIP。失败时保存新诊断；导出包内还会列出缺失附件和未核实原图。</div><div class="foot">只在点击操作后读取 Gemini · 无自动上传</div></div>
</section>`;
function cleanTitle(doc=document){return (doc.title||'').replace(/\s*[-–—|]\s*(?:Google )?Gemini\s*$/i,'').trim()||'Gemini 对话';}
function isStreaming(doc){return Boolean(doc.querySelector('[data-test-id="stop-response-button"], button[aria-label="Stop response"], button[aria-label="停止回答"], button[aria-label="停止生成"]'));}
function mountApp(){
  if(location.hostname!=='gemini.google.com'||window.top!==window.self||document.getElementById('gemini-memory-box'))return;
  const host=document.createElement('div');host.id='gemini-memory-box';const shadow=host.attachShadow({mode:'closed'}),style=document.createElement('style');style.textContent=UI_CSS;shadow.appendChild(style);
  const shell=document.createElement('div');shell.appendChild(createUI(document));shadow.appendChild(shell);(document.body||document.documentElement).appendChild(host);
  const $=s=>shadow.querySelector(s),$$=s=>[...shadow.querySelectorAll(s)],key='gemini.memorybox.settings.v1',log=makeLogger(),cache=createPageCache(),elementIds=new WeakMap(),pixelSeen=new WeakMap();
  let settings;try{settings=settingsOf(JSON.parse(localStorage.getItem(key)||'null'));}catch{settings=settingsOf(null);}
  let folder=null,localFiles=[],busy=false,kind=null,aborter=null,capturePromise=null,elementCount=0,lastRoute=geminiRoute(location.pathname,location.search)?.key||null;
  cache.reset(lastRoute);
  const getRoute=()=>geminiRoute(location.pathname,location.search),assignId=el=>{if(!elementIds.has(el))elementIds.set(el,'page-'+(++elementCount));return elementIds.get(el);};
  const gmRequest=typeof GM_xmlhttpRequest==='function'?d=>GM_xmlhttpRequest(d):typeof GM!=='undefined'&&typeof GM.xmlHttpRequest==='function'?d=>GM.xmlHttpRequest(d):null;
  const network=(route,signal)=>makeGeminiNetwork({route,signal,log,fetchImpl:window.fetch.bind(window),gmRequest,stillHere:()=>getRoute()?.key===route.key,
    getConfig:()=>{try{return (typeof unsafeWindow!=='undefined'?unsafeWindow:window).WIZ_global_data;}catch{return null;}}});
  function status(title,copy='',tone='normal'){$('#status').hidden=false;$('#status').dataset.tone=tone;$('#status-title').textContent=title;$('#status-copy').textContent=copy;}
  function showTab(tab){$$('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab);b.setAttribute('aria-pressed',String(b.dataset.tab===tab));});$$('[data-view]').forEach(v=>v.hidden=v.dataset.view!==tab);if(tab==='logs')renderLogs();}
  function renderLogs(){const labels={PAGE_LOCATED:'页面消息定位已检查',UI_READY:'界面已启动',RPC_SHAPE:'返回结构已记录（仅类型）',SESSION_READY:'Gemini 登录配置已读取',HISTORY_PAGE:'历史分页已读取',TEXT_CAPTURED:'聊天已读取',RESOURCE_INVENTORY:'附件已列出',CONTENT_EXTRAS_SAVED:'摘要与源码已保存',ATTACHMENT_SAVED:'附件已保存',EXPORT_VERIFIED:'所选范围核对完成',EXPORT_INCOMPLETE:'有未完成或待核实项',ATTACHMENT_CHECK_DONE:'附件样本检测完成',LOCAL_CHECK:'本地检查完成',DOWNLOAD_REDIRECT:'下载跳转已验证',RETRY:'等待重试',PAGE_SCAN_DONE:'页面收集结束'};
    $('#log-list').textContent=log.entries.map(e=>`${e.time.slice(11,19)} ${e.level.toUpperCase()} ${labels[e.code]||explain(e.code)} [${e.code}]`+Object.keys(e).filter(k=>!['time','level','code'].includes(k)).map(k=>` ${k}=${e[k]}`).join('')).join('\n');$('#log-list').scrollTop=$('#log-list').scrollHeight;
  }
  function render(){
    $$('[data-setting]').forEach(el=>{if(el.type==='checkbox')el.checked=settings[el.dataset.setting];else el.value=String(settings[el.dataset.setting]);});
    $('#current-title').textContent=getRoute()?cleanTitle():'请先打开已保存的 Gemini 聊天';
    const tags=[settings.mode==='history'?'分页历史':'页面部分记录','原始 JSON',...(settings.html?['离线阅读']:[]),...(settings.markdown?['Markdown']:[]),...(settings.images?['图片']:[]),...(settings.files?['文件']:[]),...(settings.media?['音视频']:[]),...(settings.thoughts?['摘要']:[]),...(settings.sources?['源码']:[])];
    $('#format-tags').replaceChildren(...tags.map(t=>{const span=document.createElement('span');span.className='tag';span.textContent=t;return span;}));
    const picker=typeof window.showSaveFilePicker==='function';$('#folder-area').hidden=settings.destination!=='folder';$('#folder-name').textContent=folder?folder.name+'（本页记住）':'尚未选择';
    $('#destination-summary').textContent=settings.destination==='folder'?(folder?'保存到：'+folder.name+' / 新 ZIP':'先选择一个保存文件夹'):settings.destination==='ask'&&picker?'导出前选择 ZIP 保存位置':'浏览器下载位置 · 请在下载记录中确认';
    $('#save-note').textContent=picker?'先选择位置，再开始读取。固定文件夹仅本页记住，每次生成新 ZIP。':'当前浏览器使用默认下载位置，整包缓存上限 128 MiB；可在浏览器下载设置中开启每次询问位置。';
    $('#export').textContent=busy?kind==='check'?'正在检测附件…':kind==='scan'?'正在收集图片…':'正在导出…':'导出当前对话 · ZIP';
    $('#export').disabled=busy;$('#settings-fields').disabled=busy;$('#cancel').hidden=!busy;
    for(const id of ['choose-folder','run-diagnostics','clear-logs','check-attachments','choose-local-files','clear-local-files'])$('#'+id).disabled=busy;
    $('#local-files').disabled=busy;$('#local-files-summary').textContent=localFiles.length?`已选 ${localFiles.length} 个本机文件：`+localFiles.map(f=>f.name).join('、'):'未选择本机文件';
    $('#scan-page').disabled=busy||!settings.pageAssist||!getRoute();
    const c=cache.stats();$('#cache-summary').textContent=`已见 ${c.items} 项 · ${(c.bytes/MiB).toFixed(1)} MiB${c.truncated?'（缓存已满）':''}`;
  }
  async function capture(){
    if(capturePromise)return capturePromise;
    const route=getRoute();cache.reset(route?.key||null);if(!route)return {messages:[],resources:[],fingerprint:'',loading:false};
    capturePromise=(async()=>{const page=collectPage(document,route,assignId);
      if(settings.pageAssist)for(const row of page.resources){
        if(getRoute()?.key!==route.key)break;cache.add(route.key,row);
        if(row.element&&pixelSeen.get(row.element)!==row.url&&cache.stats().bytes<60*MiB){pixelSeen.set(row.element,row.url);const bytes=await loadedImageBytes(row.element);if(bytes&&getRoute()?.key===route.key)cache.add(route.key,{...row,bytes});}
      }return page;
    })();
    try{return await capturePromise;}finally{capturePromise=null;render();}
  }
  function progress(p){
    const title=p.stage==='history'?'正在读取 Gemini 完整历史':p.stage==='attachment'?'正在下载附件':'正在完成 ZIP';
    const detail=p.stage==='history'?`已读取 ${p.pages} 页 · ${p.turns} 轮`:p.stage==='attachment'?`附件 ${p.asset}/${p.assetTotal}`:'核对文件和报告';status(title,detail);renderLogs();
  }
  async function chooseFolder(){try{if(typeof window.showDirectoryPicker!=='function')throw new ExportError('PERMISSION_DENIED');folder=await window.showDirectoryPicker({id:'gemini-memory-box',mode:'readwrite'});render();}catch(e){if(e.name!=='AbortError'){status('未能选择文件夹',explain(errorCode(e)),'warn');showTab('home');}}}
  function begin(task){const route=getRoute();if(!route){status('先打开要保存的聊天',explain('NO_CONVERSATION'),'warn');showTab('home');return null;}
    if(isStreaming(document)){status('等待回复完成',explain('STREAMING'),'warn');showTab('home');return null;}
    busy=true;kind=task;aborter=new AbortController();render();return {route,signal:aborter.signal,settings:settingsOf(settings)};
  }
  function done(){busy=false;kind=null;aborter=null;render();renderLogs();}
  async function startExport(){
    if(busy)return;const task=begin('export');if(!task)return;
    const filename=`回忆匣_Gemini_${safeName(cleanTitle(),'当前对话',40)}_${stamp()}_${randomSuffix()}.zip`;let handle=null,directory=null,sink=null,memory=null;
    try{
      // Pick a location in this click's user activation, before any reads or network work.
      if(task.settings.destination==='folder'){
        if(!folder){if(typeof window.showDirectoryPicker!=='function')throw new ExportError('PERMISSION_DENIED');folder=await window.showDirectoryPicker({id:'gemini-memory-box',mode:'readwrite'});}
        else if(await folder.requestPermission({mode:'readwrite'})!=='granted')throw new ExportError('PERMISSION_DENIED');
        directory=folder;handle=await uniqueFile(folder,filename);
      }else if(task.settings.destination==='ask'&&typeof window.showSaveFilePicker==='function'){
        handle=await window.showSaveFilePicker({id:'gemini-memory-box',suggestedName:filename,types:[{description:'Gemini 聊天 ZIP',accept:{'application/zip':['.zip']}}],excludeAcceptAllOption:true});
      }
      checkAbort(task.signal);if(getRoute()?.key!==task.route.key)throw new ExportError('WRONG_PAGE');
      sink=handle?await fileSink(handle,directory):(memory=memorySink());showTab('home');status('开始导出','正在读取当前 Gemini 对话。');$('#progress').hidden=false;$('#progress').removeAttribute('value');
      const page=await capture();
      const report=await exportArchive({net:network(task.route,task.signal),zip:new ZipWriter(sink,task.signal),route:task.route,settings:task.settings,signal:task.signal,log,progress,title:cleanTitle(),dom:cache.snapshot(task.route.key),pageMessages:page.messages,localFiles:[...localFiles]});
      if(memory)blobDownload(memory.blob(),filename);
      status(report.result==='complete'?'已按所选范围导出完成':'ZIP 已保存，仍有待核对项',`${report.turns} 轮 · 附件项 ${report.attachments_saved}/${report.attachments_selected} · 失败 ${report.attachments_failed}\n实际附件文件 ${report.unique_attachment_files} · 原图未核实 ${report.images_unverified}\n摘要 ${report.thought_summaries_saved} 轮 · 源码 ${report.structured_sources_saved} 份 · 本机补入待核实 ${report.local_files_unverified}\n${memory?'已交给浏览器下载，请在下载记录中确认位置。':'已保存：'+(directory?directory.name+' / ':'')+handle.name}\n完整解压 ZIP，打开「打开我.html」。${report.result==='complete'?'':'请同时查看导出报告与附件失败清单。'}`,report.result==='complete'?'success':'warn');
      $('#progress').max=100;$('#progress').value=100;
    }catch(e){await sink?.abort?.().catch(()=>{});if(!sink&&handle&&directory)await directory.removeEntry(handle.name).catch(()=>{});const code=errorCode(e);log.add(code,{},'warn');status(code==='CANCELLED'?'已取消':'导出未完成',explain(code),'warn');$('#progress').hidden=true;}
    finally{done();}
  }
  async function startCheck(){
    if(busy)return;const task=begin('check');if(!task)return;showTab('home');status('正在检测实际附件','读取历史后，最多取回两份样本；每份上限 8 MiB，不保存 ZIP。');
    try{const page=await capture(),result=await checkCurrentAttachments({net:network(task.route,task.signal),...task,log,dom:cache.snapshot(task.route.key),pageMessages:page.messages});
      const label={images:'图片',files:'文件',media:'音视频'};$('#diag-result').textContent=`实际下载：${result.passed}/${result.tested} 通过。\n`+result.results.map(r=>label[r.kind]+'：'+(r.status==='passed'?`${r.bytes} 字节${r.kind==='images'?(r.original_verified?'，原文件通路':'，原图未核实'):''}`:r.status==='size-limit'?'超过诊断大小上限，未验证':explain(r.code))).join('\n')+(result.tested?'\n样本结果不代表所有附件都可取得。':'未发现可检测的附件记录。');
      status('附件检测结束',$('#diag-result').textContent,result.passed===result.tested&&result.tested?'success':'warn');showTab('logs');
    }catch(e){log.add(errorCode(e),{},'warn');$('#diag-result').textContent=explain(errorCode(e));status('附件检测未完成',$('#diag-result').textContent,'warn');showTab('logs');}finally{done();}
  }
  async function startScan(){
    if(busy||!settings.pageAssist)return;const task=begin('scan');if(!task)return;showTab('home');
    try{const scroller=findChatScroller(document,window);if(!scroller){status('未找到可滚动的聊天区域','可手动滚动后再导出；已加载图片会保留在本页缓存。','warn');return;}
      const result=await scanPageArea({scroller,capture,signal:task.signal,stillHere:()=>getRoute()?.key===task.route.key,progress:stage=>status('辅助加载 · '+stage,`已记住 ${cache.stats().items} 项页面资源，可随时停止。`)});
      log.add('PAGE_SCAN_DONE',{total:cache.stats().items,skipped:result.limited?1:0});status('页面收集结束',`已记住 ${cache.stats().items} 项。${result.limited?'达到时间或步数上限。':''}滚动边界不代表完整历史；原图仍需下载核实。`,'normal');
    }catch(e){log.add(errorCode(e),{},'warn');status('页面收集已停止',explain(errorCode(e))+'；已收集的图片保留。','warn');}finally{done();}
  }
  function openPanel(){$('#launch').hidden=true;$('#panel').hidden=false;render();$('#export').focus();}
  $('#launch').addEventListener('click',openPanel);host.addEventListener('memorybox-open',openPanel);
  $('#close').addEventListener('click',()=>{$('#panel').hidden=true;$('#launch').hidden=false;$('#launch').focus();});$$('[data-tab]').forEach(b=>b.addEventListener('click',()=>showTab(b.dataset.tab)));
  $$('[data-setting]').forEach(el=>el.addEventListener('change',()=>{settings[el.dataset.setting]=el.type==='checkbox'?el.checked:el.value;settings=settingsOf(settings);if(!settings.pageAssist)cache.clear();try{localStorage.setItem(key,JSON.stringify(settings));}catch{status('设置仅本页生效','浏览器没有保存设置。','warn');}render();}));
  $('#export').addEventListener('click',startExport);$('#cancel').addEventListener('click',()=>aborter?.abort());$('#choose-folder').addEventListener('click',chooseFolder);$('#check-attachments').addEventListener('click',startCheck);$('#scan-page').addEventListener('click',startScan);
  $('#choose-local-files').addEventListener('click',()=>{if(!busy)$('#local-files').click();});
  $('#local-files').addEventListener('change',()=>{if(!busy){localFiles=[...$('#local-files').files];render();}});
  $('#clear-local-files').addEventListener('click',()=>{if(!busy){localFiles=[];$('#local-files').value='';render();}});
  $('#clear-logs').addEventListener('click',()=>{if(!busy){log.entries.length=0;$('#diag-result').textContent='';renderLogs();}});
  $('#save-diagnostics').addEventListener('click',()=>blobDownload(new Blob([jsonText(log.snapshot())],{type:'application/json'}),`回忆匣_Gemini_日志诊断_${stamp()}.json`));
  $('#run-diagnostics').addEventListener('click',async()=>{try{let blocked=false;try{approvedResource('https://example.com/private');}catch{blocked=true;}
    const sink=memorySink(),zip=new ZipWriter(sink);await zip.add('检查.txt','回忆匣 Gemini ZIP 自检');await zip.finish();const b=new Uint8Array(await sink.blob().arrayBuffer());
    const located=locateGeminiChat(document);log.add('PAGE_LOCATED',{stage:located.stage,total:located.nodes.length,success:located.nodes.length?1:0});
    $('#diag-result').textContent=[`聊天区定位：${located.nodes.length?'已识别 '+located.nodes.length+' 条已加载消息':'暂未发现已加载消息'}`,`外部网站拦截：${blocked?'通过':'失败'}`,`ZIP 生成：${b[0]===80&&b[1]===75&&b[b.length-22]===80?'通过':'失败'}`,`选择保存位置：${typeof window.showSaveFilePicker==='function'?'可用':'使用浏览器下载'}`,`附件下载：${gmRequest?'脚本管理器通路可用':'仅浏览器通路，可能受跨域限制'}`,'本地检查未读取聊天正文，未发出网络请求。'].join('\n');log.add('LOCAL_CHECK');renderLogs();
  }catch(e){$('#diag-result').textContent=explain(errorCode(e));}});
  window.addEventListener('beforeunload',e=>{if(busy){e.preventDefault();e.returnValue='';}});
  let timer;const schedule=()=>{if(timer||!settings.pageAssist)return;timer=setTimeout(()=>{timer=null;capture().catch(()=>{});},600);};
  new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});document.addEventListener('load',schedule,true);
  setInterval(()=>{const next=getRoute()?.key||null;if(next!==lastRoute){lastRoute=next;cache.reset(next);localFiles=[];$('#local-files').value='';if(busy)aborter?.abort();render();schedule();}},700);
  render();schedule();host.dataset.memoryboxReady='1';host.dataset.memoryboxVersion=VERSION;log.add('UI_READY',{stage:'startup'});
  return {host,open:openPanel};
}
