const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture,A}=require('./matgo-online-fixture.cjs');
const root=path.join(__dirname,'..');
(async()=>{
 const f=await fixture({adaptive:true}),{db,call}=f;
 const browser=await chromium.launch({headless:true,executablePath:process.env.MATGO_CHROMIUM,args:['--no-sandbox']});
 try{
  await call(A,{action:'status'});
  await db.query('update ojjuda_matgo_internal.wallets set gold=400000 where user_id=$1',[A]);
  const context=await browser.newContext({viewport:{width:320,height:650},hasTouch:true});
  const errors=[],requests=[];
  await context.exposeBinding('stakeFixture',async(_,body)=>{requests.push(body);const data=await call(A,body);if(body.action==='start'&&data.round){await db.query('update ojjuda_matgo_internal.wallets set round_seed=10 where user_id=$1',[A]);data.round.seed=10;}return {data};});
  await context.addInitScript(()=>{
   localStorage.setItem('ojjuda-matgo-sound','off');
   window.OjjudaMatgoAccess={check:async()=>{},allowed:()=>true,subscribe:()=>()=>{},getClient:()=>({functions:{invoke:(_,{body})=>stakeFixture(body)}})};
   const timeout=setTimeout;window.setTimeout=(fn,delay,...args)=>timeout(fn,delay<5000?Math.min(delay,5):delay,...args);
   const animate=Element.prototype.animate;Element.prototype.animate=function(frames,options){return animate.call(this,frames,typeof options==='object'?{...options,duration:5,delay:0}:5);};
  });
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());
   if(url.origin!=='https://fixture.test'||['/config.js','/matgo-access.js'].includes(url.pathname))return route.fulfill({contentType:'text/javascript',body:''});
   const file=path.join(root,decodeURIComponent(url.pathname));
   if(!fs.existsSync(file))return route.fulfill({status:404,body:''});
   if(url.pathname==='/games/matgo.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(file,'utf8').replace('startRound();\n})();','window.stakesTest={startRound,game,ui};\nstartRound();\n})();')});
   return route.fulfill({path:file,contentType:/\.(mjs|js)$/.test(file)?'text/javascript':undefined});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/games/matgo.html');
  const ready=()=>page.waitForFunction(()=>window.stakesTest&&!stakesTest.ui.busy&&!stakesTest.ui.dealing&&document.querySelector('#stakeRate'));
  await ready();assert.equal(await page.locator('#matgo-stake').count(),0);
  assert.equal(await page.evaluate(()=>stakesTest.game.rate),2000);
  assert.equal(await page.locator('#stakeRate').innerText(),'점당 2,000G');
  assert.equal(await page.locator('#cpuLevel').innerText(),'5단계','400,000G sets a minimum of level 5');
  assert.equal(requests.some(r=>r.action==='stake'),false,'there is no consent request');
  assert.equal(requests.find(r=>r.action==='start').rules_version,11);
  const fits=await page.locator('.cpu-opponent').evaluate(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height<55;});
  assert.equal(fits,true,'compact level display fits a 320px mobile screen');
  await page.reload();await ready();assert.equal(await page.evaluate(()=>stakesTest.game.rate),2000);
  const end=async(gold,outcome='win')=>{const s=await call(A,{action:'status'});await db.query('select public.matgo_ranked_settle($1,$2,$3,0::smallint,1,$4)',[A,s.round.id,gold,outcome]);};
  // Reach a five-win promotion: UI changes only on the following deal.
  for(let i=0;i<5;i++){
    assert.equal(await page.locator('#cpuLevel').innerText(),'5단계');
    await end(400000);await page.reload();await ready();
  }
  assert.equal(await page.locator('#cpuLevel').innerText(),'6단계');
  for(let i=0;i<3;i++){await end(400000,'loss');await page.reload();await ready();}
  assert.equal(await page.locator('#cpuLevel').innerText(),'5단계');
  for(let i=0;i<3;i++){await end(400000,'loss');await page.reload();await ready();}
  assert.equal(await page.locator('#cpuLevel').innerText(),'5단계','three more losses cannot break the gold floor');
  await end(125000);await page.reload();await ready();assert.equal(await page.evaluate(()=>stakesTest.game.rate),2000);
  await end(0,'loss');await page.reload();await page.locator('#refill-gold').waitFor();
  assert.equal(await page.locator('#stakeRate').innerText(),'점당 100G');
  await page.locator('#refill-gold').tap();await ready();assert.equal(await page.evaluate(()=>stakesTest.game.rate),100);
  await end(600000);await page.reload();await ready();assert.equal(await page.evaluate(()=>stakesTest.game.rate),4000);
  assert.equal(await page.locator('#matgo-stake').count(),0);
  if(process.env.MATGO_STAKE_SCREENSHOT)await page.screenshot({path:process.env.MATGO_STAKE_SCREENSHOT});
  await page.locator('#menu').click();await page.locator('#rules').click();
  const help=await page.locator('.modal').innerText();
  assert.match(help,/두 사람의 자동 판돈 중 낮은 금액/);assert.match(help,/5연승/);assert.match(help,/3연패/);assert.match(help,/10만G부터 2단계/);assert.match(help,/10만G부터 점당 200G/);assert.match(help,/30만G부터 1,000G/);
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: mobile automatic stakes without consent, compact level display, gold floor, five-win promotion, floor-limited three-loss demotion, refresh persistence, bankruptcy/refill and rules');
 }finally{await browser.close();await f.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
