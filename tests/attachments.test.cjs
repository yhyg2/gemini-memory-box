const {test}=require('node:test'),assert=require('node:assert/strict');
const c=require('../gemini-memory-box.user.js'),{C,PNG,URL,turn,mediaEntry}=require('./fixtures.cjs');
const route=c.geminiRoute('/app/0123456789abcdef'),log=()=>c.makeLogger(),code=s=>e=>e.code===s;
const section=raw=>({raw,role:'assistant',text:'',message_id:'synthetic:assistant',node_id:'synthetic',response_id:'r_0000000000000001',candidate_id:'rc_0000000000000001'});
const response=(b=PNG,type='image/png')=>({bytes:b,status:200,headers:new Headers({'content-type':type,'content-length':String(b.length)})});
test('Google CDN and image-specific Google paths pass; arbitrary destinations fail',()=>{
  for(const u of [URL,'https://lh3.googleusercontent.com/gg-dl/KEY=s0','https://drive.usercontent.google.com/download?id=F','https://lh3.google.com/gg/X'])c.approvedResource(u);
  for(const u of ['https://example.com/x','https://lh3.googleusercontent.com.evil.test/x','https://accounts.google.com/','https://lh3.google.com/search','http://lh3.googleusercontent.com/gg/X','https://u:p@lh3.googleusercontent.com/gg/X','https://lh3.googleusercontent.com:444/gg/X','//lh3.googleusercontent.com/x','https://lh3.googleusercontent.com/x#f','https://lh3.googleusercontent.com/gg/\\x'])assert.throws(()=>c.approvedResource(u),code('BLOCKED_URL'));
});
test('full-size keeps gg-dl asset identity, signed query and path',()=>{assert.equal(c.fullSizeURL('https://lh3.googleusercontent.com/gg-dl/KEY=w1024-h512?token=abc'),'https://lh3.googleusercontent.com/gg-dl/KEY=s0?token=abc');assert.equal(c.canonicalResource(URL+'=w100-h200'),URL);});
test('resource discovery keeps user and model media separate and deduplicates same URL',()=>{
  const selected=c.selectTurns([turn(1,{attachments:[mediaEntry(),mediaEntry()]})],route),a=c.discoverResources(selected.messages);assert.equal(a.length,1);assert.equal(a[0].kind,'images');assert.equal(a[0].media_token,'$SYNTHETIC_TOKEN');assert.equal(a[0].occurrences[0].role,'assistant');
});
test('file metadata carries filename/MIME to nested download URL',()=>{
  const raw=['rc_0000000000000001',['text'],null,['notes.pdf','application/pdf',['https://lh3.googleusercontent.com/contrib/FILE']]];
  const a=c.discoverResources([section(raw)]);assert.equal(a.length,1);assert.equal(a[0].name,'notes.pdf');assert.equal(a[0].kind,'files');
});
test('ordinary message text that looks like a filename is not a phantom attachment',()=>{const raw=['rc_0000000000000001',['notes.pdf']];assert.deepEqual(c.discoverResources([{...section(raw),text:'notes.pdf'}]),[]);});
test('filename-only upload creates a visible missing-original entry',()=>{const raw=['rc_0000000000000001',['text'],null,['report.docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document']];const a=c.discoverResources([section(raw)]);assert.equal(a[0].unavailable,'ORIGINAL_URL_MISSING');});
test('external Markdown image stays a reference; code examples are not fetched',()=>{
  const s={...section([]),text:'![remote](https://example.com/picture.png)\n```md\n![fake](https://evil.test/x)\n```'};const a=c.discoverResources([s]);assert.equal(a.length,1);assert.equal(a[0].reference,true);
});
test('native image original request uses the exact media token and own turn IDs',async()=>{
  const a=c.discoverResources(c.selectTurns([turn(1,{attachments:[mediaEntry()]})],route).messages)[0];let calls=0;
  const file=await c.acquireResource(a,{route,settings:c.DEFAULTS,log:log(),net:{rpc:async(id,args)=>{assert.equal(id,'c8o8Fe');assert.equal(args[0][0][3][5],'$SYNTHETIC_TOKEN');assert.equal(args[1][2],C);return [URL.replace('/gg/','/gg-dl/')];},request:async u=>{calls++;assert(u.includes('/gg-dl/'));assert(u.endsWith('=s0'));return response();}}});
  assert(file.originalVerified);assert.equal(calls,1);assert.deepEqual(file.bytes,PNG);
});
test('a full-size request without proof is saved but not claimed as an original',async()=>{const a={pointer:URL,kind:'images',name:'x.png'};const f=await c.acquireResource(a,{net:{request:async()=>response()},route,settings:c.DEFAULTS,log:log()});assert.equal(f.originalVerified,false);});
test('loaded pixel fallback is explicitly a page copy',async()=>{const a={pointer:URL,kind:'images',pageBytes:PNG};const f=await c.acquireResource(a,{net:{request:async()=>{throw new c.ExportError('HTTP_404');}},route,settings:c.DEFAULTS,log:log()});assert(f.pageCopy);assert.equal(f.originalVerified,false);});
test('HTML login page cannot be saved as a PNG or PDF',async()=>{for(const kind of ['images','files'])await assert.rejects(c.acquireResource({pointer:URL,kind,name:kind==='images'?'x.png':'x.pdf'},{net:{request:async()=>response(new TextEncoder().encode('<html>login</html>'),'text/html')},route,settings:c.DEFAULTS,log:log()}),code('ERROR_PAGE'));});
test('JSON and text uploads keep literal content instead of following embedded URLs',async()=>{
  for(const [name,text,type]of [['x.json','{"url":"https://evil.test/x"}','application/json'],['x.txt','https://evil.test/x','text/plain']]){
    let calls=0;const bytes=new TextEncoder().encode(text),file=await c.acquireResource({pointer:'https://lh3.googleusercontent.com/contrib/FILE',kind:'files',name},{net:{request:async()=>{calls++;return response(bytes,type);}},route,settings:c.DEFAULTS,log:log()});assert.equal(calls,1);assert.equal(new TextDecoder().decode(file.bytes),text);
  }
});
test('image metadata download chain cannot request external hosts',async()=>{let calls=0;await assert.rejects(c.acquireResource({pointer:URL,kind:'images'},{net:{request:async()=>{calls++;return response(new TextEncoder().encode('{"url":"https://evil.test/x"}'),'application/json');}},route,settings:c.DEFAULTS,log:log()}),code('BLOCKED_URL'));assert.equal(calls,2);});
function gmMock(handler){return details=>{queueMicrotask(()=>handler(details));return {abort(){}};};}
function netWithGM(gm,fetchImpl=async()=>{throw Error('unexpected');}){return c.makeGeminiNetwork({route,log:log(),gmRequest:gm,fetchImpl,sleep:async()=>{}});}
test('ordinary CDN download is anonymous and contains no session headers',async()=>{
  const net=netWithGM(gmMock(d=>{assert.equal(d.anonymous,true);assert.deepEqual(d.headers,{});assert.equal(d.redirect,'manual');d.onload({status:200,finalUrl:d.url,response:PNG.buffer,responseHeaders:'Content-Type: image/png'});}));await net.request('https://lh3.googleusercontent.com/contrib/FILE');
});
test('generated image may use own Google cookies without copying Gemini credentials',async()=>{
  const net=netWithGM(gmMock(d=>{assert.equal(d.anonymous,false);assert.deepEqual(d.headers,{});d.onload({status:200,finalUrl:d.url,response:PNG.buffer});}));await net.request(URL);
});
test('validated redirect is followed only after target is allowlisted',async()=>{
  const seen=[];const net=netWithGM(gmMock(d=>{seen.push(d.url);d.onload({status:302,finalUrl:d.url,response:new ArrayBuffer(0),responseHeaders:'Location: https://evil.test/private'});}));await assert.rejects(net.request(URL),code('BLOCKED_URL'));assert.equal(seen.length,1);
});
test('a redirect reconstructs credential mode for the new origin/path',async()=>{
  const modes=[];const net=netWithGM(gmMock(d=>{modes.push(d.anonymous);d.onload({status:modes.length===1?302:200,finalUrl:d.url,response:modes.length===1?new ArrayBuffer(0):PNG.buffer,responseHeaders:modes.length===1?'Location: https://images.googleusercontent.com/signed/X':'Content-Type: image/png'});}));await net.request(URL);assert.deepEqual(modes,[false,true]);
});
test('managers that silently follow redirects are not treated as verified downloads',async()=>{const net=netWithGM(gmMock(d=>d.onload({status:200,finalUrl:'https://lh3.googleusercontent.com/gg/OTHER',response:PNG.buffer})));await assert.rejects(net.request(URL),code('REDIRECT_BLOCKED'));});
test('declared truncation, file limit and cancellation are enforced',async()=>{
  const bad=netWithGM(gmMock(d=>d.onload({status:200,finalUrl:d.url,response:PNG.buffer,responseHeaders:'Content-Length: 900'})));await assert.rejects(bad.request(URL),code('TRUNCATED_CONTENT'));
  const large=netWithGM(gmMock(d=>d.onprogress({loaded:20,total:20})));await assert.rejects(large.request(URL,10),code('FILE_TOO_LARGE'));
  const ac=new AbortController(),net=c.makeGeminiNetwork({route,log:log(),signal:ac.signal,gmRequest:()=>({abort(){}}),fetchImpl:()=>{}});const promise=net.request(URL);ac.abort();await assert.rejects(promise,code('CANCELLED'));
});
test('diagnostics contain no raw identifiers, token, filenames, URLs or body text',()=>{
  const l=log();l.add('ERROR',{status:403,host:'lh3.googleusercontent.com',title:'PRIVATE TITLE',url:URL,token:'SECRET',body:'PRIVATE BODY',filename:'SECRET.pdf',strategy:'native-original'});const s=JSON.stringify(l.snapshot());for(const value of ['PRIVATE','SECRET',URL,'SYNTHETIC_ASSET'])assert(!s.includes(value));
});
