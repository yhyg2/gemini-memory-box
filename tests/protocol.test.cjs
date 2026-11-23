const {test}=require('node:test'),assert=require('node:assert/strict');
const core=require('../gemini-memory-box.user.js');
const {C,rid,rcid,turn,frame,mediaEntry}=require('./fixtures.cjs');
const route=core.geminiRoute('/u/2/app/0123456789abcdef','?authuser=2');
const code=c=>e=>e.code===c;
test('secondary account path and account query are preserved',()=>{assert.equal(route.slot,'2');assert.equal(route.prefix,'/u/2');assert.equal(route.id,C);assert.equal(route.extra.authuser,'2');});
test('landing, shared, invalid and foreign-shaped paths are rejected',()=>{for(const p of ['/app','/share/0123456789abcdef','/app/abc','/u/no/app/0123456789abcdef','/app/0123456789abcdef/extra'])assert.equal(core.geminiRoute(p),null);});
test('framed Unicode and transport metadata decode exactly',()=>{const p=[[turn(1,{answer:'中文 😀\n```js\n1<2\n```'})],null];assert.deepEqual(core.parseBatchResponse(frame(p)),p);});
test('multi-line framed JSON and escaping decode without evaluation',()=>{const p=[[turn(1,{answer:'"[{\\"'})],null],f=JSON.stringify([['wrb.fr','hNvQHb',JSON.stringify(p)]],null,2);assert.deepEqual(core.parseBatchResponse(")]}'\n42\n"+f),p);});
test('truncated payload, malformed tail and duplicate RPC frames fail closed',()=>{for(const s of [frame([[],null]).slice(0,-15),frame([[],null])+'oops',frame([[],null])+frame([[],null]).replace(")]}'\n",'')])assert.throws(()=>core.parseBatchResponse(s),code('INVALID_RPC_RESPONSE'));});
test('unknown continuation cursor schema is refused',()=>{assert.throws(()=>core.parseHistoryPage([[],{next:'hidden'}]),code('RPC_SCHEMA_CHANGED'));});
test('configuration parses escaped JSON values without evaluating script',()=>{const x=core.configFromHTML('<script>evil();WIZ_global_data={"SNlM0e":"tok\\u0065n","cfb2h":"build","FdrFJe":"session"}</script>');assert.equal(x.SNlM0e,'token');assert.equal(core.configFromHTML('SNlM0e="x"'),null);});
test('missing page configuration does not fabricate session values',()=>{assert.equal(core.configFields({SNlM0e:'x'}),null);assert.equal(core.configFields({SNlM0e:'x\ny',cfb2h:'x',FdrFJe:'s'}),null);});
test('response shape diagnostics reveal types and lengths, never keys or values',()=>{const value=[['PRIVATE_ID','PRIVATE_BODY'],{PRIVATE_FILENAME:'SECRET_TOKEN'}],shape=core.responseShape(value);assert(shape.includes('string'));assert(!shape.includes('PRIVATE'));assert(!shape.includes('SECRET'));const log=core.makeLogger();log.add('RPC_SHAPE',{json_shape:shape});assert.equal(log.entries[0].json_shape,shape);});
test('read-only RPC keeps CSRF and session on the exact Gemini account origin',async()=>{
  const calls=[],log=core.makeLogger(),net=core.makeGeminiNetwork({route,log,getConfig:()=>({SNlM0e:'SECRET_CSRF',cfb2h:'build',FdrFJe:'SECRET_SID'}),fetchImpl:async(u,o)=>{calls.push({u,o});return new Response(frame([[turn(1)],null]),{status:200});}});
  await net.rpc('hNvQHb',[C,50,null,1,[0],[4],null,1]);const {u,o}=calls[0],url=new URL(u),body=new URLSearchParams(o.body);
  assert.equal(url.origin,'https://gemini.google.com');assert.equal(url.pathname,'/u/2/_/BardChatUi/data/batchexecute');assert.equal(url.searchParams.get('authuser'),'2');assert.equal(body.get('at'),'SECRET_CSRF');assert.equal(o.credentials,'same-origin');assert.equal(o.redirect,'error');
  assert(!JSON.stringify(log.snapshot()).includes('SECRET'));await assert.rejects(net.rpc('DELETE',[]),code('BLOCKED_URL'));
});
test('history pagination deduplicates an overlap and reverses exactly once',async()=>{
  let n=0;const pages=[[[turn(3),turn(2)],'cursor-1'],[[turn(2),turn(1)],null]];
  const out=await core.collectHistory({route,log:core.makeLogger(),net:{rpc:async(id,args)=>{assert.equal(id,'hNvQHb');assert.equal(args[2],n?'cursor-1':null);return pages[n++];}}});assert.deepEqual(out.rawTurns.map(t=>t[0][1]),[rid(1),rid(2),rid(3)]);assert.equal(out.pages.length,2);
});
test('a repeated history cursor stops rather than claiming completeness',async()=>{let n=0;await assert.rejects(core.collectHistory({route,log:core.makeLogger(),net:{rpc:async()=>[[turn(++n)],'same']}}),code('PAGINATION_STALLED'));});
test('overlap with changed message content is detected',async()=>{let n=0;await assert.rejects(core.collectHistory({route,log:core.makeLogger(),net:{rpc:async()=>n++?[[turn(1,{answer:'changed'})],null]:[[turn(1)],'next']}}),code('PAGE_CONFLICT'));});
test('wrong conversation cannot be exported under current chat',async()=>{const t=turn(1);t[0][0]='c_ffffffffffffffff';await assert.rejects(core.collectHistory({route,log:core.makeLogger(),net:{rpc:async()=>[[t],null]}}),code('WRONG_CONVERSATION'));});
test('continued candidate is selected by next-turn linkage',()=>{
  const t1=turn(1),alt=[rcid(99),['使用中的回答']];t1[3][0].push(alt);const t2=turn(2);t2[1][2]=rcid(99);
  assert.equal(core.selectTurns([t1,t2],route).messages[1].text,'使用中的回答');
});
test('missing branch parent, missing root and missing content are errors',()=>{
  const bad=turn(2);bad[1][1]=rid(77);assert.throws(()=>core.selectTurns([turn(1),bad],route),code('CHAIN_BROKEN'));
  assert.throws(()=>core.selectTurns([turn(2)],route),code('CHAIN_ROOT_MISSING'));
  assert.throws(()=>core.selectTurns([turn(1,{answer:''})],route),code('CONTENT_MISSING'));
});
test('image-only response is valid and exact original Markdown is retained',()=>{
  const text='```html\n<img src="https://example.com/x">\n```\n$$a<b$$';const out=core.selectTurns([turn(1,{user:text,answer:'',attachments:[mediaEntry()]})],route);assert.equal(out.messages[0].text,text);assert.equal(out.messages[1].text,'');
});
test('unresolved latest alternate candidate is explicitly marked',()=>{const t=turn(1);t[3][0].push([rcid(99),['alt']]);t[3][3]=null;assert.deepEqual(core.selectTurns([t],route).warnings,['CANDIDATE_UNVERIFIED']);});
test('cancelled or changed-account requests stop before making network calls',async()=>{
  let calls=0;const ac=new AbortController();ac.abort();for(const opts of [{signal:ac.signal},{stillHere:()=>false}]){
    const net=core.makeGeminiNetwork({route,log:core.makeLogger(),fetchImpl:async()=>{calls++;},...opts});await assert.rejects(net.ready());}assert.equal(calls,0);
});
