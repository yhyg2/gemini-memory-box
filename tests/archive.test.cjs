const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const c=require('../gemini-memory-box.user.js'),{PNG,URL,turn,mediaEntry,dep}=require('./fixtures.cjs'),JSZip=dep('jszip');
const route=c.geminiRoute('/app/0123456789abcdef');
async function run({raw=[turn(1)],settings={},request=async()=>({bytes:PNG,headers:new Headers({'content-type':'image/png'})}),imageRPC=true,dom=[],pageMessages=[],name}={}){
  const sink=c.memorySink(),zip=new c.ZipWriter(sink),net={rpc:async(id)=>id==='hNvQHb'?[raw,null]:imageRPC?[URL]:[],request,clear(){}};
  const report=await c.exportArchive({net,zip,route,settings:{...c.DEFAULTS,...settings},log:c.makeLogger(),dom,pageMessages,title:'合成测试 <script>不会执行</script>'});
  const bytes=Buffer.from(await sink.blob().arrayBuffer()),archive=await JSZip.loadAsync(bytes,{checkCRC32:true});if(name)fs.writeFileSync(path.join(__dirname,'../qa',name),bytes);return {report,archive,bytes};
}
test('complete ZIP includes readable files, original graph, reports and SHA-256 checks',async()=>{
  const {report,archive}=await run({raw:[turn(1,{attachments:[mediaEntry()]})],name:'complete-synthetic.zip'});assert.equal(report.result,'complete');assert.equal(report.attachments_saved,1);
  const manifest=JSON.parse(await archive.file('文件校验.json').async('string'));for(const f of manifest.files){const b=new Uint8Array(await archive.file(f.path).async('uint8array'));assert.equal(await c.sha256(b),f.sha256);assert.equal(b.length,f.size_bytes);}
  assert(archive.file('打开我.html'));assert(archive.file('附件/0001_附件_1.png'));assert((await archive.file('聊天记录.html').async('string')).includes('&lt;script&gt;'));
});
test('attachment failure yields a usable partial ZIP and explicit missing entry',async()=>{
  const {report,archive}=await run({raw:[turn(1,{attachments:[mediaEntry()]})],request:async()=>{throw new c.ExportError('HTTP_404');},name:'partial-synthetic.zip'});assert.equal(report.result,'partial');assert.equal(report.attachments_failed,1);
  const failed=JSON.parse(await archive.file('附件失败清单.json').async('string'));assert.equal(failed.length,1);assert(!Object.keys(archive.files).some(p=>p.startsWith('附件/')));assert(archive.file('聊天记录.md'));
});
test('page mode can never declare complete history',async()=>{
  const {report}=await run({settings:{mode:'page'},pageMessages:[{role:'user',text:'仅页面',message_id:'p:user',node_id:'p',raw:{}}],name:'page-synthetic.zip'});assert.equal(report.history_complete,false);assert.equal(report.result,'partial');assert(report.warnings.includes('PAGE_ONLY'));
});
test('display-only image copies are preserved and reported as unverified',async()=>{
  const {report,archive}=await run({raw:[turn(1,{attachments:[[URL,'image/png']]})],imageRPC:false,name:'unverified-synthetic.zip'});assert.equal(report.images_unverified,1);assert.equal(report.result,'partial');assert.equal(JSON.parse(await archive.file('附件失败清单.json').async('string')).length,0);assert.equal(JSON.parse(await archive.file('附件待核实清单.json').async('string')).length,1);
});
test('settings skip chosen attachment types and reading roles without erasing raw data',async()=>{
  const {report,archive}=await run({raw:[turn(1,{user:'不可见用户消息',attachments:[mediaEntry()]})],settings:{images:false,includeUser:false}});assert.equal(report.attachments_selected,0);assert.equal(report.attachments_excluded,1);
  assert(!(await archive.file('聊天记录.md').async('string')).includes('不可见用户消息'));assert((await archive.file('原始对话.json').async('string')).includes('不可见用户消息'));
});
test('offline readers cannot run code or auto-load remote image sources',async()=>{
  const {archive}=await run({raw:[turn(1,{answer:'<script>alert(1)</script>\n![x](https://evil.test/image.png)'})]});const html=await archive.file('聊天记录.html').async('string'),md=await archive.file('聊天记录.md').async('string');
  assert(html.includes("connect-src 'none'"));assert(!/<script\b|<img[^>]+src="https?:/i.test(html));assert(!md.includes('![x](https://'));assert.equal(JSON.parse(await archive.file('资源引用清单.json').async('string')).length,1);
});
test('ZIP refuses traversal and duplicate paths',async()=>{const zip=new c.ZipWriter(c.memorySink());for(const p of ['../x','/tmp/x','C:/x','a/../x'])await assert.rejects(zip.add(p,'x'));await zip.add('safe.txt','x');await assert.rejects(zip.add('safe.txt','x'));});
test('disk write failure aborts the archive rather than counting a missing attachment',async()=>{
  let aborted=false,closed=false;const sink={async write(){throw new DOMException('full','QuotaExceededError');},async close(){closed=true;},async abort(){aborted=true;}};
  await assert.rejects(c.exportArchive({net:{rpc:async()=>[[turn(1)],null],clear(){}},zip:new c.ZipWriter(sink),route,settings:c.DEFAULTS,log:c.makeLogger()}));assert(aborted);assert.equal(closed,false);
});
test('Save As abort preserves existing file; new folder export is removed on abort',async()=>{
  let removed=0,committed=0;const h={name:'new.zip',async createWritable(){return {async write(){},async close(){committed++;},async abort(){}};}},dir={async removeEntry(n){assert.equal(n,'new.zip');removed++;}};
  await (await c.fileSink(h)).abort();assert.equal(removed,0);await (await c.fileSink(h,dir)).abort();assert.equal(removed,1);assert.equal(committed,0);
});
test('memory fallback fails at its explicit limit and original image extensions match bytes',async()=>{
  const m=c.memorySink(10);await assert.rejects(m.write(new Uint8Array(11)),e=>e.code==='MEMORY_LIMIT');assert(c.resourceFilename({number:1,kind:'images',name:'wrong.jpg'},{mime:'image/png'}).endsWith('.png'));
});
