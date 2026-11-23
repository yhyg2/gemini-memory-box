const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto');
const {JSDOM}=require('jsdom'),{PNG,URL:ASSET_URL,turn,frame,mediaEntry,dep}=require('./fixtures.cjs'),JSZip=dep('jszip');
const code=fs.readFileSync(require.resolve('../gemini-memory-box.user.js'),'utf8');
const {setTimeout:delay}=require('node:timers/promises');
async function until(fn){for(let n=0;n<150;n++){if(fn())return;await delay(15);}throw Error('UI did not settle');}
function harness({path='/u/1/app/0123456789abcdef',html='',settings={},fetchOverride,pickerCancel=false,trustedTypes=false,menuApi='legacy',failInitOnce=false}={}){
  const dom=new JSDOM('<!doctype html><html><head><title>合成对话 - Google Gemini</title></head><body><main id="chat-history">'+html+'</main></body></html>',{url:'https://gemini.google.com'+path,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
  const events=[],chunks=[],gmCalls=[],fetchCalls=[],alerts=[],menus=new Map();let root,closed=false,aborted=false,initFailed=false;
  const attach=w.Element.prototype.attachShadow;w.Element.prototype.attachShadow=function(options){if(failInitOnce&&!initFailed&&this.id==='gemini-memory-box'){initFailed=true;throw new w.TypeError('PRIVATE_STARTUP_DETAIL');}const value=attach.call(this,options);if(this.id==='gemini-memory-box')root=value;return value;};
  const htmlProperty=Object.getOwnPropertyDescriptor(w.Element.prototype,'innerHTML');
  if(trustedTypes){
    Object.defineProperty(w.Element.prototype,'innerHTML',{configurable:true,get:htmlProperty.get,set(){throw new w.TypeError("This document requires 'TrustedHTML' assignment");}});
    w.Element.prototype.insertAdjacentHTML=()=>{throw new w.TypeError('TrustedHTML required');};
    w.DOMParser.prototype.parseFromString=()=>{throw new w.TypeError('TrustedHTML required');};
    w.Range.prototype.createContextualFragment=()=>{throw new w.TypeError('TrustedHTML required');};
  }
  Object.defineProperty(w,'crypto',{value:crypto.webcrypto});for(const name of ['TextEncoder','TextDecoder','Headers','Response','Request','Blob','AbortController','CompressionStream','ArrayBuffer','Uint8Array','Uint32Array','DataView'])w[name]=globalThis[name];
  w.localStorage.setItem('gemini.memorybox.settings.v1',JSON.stringify(settings));w.unsafeWindow=w;w.WIZ_global_data={SNlM0e:'PRIVATE_CSRF',cfb2h:'synthetic-build',FdrFJe:'PRIVATE_SESSION'};
  w.fetch=async(u,o)=>{events.push('network');fetchCalls.push({u,o});if(fetchOverride)return fetchOverride(u,o);const id=new URL(u).searchParams.get('rpcids');return new Response(frame(id==='hNvQHb'?[[turn(1,{attachments:[mediaEntry()]})],null]:[ASSET_URL],id),{status:200});};
  w.GM_xmlhttpRequest=d=>{gmCalls.push(d);queueMicrotask(()=>d.onload({status:200,finalUrl:d.url,response:PNG.buffer,responseHeaders:'Content-Type: image/png\r\nContent-Length: '+PNG.length}));return {abort(){}};};
  w.alert=message=>alerts.push(message);
  if(menuApi==='legacy')w.GM_registerMenuCommand=(name,fn)=>{menus.set(name,fn);return menus.size;};
  if(menuApi==='modern')w.GM={registerMenuCommand:async(name,fn)=>{menus.set(name,fn);return menus.size;}};
  w.showSaveFilePicker=async options=>{events.push('picker');if(pickerCancel)throw new DOMException('cancel','AbortError');return {name:options.suggestedName,async createWritable(){return {async write(b){chunks.push(Buffer.from(b));},async close(){closed=true;},async abort(){aborted=true;}};}};};
  w.eval(code);return {dom,w,events,chunks,gmCalls,fetchCalls,menus,alerts,get root(){return root;},get closed(){return closed;},get aborted(){return aborted;},close(){if(trustedTypes)Object.defineProperty(w.Element.prototype,'innerHTML',htmlProperty);w.close();}};
}
test('UI injects once, stays idle, and exposes only export/settings/diagnostics',async()=>{
  const h=harness();try{assert(h.root);assert.deepEqual([...h.root.querySelectorAll('[data-tab]')].map(n=>n.textContent),['导出','设置','日志诊断']);h.w.eval(code);assert.equal(h.w.document.querySelectorAll('#gemini-memory-box').length,1);await delay(30);assert.equal(h.fetchCalls.length,0);assert.equal(h.gmCalls.length,0);
    h.root.querySelector('#launch').click();h.root.querySelector('[data-tab="settings"]').click();assert.equal(h.root.querySelector('[data-view="settings"]').hidden,false);h.root.querySelector('[data-setting="files"]').click();assert.equal(JSON.parse(h.w.localStorage.getItem('gemini.memorybox.settings.v1')).files,false);
  }finally{h.close();}
});
test('click export selects storage before reading and yields a verified ZIP in a DOM simulation',async()=>{
  const h=harness();try{h.root.querySelector('#launch').click();h.root.querySelector('#export').click();await until(()=>h.closed||h.aborted||h.root.querySelector('#status-title').textContent==='导出未完成');assert(h.closed,h.root.querySelector('#status-copy').textContent);assert.equal(h.events[0],'picker');assert(h.events.indexOf('network')>0);assert(h.root.querySelector('#status-title').textContent.includes('核对')||h.root.querySelector('#status-title').textContent.includes('完成'));
    const archive=await JSZip.loadAsync(Buffer.concat(h.chunks),{checkCRC32:true});const report=JSON.parse(await archive.file('导出报告.json').async('string'));assert.equal(report.result,'complete');assert.equal(report.attachments_saved,1);assert(h.fetchCalls.every(x=>new URL(x.u).pathname.startsWith('/u/1/')));assert(h.gmCalls.every(x=>!Object.keys(x.headers).length));const diagnostics=await archive.file('日志诊断.json').async('string');assert(!diagnostics.includes('PRIVATE_'));
    fs.writeFileSync(require('node:path').join(__dirname,'../qa/ui-flow-synthetic.zip'),Buffer.concat(h.chunks));
  }finally{h.close();}
});
test('a cancelled picker does not read the account or start downloading',async()=>{const h=harness({pickerCancel:true});try{h.root.querySelector('#export').click();await until(()=>h.root.querySelector('#status-title').textContent==='已取消');assert.equal(h.fetchCalls.length,0);assert.equal(h.gmCalls.length,0);}finally{h.close();}});
test('local diagnostics produce no network requests or downloaded files',async()=>{const h=harness();try{h.root.querySelector('#run-diagnostics').click();await until(()=>h.root.querySelector('#diag-result').textContent.length>0);assert(h.root.querySelector('#diag-result').textContent.includes('通过'),h.root.querySelector('#diag-result').textContent);assert.equal(h.events.length,0);}finally{h.close();}});
test('opening a new-chat landing page gives actionable guidance and does not read history',async()=>{const h=harness({path:'/app'});try{h.root.querySelector('#export').click();assert(h.root.querySelector('#status-copy').textContent.includes('Gemini'));assert.equal(h.events.length,0);}finally{h.close();}});
test('changing account while history is pending aborts the new ZIP without committing',async()=>{
  const h=harness({fetchOverride:async(u,o)=>new Promise((resolve,reject)=>{o.signal.addEventListener('abort',()=>reject(new DOMException('abort','AbortError')),{once:true});})});
  try{h.root.querySelector('#export').click();await until(()=>h.fetchCalls.length>0);h.w.history.pushState({},'','/u/2/app/0123456789abcdef');await until(()=>h.aborted);assert.equal(h.closed,false);}finally{h.close();}
});
test('semantic DOM extraction preserves roles, code, tables and stable response association',()=>{
  const tag=Buffer.from(JSON.stringify([['r_0000000000000001','c_0123456789abcdef',null,'rc_0000000000000001']])).toString('base64');
  const html=`<div class="conversation-container"><user-query><user-query-content><div class="query-text">你好</div></user-query-content></user-query><model-response jslog="BardVeMetadataKey:${tag};mutable:true"><message-content><div class="markdown-main-panel"><p>回答 <strong>重点</strong></p><pre><code>if (a &lt; b) {\n  c();\n}</code></pre><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table><button>复制</button></div></message-content><img src="${ASSET_URL}" width="100"></model-response></div>`;
  const h=harness({html});try{const c=require('../gemini-memory-box.user.js'),r=c.geminiRoute('/app/0123456789abcdef'),page=c.collectPage(h.w.document,r,()=> 'fallback');assert.deepEqual(page.messages.map(x=>x.role),['user','assistant']);assert(page.messages[1].text.includes('if (a < b)'));assert(page.messages[1].text.includes('| A | B |'));assert(!page.messages[1].text.includes('复制'));assert.equal(page.resources[0].messageId,'r_0000000000000001:assistant');assert.equal(page.messages[0].message_id,'r_0000000000000001:user');}finally{h.close();}
});
test('page cache isolation uses account and chat identity',()=>{const c=require('../gemini-memory-box.user.js'),cache=c.createPageCache();cache.reset('account1');cache.add('account1',{messageId:'r',url:ASSET_URL,bytes:PNG});assert.equal(cache.stats().items,1);cache.reset('account2');assert.equal(cache.stats().items,0);assert.deepEqual(cache.snapshot('account1'),[]);});
test('launcher and all tabs initialize when HTML injection sinks reject strings',()=>{
  const h=harness({trustedTypes:true});try{const host=h.w.document.getElementById('gemini-memory-box');assert(host);assert.equal(host.dataset.memoryboxReady,'1');assert.equal(host.dataset.memoryboxVersion,'1.0.4');assert.equal(h.w.document.getElementById('gemini-memory-box-startup'),null);
    h.root.querySelector('#launch').click();for(const tab of ['settings','logs','home']){h.root.querySelector('[data-tab="'+tab+'"]').click();assert.equal(h.root.querySelector('[data-view="'+tab+'"]').hidden,false);}assert.equal(h.fetchCalls.length,0);assert.equal(h.gmCalls.length,0);
    assert.equal(h.root.querySelector('svg').namespaceURI,'http://www.w3.org/2000/svg');assert.equal(h.root.querySelector('svg').getAttribute('viewBox'),'0 0 24 24');
  }finally{h.close();}
});
test('menu can open the panel and diagnose startup without reading the account',()=>{
  const h=harness({trustedTypes:true});try{assert.equal(h.menus.size,2);assert(h.root.querySelector('#panel').hidden);h.menus.get('显示回忆匣 · Gemini')();assert.equal(h.root.querySelector('#panel').hidden,false);h.menus.get('回忆匣 · 启动自检')();assert(h.alerts[0].includes('界面初始化：完成'));assert(!h.alerts[0].includes('PRIVATE_'));assert.equal(h.events.length,0);}finally{h.close();}
});
test('modern asynchronous manager menu API also provides both fallback entries',()=>{const h=harness({menuApi:'modern'});try{assert.equal(h.menus.size,2);h.menus.get('显示回忆匣 · Gemini')();assert.equal(h.root.querySelector('#panel').hidden,false);}finally{h.close();}});
test('SPA body replacement reattaches the same controller once',async()=>{
  const h=harness({trustedTypes:true});try{const host=h.w.document.getElementById('gemini-memory-box'),body=h.w.document.createElement('body');h.w.document.body.replaceWith(body);assert.equal(host.isConnected,false);await until(()=>host.isConnected);assert.equal(host.parentNode,body);assert.equal(body.querySelectorAll('#gemini-memory-box').length,1);assert.equal(h.menus.size,2);h.menus.get('显示回忆匣 · Gemini')();assert.equal(h.root.querySelector('#panel').hidden,false);assert.equal(h.events.length,0);}finally{h.close();}
});
test('initialization errors leave a retry button and a redacted startup diagnosis',()=>{
  const h=harness({trustedTypes:true,failInitOnce:true});try{const retry=h.w.document.getElementById('gemini-memory-box-startup');assert(retry);h.menus.get('回忆匣 · 启动自检')();assert(h.alerts[0].includes('BOOT_TYPE_ERROR'));assert(!h.alerts[0].includes('PRIVATE_STARTUP_DETAIL'));retry.click();assert.equal(h.w.document.getElementById('gemini-memory-box-startup'),null);assert.equal(h.w.document.getElementById('gemini-memory-box').dataset.memoryboxReady,'1');assert.equal(h.root.querySelector('#panel').hidden,false);assert.equal(h.events.length,0);}finally{h.close();}
});
test('export still creates the archive while HTML injection is forbidden',async()=>{
  const h=harness({trustedTypes:true});try{h.root.querySelector('#export').click();await until(()=>h.closed||h.aborted);assert(h.closed,h.root.querySelector('#status-copy').textContent);const zip=await JSZip.loadAsync(Buffer.concat(h.chunks),{checkCRC32:true});assert.equal(JSON.parse(await zip.file('导出报告.json').async('string')).result,'complete');}finally{h.close();}
});
