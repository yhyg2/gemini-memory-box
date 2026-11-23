/* Synthetic reproductions of tuple, citation, sidecar and fallback failures.
 * No account data, signed URLs, real titles, filenames or media tokens. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../gemini-memory-box.user.js');
const {PNG,URL,C,turn,uploadEntry,dep}=require('./fixtures.cjs'),JSZip=dep('jszip');
const route=c.geminiRoute('/app/0123456789abcdef');
const ok=(bytes=PNG,mime='image/png')=>({bytes,headers:new Headers({'content-type':mime})});
const fail=()=>{throw new c.ExportError('HTTP_403',403);};
const selected=raw=>c.selectTurns([raw],route).messages;
function typedImage(name='generated.png',url=URL,token='$SYNTHETIC_GENERATED'){
  const a=uploadEntry(1,name,url,'image/png');a[5]=token;return a;
}
function generatedTurn(){
  const raw=turn(1),node=Array(4).fill(null);node[3]=typedImage();
  raw[3][0][0][8]=[node];return raw;
}
async function archive(raw,{settings={},request=async()=>ok(),rpc=async()=>[URL.replace('/gg/','/gg-dl/')],localFiles=[]}={}){
  const sink=c.memorySink(),net={rpc:async(id,args)=>id==='hNvQHb'?[[raw],null]:rpc(id,args),request,clear(){}};
  const report=await c.exportArchive({net,route,localFiles,settings:{...c.DEFAULTS,...settings},log:c.makeLogger(),zip:new c.ZipWriter(sink)});
  return {report,zip:await JSZip.loadAsync(await sink.blob().arrayBuffer(),{checkCRC32:true})};
}
test('upload lists do not create another unnamed native image',()=>{
  const uploads=Array.from({length:5},(_,i)=>{const a=uploadEntry(1,`input-${i}.png`,URL+'-'+i,'image/png');a[5]='$SYNTHETIC_INPUT_'+i;return a;});
  const a=c.discoverResources(selected(turn(1,{userAttachments:uploads})));
  assert.equal(a.length,5);assert(a.every(x=>x.name&&x.pointer&&!x.media_token));
});
test('context-cache files are associated only with the prompt that uploaded them',()=>{
  const a=uploadEntry(1,'input-a.png',URL+'-A','image/png'),b=uploadEntry(1,'input-b.png',URL+'-B','image/png');
  const first=turn(1),later=turn(2);first[2][0][4]=[[null,null,null,[a,b],[a,b]]];later[2][0][4]=[[null,null,null,null,[a,b]]];
  const selected=c.selectTurns([first,later],route),items=c.discoverResources(selected.messages);
  assert.equal(items.length,2);for(const item of items){assert.equal(item.occurrences.length,1);assert.equal(item.occurrences[0].message_id,selected.messages[0].message_id);}
  assert.equal(items.inventory.context_cache_entries,4);
});
test('typed generated image and its original token are one attachment',()=>{
  const a=c.discoverResources(selected(generatedTurn()));
  assert.equal(a.length,1);assert.equal(a[0].pointer,URL);assert.equal(a[0].media_token,'$SYNTHETIC_GENERATED');assert.equal(a[0].name,'generated.png');
});
test('failed original keeps its own display file and stays out of the missing-file list',async()=>{
  const {report,zip}=await archive(generatedTurn(),{rpc:fail});
  assert.equal(report.attachments_selected,1);assert.equal(report.attachments_saved,1);assert.equal(report.attachments_failed,0);
  assert.equal(report.images_unverified,1);assert.equal(report.original_download_failures,1);assert.equal(report.result,'partial');
  assert.deepEqual(JSON.parse(await zip.file('附件失败清单.json').async('string')),[]);
  const pending=JSON.parse(await zip.file('附件待核实清单.json').async('string'));assert.equal(pending.length,1);assert(zip.file(pending[0].path));assert.equal(pending[0].attempts[0].strategy,'native-original');
});
test('citation chips are references to an upload, not missing attachments',()=>{
  const citation=uploadEntry(1,'input.png',null,'image/png');
  const raw=turn(1,{userAttachments:[uploadEntry(1,'input.png',URL,'image/png')]});
  raw[3][0][0][12]=[{'44':[[citation,['input.png']]]},null,null,{'44':[[citation]],'8':[[null,null,null,[null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,['input.png']]]]}];
  const a=c.discoverResources(selected(raw));assert.equal(a.length,1);assert(a[0].pointer);assert.equal(a.inventory.filename_references,1);
});
test('generator sidecar and its context copy are excluded, similarly named user upload is retained',()=>{
  const internal=uploadEntry(3,'thought_signature_123.pb','https://contribution.usercontent.google.com/download?c=SYNTHETIC_INTERNAL','application/protobuf');
  const actual=uploadEntry(16,'thought_signature_456.pb','https://contribution.usercontent.google.com/download?c=SYNTHETIC_USER','application/protobuf');
  const raw=turn(1,{userAttachments:[internal,actual]}),aux=Array(23).fill(null);aux[0]=23;aux[22]=internal;raw[3][0][0][8]=[aux];
  const a=c.discoverResources(selected(raw));assert.equal(a.length,1);assert.equal(a[0].name,'thought_signature_456.pb');assert.equal(a.inventory.internal_resources,1);
});
test('same filename with different asset URLs remains two resources',()=>{
  const a=c.discoverResources(selected(turn(1,{userAttachments:[uploadEntry(1,'same.png',URL+'-A','image/png'),uploadEntry(1,'same.png',URL+'-B','image/png')]})));
  assert.equal(a.length,2);assert.notEqual(a[0].pointer,a[1].pointer);
});
test('equal bytes reuse one ZIP entry while both message associations remain',async()=>{
  const raw=turn(1,{userAttachments:[uploadEntry(1,'a.png',URL+'-A','image/png',{size:PNG.length}),uploadEntry(1,'b.png',URL+'-B','image/png',{size:PNG.length})]});
  const {report,zip}=await archive(raw),list=JSON.parse(await zip.file('附件清单.json').async('string'));
  assert.equal(report.attachments_saved,2);assert.equal(report.unique_attachment_files,1);assert.equal(report.duplicate_content_reused,1);assert.equal(list.length,2);assert.equal(list[0].path,list[1].path);assert.equal(list[1].content_reused_from,1);
  assert.equal(Object.keys(zip.files).filter(p=>p.startsWith('附件/')&&!p.endsWith('/')).length,1);
});
function extrasTurn(){
  const raw=turn(1),candidate=raw[3][0][0],source='<!doctype html><script>throw new Error("SYNTHETIC_CODE");</script>';
  candidate[37]=[['**Synthetic summary**\n\n摘要文本'],[['SYNTHETIC_DETAIL']]];
  raw[3][12]=[[[[null,null,null,[source,'html']]]]];return {raw,source};
}
test('returned summaries and structured code become local text with exact original data',async()=>{
  const {raw,source}=extrasTurn(),{report,zip}=await archive(raw);
  assert.equal(report.thought_summaries_saved,1);assert.equal(report.structured_sources_saved,1);
  const list=JSON.parse(await zip.file('生成内容清单.json').async('string'));assert(list[0].path.endsWith('.html.txt'));assert.equal(await zip.file(list[0].path).async('string'),source);
  assert.equal(list[0].also_in_message,false);assert((await zip.file('思考摘要.txt').async('string')).includes('摘要文本'));
  const html=await zip.file('聊天记录.html').async('string');assert(html.includes('<details>'));assert(!/<script\b/.test(html));assert(html.includes(encodeURIComponent('生成内容')));
  assert((await zip.file('思考摘要.json').async('string')).includes('SYNTHETIC_DETAIL'));
});
test('extras switches control reading and extra files while raw payload is preserved',async()=>{
  const {raw,source}=extrasTurn(),{report,zip}=await archive(raw,{settings:{thoughts:false,sources:false}});
  assert.equal(report.thought_summaries_saved,0);assert.equal(report.structured_sources_saved,0);assert.equal(zip.file('思考摘要.txt'),null);
  assert(!(await zip.file('聊天记录.html').async('string')).includes('摘要文本'));assert((await zip.file('原始对话.json').async('string')).includes('摘要文本'));
  assert(JSON.parse(await zip.file('原始对话.json').async('string')).pages[0][0][0][3][12][0][0][0][3][0]===source);
});
test('a source-only response is retained even without a separate text answer',async()=>{
  const {raw}=extrasTurn();raw[3][0][0][1]=[''];
  const {report,zip}=await archive(raw);assert.equal(report.messages,2);assert.equal(report.structured_sources_saved,1);assert(zip.file('生成内容清单.json'));
});
test('source metadata is not attached to an unverified candidate branch',()=>{
  const {raw}=extrasTurn(),other=structuredClone(raw[3][0][0]);other[0]='rc_0000000000000002';raw[3][0].push(other);raw[3][3]=null;
  const s=c.selectTurns([raw],route);assert.equal(s.messages[1].sources.length,0);assert(s.warnings.includes('SOURCES_UNVERIFIED'));
});
const mockGM=handler=>d=>{queueMicrotask(()=>handler(d));return {abort(){}};};
function net(gm,log=c.makeLogger()){return c.makeGeminiNetwork({route,gmRequest:gm,log,sleep:async()=>{},fetchImpl:async()=>{throw Error('unexpected');}});}
test('login redirect is identified without requesting or logging its URL',async()=>{
  const log=c.makeLogger();let calls=0;
  const n=net(mockGM(d=>{calls++;d.onload({status:302,finalUrl:d.url,response:new ArrayBuffer(0),responseHeaders:'Location: https://accounts.google.com/ServiceLogin?continue=PRIVATE_QUERY_VALUE'});}),log);
  await assert.rejects(n.request('https://contribution.usercontent.google.com/download?c=PRIVATE_SOURCE_VALUE'),e=>e.code==='RESOURCE_LOGIN_REQUIRED'&&e.stage==='redirect-target'&&e.host==='accounts.google.com');
  assert.equal(calls,1);const s=JSON.stringify(log.snapshot());assert(s.includes('google-login'));assert(!s.includes('PRIVATE_'));assert(!s.includes('ServiceLogin'));
});
test('authenticated Google download paths use their own cookies and rebuild mode on redirect',async()=>{
  const seen=[];await net(mockGM(d=>{seen.push({anonymous:d.anonymous,headers:d.headers});d.onload({status:seen.length===1?302:200,finalUrl:d.url,response:seen.length===1?new ArrayBuffer(0):PNG.buffer,responseHeaders:seen.length===1?'Location: https://images.googleusercontent.com/synthetic':'Content-Type: image/png'});})).request('https://contribution.usercontent.google.com/download?c=SYNTHETIC');
  assert.deepEqual(seen,[{anonymous:false,headers:{}},{anonymous:true,headers:{}}]);
  assert.equal(c.approvedResource('https://work.fife.usercontent.google.com/synthetic').credentialed,true);
  assert.equal(c.approvedResource('https://contribution.usercontent.google.com/upload').credentialed,false);
});
test('blocked external redirect logs its stage but no private destination or path',async()=>{
  const log=c.makeLogger();let calls=0;
  await assert.rejects(net(mockGM(d=>{calls++;d.onload({status:302,finalUrl:d.url,response:new ArrayBuffer(0),responseHeaders:'Location: https://private-owner.example/private-path?secret=PRIVATE_TOKEN'});}),log).request(URL),e=>e.code==='BLOCKED_URL'&&e.stage==='redirect-target');
  assert.equal(calls,1);const s=JSON.stringify(log.snapshot());assert(s.includes('external-or-invalid'));for(const x of ['private-owner','private-path','PRIVATE_TOKEN'])assert(!s.includes(x));
});
test('an independent timeout aborts a manager that never invokes callbacks',async()=>{
  const original=setTimeout;let aborted=0;
  global.setTimeout=(fn,delay)=>{assert.equal(delay,60000);queueMicrotask(fn);return undefined;};
  try{await assert.rejects(net(()=>({abort(){aborted++;}})).request(URL),e=>e.code==='TIMEOUT');assert.equal(aborted,3);}finally{global.setTimeout=original;}
});
test('a locally selected original fills a failed upload and is explicitly unverified',async()=>{
  const original=new JSZip();original.file('note.txt','SYNTHETIC LOCAL CONTENT');const bytes=await original.generateAsync({type:'uint8array'});
  const raw=turn(1,{userAttachments:[uploadEntry(16,'archive.zip','https://contribution.usercontent.google.com/download?c=SYNTHETIC','application/zip')]});
  const file={name:'archive.zip',type:'application/zip',size:bytes.length,arrayBuffer:async()=>bytes.buffer};
  const {report,zip}=await archive(raw,{request:fail,localFiles:[file]});
  assert.equal(report.attachments_saved,1);assert.equal(report.attachments_failed,0);assert.equal(report.local_files_unverified,1);assert.equal(report.result,'partial');
  const list=JSON.parse(await zip.file('附件清单.json').async('string'));assert.equal(list[0].provided_locally,true);assert.equal(list[0].original_verified,false);assert.equal(list[0].acquisition_strategy,'local-file');
  assert.deepEqual(await zip.file(list[0].path).async('uint8array'),bytes);assert.equal(JSON.parse(await zip.file('附件待核实清单.json').async('string')).length,1);
});
test('ambiguous local filenames and unrelated selections are never silently used',async()=>{
  const raw=turn(1,{userAttachments:[uploadEntry(16,'archive.zip','https://contribution.usercontent.google.com/download?c=SYNTHETIC','application/zip')]});let reads=0;
  const f={name:'archive.zip',size:4,type:'application/zip',arrayBuffer:async()=>{reads++;return new ArrayBuffer(4);}};
  const a=await archive(raw,{request:fail,localFiles:[f,f]});assert.equal(a.report.attachments_failed,1);assert.equal(JSON.parse(await a.zip.file('附件失败清单.json').async('string'))[0].error,'LOCAL_FILE_AMBIGUOUS');
  const b=await archive(raw,{request:fail,localFiles:[{...f,name:'other.zip'}]});assert.equal(b.report.attachments_saved,0);assert.equal(reads,0);
});
