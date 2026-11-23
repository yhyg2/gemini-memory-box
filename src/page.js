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
