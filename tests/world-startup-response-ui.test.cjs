const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
let html=fs.readFileSync(path.join(root,'world.html'),'utf8');
const boot='j1(()=>H());gm(';
assert(html.includes(boot));
html=html.replace(boot,`window.startupTest={auth:D,state:g,actions:sr,openGame:Al,closeGame:El,setClient:c=>{S=c},finishLogin:rm,setShow:fn=>{em=fn}};${boot}`);
const adminPath=p=>p.startsWith('/admin/')||p==='/note/admin.js'||p==='/note/admin.css';
const gamePath=p=>['/world-spot-game.js','/world-spot-game.css','/ttang-bridge.js','/photo-ttang-access.js','/photo-ttang-ranking.js','/photo-ttang-bridge.js','/games/mole-game.js','/games/mole-game.css','/games/runner-game.js','/games/runner-game.css','/games/breakout-game.js','/game-controls.js','/game-controls.css','/screw-loader.js','/screw-games.css'].includes(p);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
  let allowAdmin=false,failReview=true,releaseRunner,runnerHeld=false,failPhoto=true;
  const runnerGate=new Promise(resolve=>{releaseRunner=resolve;});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=new URL(route.request().url()),p=url.pathname;
   if(url.hostname!=='fixture.test')return route.abort();
   requests.push(p);
   if(p==='/world.html')return route.fulfill({contentType:'text/html',body:html});
   if(p==='/config.js')return route.fulfill({contentType:'text/javascript',body:'window.OJJUDA_CONFIG={};'});
   if(adminPath(p)&&!allowAdmin)return route.fulfill({status:503,body:'must not load during startup'});
   if(p==='/admin/review-inbox.js'&&failReview){failReview=false;return route.fulfill({status:503,body:'temporary failure'});}
   if(p==='/games/runner-game.js'){runnerHeld=true;await runnerGate;}
   if(p==='/photo-ttang-ranking.js'&&failPhoto){failPhoto=false;return route.fulfill({status:503,body:'temporary failure'});}
   const file=path.resolve(root,'.'+p);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://fixture.test/world.html');
  await page.locator('.bottomnav').waitFor();
  assert.deepEqual(requests.filter(adminPath),[],'ordinary entry downloads no admin tools or styles');
  assert.deepEqual(requests.filter(gamePath),[],'ordinary entry downloads none of the fifteen game assets');
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
  await page.evaluate(()=>{startupTest.openGame('mole');startupTest.openGame('mole');});
  await page.locator('[data-g=start]').waitFor();
  assert.equal(await page.evaluate(()=>!!OjjudaMoleGame?.create),true,'the selected modern engine is ready before opening');
  assert.equal(requests.filter(p=>p==='/games/mole-game.js').length,1,'rapid taps share the selected game download');
  assert.equal(requests.filter(p=>p==='/games/runner-game.js').length,0,'opening mole does not load runner');
  await page.evaluate(()=>{startupTest.closeGame();startupTest.openGame('runner');});
  while(!runnerHeld)await new Promise(resolve=>setTimeout(resolve,5));
  await page.locator('.bottomnav [data-tab=friends]').click();
  releaseRunner();await page.waitForFunction(()=>OjjudaGameAssets.ready('runner'));
  assert.equal(await page.locator('.gbox').count(),0,'a completed download does not reopen a game after navigation');
  await page.evaluate(()=>startupTest.openGame('runner'));await page.locator('[data-g=start]').waitFor();
  await page.evaluate(()=>startupTest.closeGame());
  assert.equal(await page.evaluate(()=>OjjudaGameAssets.load('photo_ttang').then(()=>false,()=>true)),true,'a failed game asset remains retryable');
  await page.evaluate(()=>OjjudaGameAssets.load('photo_ttang'));
  assert.equal(await page.evaluate(()=>OjjudaGameAssets.ready('photo_ttang')&&!!OjjudaPhotoTtangBridge?.open),true);
  assert.equal(requests.filter(p=>p==='/photo-ttang-ranking.js').length,2);
  assert.equal(requests.filter(p=>p==='/photo-ttang-bridge.js').length,1,'successful dependencies do not load again on retry');
  const login=await page.evaluate(async()=>{
   let shown=0,reads=0;startupTest.auth.user={id:'speed-test'};startupTest.auth.online=true;
   startupTest.setClient({from(){reads++;throw Error('redundant wallet request');}});
   startupTest.setShow(()=>shown++);
   await startupTest.finishLogin('speed-test',{owned:[]});
   return{shown,reads,ready:startupTest.auth.walletReady,legacy:startupTest.auth.walletLegacy};
  });
  assert.deepEqual(login,{shown:1,reads:0,ready:true,legacy:false},'login reuses its already loaded wallet capabilities');
  assert.deepEqual(errors,[]);
  console.log('PASS: zero admin/game assets before use, game engines loaded on demand, cancellation after navigation, lazy asset retry/deduplication, and no redundant wallet read');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
