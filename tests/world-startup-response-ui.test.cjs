const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'world.html'),'utf8');
const boot='j1(()=>H());gm(';
assert(html.includes(boot));
html=html.replace(boot,`window.startupTest={auth:D,state:g,actions:sr,setClient:c=>{S=c},finishLogin:rm,setShow:fn=>{em=fn}};${boot}`);
const adminPath=p=>p.startsWith('/admin/')||p==='/note/admin.js'||p==='/note/admin.css';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
  let allowAdmin=false,failReview=true;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.hostname!=='fixture.test')return route.abort();
   requests.push(p);
   if(p==='/world.html')return route.fulfill({contentType:'text/html',body:html});
   if(p==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.OJJUDA_CONFIG={};'});
   if(adminPath(p)&&!allowAdmin)return route.fulfill({status:503,body:'must not load during startup'});
   if(p==='/admin/review-inbox.js'&&failReview){failReview=false;return route.fulfill({status:503,body:'temporary failure'});}
   const file=path.resolve(root,'.'+p);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://fixture.test/world.html');
  await page.locator('.bottomnav').waitFor();
  assert.deepEqual(requests.filter(adminPath),[],'ordinary entry downloads no admin tools or styles');
  assert.equal(await page.locator('script[src]:not([defer]):not([async])').count(),0,'external scripts do not block parsing');
  await page.locator('.bottomnav [data-tab=my]').click();
  assert.equal(await page.locator('.bottomnav [aria-current=page]').getAttribute('data-tab'),'my');
  assert.deepEqual(requests.filter(adminPath),[],'ordinary menu taps do not load admin tools');
  allowAdmin=true;
  assert.equal(await page.evaluate(async()=>{try{await OjjudaAdminAssets.load();return false}catch{return true}}),true,'failed tools report a retryable load');
  await page.evaluate(()=>OjjudaAdminAssets.load());
  assert.equal(await page.evaluate(()=>OjjudaAdminAssets.ready&&!!OjjudaReviewInbox?.mount&&!!OjjudaNoteAdmin?.mount),true,'all tools remain available on demand');
  await page.evaluate(()=>Promise.all([OjjudaAdminAssets.load(),OjjudaAdminAssets.load()]));
  assert.equal(requests.filter(p=>p==='/admin/review-inbox.js').length,2,'failed file alone retries');
  for(const p of new Set(requests.filter(adminPath)))if(p!=='/admin/review-inbox.js')assert.equal(requests.filter(x=>x===p).length,1,'successful assets do not reload: '+p);
  const login=await page.evaluate(async()=>{
   let shown=0,reads=0;startupTest.auth.user={id:'speed-test'};startupTest.auth.online=true;
   startupTest.setClient({from(){reads++;throw Error('redundant wallet request');}});
   startupTest.setShow(()=>shown++);
   await startupTest.finishLogin('speed-test',{owned:[]});
   return{shown,reads,ready:startupTest.auth.walletReady,legacy:startupTest.auth.walletLegacy};
  });
  assert.deepEqual(login,{shown:1,reads:0,ready:true,legacy:false},'login reuses its already loaded wallet capabilities');
  assert.deepEqual(errors,[]);
  console.log('PASS: real deferred startup, zero admin assets before use, menu response, lazy asset retry/deduplication, and no redundant wallet read');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
