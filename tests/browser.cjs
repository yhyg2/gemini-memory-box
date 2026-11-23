/* Real Chromium with fully mocked Gemini/CDN responses; no account or live network. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {PNG,URL:ASSET,C,turn,frame,mediaEntry,uploadEntry,dep}=require('./fixtures.cjs');
const {chromium}=dep('playwright'),JSZip=dep('jszip');
const script=fs.readFileSync(path.join(__dirname,'../gemini-memory-box.user.js'),'utf8');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n');
const inputURL='https://lh3.googleusercontent.com/gg/INPUT_SYNTHETIC',pdfURL='https://contribution.usercontent.google.com/download/PDF_SYNTHETIC';
const fixture=turn(1,{user:'当前问题',answer:'正式回答',attachments:[mediaEntry()],userAttachments:[uploadEntry(1,'截图.png',inputURL,'image/png',{size:PNG.length}),uploadEntry(16,'资料.pdf',pdfURL,'application/pdf')]});
fixture[3][0][0][37]=[['**Synthetic summary**\n\n模拟展示摘要'],[]];
fixture[3][12]=[[[[null,null,null,['<!doctype html><script>alert("SYNTHETIC_SOURCE");</script>','html']]]]];
const requests=[],checks=[];let blockPDF=false;
const prelude=`
window.__menus={};window.__alerts=[];window.__events=[];window.__saved=[];window.__committed=false;
const realAttach=Element.prototype.attachShadow;
Element.prototype.attachShadow=function(o){const s=realAttach.call(this,o);if(this.id==='gemini-memory-box')window.__memoryShadow=s;return s;};
window.WIZ_global_data={SNlM0e:'SYNTHETIC_CSRF',cfb2h:'SYNTHETIC_BUILD',FdrFJe:'SYNTHETIC_SESSION'};
window.unsafeWindow=window;
localStorage.setItem('gemini.memorybox.settings.v1',JSON.stringify({pageAssist:false}));
window.GM_registerMenuCommand=(name,fn)=>{window.__menus[name]=fn;return name;};window.alert=text=>window.__alerts.push(text);
window.showSaveFilePicker=async o=>{window.__events.push('picker');return {name:o.suggestedName,async createWritable(){return {async write(bytes){window.__saved.push(Array.from(bytes));},async close(){window.__committed=true;},async abort(){window.__aborted=true;}};}};};
window.GM_xmlhttpRequest=d=>{
 const ac=new AbortController();fetch(d.url,{credentials:d.anonymous?'omit':'include',redirect:'manual',signal:ac.signal}).then(async r=>d.onload({status:r.status,finalUrl:r.url,response:await r.arrayBuffer(),responseHeaders:[...r.headers].map(([k,v])=>k+': '+v).join('\\r\\n')})).catch(()=>d.onerror());return {abort(){ac.abort();}};
};`;
const markup='<main><div hidden id="chat-history"><user-query>旧页面</user-query></div><chat-window-content><div class="conversation-container"><div data-test-id="user-query"><div class="query-content">当前问题</div></div><model-response data-response-id="r_0000000000000001"><div class="thoughts-container"><div class="markdown-main-panel">思考面板</div></div><model-response-content><div class="markdown-main-panel">正式回答</div></model-response-content><message-actions><button>复制</button></message-actions></model-response></div></chat-window-content></main>';
const safe=s=>s.replace(/<\/script/gi,'<\\/script');
const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>合成测试 - Google Gemini</title></head><body>'+markup+'<script nonce="fixture">'+safe(prelude)+'\n'+safe(script)+'</script></body></html>';
const csp="default-src 'none'; script-src 'nonce-fixture'; style-src 'unsafe-inline'; img-src data:; connect-src 'self' https://lh3.googleusercontent.com https://contribution.usercontent.google.com; base-uri 'none'; require-trusted-types-for 'script'; trusted-types 'none'";
async function launch(){
  const options={headless:true};
  if(process.env.SPARTICUZ_MODULE){const binary=(await import(process.env.SPARTICUZ_MODULE)).default;options.executablePath=await binary.executablePath();options.args=binary.args;}
  else if(process.env.CHROMIUM_EXECUTABLE){options.executablePath=process.env.CHROMIUM_EXECUTABLE;options.args=['--no-sandbox','--disable-dev-shm-usage'];}
  return chromium.launch(options);
}
async function click(page,id){const r=await page.evaluate(id=>{const el=window.__memoryShadow.getElementById(id),b=el.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,width:b.width,height:b.height};},id);assert(r.width>0&&r.height>0,id+' not rendered');await page.mouse.click(r.x,r.y);}
(async()=>{
  const browser=await launch(),context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await context.route('**/*',async route=>{
    const req=route.request(),u=new globalThis.URL(req.url());
    if(u.hostname==='gemini.google.com'&&u.pathname==='/u/1/app/0123456789abcdef'&&req.method()==='GET')return route.fulfill({status:200,contentType:'text/html',headers:{'content-security-policy':csp},body:html});
    requests.push({origin:u.origin,path:u.pathname,method:req.method()});
    if(u.hostname==='gemini.google.com'&&u.pathname==='/u/1/_/BardChatUi/data/batchexecute'&&req.method()==='POST'){
      const id=u.searchParams.get('rpcids'),body=new URLSearchParams(req.postData());assert.equal(body.get('at'),'SYNTHETIC_CSRF');
      return route.fulfill({status:200,contentType:'text/plain',body:frame(id==='hNvQHb'?[[fixture],null]:[ASSET.replace('/gg/','/gg-dl/')],id)});
    }
    if((u.hostname==='lh3.googleusercontent.com'&&/^\/(?:gg|gg-dl)\//.test(u.pathname))||u.href===pdfURL){return route.fulfill({status:u.href===pdfURL&&blockPDF?403:200,contentType:u.href===pdfURL?'application/pdf':'image/png',headers:{'access-control-allow-origin':'https://gemini.google.com','access-control-allow-credentials':'true'},body:u.href===pdfURL?pdf:Buffer.from(PNG)});}
    throw Error('Unexpected network destination: '+u.origin+u.pathname);
  });
  try{
    await page.goto('https://gemini.google.com/u/1/app/0123456789abcdef');
    await page.waitForFunction(()=>document.getElementById('gemini-memory-box')?.dataset.memoryboxReady==='1');
    assert(await page.evaluate(()=>{try{document.createElement('div').innerHTML='<b>blocked</b>';return false;}catch(e){return e.name==='TypeError';}}));checks.push('real-csp-trusted-types-enforced');
    const launcher=await page.evaluate(()=>{const b=window.__memoryShadow.getElementById('launch').getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};});
    assert(launcher.w>100&&launcher.h>20&&launcher.x>=0&&launcher.y>=0&&launcher.right<=1280&&launcher.bottom<=900);checks.push('launcher-visible-in-desktop-viewport');
    assert.equal(requests.length,0);await click(page,'launch');
    await page.evaluate(()=>window.__memoryShadow.querySelector('[data-tab="logs"]').click());await click(page,'run-diagnostics');
    await page.waitForFunction(()=>window.__memoryShadow.getElementById('diag-result').textContent.includes('聊天区定位：已识别 2 条'));
    assert.equal(requests.length,0);checks.push('page-locator-and-local-diagnostics-no-network');
    await page.evaluate(()=>window.__memoryShadow.querySelector('[data-tab="home"]').click());await click(page,'export');
    await page.waitForFunction(()=>window.__committed||window.__aborted,{},{timeout:20000});
    assert(await page.evaluate(()=>window.__committed),await page.evaluate(()=>window.__memoryShadow.getElementById('status-copy').textContent));
    assert.equal((await page.evaluate(()=>window.__events))[0],'picker');
    const bytes=Buffer.concat((await page.evaluate(()=>window.__saved)).map(a=>Buffer.from(a))),zip=await JSZip.loadAsync(bytes,{checkCRC32:true}),report=JSON.parse(await zip.file('导出报告.json').async('string'));
    assert.equal(report.result,'complete');assert.equal(report.attachments_selected,3);assert.equal(report.attachments_saved,3);assert.equal(report.attachments_failed,0);
    assert.equal(report.unique_attachment_files,2);assert.equal(report.duplicate_content_reused,1);
    fs.writeFileSync(path.join(__dirname,'../qa/browser-synthetic.zip'),bytes);checks.push('native-upload-and-generated-image-to-valid-zip');
    assert.equal(report.thought_summaries_saved,1);assert.equal(report.structured_sources_saved,1);
    const sources=JSON.parse(await zip.file('生成内容清单.json').async('string'));assert(sources[0].path.endsWith('.html.txt'));assert((await zip.file(sources[0].path).async('string')).includes('SYNTHETIC_SOURCE'));
    assert((await zip.file('聊天记录.html').async('string')).includes('模拟展示摘要'));assert.deepEqual(await page.evaluate(()=>window.__alerts),[]);checks.push('summaries-and-source-text-export-without-execution');
    await page.evaluate(()=>window.__memoryShadow.querySelector('[data-tab="settings"]').click());
    const input=await page.evaluateHandle(()=>window.__memoryShadow.getElementById('local-files'));
    await input.asElement().setInputFiles({name:'资料.pdf',mimeType:'application/pdf',buffer:pdf});
    assert((await page.evaluate(()=>window.__memoryShadow.getElementById('local-files-summary').textContent)).includes('资料.pdf'));
    blockPDF=true;await page.evaluate(()=>{window.__saved=[];window.__committed=false;window.__aborted=false;window.__memoryShadow.querySelector('[data-tab="home"]').click();});
    await click(page,'export');await page.waitForFunction(()=>window.__committed||window.__aborted,{},{timeout:20000});assert(await page.evaluate(()=>window.__committed));
    const supplemented=await JSZip.loadAsync(Buffer.concat((await page.evaluate(()=>window.__saved)).map(a=>Buffer.from(a))),{checkCRC32:true});
    const suppliedReport=JSON.parse(await supplemented.file('导出报告.json').async('string'));assert.equal(suppliedReport.attachments_saved,3);assert.equal(suppliedReport.attachments_failed,0);assert.equal(suppliedReport.local_files_unverified,1);assert.equal(suppliedReport.result,'partial');
    fs.writeFileSync(path.join(__dirname,'../qa/local-supplement-synthetic.zip'),Buffer.concat((await page.evaluate(()=>window.__saved)).map(a=>Buffer.from(a))));checks.push('local-file-fallback-keeps-source-and-unverified-label');
    await page.evaluate(()=>{const body=document.createElement('body');body.textContent='页面容器重建';document.body.replaceWith(body);});
    await page.waitForFunction(()=>document.getElementById('gemini-memory-box')?.isConnected);assert.equal(await page.locator('#gemini-memory-box').count(),1);checks.push('spa-body-replacement-restores-same-launcher');
    await page.evaluate(()=>{window.__memoryShadow.getElementById('close').click();window.__menus['显示回忆匣 · Gemini']();});assert.equal(await page.evaluate(()=>window.__memoryShadow.getElementById('panel').hidden),false);checks.push('manager-menu-reopens-panel');
    await page.evaluate(()=>history.replaceState({},'', '/u/2/app/0123456789abcdef'));
    await page.waitForFunction(()=>window.__memoryShadow.getElementById('local-files-summary').textContent==='未选择本机文件');
    assert.equal(await page.evaluate(()=>window.__memoryShadow.getElementById('local-files').files.length),0);checks.push('local-files-cleared-on-account-route-change');
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(1100);
    const mobile=await page.evaluate(()=>{const r=window.__memoryShadow.getElementById('panel').getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};});assert(mobile.x>=0&&mobile.y>=0&&mobile.right<=390&&mobile.bottom<=844);checks.push('panel-visible-in-narrow-viewport');
    assert.deepEqual(errors,[]);
    const result={browser:browser.version(),data:'synthetic-only',network:'all destinations intercepted; no account login',checks,passed:checks.length,failed:0,archive:{result:report.result,attachments_saved:report.attachments_saved,attachments_selected:report.attachments_selected},errors};
    fs.writeFileSync(path.join(__dirname,'../qa/browser-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack);process.exitCode=1;});
