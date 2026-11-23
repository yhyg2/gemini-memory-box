const {test}=require('node:test'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom'),c=require('../gemini-memory-box.user.js');
const {C,PNG,URL,turn,uploadEntry,dep}=require('./fixtures.cjs'),JSZip=dep('jszip');
const route=c.geminiRoute('/app/0123456789abcdef');
const image=()=>uploadEntry(1,'用户上传.png',URL,'image/png',{size:PNG.length});
test('user upload is preserved alongside its prompt and duplicate attachment wrapper',()=>{
  const selected=c.selectTurns([turn(1,{user:'请看这张图',userAttachments:[image()]})],route);
  const files=c.discoverResources(selected.messages);assert.equal(files.length,1);assert.equal(files[0].name,'用户上传.png');assert.equal(files[0].occurrences[0].role,'user');assert.equal(files[0].expected_size,PNG.length);assert.equal(selected.messages[0].text,'请看这张图');
});
test('image-only user input is valid when native upload metadata exists',()=>{const selected=c.selectTurns([turn(1,{user:'',userAttachments:[image()]})],route);assert.equal(selected.messages[0].text,'');assert.equal(c.discoverResources(selected.messages).length,1);});
test('typed file upload selects download slot and excludes thumbnail/upload endpoints',()=>{
  for(const type of [3,16]){
    const entry=uploadEntry(type,'保留.psd','https://contribution.usercontent.google.com/download/ORIGINAL','application/octet-stream');
    const files=c.discoverResources(c.selectTurns([turn(1,{userAttachments:[entry]})],route).messages);assert.equal(files.length,1);assert.equal(files[0].pointer,entry[7][1]);assert.equal(files[0].name,'保留.psd');assert.equal(files[0].kind,'files');
  }
});
test('missing native download cannot be replaced by its thumbnail',()=>{
  const entry=uploadEntry(16,'文件.pdf',null,'application/pdf'),files=c.discoverResources(c.selectTurns([turn(1,{userAttachments:[entry]})],route).messages);assert.equal(files.length,1);assert.equal(files[0].pointer,null);assert.equal(files[0].unavailable,'ORIGINAL_URL_MISSING');
});
test('native user uploads reach actual bytes and the archive manifest',async()=>{
  const sink=c.memorySink(),net={rpc:async()=>[[turn(1,{userAttachments:[image()]})],null],request:async()=>({bytes:PNG,headers:new Headers({'content-type':'image/png'})}),clear(){}};
  const report=await c.exportArchive({net,zip:new c.ZipWriter(sink),route,settings:c.DEFAULTS,log:c.makeLogger()});assert.equal(report.attachments_saved,1);assert.equal(report.images_unverified,0);
  const zip=await JSZip.loadAsync(Buffer.from(await sink.blob().arrayBuffer()),{checkCRC32:true});assert.deepEqual(new Uint8Array(await zip.file('附件/0001_用户上传.png').async('uint8array')),PNG);
});
function page(html){const d=new JSDOM('<!doctype html><html><body>'+html+'</body></html>',{url:'https://gemini.google.com/app/0123456789abcdef'});return {dom:d,doc:d.window.document,read(){return c.collectPage(d.window.document,route,el=>el.id||'fallback');}};}
test('locator prefers conversation root and excludes hidden and sidebar messages',()=>{
  const p=page('<nav><div data-test-id="user-query">侧栏</div></nav><main><div hidden id="chat-history"><user-query>旧消息</user-query></div><chat-window-content><div data-test-id="user-query"><div class="query-content">当前问题</div></div><div data-test-id="model-response"><div class="response-content">当前回答</div></div></chat-window-content></main>');
  try{const located=c.locateGeminiChat(p.doc),out=p.read();assert.equal(located.stage,'chat-window-content');assert.deepEqual(out.messages.map(m=>m.text),['当前问题','当前回答']);}finally{p.dom.window.close();}
});
test('nested model-response-text wrappers do not duplicate model messages',()=>{
  const p=page('<main><user-query><div class="query-text">问题</div></user-query><model-response><message-content class="model-response-text"><div class="markdown-main-panel">回答</div></message-content></model-response></main>');
  try{assert.equal(c.locateGeminiChat(p.doc).nodes.length,2);assert.equal(p.read().messages.length,2);}finally{p.dom.window.close();}
});
test('model-response-content bodies exclude thought and action chrome',()=>{
  const p=page('<chat-window-content><user-query><div class="query-content">问题</div><div role="button">编辑</div></user-query><model-response><div class="thoughts-container"><div class="markdown-main-panel">推理面板</div></div><model-response-content><div class="markdown-main-panel">正式回答</div></model-response-content><div class="table-footer">导出表格</div></model-response></chat-window-content>');
  try{assert.deepEqual(p.read().messages.map(m=>m.text),['问题','正式回答']);}finally{p.dom.window.close();}
});
test('lazy attachment images can be collected before dimensions are available',()=>{
  const p=page('<main><model-response><single-image><img data-src="'+URL+'"></single-image><span class="avatar"><img src="'+URL+'" width="100"></span></model-response></main>');
  try{assert.equal(p.read().resources.length,1);assert.equal(p.read().resources[0].url,URL);}finally{p.dom.window.close();}
});
test('direct JSON and base64 message metadata both keep the conversation association',()=>{
  const value=JSON.stringify([['r_0000000000000001',C]]);
  for(const encoded of [value,Buffer.from(value).toString('base64')]){
    const p=page('<main><model-response></model-response></main>');try{const el=p.doc.querySelector('model-response');el.setAttribute('jslog','BardVeMetadataKey:'+encoded+';mutable:true');assert.deepEqual(c.metadataIDs(el),{response:'r_0000000000000001',conversation:C});}finally{p.dom.window.close();}
  }
});
test('semantic fallback still finds messages when common outer wrappers change',()=>{const p=page('<section><user-query><user-query-content>问题</user-query-content></user-query><model-response><message-content>回答</message-content></model-response></section>');try{assert.equal(p.read().locator_stage,'semantic-nodes');assert.equal(p.read().messages.length,2);}finally{p.dom.window.close();}});
