// ==UserScript==
// @name         回忆匣 · Gemini
// @namespace    gemini-memory-box
// @version      1.0.4
// @description  当前 Gemini 对话与附件本机打包 ZIP；仅导出、设置、脱敏诊断；无上传、统计或远程依赖。
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @noframes
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM.registerMenuCommand
// @connect      self
// @connect      googleusercontent.com
// @connect      usercontent.google.com
// @connect      lh1.google.com
// @connect      lh2.google.com
// @connect      lh3.google.com
// @connect      lh4.google.com
// @connect      lh5.google.com
// @connect      lh6.google.com
// @connect      lh7.google.com
// @updateURL    none
// @downloadURL  none
// ==/UserScript==

(() => {
'use strict';
/* 回忆匣 Gemini: standalone, read-only, local ZIP export. */
const VERSION='1.0.4', MiB=1024*1024;
const encoder=new TextEncoder(),decoder=new TextDecoder();
const textBytes=value=>encoder.encode(String(value??''));
const jsonText=value=>JSON.stringify(value,null,2)+'\n';
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const DEFAULTS=Object.freeze({mode:'history',html:true,markdown:true,images:true,files:true,media:true,thoughts:true,sources:true,includeUser:true,includeGemini:true,pageAssist:true,destination:'ask',maxFileMiB:256});
class ExportError extends Error{constructor(code,status=0){super(code);this.name='ExportError';this.code=code;this.status=status;}}
function checkAbort(signal){if(signal?.aborted)throw new ExportError('CANCELLED');}
function errorCode(e){
  if(e?.name==='AbortError'||e?.code==='CANCELLED')return 'CANCELLED';
  if(e?.name==='QuotaExceededError')return 'DISK_FULL';
  if(['NotAllowedError','SecurityError'].includes(e?.name))return 'PERMISSION_DENIED';
  return /^[A-Z][A-Z0-9_]{0,70}$/.test(e?.code||'')?e.code:'UNEXPECTED_ERROR';
}
const MESSAGES=Object.freeze({
  CANCELLED:'操作已取消，未提交未完成的 ZIP',NO_CONVERSATION:'请先打开一个 Gemini 已保存的聊天窗口',
  CONFIG_UNAVAILABLE:'Gemini 登录配置未就绪；请刷新该窗口后重试',LOGIN_REQUIRED:'Google 登录状态失效，请刷新 Gemini',
  BLOCKED_URL:'资源地址不在允许的 Google 下载范围内，已停止请求',REDIRECT_BLOCKED:'脚本管理器自动跳转，无法逐跳验证，已拒绝保存',
  REDIRECT_LOCATION_MISSING:'下载需要跳转，但当前通路未提供可验证的跳转地址',REDIRECT_LOOP:'下载跳转循环或超过五次',
  RESOURCE_LOGIN_REQUIRED:'该 Google 附件要求登录，已停止在登录页；可刷新 Gemini 后重试，或在设置中补入本机原文件',
  LOCAL_FILE_UNVERIFIED:'已补入你选择的本机文件；尚不能证明与平台原文件逐字节相同',
  LOCAL_FILE_AMBIGUOUS:'有多个同名本机文件，无法确定对应关系；请只保留所需的一份',
  INVALID_RPC_RESPONSE:'Gemini 接口返回为空或不符合已知格式，未将该通路视为完成',RPC_SCHEMA_CHANGED:'Gemini 对话结构不符合已知格式；请保存诊断',
  WRONG_CONVERSATION:'返回内容不属于请求的对话，已停止',WRONG_PAGE:'当前窗口或账号已切换，已停止操作',
  EMPTY_HISTORY:'没有读到已保存的对话；请确认回复完成并已保存在历史中',PAGINATION_STALLED:'历史分页没有继续或重复游标，已停止',
  HISTORY_LIMIT:'历史超过读取上限，未生成声称完整的导出',PAGE_CONFLICT:'重复的消息标识对应不同内容，可能正在编辑；请等编辑完成再试',
  CHAIN_BROKEN:'对话前后关联不连续，不能确认完整顺序',CHAIN_ROOT_MISSING:'最早消息仍指向未取得的历史，不能确认完整范围',
  CANDIDATE_UNVERIFIED:'最新回复有多个候选，平台未明确给出当前选择；原始 JSON 保留所有候选',
  SOURCES_UNVERIFIED:'结构化源码未明确对应所选回复，仅在原始 JSON 中保留，未自动关联到当前正文',
  CONTENT_MISSING:'有一轮缺少文字或可识别附件，无法确认聊天内容完整',STREAMING:'当前回复仍在生成，请等它完成后导出',
  NETWORK_ERROR:'下载失败；请确认脚本管理器允许声明的 Google 资源域名',TIMEOUT:'读取或下载超时',
  EMPTY_CONTENT:'下载结果为空',INVALID_IMAGE:'返回结果不是可识别的图片',INVALID_FILE:'返回内容不符合该文件格式',
  TRUNCATED_CONTENT:'附件长度与服务器声明不符，未保存不完整文件',ERROR_PAGE:'下载返回了登录页或错误网页',
  ORIGINAL_URL_MISSING:'发现附件名称或引用，但 Gemini 未提供可下载的原文件地址',DOWNLOAD_POINTER_MISSING:'下载接口未提供可识别的下一步地址',
  EXTERNAL_REFERENCE:'这是外部资源引用；没有自动向外部网站请求',PAGE_ONLY:'这是页面补救模式，只能保存本次已加载的消息',
  PAGE_IMAGE_COPY:'取得的是页面显示副本，原文件完整性未核实',IMAGE_ORIGINAL_UNVERIFIED:'取得了图片文件，但未核实为原图',
  FILE_TOO_LARGE:'附件超过单文件大小上限',MEMORY_LIMIT:'整包超过 128 MiB 下载缓存上限，请改用选择 ZIP 保存位置',
  ZIP_LIMIT:'ZIP 条目数量或单个文件超过本导出器上限',DISK_FULL:'写入失败，请检查磁盘空间',
  PERMISSION_DENIED:'保存权限不可用，请重新选择位置',CANNOT_SAVE:'无法创建或写入 ZIP，请检查保存位置',
  NO_CONTENT_SELECTED:'文字和附件均未选择，请在设置中至少保留一项',UNEXPECTED_ERROR:'发生未识别错误，请保存脱敏诊断',
});
function explain(code){return MESSAGES[code]||(/^HTTP_\d+$/.test(code)?`Google 返回 ${code.slice(5)}；请检查登录、权限或资源是否仍有效`:MESSAGES.UNEXPECTED_ERROR);}
function settingsOf(v){
  const out={...DEFAULTS};if(!v||typeof v!=='object')return out;
  for(const k of ['html','markdown','images','files','media','thoughts','sources','includeUser','includeGemini','pageAssist'])if(typeof v[k]==='boolean')out[k]=v[k];
  if(['history','page'].includes(v.mode))out.mode=v.mode;
  if(['ask','folder','download'].includes(v.destination))out.destination=v.destination;
  if([64,256,512,1024].includes(Number(v.maxFileMiB)))out.maxFileMiB=Number(v.maxFileMiB);
  return out;
}
function leafOf(path){return String(path||'').split('/').at(-1)||'附件';}
function mdPath(path){return path.split('/').map(p=>encodeURIComponent(p).replace(/[()]/g,c=>c==='('?'%28':'%29')).join('/');}

/* Local ZIP, integrity and safe file-writing utilities from Memory Box 4.2.0. */
function safeName(value, fallback = '未命名', max = 90) {
  let name = String(value ?? '').normalize('NFC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '_').trim().replace(/[. ]+$/g, '');
  name = [...name].slice(0, max).join('');
  while (textBytes(name).length > 210) name = [...name].slice(0,-1).join('');
  name = name.replace(/[. ]+$/g, '');
  if (!name || /^\.+$/.test(name)) name = fallback;
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = '_' + name;
  return name;
}

function timestamp(value) {
  if (value == null || value === '') return '';
  const date = new Date(typeof value === 'number' && value < 1e11 ? value * 1000 : value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}
function stamp(date = new Date()) {
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}${pad(date.getMonth()+1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}
function randomSuffix() { return Array.from(crypto.getRandomValues(new Uint8Array(8)), n => n.toString(16).padStart(2,'0')).join(''); }

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      if (/^(?:access_?token|refresh_?token|authorization|cookie|set-cookie|session_?token|SNlM0e|FdrFJe|csrf_?token|media_token)$/i.test(key)) { out[key] = '[凭据已移除]'; continue; }
      out[key] = scrub(item);
    }
    return out;
  }
  // Only a standalone URL is processed. User-authored prose/code is retained.
  if (typeof value === 'string' && /^https:\/\/\S+$/.test(value)) {
    try {
      const u = new URL(value);
      for (const k of [...u.searchParams.keys()]) if (/^(?:sig|signature|token|access_token|key|policy|credential|x-amz-.+|x-goog-.+|se|sp|sv|sr)$/i.test(k)) u.searchParams.set(k,'REDACTED');
      return u.href;
    } catch { return value; }
  }
  return value;
}
function makeLogger() {
  const entries = [];
  return {
    entries,
    add(code, details = {}, level = 'info') {
      const item = {time:new Date().toISOString(),level,code:/^[A-Z0-9_]{1,70}$/.test(code) ? code : 'UNEXPECTED_ERROR'};
      // Never log errors' messages/stacks, titles, identifiers, URLs or bodies.
      for (const k of ['status','attempt','bytes','index','total','success','failed','skipped']) if (Number.isFinite(details[k])) item[k] = details[k];
      for (const k of ['stage','strategy','id_kind','server_error','json_shape','host']) {
        const value=details[k];
        const pattern=k==='host'?/^[a-z0-9.-]{1,160}$/:k==='json_shape'?/^[A-Za-z0-9_:,.[\]-]{0,300}$/:/^[A-Za-z0-9_-]{1,70}$/;
        if(typeof value==='string' && pattern.test(value))item[k]=value;
      }
      entries.push(item); if (entries.length > 2000) entries.shift();
      return item;
    },
    snapshot() { return {app:'回忆匣 Gemini',version:VERSION,generated_at:new Date().toISOString(),privacy:'只含阶段、类型、域名与响应字段结构；无会话令牌、聊天正文、标题、文件名、链接路径或查询参数',entries:entries.map(e => ({...e}))}; },
  };
}
async function pause(ms, signal) {
  checkAbort(signal);
  return new Promise((resolve,reject) => {
    const done = () => { signal?.removeEventListener('abort',cancel); resolve(); };
    const timer = setTimeout(done,ms);
    const cancel = () => { clearTimeout(timer); signal?.removeEventListener('abort',cancel); reject(new ExportError('CANCELLED')); };
    signal?.addEventListener('abort',cancel,{once:true});
  });
}
async function readLimited(response, maxBytes, signal) {
  const declared = Number(response.headers?.get('content-length'));
  if (declared > maxBytes) { await response.body?.cancel?.(); throw new ExportError('FILE_TOO_LARGE'); }
  if (!response.body?.getReader) {
    const out = new Uint8Array(await response.arrayBuffer());
    if (out.byteLength > maxBytes) throw new ExportError('FILE_TOO_LARGE');
    checkAbort(signal); return out;
  }
  const reader = response.body.getReader(), chunks = []; let total = 0;
  try {
    while (true) {
      checkAbort(signal); const {done,value} = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > maxBytes) throw new ExportError('FILE_TOO_LARGE');
      chunks.push(value);
    }
  } catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let p = 0;
  for (const chunk of chunks) { bytes.set(chunk,p); p += chunk.length; }
  return bytes;
}

const CRC_TABLE = new Uint32Array(256);
for (let n=0;n<256;n++) { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; CRC_TABLE[n]=c>>>0; }
async function crc32(bytes, signal) {
  let c=0xffffffff;
  for (let start=0;start<bytes.length;start+=4*MiB) {
    checkAbort(signal);
    const end=Math.min(bytes.length,start+4*MiB);
    for(let i=start;i<end;i++) c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);
    if (bytes.length>4*MiB) await pause(0,signal);
  }
  return (c^0xffffffff)>>>0;
}
async function sha256(bytes) {
  const result = new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return Array.from(result,b=>b.toString(16).padStart(2,'0')).join('');
}
function zipHeader(size) { const b=new Uint8Array(size); return {b,v:new DataView(b.buffer)}; }
class ZipWriter {
  constructor(sink, signal, {compress = true} = {}) { this.sink=sink;this.signal=signal;this.compress=compress;this.entries=[];this.offset=0;this.closed=false;this.names=new Set(); }
  async write(data) {
    checkAbort(this.signal);
    if (this.offset + data.length >= Number.MAX_SAFE_INTEGER-16*MiB) throw new ExportError('ZIP_LIMIT');
    await this.sink.write(data);this.offset+=data.length;
  }
  async add(path, value) {
    if (this.closed || this.entries.length>=100000 || !path || /(?:^|\/)\.\.(?:\/|$)|\\|^\/|^[A-Za-z]:/.test(path) || this.names.has(path)) throw new ExportError('ZIP_LIMIT');
    const bytes=typeof value === 'string'?textBytes(value):value;
    if (!(bytes instanceof Uint8Array) || bytes.length>=0xffffffff) throw new ExportError('ZIP_LIMIT');
    const name=textBytes(path); if(name.length>65535) throw new ExportError('ZIP_LIMIT');
    const crc=await crc32(bytes,this.signal); let payload=bytes,method=0;
    if(this.compress && bytes.length>1000 && /\.(?:json|md|html|txt)$/.test(path) && typeof CompressionStream==='function') {
      try {
        const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
        const packed=new Uint8Array(await new Response(stream).arrayBuffer());
        if(packed.length<bytes.length){payload=packed;method=8;}
      } catch {} // STORE is always a valid offline ZIP fallback.
    }
    checkAbort(this.signal);
    const {b,v}=zipHeader(30);const date=new Date();
    const dosTime=(date.getHours()<<11)|(date.getMinutes()<<5)|(date.getSeconds()>>1);
    const dosDate=((Math.max(1980,date.getFullYear())-1980)<<9)|((date.getMonth()+1)<<5)|date.getDate();
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(8,method,true);
    v.setUint16(10,dosTime,true);v.setUint16(12,dosDate,true);v.setUint32(14,crc,true);v.setUint32(18,payload.length,true);v.setUint32(22,bytes.length,true);v.setUint16(26,name.length,true);
    const offset=this.offset;await this.write(b);await this.write(name);await this.write(payload);
    this.entries.push({name,crc,size:bytes.length,packed:payload.length,method,offset,dosTime,dosDate});this.names.add(path);
    return {path,size_bytes:bytes.length,sha256:await sha256(bytes)};
  }
  async finish() {
    const centralOffset=this.offset;
    for(const e of this.entries){
      const large=e.offset>=0xffffffff;
      const {b,v}=zipHeader(46);v.setUint32(0,0x02014b50,true);v.setUint16(4,large?45:20,true);v.setUint16(6,large?45:20,true);v.setUint16(8,0x800,true);v.setUint16(10,e.method,true);
      v.setUint16(12,e.dosTime,true);v.setUint16(14,e.dosDate,true);v.setUint32(16,e.crc,true);v.setUint32(20,e.packed,true);v.setUint32(24,e.size,true);v.setUint16(28,e.name.length,true);v.setUint16(30,large?12:0,true);v.setUint32(42,large?0xffffffff:e.offset,true);
      await this.write(b);await this.write(e.name);
      if(large){const extra=zipHeader(12);extra.v.setUint16(0,1,true);extra.v.setUint16(2,8,true);extra.v.setBigUint64(4,BigInt(e.offset),true);await this.write(extra.b);}
    }
    const size=this.offset-centralOffset;
    if(centralOffset>=0xffffffff || size>=0xffffffff || this.entries.length>=65535){
      const zip64Offset=this.offset,record=zipHeader(56),locator=zipHeader(20);
      record.v.setUint32(0,0x06064b50,true);record.v.setBigUint64(4,44n,true);record.v.setUint16(12,45,true);record.v.setUint16(14,45,true);
      record.v.setBigUint64(24,BigInt(this.entries.length),true);record.v.setBigUint64(32,BigInt(this.entries.length),true);record.v.setBigUint64(40,BigInt(size),true);record.v.setBigUint64(48,BigInt(centralOffset),true);
      locator.v.setUint32(0,0x07064b50,true);locator.v.setBigUint64(8,BigInt(zip64Offset),true);locator.v.setUint32(16,1,true);
      await this.write(record.b);await this.write(locator.b);
    }
    const {b,v}=zipHeader(22);
    v.setUint32(0,0x06054b50,true);v.setUint16(8,Math.min(this.entries.length,65535),true);v.setUint16(10,Math.min(this.entries.length,65535),true);v.setUint32(12,Math.min(size,0xffffffff),true);v.setUint32(16,Math.min(centralOffset,0xffffffff),true);
    await this.write(b);checkAbort(this.signal);await this.sink.close();this.closed=true;
  }
  async abort() { this.closed=true;await this.sink.abort?.(); }
}
function memorySink(max=128*MiB) {
  let chunks=[],size=0,closed=false;
  return {
    async write(bytes){if(closed)throw new ExportError('CANNOT_SAVE');size+=bytes.length;if(size>max)throw new ExportError('MEMORY_LIMIT');chunks.push(bytes);},
    async close(){closed=true;},async abort(){chunks=[];closed=true;},
    blob(){if(!closed)throw new ExportError('CANNOT_SAVE');return new Blob(chunks,{type:'application/zip'});},
  };
}


function extensionFor(mime) {
  return ({'image/bmp':'.bmp','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'.docx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'.xlsx','application/vnd.openxmlformats-officedocument.presentationml.presentation':'.pptx','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/gif':'.gif','image/avif':'.avif','image/svg+xml':'.svg','application/zip':'.zip','application/pdf':'.pdf','application/json':'.json','text/plain':'.txt','audio/mpeg':'.mp3','audio/wav':'.wav','audio/ogg':'.ogg','video/mp4':'.mp4','video/webm':'.webm'})[mime] || '.bin';
}
function attachmentFilename(a, result) {
  let name=safeName(a.name || result.name || (a.file_id ? a.file_id : `附件_${a.number}`),'附件',120);
  if(result.pageCopy && a.kind==='images')name=name.replace(/\.[a-z0-9]{1,10}$/i,'')+'_页面副本'+extensionFor(result.mime);
  if(!/\.[a-z0-9]{1,10}$/i.test(name))name+=extensionFor(result.mime);
  return `${String(a.number).padStart(4,'0')}_${name}`;
}

const READER_CSS=`:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#24324c;background:#f4f5fa}*{box-sizing:border-box}body{margin:0;padding:36px 18px}main{max-width:960px;margin:auto}h1{font-size:28px;margin:0 0 12px;overflow-wrap:anywhere}.subtitle{color:#637089;font-size:13px;line-height:1.8}.notice{padding:14px 18px;border:1px solid #e0d2aa;background:#fff9e9;border-radius:12px;line-height:1.7;margin:20px 0}.turn{margin:22px 0;max-width:94%}.turn.user{margin-left:auto}.label{font-size:12px;color:#6a7690;margin:0 5px 8px}.bubble{background:white;border:1px solid #e0e5ef;border-radius:16px;padding:18px 22px;box-shadow:0 4px 18px #20335504;overflow-wrap:anywhere}.user .bubble{background:#eceafc;border-color:#ddd8f5}.body{white-space:pre-wrap;font:15px/1.85 system-ui,sans-serif;margin:0}.asset{margin:16px 0 0;padding-top:12px;border-top:1px solid #e0e5ef;font-size:13px;overflow-wrap:anywhere}.asset img{display:block;max-width:100%;max-height:680px;object-fit:contain;border-radius:8px;margin:10px 0}a{color:#5849aa;text-decoration:none}a:hover{text-decoration:underline}.failed{color:#9b5e29}.index-card{background:white;border:1px solid #e0e5ef;border-radius:14px;padding:20px;margin:14px 0}.index-card h2{font-size:18px;margin:0 0 8px}footer{margin:32px 0;color:#6a7690;font-size:12px;line-height:1.8}details{margin:12px 0}summary{cursor:pointer;font-size:13px}`;
function readerShell(title, content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' data: file:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; connect-src 'none'; object-src 'none'; frame-src 'none'"><meta name="referrer" content="no-referrer"><title>${htmlEscape(title)}</title><style>${READER_CSS}</style></head><body><main>${content}</main></body></html>`;
}
function assetHTML(a) {
  if(a.status!=='saved')return `<div class="asset failed">${htmlEscape(a.name || '未命名附件')} · ${htmlEscape(a.status==='excluded'?'按设置未下载':explain(a.error))}</div>`;
  const path=htmlEscape(mdPath(a.path));
  const image=a.kind==='images' && /^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(a.mime || '');
  return `<div class="asset"><a href="${path}" download>${htmlEscape(a.name || leafOf(a.path))}</a> · ${(a.size_bytes/1024).toFixed(1)} KiB${a.proxy_image?' · 网页展示图片':''}${a.pageCopy?' · 页面图片副本（原文件未核实）':''}${a.providedLocally?' · 本机补入，原文件一致性未核实':''}${a.content_reused_from?' · 与附件项 '+a.content_reused_from+' 共用相同文件':''}${image?`<img src="${path}" alt="${htmlEscape(a.name || '图片附件')}" loading="lazy">`:''}</div>`;
}

function blobDownload(blob, name, doc=document) {
  const url=URL.createObjectURL(blob),a=doc.createElement('a');
  a.href=url;a.download=safeName(name,'回忆匣.zip',160);a.style.display='none';doc.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),120000);
}
async function fileSink(handle, directory = null) {
  let stream;
  try{stream=await handle.createWritable();}catch(e){if(directory)await directory.removeEntry(handle.name).catch(()=>{});throw e;}
  let committed=false,aborted=false;
  return {
    async write(bytes){await stream.write(bytes);},
    async close(){await stream.close();committed=true;},
    async abort(){if(!committed && !aborted){aborted=true;await stream.abort().catch(()=>{});if(directory)await directory.removeEntry(handle.name).catch(()=>{});}},
  };
}
async function uniqueFile(directory, name) {
  // Never overwrite an earlier export, including one produced in another tab.
  // The random task suffix makes a concurrent identical name extremely unlikely.
  for(let n=0;n<100;n++){
    const candidate=n?name.replace(/\.zip$/,`_${n}.zip`):name;
    try{await directory.getFileHandle(candidate);}catch(e){
      if(e.name==='NotFoundError')return directory.getFileHandle(candidate,{create:true});
      throw e;
    }
  }
  throw new ExportError('CANNOT_SAVE');
}

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

const USER_NODES='user-query, [data-test-id="user-query"], .user-query, message-content.user-message';
const MODEL_NODES='model-response, [data-test-id="model-response"], .model-response, message-content.model-message, message-content.model-response-text, structured-content-container.model-response-text';
const PAGE_CHROME='button, svg, mat-icon, script, style, textarea, input, form, nav, [role="toolbar"], [role="button"], [contenteditable="true"], message-actions, prompt-copy-button, prompt-edit-button, copy-button, copy-table-button, regenerate-button, .table-footer, .response-footer, .sources-list, .thoughts-container, model-thoughts, .cdk-visually-hidden, .visually-hidden, .sr-only';
function locateGeminiChat(doc){
  const visibility=new WeakMap();
  function visible(el){
    if(!el||el.nodeType!==1)return true;if(visibility.has(el))return visibility.get(el);
    let show=!el.matches('[hidden], [aria-hidden="true"], nav, aside, [role="navigation"], [role="dialog"], #gemini-memory-box, #gemini-memory-box-startup');
    if(show){try{const style=doc.defaultView?.getComputedStyle(el);show=style?.display!=='none'&&style?.visibility!=='hidden';}catch{}}
    if(show&&el.parentElement)show=visible(el.parentElement);visibility.set(el,show);return show;
  }
  function messages(root){
    const candidates=[...root.querySelectorAll(USER_NODES+', '+MODEL_NODES)].filter(visible);
    const role=el=>el.matches(USER_NODES)?'user':'assistant';
    return candidates.filter(el=>!candidates.some(other=>other!==el&&other.contains(el)&&role(other)===role(el)));
  }
  const roots=[['#chat-history','chat-history'],['[data-test-id="chat-history-container"]','history-testid'],['chat-window-content','chat-window-content'],['chat-window','chat-window'],['.chat-history','history-class'],['main','main'],['[role="main"]','main-role']];
  let empty=null;
  for(const [selector,stage]of roots)for(const root of doc.querySelectorAll(selector)){
    if(!visible(root))continue;const nodes=messages(root);if(nodes.length)return {root,nodes,stage};if(!empty)empty={root,nodes:[],stage};
  }
  if(doc.body){const nodes=messages(doc.body);if(nodes.length)return {root:doc.body,nodes,stage:'semantic-nodes'};}
  return empty||{root:null,nodes:[],stage:'not-found'};
}
function metadataIDs(element){
  const out={};let current=element;
  for(let level=0;current&&level<8;level++,current=current.parentElement){
    for(const key of ['data-response-id','data-message-id','id']){
      const v=current.getAttribute?.(key)||'',m=v.match(/(?:^|[^a-z])r_[0-9a-f]{16}(?:$|[^0-9a-f])/i);
      if(m){out.response=m[0].match(/r_[0-9a-f]{16}/i)[0];return out;}
    }
    const encoded=current.getAttribute?.('jslog')?.match(/BardVeMetadataKey:([^;]*)(?:;|$)/)?.[1];
    if(encoded&&encoded.length<20000){try{
      const values=JSON.parse(encoded.trim().startsWith('[')?encoded:atob(encoded));if(Array.isArray(values)){
        const strings=JSON.stringify(values),r=strings.match(/"(r_[0-9a-f]{16})"/i),c=strings.match(/"(c_[0-9a-f]{16})"/i);
        if(r)out.response=r[1];if(c)out.conversation=c[1];if(r)return out;
      }
    }catch{}}
    if(current.matches?.('.conversation-container'))break;
  }
  return out;
}
function domMarkdown(root){
  if(!root)return '';
  function convert(node,depth=0){
    if(depth>70)return '';
    if(node.nodeType===3)return node.textContent||'';
    if(node.nodeType!==1)return '';
    const tag=node.tagName.toLowerCase();
    if(node.matches(PAGE_CHROME)||node.getAttribute('aria-hidden')==='true'||node.hasAttribute('hidden'))return '';
    const children=()=>[...node.childNodes].map(n=>convert(n,depth+1)).join('');
    if(tag==='pre'){
      const text=node.querySelector('code')?.textContent??node.textContent??'';
      const runs=[...text.matchAll(/`+/g)].map(m=>m[0].length),fence='`'.repeat(Math.max(3,...runs.map(n=>n+1)));
      return '\n\n'+fence+'\n'+text+'\n'+fence+'\n\n';
    }
    if(tag==='code')return '`'+(node.textContent||'').replace(/`/g,'\\`')+'`';
    if(tag==='br')return '\n';
    if(tag==='img')return ''; // The actual image is exported through the attachment inventory.
    if(tag==='a'){
      const label=children(),url=node.getAttribute('href')||'';
      return /^https?:\/\//.test(url)?`[${label.replace(/\]/g,'\\]')}](${url.replace(/[()]/g,c=>encodeURIComponent(c))})`:label;
    }
    if(tag==='strong'||tag==='b')return '**'+children()+'**';
    if(tag==='em'||tag==='i')return '*'+children()+'*';
    if(/^h[1-6]$/.test(tag))return '\n\n'+'#'.repeat(Number(tag[1]))+' '+children()+'\n\n';
    if(tag==='li')return '\n- '+children().trim();
    if(tag==='blockquote')return '\n\n'+children().trim().split('\n').map(t=>'> '+t).join('\n')+'\n\n';
    if(tag==='table'){
      const rows=[...node.querySelectorAll('tr')].map(tr=>[...tr.querySelectorAll('th,td')].map(td=>convert(td,depth+1).trim().replace(/\|/g,'\\|').replace(/\n/g,' ')));
      if(!rows.length)return '';const width=Math.max(...rows.map(r=>r.length));
      const line=r=>'| '+Array.from({length:width},(_,i)=>r[i]||'').join(' | ')+' |';
      return '\n\n'+[line(rows[0]),line(Array(width).fill('---')),...rows.slice(1).map(line)].join('\n')+'\n\n';
    }
    const body=children();return ['p','div','section','ul','ol','hr'].includes(tag)?'\n'+body+'\n':body;
  }
  return convert(root).replace(/\r/g,'').replace(/\n{4,}/g,'\n\n\n').trim();
}
function collectPage(doc,route,assignId){
  const located=locateGeminiChat(doc),root=located.root;
  if(!root)return {messages:[],resources:[],fingerprint:'',loading:false,locator_stage:located.stage};
  const messages=[],resources=[];
  for(const el of located.nodes){
    const role=el.matches(USER_NODES)?'user':'assistant',container=el.closest('.conversation-container');
    let ids=metadataIDs(el);
    if(!ids.response&&container){for(const tagged of container.querySelectorAll('[data-response-id], [jslog*="BardVeMetadataKey"]')){ids=metadataIDs(tagged);if(ids.response)break;}}
    if(ids.conversation&&ids.conversation!==route.id)continue;
    const nodeId=ids.response||assignId(el),messageId=nodeId+':'+role;
    const selectors=role==='user'?['.query-text','.query-content','[data-test-id="user-query-content"]','user-query-content','.user-query-content']:['message-content .markdown-main-panel','model-response-content .markdown-main-panel','.markdown-main-panel','[data-test-id="message-content"]','message-content.model-response-text','model-response-content','message-content','.response-content','.message-content'];
    let body=el;for(const selector of selectors){const found=[...(el.matches(selector)?[el]:[]),...el.querySelectorAll(selector)].find(node=>!node.closest('.thoughts-container, model-thoughts, [hidden], [aria-hidden="true"]'));if(found){body=found;break;}}
    messages.push({message_id:messageId,node_id:nodeId,role,text:domMarkdown(body),raw:{source:'loaded-page'},time:''});
    for(const img of el.querySelectorAll('img')){
      if(img.closest('.avatar, [data-test-id*="avatar"], [hidden], [aria-hidden="true"]'))continue;
      let url=img.currentSrc||img.getAttribute('data-src')||img.getAttribute('src');
      if(!url)continue;try{url=new URL(url,doc.location?.href||'https://gemini.google.com/').href;}catch{continue;}
      const explicit=img.closest('single-image, generated-image, .image-container, [data-image-id], gem-attachment')||/^https:\/\/lh[1-7]\.googleusercontent\.com\/(?:gg|gg-dl|rd-gg|contrib)\//.test(url);
      if(Math.max(img.naturalWidth||0,img.width||0)<64&&!explicit)continue;
      if(!/^(?:https:\/\/|data:image\/|blob:https:\/\/gemini.google.com\/)/.test(url))continue;
      resources.push({messageId,role,url,name:img.getAttribute('alt')?.slice(0,100)||null,element:img,kind:'images'});
    }
    for(const link of el.querySelectorAll('a[download], a[data-download-url], video[src], audio[src], source[src]')){
      const url=link.getAttribute('data-download-url')||link.getAttribute('href')||link.getAttribute('src');if(!url||!/^https:\/\//.test(url))continue;
      let kind=['video','audio','source'].includes(link.tagName.toLowerCase())?'media':'files';
      try{approvedResource(url);}catch{continue;}
      resources.push({messageId,role,url,name:link.getAttribute('download')||null,element:null,kind});
    }
  }
  return {messages,resources,fingerprint:messages.map(m=>m.message_id).join('|'),loading:Boolean(root.querySelector('[aria-busy="true"], .loading-history, [data-test-id="loading-history"]')),locator_stage:located.stage};
}
async function loadedImageBytes(img){
  if(!img.complete||!img.naturalWidth||!img.naturalHeight||img.naturalWidth*img.naturalHeight>16000000)return null;
  try{const canvas=img.ownerDocument.createElement('canvas');canvas.width=img.naturalWidth;canvas.height=img.naturalHeight;
    canvas.getContext('2d').drawImage(img,0,0);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    return blob&&blob.size<=8*MiB?new Uint8Array(await blob.arrayBuffer()):null;
  }catch{return null;}
}
function createPageCache(){
  let key=null,records=new Map(),totalBytes=0,truncated=false;
  return {reset(next){if(next!==key){key=next;records.clear();totalBytes=0;truncated=false;}},
    add(routeKey,row){if(key!==routeKey)return;const id=row.messageId+'|'+canonicalResource(row.url),old=records.get(id);if(!old&&records.size>=1500){truncated=true;return;}
      const next={...old,...row};delete next.element;if(!row.bytes&&old?.bytes)next.bytes=old.bytes;
      const delta=(next.bytes?.length||0)-(old?.bytes?.length||0);if(totalBytes+delta>64*MiB){truncated=true;next.bytes=old?.bytes;}else totalBytes+=delta;records.set(id,next);
    },snapshot(routeKey){return routeKey===key?[...records.values()]:[];},clear(){records.clear();totalBytes=0;truncated=false;},stats(){return {items:records.size,bytes:totalBytes,truncated};}};
}
function findChatScroller(doc,win){
  const root=locateGeminiChat(doc).root;if(!root)return null;
  const set=new Set([doc.scrollingElement,root,...root.querySelectorAll('div, infinite-scroller, chat-window')]);
  for(let p=root.parentElement;p;p=p.parentElement)set.add(p);
  return [...set].filter(e=>e&&e.clientHeight>120&&e.scrollHeight>e.clientHeight+40&&(e===doc.scrollingElement||['auto','scroll','overlay'].includes(win.getComputedStyle(e).overflowY)))
    .sort((a,b)=>b.querySelectorAll(USER_NODES+', '+MODEL_NODES).length-a.querySelectorAll(USER_NODES+', '+MODEL_NODES).length||b.clientHeight-a.clientHeight)[0]||null;
}
async function scanPageArea({scroller,capture,signal,progress,stillHere=()=>true,sleep=pause,maxSteps=500,maxMs=300000,now=Date.now}){
  const initial=scroller.scrollTop,started=now();let steps=0,limited=false;
  try{for(const direction of [-1,1]){let stable=0;while(true){
    checkAbort(signal);if(!stillHere())throw new ExportError('WRONG_PAGE');if(++steps>maxSteps||now()-started>maxMs){limited=true;break;}
    const before=scroller.scrollTop,height=scroller.scrollHeight,first=await capture();
    scroller.scrollTop=Math.max(0,Math.min(scroller.scrollHeight-scroller.clientHeight,before+direction*Math.max(120,scroller.clientHeight*.7)));
    await sleep(500,signal);const after=await capture();progress?.(direction<0?'读取较早页面':'回看页面图片');
    const edge=direction<0?scroller.scrollTop<=1:scroller.scrollTop+scroller.clientHeight>=scroller.scrollHeight-2;
    if(edge&&height===scroller.scrollHeight&&Math.abs(before-scroller.scrollTop)<2&&first?.fingerprint===after?.fingerprint&&!after?.loading)stable++;else stable=0;
    if(stable>=5)break;
  }}return {steps,limited};}finally{scroller.scrollTop=initial;}
}

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

const UI_CSS=`
:host{all:initial;font-family:system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif;color:#29334a;font-size:14px;line-height:1.5;--accent:#7461c6;--ink:#29334a;--muted:#7a8194;--line:#e8e8f1;--surface:#fafaff;position:fixed;right:24px;bottom:24px;z-index:2147483646}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer}button:disabled{cursor:default;opacity:.5}button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #a89bdf;outline-offset:3px}
.launch{border:1px solid #e1def2;background:#fff;box-shadow:0 6px 26px #4c426b20;border-radius:24px;padding:11px 18px;display:flex;align-items:center;gap:9px;color:var(--ink);font-weight:650;font-size:14px}.launch svg{color:var(--accent)}.launch:hover{background:#f6f3ff}.launch[hidden], [hidden]{display:none!important}
.panel{width:420px;max-height:calc(100dvh - 48px);background:#fff;border:1px solid #e4e1ee;border-radius:22px;box-shadow:0 16px 64px #30274126;overflow:hidden;display:flex;flex-direction:column}.head{display:flex;align-items:center;padding:21px 22px 17px;border-bottom:1px solid var(--line);gap:11px}.mark{display:grid;place-items:center;background:#f0ecfd;color:var(--accent);width:38px;height:38px;border-radius:12px}.brand{flex:1}.brand strong{display:block;font-size:17px;letter-spacing:.5px}.brand small{display:block;font-size:11px;color:var(--muted);margin-top:2px}.icon{border:0;background:transparent;width:32px;height:32px;border-radius:9px;color:#8a90a1;display:grid;place-items:center}.icon:hover{background:#f2f1f8;color:var(--accent)}
.nav{display:flex;gap:5px;padding:12px 20px 0}.nav button{flex:1;border:0;background:transparent;color:var(--muted);font-size:13px;padding:8px 10px;border-radius:9px}.nav button.active{color:#6b57b5;background:#f1edfc;font-weight:650}.view{padding:20px 22px 22px;overflow:auto;overscroll-behavior:contain;min-height:0}.intro{font-size:22px;font-weight:650;line-height:1.4;margin:4px 0 9px;letter-spacing:-.3px}.lead{font-size:12px;line-height:1.9;color:var(--muted);margin:0 0 20px}
.scope-card{background:var(--surface);border:1px solid var(--line);border-radius:13px;padding:14px 16px;margin-bottom:14px}.kicker{font-size:11px;color:var(--muted);margin-bottom:6px}.current{font-size:14px;font-weight:600;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin-top:10px}.tag{font-size:10px;padding:3px 7px;background:#efedf6;color:#726b85;border-radius:5px}.destination{display:flex;align-items:flex-start;gap:7px;font-size:12px;color:var(--muted);margin:0 2px 19px;line-height:1.6}.destination svg{flex:none;margin-top:2px}
.primary{width:100%;min-height:47px;background:var(--accent);color:white;border:1px solid var(--accent);border-radius:11px;font-size:14px;font-weight:650;box-shadow:0 4px 12px #7461c620}.primary:hover{background:#6854b9}.secondary{border:1px solid #ddd9ed;background:white;border-radius:9px;padding:8px 12px;font-size:12px;color:#6b5d93}.secondary:hover{background:#f8f6ff}.danger{color:#9c4d64;border-color:#ebd9df}.small{font-size:11px;color:var(--muted);line-height:1.75}.privacy{margin-top:16px;display:flex;gap:6px;align-items:center;color:#7d8d8a;font-size:10px;justify-content:center}
.status{margin-top:16px;border:1px solid var(--line);border-radius:12px;padding:13px 14px;background:#fafaff}.status[data-tone=warn]{background:#fffaf0;border-color:#eddfbe}.status[data-tone=error]{background:#fff6f7;border-color:#edd7df}.status[data-tone=success]{background:#f2faf6;border-color:#d6e8df}.status-title{font-size:13px;font-weight:600}.status-copy{font-size:11px;color:var(--muted);line-height:1.85;margin-top:6px;white-space:pre-wrap;overflow-wrap:anywhere}progress{appearance:none;width:100%;height:5px;border:0;border-radius:4px;overflow:hidden;margin-top:12px;background:#e8e5f2}progress::-webkit-progress-bar{background:#e8e5f2}progress::-webkit-progress-value{background:#9a8bd5}progress::-moz-progress-bar{background:#9a8bd5}.cancel{display:block;margin:11px auto 0;background:transparent;border:0;color:#8b6f86;font-size:12px}
.section{margin-bottom:19px;padding-bottom:19px;border-bottom:1px solid var(--line)}.section:last-child{border:0;margin-bottom:0;padding-bottom:0}.section h3{font-size:13px;margin:0 0 12px;font-weight:650}.row{display:flex;gap:10px;align-items:flex-start;margin:11px 0;font-size:12px;cursor:pointer;line-height:1.6}.row input{accent-color:var(--accent);margin:3px 0 0;width:15px;height:15px;flex:none}.row span{display:block}.row small{color:var(--muted);font-size:10px;display:block;margin-top:2px}.choices{display:grid;grid-template-columns:1fr 1fr;gap:2px 8px}.form-control{width:100%;border:1px solid #dedce9;border-radius:9px;padding:9px 10px;color:var(--ink);background:#fff;font-size:12px}.form-control:disabled{color:#a0a0ad}.inline{display:flex;align-items:center;gap:8px;margin-top:10px}.inline .form-control{flex:1;min-width:0}.inline .secondary{flex:none}.subnote{margin:8px 0 0;font-size:10px;color:var(--muted);line-height:1.8}.list{max-height:200px;overflow:auto;margin-top:10px;border:1px solid var(--line);border-radius:10px}.list label{padding:9px 11px;margin:0;border-bottom:1px solid var(--line)}.list label:last-child{border:0}.list label span{min-width:0;overflow-wrap:anywhere}.list-message{font-size:11px;color:var(--muted);padding:14px;text-align:center}.heading-line{display:flex;justify-content:space-between;align-items:center;gap:10px}.heading-line h3{margin:0}.log-list{font:10px/1.9 ui-monospace,SFMono-Regular,Consolas,monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:#f8f8fc;border:1px solid var(--line);border-radius:10px;padding:12px;max-height:235px;overflow:auto;margin:14px 0}.log-list:empty::before{content:'还没有操作日志。'}fieldset{border:0;padding:0;margin:0;min-width:0}.notice{padding:10px 12px;border-radius:8px;background:#f8f5ef;font-size:11px;color:#8d7c60;line-height:1.7;margin:10px 0}.foot{font-size:10px;color:#aaa5b8;padding-top:12px;text-align:center}.diag-result{font-size:11px;line-height:1.9;white-space:pre-wrap;color:#788180;margin-top:12px}
@media(max-width:480px){:host{right:10px;bottom:10px}.panel{width:calc(100vw - 20px);max-height:calc(100dvh - 20px);border-radius:17px}.view{padding:17px 18px}.head{padding:17px 18px 14px}}
@media(prefers-color-scheme:dark){:host{color:#e3e1ec;--ink:#e3e1ec;--muted:#a19cae;--line:#393445;--surface:#2b2834}.panel{background:#24212c;border-color:#494056}.launch{background:#2c2638;border-color:#514565;color:#e6e0ef}.launch:hover,.secondary:hover,.icon:hover{background:#383045}.mark{background:#3b3150}.nav button.active{background:#3a304c;color:#d0bffa}.tag{background:#3a3446;color:#b9b0ce}.secondary,.form-control{background:#2c2836;border-color:#51465d;color:#d2c3eb}.status,.log-list{background:#2c2835;border-color:#494056}.status[data-tone=warn],.notice{background:#393026;border-color:#65543c;color:#e4caaa}.status[data-tone=error]{background:#392733;border-color:#694253}.status[data-tone=success]{background:#263a34;border-color:#3f6053}}
`;
const BOX_ICON='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 8h16v12H4zM3 4h18v4H3zM9 12h6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const FOLDER_ICON='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M3 7h7l2 2h9v11H3zM3 7V4h7l2 3" stroke-linejoin="round"/></svg>';
const SHIELD_ICON='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" stroke-linejoin="round"/></svg>';

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

const UI_TREE=[["button",{"class":"launch","id":"launch","aria-label":"打开回忆匣 Gemini"},[["svg",{"width":"20","height":"20","viewbox":"0 0 24 24","fill":"none","stroke":"currentColor","stroke-width":"1.6","aria-hidden":"true"},[["path",{"d":"M4 8h16v12H4zM3 4h18v4H3zM9 12h6","stroke-linecap":"round","stroke-linejoin":"round"},[]]]],["span",{},["回忆匣 · Gemini"]]]],["section",{"class":"panel","id":"panel","hidden":"","aria-label":"回忆匣 Gemini 导出面板"},[["header",{"class":"head"},[["div",{"class":"mark"},[["svg",{"width":"20","height":"20","viewbox":"0 0 24 24","fill":"none","stroke":"currentColor","stroke-width":"1.6","aria-hidden":"true"},[["path",{"d":"M4 8h16v12H4zM3 4h18v4H3zM9 12h6","stroke-linecap":"round","stroke-linejoin":"round"},[]]]]]],["div",{"class":"brand"},[["strong",{},["回忆匣 · Gemini"]],["small",{},["对话与附件导出"]]]],["button",{"class":"icon","id":"close","aria-label":"收起"},["−"]]]],["nav",{"class":"nav","aria-label":"功能"},[["button",{"class":"active","data-tab":"home"},["导出"]],["button",{"data-tab":"settings"},["设置"]],["button",{"data-tab":"logs"},["日志诊断"]]]],["div",{"class":"view","data-view":"home"},[["h2",{"class":"intro"},["把聊过的，好好留下。"]],["p",{"class":"lead"},["Gemini 的文字与附件，一起装进 ZIP。",["br",{},[]],"完整解压后，就能离线翻看。"]],["div",{"class":"scope-card"},[["div",{"class":"kicker"},["当前 Gemini 对话"]],["div",{"class":"current","id":"current-title"},["请先打开聊天窗口"]],["div",{"class":"meta","id":"format-tags"},[]]]],["div",{"class":"destination"},[["svg",{"width":"14","height":"14","viewbox":"0 0 24 24","fill":"none","stroke":"currentColor","stroke-width":"1.5","aria-hidden":"true"},[["path",{"d":"M3 7h7l2 2h9v11H3zM3 7V4h7l2 3","stroke-linejoin":"round"},[]]]],["span",{"id":"destination-summary"},["先选择 ZIP 保存位置"]]]],["button",{"class":"primary","id":"export"},["导出当前对话 · ZIP"]],["div",{"class":"status","id":"status","hidden":"","role":"status","aria-live":"polite"},[["div",{"class":"status-title","id":"status-title"},[]],["div",{"class":"status-copy","id":"status-copy"},[]],["progress",{"id":"progress","hidden":"","aria-label":"导出进度"},[]],["button",{"class":"cancel","id":"cancel","hidden":""},["取消本次操作"]]]],["div",{"class":"privacy"},[["svg",{"width":"12","height":"12","viewbox":"0 0 24 24","fill":"none","stroke":"currentColor","stroke-width":"1.5","aria-hidden":"true"},[["path",{"d":"M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6","stroke-linejoin":"round"},[]]]],["span",{},["本机打包 · 无上传与统计 · 无远程依赖"]]]]]],["div",{"class":"view","data-view":"settings","hidden":""},[["fieldset",{"id":"settings-fields"},[["section",{"class":"section"},[["h3",{},["提取方式"]],["select",{"class":"form-control","data-setting":"mode","aria-label":"提取方式"},[["option",{"value":"history"},["当前对话的完整历史（推荐）"]],["option",{"value":"page"},["页面补救：仅本次已加载消息"]]]],["p",{"class":"subnote"},["历史模式自动读取分页并核对顺序，通常无需先划完整个窗口。页面补救模式始终标记为部分记录。只处理当前聊天，不读取历史列表。"]]]],["section",{"class":"section"},[["h3",{},["ZIP 里放什么"]],["div",{"class":"choices"},[["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"html"},[]],["span",{},["离线聊天阅读版"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"markdown"},[]],["span",{},["Markdown 文字版"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"images"},[]],["span",{},["图片附件"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"files"},[]],["span",{},["文件与代码附件"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"media"},[]],["span",{},["音频与视频附件"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"thoughts"},[]],["span",{},["思考摘要",["small",{},["保存接口已返回的展示摘要。"]]]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"sources"},[]],["span",{},["生成的小程序与代码源码",["small",{},["返回中的结构化代码块，另存为文本文件。"]]]]]]]],["p",{"class":"subnote"},["原始 JSON、附件清单、完整性报告和诊断日志始终保留。原图优先；页面副本与缺失附件会注明。"]]]],["section",{"class":"section"},[["h3",{},["补入下载失败的本机原文件"]],["div",{"class":"inline"},[["button",{"class":"secondary","id":"choose-local-files"},["选择本机文件"]],["button",{"class":"secondary","id":"clear-local-files"},["清除选择"]],["input",{"id":"local-files","type":"file","multiple":"","hidden":""},[]]]],["p",{"class":"small","id":"local-files-summary"},["未选择本机文件"]],["p",{"class":"subnote"},["只在对应附件下载失败时按文件名配对；多个同名文件不会自动配对。补入项标为“本机补入，原文件一致性未核实”。文件仅在本页使用，不上传；切换聊天或账号后清空。"]]]],["section",{"class":"section"},[["h3",{},["阅读版显示谁的文字"]],["div",{"class":"choices"},[["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"includeUser"},[]],["span",{},["我的消息"]]]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"includeGemini"},[]],["span",{},["Gemini 的回复"]]]]]],["p",{"class":"subnote"},["只影响 HTML 和 Markdown 的文字显示。原始 JSON 保留本次接口返回的整段对话和候选回复；附件由上方开关选择。"]]]],["section",{"class":"section"},[["h3",{},["页面图片补充"]],["label",{"class":"row"},[["input",{"type":"checkbox","data-setting":"pageAssist"},[]],["span",{},["记住本页已加载的图片",["small",{},["仅本页内存保存；切换账号、聊天或刷新后清空。"]]]]]],["div",{"class":"inline"},[["button",{"class":"secondary","id":"scan-page"},["辅助加载图片"]],["span",{"class":"small","id":"cache-summary"},["尚未收集"]]]],["p",{"class":"subnote"},["需要补充页面图片时使用。分段滚动最多 5 分钟，可随时停止；不会使过期附件重新生成。页面补救模式仍只导出点击时加载的消息。"]]]],["section",{"class":"section"},[["h3",{},["保存到哪里"]],["select",{"class":"form-control","data-setting":"destination","aria-label":"保存方式"},[["option",{"value":"ask"},["每次选择 ZIP 保存位置（推荐）"]],["option",{"value":"folder"},["本页固定使用一个文件夹"]],["option",{"value":"download"},["浏览器默认下载位置"]]]],["div",{"class":"inline","id":"folder-area","hidden":""},[["button",{"class":"secondary","id":"choose-folder"},["选择文件夹"]],["span",{"class":"small","id":"folder-name"},["尚未选择"]]]],["p",{"class":"subnote","id":"save-note"},["先选择位置，再开始读取。固定文件夹仅本页记住，每次生成新的 ZIP。"]]]],["section",{"class":"section"},[["h3",{},["单个附件大小上限"]],["select",{"class":"form-control","data-setting":"maxFileMiB","aria-label":"附件大小上限"},[["option",{"value":"64"},["64 MiB"]],["option",{"value":"256"},["256 MiB（默认）"]],["option",{"value":"512"},["512 MiB"]],["option",{"value":"1024"},["1 GiB"]]]],["p",{"class":"subnote"},["浏览器默认下载方式的整包缓存上限为 128 MiB。选择保存位置可逐个文件写入，整包超过 4 GiB 时使用 ZIP64。"]]]]]],["div",{"class":"foot"},["设置保存在本机 · Gemini 1.0.4"]]]],["div",{"class":"view","data-view":"logs","hidden":""},[["div",{"class":"heading-line"},[["h3",{},["本次页面的日志"]],["button",{"class":"secondary","id":"clear-logs"},["清空"]]]],["p",{"class":"small"},["只记录阶段、数量、错误类型与下载域名。没有聊天正文、标题、文件名、链接路径、查询参数或登录凭据。"]],["div",{"class":"log-list","id":"log-list","aria-live":"polite"},[]],["div",{"class":"inline"},[["button",{"class":"secondary","id":"run-diagnostics"},["检查本地功能"]],["button",{"class":"secondary","id":"check-attachments"},["检测当前附件"]],["button",{"class":"secondary","id":"save-diagnostics"},["保存诊断 JSON"]]]],["div",{"class":"diag-result","id":"diag-result"},[]],["div",{"class":"notice"},["附件检测最多实际取回两份样本，每份上限 8 MiB，不生成 ZIP。失败时保存新诊断；导出包内还会列出缺失附件和未核实原图。"]],["div",{"class":"foot"},["只在点击操作后读取 Gemini · 无自动上传"]]]]]]];
function createUI(doc){
  const SVG='http://www.w3.org/2000/svg';
  const svgNames={viewbox:'viewBox',preserveaspectratio:'preserveAspectRatio'};
  function create(node,inSVG=false){
    if(typeof node==='string')return doc.createTextNode(node);
    const [tag,attrs,children]=node,svg=inSVG||tag==='svg';
    const element=svg?doc.createElementNS(SVG,tag):doc.createElement(tag);
    for(const [name,value]of Object.entries(attrs))element.setAttribute(svg?(svgNames[name]||name):name,value);
    for(const child of children)element.appendChild(create(child,svg));
    return element;
  }
  const fragment=doc.createDocumentFragment();
  for(const node of UI_TREE)fragment.appendChild(create(node));
  return fragment;
}

const APP_ID='gemini-memory-box',BOOT_ID=APP_ID+'-startup';
function positionHost(host){
  const gap=window.innerWidth<=480?'10px':'24px';
  for(const [name,value]of Object.entries({position:'fixed',right:gap,bottom:gap,'z-index':'2147483647',display:'block',visibility:'visible',opacity:'1','pointer-events':'auto'}))host.style.setProperty(name,value,'important');
}
function bootstrapApp(){
  if(location.hostname!=='gemini.google.com'||window.top!==window.self)return;
  if(document.getElementById(APP_ID)?.dataset.memoryboxReady==='1')return;
  let app=null,lastCode=null;
  function place(){
    if(!app?.host)return;
    const parent=document.body||document.documentElement;if(!parent)return;
    positionHost(app.host);if(app.host.parentNode!==parent)parent.appendChild(app.host);
  }
  function fallback(){
    if(document.getElementById(BOOT_ID))return;
    const parent=document.body||document.documentElement;if(!parent)return;
    const button=document.createElement('button');button.id=BOOT_ID;button.type='button';
    button.textContent='回忆匣启动未完成 · 点击重试';
    positionHost(button);
    for(const [name,value]of Object.entries({background:'#fff',color:'#29334a',border:'1px solid #d7cdef','border-radius':'12px',padding:'12px 16px',font:'14px system-ui,sans-serif'}))button.style.setProperty(name,value,'important');
    button.addEventListener('click',()=>{button.remove();ensure(true);});parent.appendChild(button);
  }
  function ensure(open=false){
    if(app){place();if(open)app.open();return;}
    const existing=document.getElementById(APP_ID);
    if(existing?.dataset.memoryboxReady==='1'){positionHost(existing);if(open)existing.dispatchEvent(new Event('memorybox-open'));return;}
    try{
      existing?.remove();app=mountApp();if(!app)return;
      lastCode=null;document.getElementById(BOOT_ID)?.remove();place();if(open)app.open();
    }catch(e){
      lastCode=e?.name==='TypeError'?'BOOT_TYPE_ERROR':e?.name==='SecurityError'?'BOOT_SECURITY_ERROR':'BOOT_INIT_ERROR';
      const unfinished=document.getElementById(APP_ID);if(unfinished?.dataset.memoryboxReady!=='1')unfinished?.remove();
      fallback();
    }
  }
  const register=typeof GM_registerMenuCommand==='function'?(name,fn)=>GM_registerMenuCommand(name,fn):typeof GM!=='undefined'&&typeof GM.registerMenuCommand==='function'?(name,fn)=>GM.registerMenuCommand(name,fn):null;
  if(register){
    for(const [name,fn]of [
      ['显示回忆匣 · Gemini',()=>ensure(true)],
      ['回忆匣 · 启动自检',()=>{
        const mounted=document.getElementById(APP_ID)?.dataset.memoryboxReady==='1';
        const located=locateGeminiChat(document);
        window.alert(`回忆匣 Gemini ${VERSION}\n脚本已经执行：是\n网页匹配：gemini.google.com\n界面初始化：${mounted?'完成':'未完成'}\n界面连接：${document.getElementById(APP_ID)?.isConnected?'正常':'未连接'}\n聊天区定位：${located.nodes.length?'已识别':'暂未发现已加载消息'}\n已加载消息：${located.nodes.length}\n启动状态：${lastCode||'READY'}\n此自检未读取聊天正文，未发出网络请求。`);
      }]
    ])try{const result=register(name,fn);if(result?.catch)result.catch(()=>{});}catch{}
  }
  if(document.documentElement)ensure();
  else document.addEventListener('DOMContentLoaded',()=>ensure(),{once:true});
  // Reattach the existing controller after SPA/body replacement; retain one set of listeners.
  setInterval(()=>{if(app)place();},1000);
  window.addEventListener('pageshow',()=>ensure());
}

if(typeof module!=='undefined'&&module.exports&&typeof window==='undefined'){
 module.exports={VERSION,DEFAULTS,settingsOf,ExportError,errorCode,explain,safeName,scrub,makeLogger,readLimited,
 geminiRoute,configFields,configFromHTML,approvedResource,responseShape,parseBatchResponse,parseHistoryPage,makeGeminiNetwork,
 collectHistory,selectTurns,discoverResources,canonicalResource,fullSizeURL,imageMime,acquireResource,publicResource,structuredSources,thoughtSummary,
 ZipWriter,memorySink,sha256,fileSink,uniqueFile,resourceFilename,exportArchive,checkCurrentAttachments,
 locateGeminiChat,metadataIDs,domMarkdown,collectPage,createPageCache,scanPageArea,htmlDocument,markdownDocument,UI_HTML,UI_CSS,mountApp,createUI,bootstrapApp};
}else if(typeof document!=='undefined'){
 bootstrapApp();
}
})();
