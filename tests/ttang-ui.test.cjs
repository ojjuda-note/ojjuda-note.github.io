const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
async function smallTouchTurn(context,page,game){
  const input=await context.newCDPSession(page),box=await game.locator('#cv').boundingBox();
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height*.65);
  const wasPaused=await game.evaluate(()=>{const before=paused;paused=true;me.target=0;return before;});
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-2}]});
  assert.equal(await game.evaluate(()=>me.target),0,'tiny finger jitter must not change direction');
  await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-6}]});
  assert.ok(Math.abs(await game.evaluate(()=>me.target)+Math.PI/2)<.001,'a small upward drag must turn immediately');
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await game.evaluate(()=>joys.size),0,'releasing the finger must release the joystick');
  await game.evaluate(before=>{paused=before;},wasPaused);await input.detach();
}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});try{
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),errors=[];
await context.addInitScript(()=>Object.defineProperty(crypto,'randomUUID',{value:undefined}));
await context.route('http://127.0.0.1:8875/**',r=>{const name=new URL(r.request().url()).pathname;const file=path.join(__dirname,'..',name);return fs.existsSync(file)?r.fulfill({contentType:name.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)}):r.fulfill({status:404,body:'Not found'});});
await context.route('https://fonts.googleapis.com/**',r=>r.fulfill({body:''}));
await context.route('http://127.0.0.1:8875/fixture',r=>r.fulfill({contentType:'text/html',body:'<meta charset="utf-8"><button id="open">땅따먹기</button><script src="/ttang-bridge.js"></script><script>window.allowed=true;window.scores=[];document.querySelector("button").onclick=()=>OjjudaTtangBridge.open({owner:"member-a",authorized:()=>allowed,onScore:async score=>{scores.push(score);return {ok:true}}});</script>'}));
const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE',e.message)});await page.goto('http://127.0.0.1:8875/fixture');await page.click('#open');
const frame=await (await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForSelector('#soloBtn');
if(process.env.TTANG_PROOF_FONT){const css='@font-face{font-family:QuotedProof;src:url(data:font/ttf;base64,'+fs.readFileSync(process.env.TTANG_PROOF_FONT).toString('base64')+')}body,button{font-family:QuotedProof,sans-serif!important}';await page.addStyleTag({content:css});await frame.addStyleTag({content:css.replaceAll('QuotedProof','Gowun Dodum')});await frame.evaluate(()=>document.fonts.ready);await page.evaluate(()=>document.fonts.ready);}
for(const [width,height] of [[320,568],[390,844],[844,390]]){await page.setViewportSize({width,height});assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await frame.locator('#soloBtn').isVisible(),true);await frame.locator('summary').click();assert.equal(await frame.locator('.how').isVisible(),true);await frame.locator('summary').click();}
await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/ttang-menu.png'});
await frame.locator('#soloBtn').tap();await frame.waitForSelector('#hud',{state:'visible'});await frame.waitForFunction(()=>world.time>.1&&me.alive);
const firstRound=await frame.evaluate(()=>roundId);assert.ok(firstRound.length>0&&firstRound.length<=64,'compatible round ID accepted by the World bridge');
await smallTouchTurn(context,page,frame);await page.screenshot({path:'/tmp/ttang-play.png'});
await frame.click('#pause');assert.equal(await frame.getByText('잠깐 쉬는 중').isVisible(),true);await frame.click('#go');
await frame.evaluate(()=>{world.kill(me,0,'end');});await page.waitForFunction(()=>scores.length===1);assert.equal(await page.locator('#ttang-save-status').innerText(),(await page.evaluate(()=>scores[0]))+'점 · 기록했어요!');
await frame.evaluate(()=>sendResult({mode:'solo',score:123}));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scores.length),1,'duplicate round ignored');
await frame.click('#again');await frame.waitForSelector('#hud',{state:'visible'});assert.notEqual(await frame.evaluate(()=>roundId),firstRound,'restarting creates a fresh round without the UUID API');await frame.evaluate(()=>parent.postMessage({type:'ojjuda:ttang:result',mode:'solo',round:roundId,score:1001},location.origin));await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>scores.length),1,'invalid score rejected');
await page.evaluate(()=>window.allowed=false);await page.waitForSelector('#ttang-overlay',{state:'detached'});assert.equal(await page.evaluate(()=>document.body.classList.contains('gaming')),false);
await page.evaluate(()=>window.allowed=true);await page.click('#open');await page.getByRole('button',{name:'땅따먹기 닫기'}).click();assert.equal(await page.locator('iframe').count(),0);
// Two isolated game frames exercise the bundled transport and synchronization.
const host=await context.newPage(),guest=await context.newPage();for(const p of [host,guest]){p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:8875/games/ttang.html');await p.click('#duoBtn');assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
await host.click('#mk');await host.waitForFunction(()=>Net.tr?.kind==='local');const code=await host.locator('.overlay:not(#menu) h2 span').innerText();await guest.fill('#code',code);await guest.click('#jn');await host.waitForFunction(()=>mode==='net'&&role==='host');await guest.waitForFunction(()=>mode==='net'&&role==='guest');await guest.waitForTimeout(400);assert.equal(await guest.evaluate(()=>world.players.length),await host.evaluate(()=>world.players.length));
await smallTouchTurn(context,guest,guest);await host.waitForFunction(()=>Math.abs(p2.target+Math.PI/2)<.002);
// A body-edge cut decided by the host must also eliminate the guest player.
await host.evaluate(()=>{
  paused=true;world.time=1;world.events=[];
  world.own.fill(0);world.counts.fill(0);world.counts[0]=world.N;world.trail.fill(0);
  for(const p of world.players){p.alive=false;p.trail=[];p.pts=[];p.tc=new Map();p.shieldT=0;p.kills=0;p.bb=[1e9,1e9,-1,-1];}
  Object.assign(me,{alive:true,x:25,y:25});Object.assign(p2,{alive:true,x:6,y:10});
  for(let i=1;i<=160;i++){const x=p2.x;p2.x=6+i*.05;world.visit(p2,x,10);}
  me.x=10;me.y=10.5;world.visit(me,10,10.5);
  captureNetEvents();world.events=[];Net.send(snapshot());
});
await guest.waitForFunction(()=>world.players[0].kills===1&&!world.players[1].alive);
assert.equal(await host.evaluate(()=>me.kills===1&&!p2.alive),true);
// Closing a territory loop must eliminate an enclosed guest on both screens.
const capture=await host.evaluate(()=>{
  world.events=[];world.time=10;
  world.own.fill(0);world.counts.fill(0);world.counts[0]=world.N;world.trail.fill(0);
  for(const p of world.players){p.alive=false;p.trail=[];p.pts=[];p.tc=new Map();p.shieldT=0;p.kills=0;p.respawnAt=0;p.bb=[1e9,1e9,-1,-1];}
  Object.assign(me,{alive:true,x:3,y:3});Object.assign(p2,{alive:true,x:12,y:12});
  for(let y=20;y<80;y++)for(let x=20;x<60;x++)world.setOwn(y*world.GW+x,me.id);
  world.setOwn(world.si(25,25),p2.id);
  for(const [x,y] of [[18,3],[18,18],[3,18],[3,7]]){
    const dx=x-me.x,dy=y-me.y,n=Math.ceil(Math.hypot(dx,dy)/.05);
    for(let i=0;i<n;i++){const px=me.x,py=me.y;me.x+=dx/n;me.y+=dy/n;world.visit(me,px,py);}
  }
  const death=world.events.find(e=>e.t==='death'&&e.p===p2);
  captureNetEvents();world.events=[];Net.send(snapshot());
  return {alive:p2.alive,why:death?.why,kills:me.kills};
});
assert.deepEqual(capture,{alive:false,why:'capture',kills:1});
await guest.waitForFunction(()=>world.players[0].kills===1&&!world.players[1].alive&&world.own[world.si(12,12)]===world.players[0].id);
await host.evaluate(()=>OjjudaTtang.menu());await guest.getByText('친구가 나갔어요').waitFor();assert.deepEqual(errors,[]);
console.log('PASS: mobile/landscape layout, practice without UUID API, small touch drags in practice and multiplayer, pause/resume, result save, duplicate and invalid results, account change cleanup, close');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
