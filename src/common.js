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
