const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const fixture=`<meta charset="utf-8"><script src="/ttang-bridge.js"></script><script>
window.scores=[];window.openGame=options=>OjjudaTtangBridge.open({owner:'member',authorized:()=>true,onResult:async(won,round)=>{scores.push({won,round});return {ok:true};},...options});
</script>`;
function state(){
 const hash=a=>{let n=2166136261;for(const value of a)n=Math.imul(n^value,16777619);return n>>>0;};
 return {round:roundId,time:world.time,end:endAt,own:hash(world.own),counts:[...world.counts],items:world.items,itemSeq:world.itemSeq,nextItem:world.nextItem,
  players:world.players.map(p=>({id:p.id,x:p.x,y:p.y,ang:p.ang,target:p.target,alive:p.alive,kills:p.kills,best:p.best,born:p.born,boostT:p.boostT,shieldT:p.shieldT,respawnAt:p.respawnAt,trail:[...p.trail],pts:p.pts,tc:[...p.tc]}))};
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 const errors=[];
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://takeover.test')return route.fulfill({body:''});
   if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});
   const file=path.join(root,url.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file,contentType:/\.(js|mjs)$/.test(file)?'text/javascript':undefined}):route.fulfill({status:404,body:''});
  });
  const game=async page=>{const frame=await(await page.locator('iframe').elementHandle()).contentFrame();await frame.waitForFunction(()=>!!window.OjjudaTtang);return frame;};
  async function pair(code){
   const host=await context.newPage(),guest=await context.newPage();for(const page of [host,guest])page.on('pageerror',error=>{errors.push(error.message);console.error('Territory browser error:',error.stack||error.message);});
   await host.goto('https://takeover.test/');await guest.goto('https://takeover.test/');
   await host.evaluate(code=>openGame({hostCode:code}),code);const h=await game(host);await h.waitForFunction(()=>Net.kind==='local');
   await guest.evaluate(code=>openGame({joinCode:code}),code);const g=await game(guest);
   await h.waitForFunction(()=>mode==='net'&&role==='host');await g.waitForFunction(()=>mode==='net'&&role==='guest'&&!!Net.backup);
   assert.equal(await h.evaluate(()=>roundId),await g.evaluate(()=>roundId));return {host,guest,h,g};
  }
  async function finish(page,frame,round){
   assert.deepEqual(errors,[],'the inherited world must still have a live animation loop');
   await frame.evaluate(()=>{paused=false;world.time=endAt-.01;});
   try{await frame.waitForFunction(()=>over);}catch(error){console.error('Territory completion state:',await frame.evaluate(()=>({mode,role,over,paused,time:world?.time,endAt,last,now:performance.now(),bot:p2?.bot})));throw error;}
   await page.waitForFunction(()=>scores.length===1);assert.equal((await page.evaluate(()=>scores))[0].round,round);
   await page.evaluate(()=>OjjudaTtangBridge.close());assert.equal((await page.evaluate(()=>scores)).length,1,'final outcome is recorded once');
  }
  {
   const {host,guest,h,g}=await pair('a'.repeat(24));
   await h.evaluate(()=>{paused=true;world.time=17;endAt=120;me.boostT=3.2;p2.shieldT=2.7;world.sameWorld='host';});
   const before=await h.evaluate(state);await guest.evaluate(()=>OjjudaTtangBridge.close());
   await h.waitForFunction(()=>p2.bot);assert.deepEqual(await h.evaluate(state),before,'all board, trail, position, item and timer state stays intact');
   assert.equal(await h.evaluate(()=>world.sameWorld),'host');assert.equal(await h.evaluate(()=>mode),'net');assert.equal(await h.evaluate(()=>over),false);
   assert.equal(await h.locator('#duoB').textContent().then(text=>text.startsWith('컴퓨터 ')),true);
   assert.deepEqual(await guest.evaluate(()=>scores),[],'the departed multiplayer user receives no loss/streak record');
   await guest.evaluate(()=>openGame());const fresh=await game(guest);assert.equal(await fresh.evaluate(()=>mode),'attract');assert.equal(await fresh.evaluate(()=>roundId),null);
   await h.evaluate(()=>{paused=false;});await h.waitForFunction(()=>world.time>17.1);
   assert.equal(await h.evaluate(()=>Number.isFinite(p2.x)&&Number.isFinite(p2.y)&&Number.isFinite(p2.target)),true,'the inherited player has valid AI steering');
   await finish(host,h,before.round);await host.close();await guest.close();
  }
  {
   const {host,guest,h,g}=await pair('b'.repeat(24));
   await g.evaluate(()=>{paused=true;world.sameWorld='guest';});
   await h.evaluate(()=>{
    paused=true;world.time=23.125;endAt=121;me.boostT=3.25;me.shieldT=1.75;p2.kills=3;p2.best=12.5;
    me.trail=[];me.pts=[];me.tc=new Map();
    const k=[world.si(22,22),world.si(22.1,22)];for(const index of k){world.trail[index]=me.id;world.trailT[index]=22.25;me.trail.push(index);}
    me.pts=[{x:22,y:22,t:22.25},{x:22.1,y:22,t:22.5}];me.tc.set(22*world.U+22,22.25);
    world.items=[{id:19,type:'shield',x:20,y:21,born:17.5}];world.itemSeq=19;world.nextItem=24.5;
   });
   await h.evaluate(()=>{Net.sequence++;Net.send(snapshot());});
   await g.waitForFunction(()=>world.netTime===23.125&&Net.backup?.itemSeq===19);
   const before=await h.evaluate(state);await host.evaluate(()=>OjjudaTtangBridge.close());
   await g.waitForFunction(()=>role==='host'&&p2.bot);assert.deepEqual(await g.evaluate(state),before);
   assert.equal(await g.evaluate(()=>world.sameWorld),'guest');assert.equal(await g.evaluate(()=>me.id),2,'the remaining guest retains its own seat');
   assert.equal(await g.evaluate(()=>p2.id),1);assert.equal(await g.evaluate(()=>world.trail[p2.trail[0]]),1);
   assert.deepEqual(await host.evaluate(()=>scores),[]);
   await finish(guest,g,before.round);await host.close();await guest.close();
  }
  {
   const {host,guest,h,g}=await pair('c'.repeat(24));
   await h.evaluate(()=>{paused=true;world.time=31;endAt=120;});const round=await h.evaluate(()=>roundId);
   await g.evaluate(()=>{Net.tr.close();Net.tr=null;paused=true;});
   await h.evaluate(()=>{Net.lastRx=performance.now()-11000;paused=false;});await h.waitForFunction(()=>p2.bot);
   assert.equal(await h.evaluate(()=>roundId),round);assert.equal(await h.evaluate(()=>over),false);assert.ok(await h.evaluate(()=>world.time<40));
   await g.evaluate(()=>{paused=false;last=performance.now()-11001;});await g.waitForFunction(()=>mode==='attract');
   await g.evaluate(round=>parent.postMessage({type:'ojjuda:ttang:result',round,mode:'duo',win:true},location.origin),round);
   await guest.waitForTimeout(30);assert.deepEqual(await guest.evaluate(()=>scores),[],'a permanently excluded seat cannot send a later result');
   await finish(host,h,round);await host.close();await guest.close();
  }
  assert.deepEqual(errors,[]);console.log('PASS: guest exit and host exit preserve the exact game state, original seat, collision trails and clocks; AI completes the same game; only remaining humans record results; timeout and suspended-tab re-entry exclude stale results.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
