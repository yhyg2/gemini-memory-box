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
