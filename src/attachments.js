function imageMime(bytes,supplied=''){
  const h=decoder.decode(bytes.subarray(0,160));
  if(bytes.length>=8&&bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71)return 'image/png';
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(/^GIF8[79]a/.test(h))return 'image/gif';
  if(h.startsWith('RIFF')&&h.slice(8,12)==='WEBP')return 'image/webp';
  if(h.slice(4,8)==='ftyp'&&/avif|avis/.test(h.slice(8,40)))return 'image/avif';
  if(h.startsWith('BM'))return 'image/bmp';
  // SVG is retained as an attachment but never embedded into the offline reader.
  if(/^(?:\s*<\?xml[^>]*>\s*)?<svg[\s>]/i.test(h))return 'image/svg+xml';
  return null;
}
function kindOf(mime='',name=''){
  if(/^image\//i.test(mime)||/\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i.test(name))return 'images';
  if(/^(?:audio|video)\//i.test(mime)||/\.(?:mp[34]|wav|ogg|m4a|webm|mov)(?:[?#]|$)/i.test(name))return 'media';
  return 'files';
}
function canonicalResource(value){
  try{const u=new URL(value);if(/^lh[1-7]\.(?:googleusercontent|google)\.com$/.test(u.hostname))u.pathname=u.pathname.replace(/=(?:s\d+|w\d+|h\d+|d-I)[\w-]*$/,'');return u.href;}catch{return String(value);}
}
function fullSizeURL(value){
  const {url}=approvedResource(value);
  if(!/^lh[1-7]\.(?:googleusercontent|google)\.com$/.test(url.hostname))return null;
  if(!/^\/(?:gg|gg-dl|rd-gg|aistudio|contrib)\//.test(url.pathname))return null;
  // Change the rendition suffix only; keep the exact server-issued asset key and path.
  url.pathname=url.pathname.replace(/=[\w-]+$/,'')+'=s0';return url.href;
}
function directURLs(value){
  const out=[];let visited=0;
  function walk(v,depth=0){if(depth>35||++visited>30000)return;
    if(typeof v==='string'){if(/^https:\/\/\S+$/.test(v))out.push(v);return;}
    if(Array.isArray(v))for(const x of v)walk(x,depth+1);
    else if(v&&typeof v==='object')for(const x of Object.values(v))walk(x,depth+1);
  }walk(value);return [...new Set(out)];
}
function discoverResources(sections,dom=[]){
  const items=[],keys=new Map(),internalURLs=new Set(),ignoredNames=new Set(),ignoredInternal=new Set();let walked=0,inspected=0,contextCacheEntries=0;
  const filename=/^[^\/\r\n<>]{1,180}\.(?:pdf|docx?|xlsx?|pptx?|zip|txt|md|csv|json|ipynb|py|js|html?|png|jpe?g|webp|gif|avif|svg|mp[34]|wav|ogg|m4a|webm)$/i;
  const internalName=s=>typeof s==='string'&&/^thought_signature_\d+\.pb$/i.test(s);
  function inspectInternal(v,depth=0){
    if(!v||typeof v!=='object')return;
    if(depth>70||++inspected>250000)throw new ExportError('RPC_SCHEMA_CHANGED');
    // This exact tuple is an image generator's protocol sidecar. Recognise it
    // at its protocol location; a user's similarly named file stays an upload.
    if(Array.isArray(v)&&v[0]===23&&Array.isArray(v[22])&&internalName(v[22][2])&&v[22][11]==='application/protobuf'){
      const url=v[22][7]?.[1];if(typeof url==='string')internalURLs.add(canonicalResource(url));
    }
    for(const x of Object.values(v))if(x&&typeof x==='object')inspectInternal(x,depth+1);
  }
  for(const section of sections)inspectInternal(section.raw);
  function noteNames(v,occurrence,depth=0){
    if(depth>50)return;
    if(typeof v==='string'&&filename.test(v))ignoredNames.add(occurrence.message_id+'|'+v);
    else if(v&&typeof v==='object')for(const x of Object.values(v))noteNames(x,occurrence,depth+1);
  }
  function add(source,occurrence){
    if(!source.pointer&&!source.media_token&&!source.name)return;
    const tokenKey=source.media_token?'token:'+source.media_token:null,urlKey=source.pointer?'url:'+canonicalResource(source.pointer):null;
    const key=tokenKey||urlKey||'missing:'+occurrence.message_id+'|'+source.name;
    let a=(tokenKey&&keys.get(tokenKey))||(urlKey&&keys.get(urlKey))||keys.get(key);
    if(!a){a={number:items.length+1,kind:'files',name:null,mime:null,pointer:null,media_token:null,occurrences:[],...source};items.push(a);}
    else{
      if(!a.media_token&&source.media_token){a.response_id=source.response_id;a.candidate_id=source.candidate_id;}
      for(const k of ['name','mime','pointer','media_token','expected_size','response_id','candidate_id'])if(!a[k]&&source[k])a[k]=source[k];
    }
    keys.set(key,a);if(tokenKey)keys.set(tokenKey,a);if(urlKey)keys.set(urlKey,a);
    if(!a.occurrences.some(o=>o.message_id===occurrence.message_id))a.occurrences.push({...occurrence});
    return a;
  }
  function visit(v,occurrence,ctx,depth=0,hint={}){
    if(depth>70||++walked>250000)throw new ExportError('RPC_SCHEMA_CHANGED');
    if(!v||typeof v!=='object')return;
    // Gemini's typed upload tuple has one download slot. Thumbnail/upload URLs
    // are alternatives with different purposes, not additional file originals.
    if(Array.isArray(v)&&[1,3,16].includes(v[1])&&typeof v[2]==='string'&&v[2].trim()&&v[2].length<=240&&
       (v[1]!==1||typeof v[3]==='string'||v[3]==null)){
      const kind=v[1]===1?'images':kindOf(typeof v[11]==='string'?v[11]:'',v[2]);
      const pointer=v[1]===1?(typeof v[3]==='string'?v[3]:null):(typeof v[7]?.[1]==='string'?v[7][1]:null);
      if(pointer&&internalURLs.has(canonicalResource(pointer))&&internalName(v[2])&&v[11]==='application/protobuf'){
        ignoredInternal.add(canonicalResource(pointer));return;
      }
      let allowed=false;if(pointer)try{approvedResource(pointer);allowed=true;}catch{}
      const size=Array.isArray(v[15])&&Number.isFinite(v[15][2])&&v[15][2]>0?v[15][2]:null;
      const token=kind==='images'&&occurrence.role==='assistant'&&typeof v[5]==='string'&&/^\$[^\s]{1,8190}$/.test(v[5])?v[5]:null;
      add({name:v[2],mime:typeof v[11]==='string'?v[11]:null,kind,pointer,media_token:token,expected_size:size,reference:Boolean(pointer&&!allowed),unavailable:pointer?null:'ORIGINAL_URL_MISSING',response_id:ctx.response_id,candidate_id:ctx.candidate_id},occurrence);
      return;
    }
    const values=Array.isArray(v)?v:Object.values(v),strings=values.filter(x=>typeof x==='string');
    const ownMime=strings.find(s=>/^(?:image|audio|video|application|text)\/[A-Za-z0-9.+_-]+$/.test(s))||null;
    const ownName=strings.find(s=>filename.test(s))||null;
    const mime=ownMime||hint.mime||null,name=ownName||hint.name||null;
    // A generated-media record has a URL and MIME next to its token wrapper.
    // A list of uploads also has v[3][5], but it is not another image.
    const token=Array.isArray(v)&&typeof v[0]==='string'&&/^https:\/\//.test(v[0])&&typeof v[1]==='string'&&/^image\//.test(v[1])&&Array.isArray(v[3])&&typeof v[3][5]==='string'&&/^\$[^\s]{1,8190}$/.test(v[3][5])?v[3][5]:null;
    const candidates=strings.filter(s=>/^https:\/\/\S+$/.test(s));
    const size=values.find(s=>Array.isArray(s)&&s.length===3&&s.every(Number.isFinite)&&s[0]>0&&s[1]>0&&s[2]>1000);
    let made=false;
    for(const url of candidates){
      let allowed=false;try{approvedResource(url);allowed=true;}catch{}
      const generated=/^https:\/\/lh[1-7]\.(?:googleusercontent|google)\.com\/(?:gg|gg-dl|rd-gg)\//.test(url);
      if(!allowed&&!mime&&!name)continue;
      if(!generated&&!mime&&!name&&!/\.(?:png|jpe?g|webp|pdf|docx?|zip|mp[34])(?:[?=]|$)/i.test(url))continue;
      const kind=generated?'images':kindOf(mime||'',name||url);
      add({pointer:url,name,mime,kind,media_token:token,expected_size:size?.[2]||null,reference:!allowed,generated,response_id:ctx.response_id,candidate_id:ctx.candidate_id},occurrence);made=true;
    }
    if(token&&!made)add({name,mime,kind:mime?kindOf(mime,name||''):'images',media_token:token,expected_size:size?.[2]||null,generated:!mime||/^image\//.test(mime),response_id:ctx.response_id,candidate_id:ctx.candidate_id},occurrence);
    if(ownName&&ownMime&&!made&&!token){
      const nested=values.some(x=>x&&typeof x==='object'&&directURLs(x).some(u=>{try{approvedResource(u);return true;}catch{return false;}}));
      if(!nested)add({name,mime,kind:kindOf(mime||'',name),unavailable:'ORIGINAL_URL_MISSING'},occurrence);
    }
    for(const [key,x]of Object.entries(v))if(x&&typeof x==='object'){
      // Field 44 is a citation map in object-form response metadata. Its file
      // chips describe references to existing uploads, not fresh attachments.
      if(!Array.isArray(v)&&key==='44'){noteNames(x,occurrence);continue;}
      visit(x,occurrence,ctx,depth+1,{mime,name});
    }
  }
  for(const section of sections){
    const occurrence={message_id:section.message_id,node_id:section.node_id,role:section.role};
    let metadata=section.raw;
    if(Array.isArray(metadata)){
      metadata=[...metadata];const index=section.role==='user'?0:1;
      if(Array.isArray(metadata[index])){metadata[index]=[...metadata[index]];metadata[index][0]=null;}
      else metadata[index]=null;
      if(section.role==='user'&&Array.isArray(metadata[0]?.[4])){
        const wrapper=metadata[0][4],head=wrapper[0];
        if(Array.isArray(head)&&head.length>=4&&head.slice(0,3).every(x=>x==null)&&(Array.isArray(head[3])||head[3]==null)&&
           (Array.isArray(head[3])||Array.isArray(head[4]))){
          // Slot 3 contains uploads made in this prompt. Slot 4 is the growing
          // context cache of earlier files, even on text-only later prompts.
          if(Array.isArray(head[4]))contextCacheEntries+=head[4].length;
          metadata[0][4]=Array.isArray(head[3])?head[3]:[];
        }else if(Array.isArray(wrapper[1]))metadata[0][4]=wrapper[1];
      }
    }
    visit(metadata,occurrence,section);
    // Inspect actual Markdown images outside code. External website images remain references.
    const prose=String(section.text||'').replace(/```[\s\S]*?```|~~~[\s\S]*?~~~/g,'').replace(/`[^`\n]*`/g,'');
    const re=/!\[([^\]]*)\]\(<?(https:\/\/[^\s)>]+)>?\)/g;let match;
    while((match=re.exec(prose))){let allowed=false;try{approvedResource(match[2]);allowed=true;}catch{}
      add({name:match[1]||null,pointer:match[2],kind:'images',reference:!allowed,pageCopy:true},occurrence);
    }
  }
  // Alias token entries to exactly matching asset keys, never to a filename or position.
  for(const a of [...items]){
    if(!a.media_token||!a.pointer)continue;
    const alias=items.find(b=>b!==a&&!b.media_token&&b.pointer&&canonicalResource(b.pointer)===canonicalResource(a.pointer));
    if(alias){for(const o of alias.occurrences)if(!a.occurrences.some(x=>x.message_id===o.message_id))a.occurrences.push(o);a.pageBytes=alias.pageBytes;items.splice(items.indexOf(alias),1);}
  }
  for(const d of dom){
    const matches=items.filter(a=>a.pointer&&canonicalResource(a.pointer)===canonicalResource(d.url));
    if(matches.length===1){if(d.bytes)matches[0].pageBytes=d.bytes;continue;}
    const a=add({pointer:d.url,name:d.name||null,kind:d.kind||'images',pageCopy:true,dom_only:true,pageBytes:d.bytes}, {message_id:d.messageId,node_id:d.messageId,role:d.role||'assistant'});
    if(a&&!items.includes(a))items.push(a);
  }
  const output=items.map((a,i)=>({...a,number:i+1}));
  Object.defineProperty(output,'inventory',{value:{filename_references:ignoredNames.size,internal_resources:ignoredInternal.size,context_cache_entries:contextCacheEntries}});
  return output;
}
function thoughtSummary(candidate){
  const display=candidate?.[37]?.[0];
  return Array.isArray(display)?display.filter(s=>typeof s==='string').join('\n\n').trim():'';
}
function structuredSources(root){
  const out=[],seen=new Set();let visited=0;
  function walk(v,depth=0){
    if(!v||typeof v!=='object')return;
    if(depth>70||++visited>250000)throw new ExportError('RPC_SCHEMA_CHANGED');
    // The response document's code node: [null, null, null, [source, language]].
    if(Array.isArray(v)&&v.slice(0,3).every(x=>x==null)&&Array.isArray(v[3])&&typeof v[3][0]==='string'&&v[3][0].trim()&&typeof v[3][1]==='string'&&/^[a-z0-9+#._-]{1,40}$/i.test(v[3][1])){
      const code=v[3][0],language=v[3][1].toLowerCase(),key=language+'|'+code;
      if(!seen.has(key)){seen.add(key);out.push({code,language});}return;
    }
    for(const x of Object.values(v))if(x&&typeof x==='object')walk(x,depth+1);
  }walk(root);return out;
}
function selectTurns(rawTurns,route){
  if(!Array.isArray(rawTurns)||!rawTurns.length)throw new ExportError('EMPTY_HISTORY');
  const turns=[],warnings=[];
  for(let i=0;i<rawTurns.length;i++){
    const raw=rawTurns[i],id=raw?.[0]?.[1],cid=raw?.[0]?.[0];
    if(cid!==route.id)throw new ExportError('WRONG_CONVERSATION');
    if(!/^r_[0-9a-f]{16}$/i.test(id||'')||!Array.isArray(raw?.[3]?.[0]))throw new ExportError('RPC_SCHEMA_CHANGED');
    const parent=typeof raw?.[1]?.[1]==='string'&&/^r_[0-9a-f]{16}$/i.test(raw[1][1])?raw[1][1]:null;
    if(i&&parent!==turns.at(-1).id)throw new ExportError('CHAIN_BROKEN');
    if(!i&&parent)throw new ExportError('CHAIN_ROOT_MISSING');
    const candidates=raw[3][0].filter(c=>Array.isArray(c)&&/^rc_[0-9a-f]{16}$/i.test(c[0]||''));
    if(!candidates.length)throw new ExportError('CONTENT_MISSING');
    const nextParent=rawTurns[i+1]?.[1]?.[2],declared=raw[3][3];
    const selected=/^rc_[0-9a-f]{16}$/i.test(nextParent||'')?nextParent:/^rc_[0-9a-f]{16}$/i.test(declared||'')?declared:null;
    const candidate=selected?candidates.find(c=>c[0]===selected):candidates[0];
    if(!candidate)throw new ExportError('CHAIN_BROKEN');
    if(!selected&&candidates.length>1)warnings.push('CANDIDATE_UNVERIFIED');
    const userText=raw?.[2]?.[0]?.[0],assistantText=candidate?.[1]?.[0];
    const time=Array.isArray(raw[4])?timestamp(Number(raw[4][0])*1000+Number(raw[4][1]||0)/1e6):'';
    let sources=structuredSources(raw[3]?.[12]);
    if(sources.length&&candidates.length>1&&declared!==candidate[0]){sources=[];warnings.push('SOURCES_UNVERIFIED');}
    const sections=[{raw:raw[2],text:typeof userText==='string'?userText:'',role:'user',message_id:id+':user',node_id:id,response_id:id,candidate_id:candidate[0],time},
      {raw:candidate,text:typeof assistantText==='string'?assistantText:'',role:'assistant',message_id:id+':assistant',node_id:id,response_id:id,candidate_id:candidate[0],time,thoughts:thoughtSummary(candidate),sources,turn_number:i+1}];
    for(const section of sections)if(!section.text.trim()&&!section.sources?.length&&!discoverResources([section]).some(a=>!a.reference))throw new ExportError('CONTENT_MISSING');
    turns.push({id,parent,candidate_id:candidate[0],sections,raw});
  }
  return {turns,warnings:[...new Set(warnings)],messages:turns.flatMap(t=>t.sections)};
}
async function acquireResource(a,{net,route,settings,signal,log,localFiles=[]}){
  if(a.reference)throw new ExportError('EXTERNAL_REFERENCE');
  const limit=settings.maxFileMiB*MiB,attempts=[];a.attempts=attempts;let best=null;
  async function content(url,depth=0){
    checkAbort(signal);if(depth>5)throw new ExportError('REDIRECT_LOOP');
    try{approvedResource(url);}catch(e){
      const host=safeHost(url),error=host==='accounts.google.com'?new ExportError('RESOURCE_LOGIN_REQUIRED'):e;
      error.stage='metadata-target';error.id_kind=host==='accounts.google.com'?'google-login':'external-or-invalid';
      if(host==='accounts.google.com')error.host=host;throw error;
    }
    const r=await net.request(url,limit),type=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    const head=decoder.decode(r.bytes.subarray(0,512));
    const disposition=r.headers.get('content-disposition')||'';
    const explicitFile=a.kind!=='images'&&(/\.(?:json|ipynb|txt|md|csv|py|js|html?)$/i.test(a.name||'')||/attachment/i.test(disposition));
    if(!explicitFile&&(type==='application/json'||/^\s*(?:\[|\{)/.test(head))){
      let data;try{data=JSON.parse(decoder.decode(r.bytes));}catch{throw new ExportError('DOWNLOAD_POINTER_MISSING');}
      const urls=directURLs(data);if(!urls.length)throw new ExportError('DOWNLOAD_POINTER_MISSING');
      let error;for(const target of urls){try{return await content(target,depth+1);}catch(e){if(errorCode(e)==='CANCELLED')throw e;error=e;}}
      throw error||new ExportError('DOWNLOAD_POINTER_MISSING');
    }
    if(!explicitFile&&/^\s*https:\/\/\S+\s*$/.test(head)&&r.bytes.length<16000)return content(decoder.decode(r.bytes).trim(),depth+1);
    if(!r.bytes.length)throw new ExportError('EMPTY_CONTENT');
    if((type==='text/html'||/^\s*<!doctype html|^\s*<html/i.test(head))&&!(/attachment/i.test(disposition)&&/\.html?$/i.test(a.name||'')))throw new ExportError('ERROR_PAGE');
    const mime=a.kind==='images'?imageMime(r.bytes,type):type||a.mime||'application/octet-stream';
    if(a.kind==='images'&&!mime)throw new ExportError('INVALID_IMAGE');
    if(a.kind!=='images'){
      if(/\.pdf$/i.test(a.name||'')&&!head.startsWith('%PDF-'))throw new ExportError('INVALID_FILE');
      if(/\.(?:docx|xlsx|pptx|zip)$/i.test(a.name||'')&&!(r.bytes[0]===80&&r.bytes[1]===75))throw new ExportError('INVALID_FILE');
    }
    const match=disposition.match(/filename\*=UTF-8''([^;]+)/i)||disposition.match(/filename="([^"]+)"/i);
    let name=a.name;if(match)try{name=decodeURIComponent(match[1]);}catch{name=match[1];}
    return {bytes:r.bytes,mime,name};
  }
  async function attempt(strategy,fn){try{const r=await fn();r.strategy=strategy;return r;}catch(e){if(errorCode(e)==='CANCELLED'||errorCode(e)==='WRONG_PAGE')throw e;
    const code=errorCode(e),details={strategy,code,status:e.status||0,...(e.stage?{stage:e.stage}:{}),...(e.host?{host:e.host}:{}),...(e.id_kind?{id_kind:e.id_kind}:{})};
    attempts.push(details);log.add(code,{...details,host:e.host||safeHost(a.pointer)},'warn');
    if(!best||!['HTTP_404','DOWNLOAD_POINTER_MISSING'].includes(code))best=e;return null;}}
  if(a.kind==='images'&&a.media_token&&/^r_[0-9a-f]{16}$/i.test(a.response_id||'')&&/^rc_[0-9a-f]{16}$/i.test(a.candidate_id||'')){
    const r=await attempt('native-original',async()=>{
      const payload=await net.rpc(IMAGE_RPC,[[[null,null,null,[null,null,null,null,null,a.media_token]],null,null,null,null,null,null,null,null,null],[a.response_id,a.candidate_id,route.id,null,null],1,0,1]);
      const target=directURLs(payload).find(u=>{try{return /^\/(?:gg|gg-dl)\//.test(new URL(u).pathname)&&Boolean(fullSizeURL(u));}catch{return false;}});
      if(!target)throw new ExportError('DOWNLOAD_POINTER_MISSING');
      const got=await content(fullSizeURL(target));got.originalVerified=true;return got;
    });if(r)return r;
  }
  if(a.pointer&&/^https:\/\//.test(a.pointer)){
    let full=null;try{if(a.kind==='images')full=fullSizeURL(a.pointer);}catch{}
    for(const [url,strategy]of [...(full?[[full,'full-size']]:[]),[a.pointer,a.dom_only?'page-url':'direct-file']]){
      const r=await attempt(strategy,()=>content(url));if(r){r.pageCopy=Boolean(a.pageCopy||a.dom_only);r.originalVerified=a.kind!=='images'||(!r.pageCopy&&a.expected_size>0&&a.expected_size===r.bytes.length&&(!a.mime||a.mime===r.mime));return r;}
    }
  }
  if(a.pointer?.startsWith('blob:https://gemini.google.com/')||/^data:(?:image|audio|video)\/[\w.+-]+;base64,/.test(a.pointer||'')){
    const r=await attempt('loaded-page-data',async()=>{
      checkAbort(signal);let bytes,mime=a.mime||'application/octet-stream';
      if(a.pointer.startsWith('data:')){
        const cut=a.pointer.indexOf(','),s=a.pointer.slice(cut+1);if(s.length*.75>limit)throw new ExportError('FILE_TOO_LARGE');
        bytes=Uint8Array.from(atob(s),c=>c.charCodeAt(0));mime=a.pointer.slice(5,a.pointer.indexOf(';'));
      }else{const response=await fetch(a.pointer,{signal,credentials:'omit'});bytes=await readLimited(response,limit,signal);mime=response.headers.get('content-type')||mime;}
      if(!bytes.length)throw new ExportError('EMPTY_CONTENT');if(a.kind==='images'){mime=imageMime(bytes,mime);if(!mime)throw new ExportError('INVALID_IMAGE');}
      return {bytes,mime,name:a.name,pageCopy:true,originalVerified:false};
    });if(r)return r;
  }
  if(a.pageBytes instanceof Uint8Array&&a.pageBytes.length){
    if(a.pageBytes.length>limit)throw new ExportError('FILE_TOO_LARGE');const mime=imageMime(a.pageBytes);if(!mime)throw new ExportError('INVALID_IMAGE');
    return {bytes:a.pageBytes,mime,name:a.name,pageCopy:true,originalVerified:false,strategy:'loaded-page-pixels'};
  }
  const matches=localFiles.filter(f=>f&&typeof f.arrayBuffer==='function'&&f.name===a.name);
  if(matches.length>1)throw new ExportError('LOCAL_FILE_AMBIGUOUS');
  if(matches.length===1){
    const got=await attempt('local-file',async()=>{
      const file=matches[0];if(file.size>limit)throw new ExportError('FILE_TOO_LARGE');
      const bytes=new Uint8Array(await file.arrayBuffer());checkAbort(signal);
      if(bytes.length!==file.size||bytes.length>limit)throw new ExportError('TRUNCATED_CONTENT');
      if(!bytes.length)throw new ExportError('EMPTY_CONTENT');
      const mime=a.kind==='images'?imageMime(bytes):file.type||a.mime||'application/octet-stream';
      if(!mime)throw new ExportError('INVALID_IMAGE');
      const head=decoder.decode(bytes.subarray(0,80));
      if(/\.pdf$/i.test(a.name)&&!head.startsWith('%PDF-'))throw new ExportError('INVALID_FILE');
      if(/\.(?:zip|docx|xlsx|pptx)$/i.test(a.name)&&!(bytes[0]===80&&bytes[1]===75))throw new ExportError('INVALID_FILE');
      return {bytes,mime,name:file.name,originalVerified:false,providedLocally:true};
    });if(got)return got;
  }
  throw best||new ExportError(a.unavailable||'ORIGINAL_URL_MISSING');
}
function publicResource(a){return {number:a.number,name:a.name||'未命名附件',kind:a.kind,source_url:a.pointer?scrub(a.pointer):null,occurrences:a.occurrences,status:a.status,path:a.path||null,mime:a.mime||null,size_bytes:a.size_bytes||0,sha256:a.sha256||null,original_verified:Boolean(a.originalVerified),page_image_copy:Boolean(a.pageCopy),provided_locally:Boolean(a.providedLocally),content_reused_from:a.content_reused_from||null,acquisition_strategy:a.strategy||null,attempts:a.attempts||[],error:a.error||null,reason:a.error?explain(a.error):a.providedLocally?explain('LOCAL_FILE_UNVERIFIED'):a.kind==='images'&&!a.originalVerified?explain(a.pageCopy?'PAGE_IMAGE_COPY':'IMAGE_ORIGINAL_UNVERIFIED'):null};}
