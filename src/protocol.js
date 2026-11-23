const HISTORY_RPC='hNvQHb',IMAGE_RPC='c8o8Fe';
function geminiRoute(pathname,search=''){
  const m=String(pathname||'').match(/^\/(?:u\/(\d+)\/)?app\/(?:c_)?([0-9a-f]{16})\/?$/i);
  if(!m)return null;
  const q=new URLSearchParams(search),extra={};
  for(const key of ['authuser','pageId']){const v=q.get(key);if(v&&v.length<=200&&!/[\u0000-\u0020]/.test(v))extra[key]=v;}
  const prefix=m[1]!=null?`/u/${m[1]}`:'';
  return {id:'c_'+m[2].toLowerCase(),slot:m[1]??null,prefix,path:pathname,extra,key:prefix+'|'+m[2].toLowerCase()+'|'+JSON.stringify(extra)};
}
function configFields(value){
  if(!value||typeof value!=='object')return null;
  const out={};for(const k of ['SNlM0e','cfb2h','FdrFJe']){
    let v;try{v=value[k];}catch{return null;}
    if(typeof v!=='string'||!v||v.length>16000||/[\r\n]/.test(v))return null;out[k]=v;
  }return out;
}
function configFromHTML(text){
  const out={};for(const k of ['SNlM0e','cfb2h','FdrFJe']){
    const m=String(text).match(new RegExp('"'+k+'"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")'));
    if(!m)return null;try{out[k]=JSON.parse(m[1]);}catch{return null;}
  }return configFields(out);
}
function approvedResource(input){
  const raw=String(input||'');
  if(!raw||raw!==raw.trim()||raw.startsWith('//')||/[\\\u0000-\u0020]/.test(raw))throw new ExportError('BLOCKED_URL');
  let u;try{u=new URL(raw);}catch{throw new ExportError('BLOCKED_URL');}
  if(u.protocol!=='https:'||u.username||u.password||u.hash||(u.port&&u.port!=='443'))throw new ExportError('BLOCKED_URL');
  const h=u.hostname.toLowerCase();
  const cdn=h==='googleusercontent.com'||h.endsWith('.googleusercontent.com');
  const userContent=h==='usercontent.google.com'||h.endsWith('.usercontent.google.com');
  const imageGoogle=/^lh[1-7]\.google\.com$/.test(h)&&/^\/(?:gg|gg-dl|rd-gg)\//.test(u.pathname);
  if(!cdn&&!userContent&&!imageGoogle)throw new ExportError('BLOCKED_URL');
  // These Google download services can require their own browser cookies.
  // Let the manager send origin-scoped cookies; never copy Gemini cookies,
  // CSRF values or Authorization headers between hosts.
  const credentialed=(/^lh[1-7]\.(?:googleusercontent|google)\.com$/.test(h)&&/^\/(?:gg|gg-dl|rd-gg)\//.test(u.pathname))||
    (h==='contribution.usercontent.google.com'&&u.pathname==='/download')||h==='work.fife.usercontent.google.com';
  return {url:u,credentialed};
}
function safeHost(value){try{return new URL(value).hostname;}catch{return undefined;}}
function responseShape(value,depth=0){
  if(value===null)return 'null';
  if(Array.isArray(value))return 'array'+value.length+'['+(depth<3?value.slice(0,4).map(x=>responseShape(x,depth+1)).join(','):'')+']';
  return ['string','number','boolean','object'].includes(typeof value)?typeof value:'unknown';
}
function parseBatchResponse(raw,rpcId=HISTORY_RPC){
  if(typeof raw!=='string'||!raw.trim())throw new ExportError('INVALID_RPC_RESPONSE');
  const text=raw.replace(/^\s*\)\]\}'\r?\n?/,'');let p=0;const frames=[];
  while(p<text.length){
    while(/\s/.test(text[p]||'')&&p<text.length)p++;
    if(p>=text.length)break;
    if(/\d/.test(text[p])){
      const marker=text.slice(p).match(/^\d+\r?\n/);if(!marker)throw new ExportError('INVALID_RPC_RESPONSE');p+=marker[0].length;continue;
    }
    if(!['[','{'].includes(text[p]))throw new ExportError('INVALID_RPC_RESPONSE');
    const start=p,stack=[];let quoted=false,escaped=false,end=-1;
    for(;p<text.length;p++){
      const c=text[p];
      if(quoted){if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c==='"')quoted=false;continue;}
      if(c==='"'){quoted=true;continue;}
      if(c==='['||c==='{')stack.push(c);
      if(c===']'||c==='}'){
        if(stack.pop()!==(c===']'?'[':'{'))throw new ExportError('INVALID_RPC_RESPONSE');
        if(!stack.length){end=++p;break;}
      }
    }
    if(end<0)throw new ExportError('INVALID_RPC_RESPONSE');
    try{frames.push(JSON.parse(text.slice(start,end)));}catch{throw new ExportError('INVALID_RPC_RESPONSE');}
  }
  const hits=[];
  function walk(v,depth=0){if(depth>100)throw new ExportError('INVALID_RPC_RESPONSE');if(!Array.isArray(v))return;
    if(v[0]==='wrb.fr'&&v[1]===rpcId){if(typeof v[2]!=='string')throw new ExportError('INVALID_RPC_RESPONSE');hits.push(v[2]);return;}
    for(const x of v)walk(x,depth+1);
  }
  for(const f of frames)walk(f);
  if(hits.length!==1)throw new ExportError('INVALID_RPC_RESPONSE');
  try{return JSON.parse(hits[0]);}catch{throw new ExportError('INVALID_RPC_RESPONSE');}
}
function parseHistoryPage(payload){
  if(!Array.isArray(payload)||!Array.isArray(payload[0])||(payload[1]!=null&&typeof payload[1]!=='string'))throw new ExportError('RPC_SCHEMA_CHANGED');
  return {turns:payload[0],cursor:payload[1]||null};
}
function makeGeminiNetwork({route,fetchImpl,gmRequest,getConfig=()=>null,signal,log,sleep=pause,stillHere=()=>true}){
  let config=null;
  function context(){checkAbort(signal);if(!stillHere())throw new ExportError('WRONG_PAGE');}
  function downloadError(error,stage,input){
    const host=safeHost(input),login=host==='accounts.google.com';
    const e=login?new ExportError('RESOURCE_LOGIN_REQUIRED',error.status||0):error;
    e.stage=stage;e.id_kind=login?'google-login':host&&(/(?:^|\.)googleusercontent\.com$/.test(host)||/(?:^|\.)usercontent\.google\.com$/.test(host)||/^lh[1-7]\.google\.com$/.test(host))?'google-download':'external-or-invalid';
    if(e.id_kind!=='external-or-invalid')e.host=host;
    log.add(errorCode(e),{stage,host:e.host,id_kind:e.id_kind,status:e.status||0},'warn');return e;
  }
  function target(input,stage){try{return approvedResource(input);}catch(e){throw downloadError(e,stage,input);}}
  async function browserRead(url,options,maxBytes){
    context();const controller=new AbortController();let timedOut=false;
    const cancel=()=>controller.abort(),timer=setTimeout(()=>{timedOut=true;controller.abort();},60000);
    signal?.addEventListener('abort',cancel,{once:true});
    try{
      const response=await fetchImpl(url,{...options,signal:controller.signal,redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
      if(response.redirected||(response.url&&response.url!==url))throw new ExportError('REDIRECT_BLOCKED');
      const bytes=await readLimited(response,maxBytes,controller.signal);context();return {status:response.status,bytes,headers:response.headers};
    }catch(e){if(signal?.aborted)throw new ExportError('CANCELLED');if(timedOut)throw new ExportError('TIMEOUT');if(e instanceof ExportError)throw e;throw new ExportError('NETWORK_ERROR');}
    finally{clearTimeout(timer);signal?.removeEventListener('abort',cancel);}
  }
  async function ready(){
    if(config)return;context();config=configFields(getConfig());
    if(!config){
      const url=new URL(route.path,'https://gemini.google.com');for(const[k,v]of Object.entries(route.extra))url.searchParams.set(k,v);
      const r=await browserRead(url.href,{method:'GET',credentials:'same-origin',mode:'same-origin',headers:{}},8*MiB);
      if(r.status===401)throw new ExportError('LOGIN_REQUIRED');if(r.status!==200)throw new ExportError('HTTP_'+r.status,r.status);
      config=configFromHTML(decoder.decode(r.bytes));
    }
    if(!config)throw new ExportError('CONFIG_UNAVAILABLE');log.add('SESSION_READY');
  }
  async function rpc(id,args){
    if(![HISTORY_RPC,IMAGE_RPC].includes(id))throw new ExportError('BLOCKED_URL');
    await ready();context();
    const query=new URLSearchParams({rpcids:id,'source-path':route.path,bl:config.cfb2h,'f.sid':config.FdrFJe,hl:'zh-CN',_reqid:String(100000+Math.floor(Math.random()*8e6)),rt:'c',...route.extra});
    const url='https://gemini.google.com'+route.prefix+'/_/BardChatUi/data/batchexecute?'+query;
    const body=new URLSearchParams({'f.req':JSON.stringify([[[id,JSON.stringify(args),null,'generic']]]),at:config.SNlM0e}).toString();
    for(let attempt=1;attempt<=3;attempt++){
      let r;try{r=await browserRead(url,{method:'POST',credentials:'same-origin',mode:'same-origin',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','X-Same-Domain':'1'},body},64*MiB);}
      catch(e){if(!['NETWORK_ERROR','TIMEOUT'].includes(errorCode(e))||attempt===3)throw e;log.add('RETRY',{attempt,stage:'history'},'warn');await sleep(attempt*800,signal);continue;}
      if(r.status>=200&&r.status<300){const payload=parseBatchResponse(decoder.decode(r.bytes),id);log.add('RPC_SHAPE',{strategy:id===HISTORY_RPC?'history':'image-original',json_shape:responseShape(payload)});return payload;}
      if(r.status===401)throw new ExportError('LOGIN_REQUIRED',401);
      if((r.status===429||r.status>=500)&&attempt<3){log.add('RETRY',{attempt,status:r.status},'warn');await sleep(Math.min(15000,attempt*1500),signal);continue;}
      throw new ExportError('HTTP_'+r.status,r.status);
    }
  }
  async function binaryOnce(input,maxBytes){
    context();const {url,credentialed}=target(input,'request-url');
    if(!gmRequest){
      if(credentialed)throw new ExportError('NETWORK_ERROR');
      return browserRead(url.href,{method:'GET',credentials:'omit',mode:'cors',headers:{}},maxBytes);
    }
    return new Promise((resolve,reject)=>{
      let handle,finished=false,timer;
      const finish=(err,result)=>{if(finished)return;finished=true;clearTimeout(timer);signal?.removeEventListener('abort',cancel);err?reject(err):resolve(result);};
      const cancel=()=>{finish(new ExportError('CANCELLED'));try{handle?.abort?.();}catch{}};
      signal?.addEventListener('abort',cancel,{once:true});
      // In fetch mode some managers ignore their timeout option. This timer
      // also bounds a request when none of the manager callbacks arrives.
      timer=setTimeout(()=>{finish(downloadError(new ExportError('TIMEOUT'),'download-timeout',url.href));try{handle?.abort?.();}catch{}},60000);
      try{
        handle=gmRequest({method:'GET',url:url.href,anonymous:!credentialed,redirect:'manual',fetch:true,responseType:'arraybuffer',timeout:60000,headers:{},
          onprogress(e){if(e.loaded>maxBytes||e.total>maxBytes){finish(new ExportError('FILE_TOO_LARGE'));try{handle?.abort?.();}catch{}}},
          onload(e){try{
            context();if(e.finalUrl&&target(e.finalUrl,'final-url').url.href!==url.href)throw downloadError(new ExportError('REDIRECT_BLOCKED'),'automatic-redirect',e.finalUrl);
            const bytes=new Uint8Array(e.response||new ArrayBuffer(0));if(bytes.length>maxBytes)throw new ExportError('FILE_TOO_LARGE');
            const headers=new Headers();for(const line of String(e.responseHeaders||'').split(/\r?\n/)){const p=line.indexOf(':');if(p>0)try{headers.append(line.slice(0,p),line.slice(p+1).trim());}catch{}}
            finish(null,{status:e.status,bytes,headers});
          }catch(e){finish(e);}},onerror(){finish(new ExportError('NETWORK_ERROR'));},ontimeout(){finish(new ExportError('TIMEOUT'));},onabort(){finish(new ExportError(signal?.aborted?'CANCELLED':'NETWORK_ERROR'));}
        });
        if(handle?.catch)handle.catch(()=>finish(new ExportError('NETWORK_ERROR')));
        if(signal?.aborted)cancel();
      }catch{finish(new ExportError('NETWORK_ERROR'));}
    });
  }
  async function request(input,maxBytes=256*MiB,chain=new Set()){
    const href=target(input,'request-url').url.href;if(chain.has(href)||chain.size>=6)throw downloadError(new ExportError('REDIRECT_LOOP'),'redirect-loop',input);
    const next=new Set(chain);next.add(href);
    for(let attempt=1;attempt<=3;attempt++){
      let r;try{r=await binaryOnce(href,maxBytes);}catch(e){if(!['NETWORK_ERROR','TIMEOUT'].includes(errorCode(e))||attempt===3)throw e;log.add('RETRY',{attempt,host:safeHost(href)},'warn');await sleep(attempt*800,signal);continue;}
      if([301,302,303,307,308].includes(r.status)){
        const location=r.headers.get('location');if(!location)throw downloadError(new ExportError('REDIRECT_LOCATION_MISSING',r.status),'redirect-header',href);
        let destination;try{destination=new URL(location,href).href;}catch{throw downloadError(new ExportError('BLOCKED_URL'),'redirect-target',location);}
        target(destination,'redirect-target');log.add('DOWNLOAD_REDIRECT',{host:safeHost(destination),stage:'redirect-target'});return request(destination,maxBytes,next);
      }
      if(r.status>=200&&r.status<300){
        const length=r.headers.get('content-length');if(length&&!r.headers.get('content-encoding')&&/^\d+$/.test(length)&&Number(length)!==r.bytes.length)throw new ExportError('TRUNCATED_CONTENT');return r;
      }
      if((r.status===429||r.status>=500)&&attempt<3){await sleep(attempt*1500,signal);continue;}
      throw downloadError(new ExportError(r.status?'HTTP_'+r.status:'REDIRECT_LOCATION_MISSING',r.status),'download-response',href);
    }
  }
  return {rpc,request,ready,clear(){config=null;}};
}
async function collectHistory({net,route,signal,log,progress,maxPages=200}){
  const pages=[],seenCursors=new Set(),seenTurns=new Map(),newest=[];let cursor=null;
  for(let page=0;page<maxPages;page++){
    checkAbort(signal);const payload=await net.rpc(HISTORY_RPC,[route.id,50,cursor,1,[0],[4],null,1]);
    const part=parseHistoryPage(payload);pages.push(payload);let fresh=0;
    for(const raw of part.turns){
      const id=raw?.[0]?.[1],cid=raw?.[0]?.[0];
      if(!Array.isArray(raw)||cid!==route.id||!/^r_[0-9a-f]{16}$/i.test(id||''))throw new ExportError(cid&&cid!==route.id?'WRONG_CONVERSATION':'RPC_SCHEMA_CHANGED');
      const serialized=JSON.stringify(raw);
      if(seenTurns.has(id)){if(seenTurns.get(id)!==serialized)throw new ExportError('PAGE_CONFLICT');continue;}
      seenTurns.set(id,serialized);newest.push(raw);fresh++;
    }
    log.add('HISTORY_PAGE',{index:page+1,total:part.turns.length,success:fresh});progress?.({stage:'history',pages:page+1,turns:newest.length});
    if(!part.cursor){if(!newest.length)throw new ExportError('EMPTY_HISTORY');return {pages,rawTurns:[...newest].reverse()};}
    if(!fresh||!part.turns.length||seenCursors.has(part.cursor))throw new ExportError('PAGINATION_STALLED');
    seenCursors.add(part.cursor);cursor=part.cursor;await pause(180,signal);
  }
  throw new ExportError('HISTORY_LIMIT');
}
