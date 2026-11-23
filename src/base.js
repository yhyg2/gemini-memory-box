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
