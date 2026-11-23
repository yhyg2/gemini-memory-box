const C='c_0123456789abcdef';
const rid=n=>'r_'+n.toString(16).padStart(16,'0');
const rcid=n=>'rc_'+n.toString(16).padStart(16,'0');
const PNG=new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN2kAAAAASUVORK5CYII=','base64'));
const URL='https://lh3.googleusercontent.com/gg/SYNTHETIC_ASSET';
function turn(n,{user='问题 '+n,answer='回答 '+n,attachments=[],userAttachments=[],candidates}={}){
  const candidate=Array(9).fill(null);candidate[0]=rcid(n);candidate[1]=[answer];candidate[8]=attachments;
  const raw=[[C,rid(n)],[C,n>1?rid(n-1):null,n>1?rcid(n-1):null],[[user]], [candidates||[candidate],null,null,rcid(n)],[1730000000+n,0]];
  if(userAttachments.length)raw[2][0]=[user,1,null,null,[[null,null,null,userAttachments],userAttachments]];
  return raw;
}
function frame(payload,id='hNvQHb'){
  const part=JSON.stringify([['wrb.fr',id,JSON.stringify(payload),null,null,null,'generic']]);return ")]}'\n"+part.length+'\n'+part+'\n'+JSON.stringify([['di',12]])+'\n';
}
function mediaEntry(url=URL,token='$SYNTHETIC_TOKEN'){
  return [url,'image/png',[1,1,1001],[null,null,null,null,null,token]];
}
function uploadEntry(type,name,url,mime,{thumbnail='https://lh3.googleusercontent.com/viewer/thumb/FAKE',upload='https://contribution.usercontent.google.com/upload/FAKE',size=0}={}){
  const a=Array(16).fill(null);a[1]=type;a[2]=name;a[11]=mime;
  if(type===1)a[3]=url;else a[7]=[thumbnail,url,upload];
  if(size)a[15]=[1,1,size];return a;
}
function dep(name){try{return require(name);}catch{return require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/'+name);}}
module.exports={C,rid,rcid,PNG,URL,turn,frame,mediaEntry,uploadEntry,dep};
