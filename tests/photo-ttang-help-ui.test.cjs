const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=`<meta charset="utf-8"><style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><script>
 window.fixtureUid='11111111-1111-4111-8111-111111111111';window.fixtureCoins=30;window.fixtureCalls=[];window.fixtureLost=false;window.rankCalls=[];window.savedEvents=0;addEventListener('ojjuda:game-record-saved',()=>savedEvents++);const receipts={};
 window.OjjudaPhotoTtangAccess={allowed:()=>true,subscribe:()=>()=>{},check:async()=>({userId:fixtureUid})};
 window.OjjudaPhotoTtangBridge={client:{from(){},auth:{getUser:async()=>({data:{user:{id:fixtureUid}}})},rpc(name,args){const promise=(async()=>{
 if(name==='photo_is_admin')return {data:false};if(name==='photo_game_clear'){rankCalls.push(args);if(window.rankFail){rankFail=false;return {error:{message:'offline'}}}if(window.rankDelay)await new Promise(r=>window.finishRank=r);return {data:{ok:true,score:1}};}if(name!=='photo_help_buy')throw Error(name);
 fixtureCalls.push(args);await new Promise(r=>setTimeout(r,window.fixtureDelay||80));let r=receipts[args.p_request_id];if(!r){const price=args.p_kind==='time'?5:3;fixtureCoins-=price;r=receipts[args.p_request_id]={ok:true,price,coins:fixtureCoins,duration_seconds:args.p_kind==='time'?30:args.p_kind==='slow'?5:0};}
 if(fixtureLost){fixtureLost=false;return {error:{message:'response lost'}}}return {data:{...r,coins:fixtureCoins}};
 })();return {then:promise.then.bind(promise),abortSignal:()=>promise};}}};
 </script><script src="/photo-ttang-ranking.js"></script><button id="rank-status"></button><iframe src="/games/photo-ttang.html"></iframe><script>window.rankDispose=OjjudaPhotoRanking.bind({frame:document.querySelector("iframe"),client:OjjudaPhotoTtangBridge.client,owner:fixtureUid,authorized:()=>fixtureUid==="11111111-1111-4111-8111-111111111111",status:document.querySelector("#rank-status")});</script>`;
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='photo.test')return route.fulfill({body:''});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});const f=path.join(root,url.pathname);return fs.existsSync(f)?route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':f.endsWith('.css')?'text/css':'text/html'}):route.fulfill({status:404,body:''});});
 await page.goto('https://photo.test/');const frame=page.frames().find(f=>f.url().includes('/games/'));
 frame.on('pageerror',e=>errors.push(e.message));await frame.waitForFunction(()=>!!window.OjjudaPhotoHelp);await frame.locator('#grid .cell').first().click();
 await frame.evaluate(()=>{sound=false;window.confirm=()=>true;paused=true;startWait=0;world.time=10;endAt=100;lives=0;me.alive=false;over=true;});
 const before=await frame.evaluate(()=>({owned:Array.from(world.own),count:world.counts[me.id]}));
 await frame.getByRole('button',{name:'ZU로 도움받기',exact:true}).click();await frame.locator('[data-photo-help=heart]').evaluate(b=>{b.click();b.click()});
 assert.equal(await frame.evaluate(()=>OjjudaPhotoTtang.canLeave()),false);await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&lives===1);
 assert.equal(await page.evaluate(()=>fixtureCoins),27);assert.equal(await page.evaluate(()=>fixtureCalls.length),1);
 const after=await frame.evaluate(()=>{paused=true;return {owned:Array.from(world.own),alive:me.alive,lives,over}});assert.deepEqual(after.owned,before.owned);assert.equal(after.alive,true);assert.equal(after.over,false);
 // A timeout can be extended without throwing away territory.
 await frame.evaluate(()=>{endAt=world.time;over=true;paused=true;OjjudaPhotoHelp.open()});
 const timeBefore=await frame.evaluate(()=>world.time);await frame.locator('[data-photo-help=time]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!over);await frame.evaluate(()=>paused=true);assert.equal(await frame.evaluate(()=>endAt),timeBefore+30);assert.equal(await page.evaluate(()=>fixtureCoins),22);
 // Lost response retains the request, then applies the paid effect exactly once.
 await page.evaluate(()=>fixtureLost=true);await frame.getByRole('button',{name:'ZU로 도움받기',exact:true}).click();await frame.locator('[data-photo-help=slow]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&document.querySelector('.photo-help [role=status]').textContent.includes('결과를 확인하지'));
 assert.equal(await page.evaluate(()=>fixtureCoins),19);await frame.locator('[data-photo-help=slow]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!paused);await frame.evaluate(()=>paused=true);assert.equal(await page.evaluate(()=>fixtureCoins),19);
 const calls=await page.evaluate(()=>fixtureCalls);assert.equal(calls[2].p_request_id,calls[3].p_request_id);
 const slow=await frame.evaluate(()=>{
  const begin=world.time;world.events=[];world.itemsOn=false;mobs=[{type:'bounce',x:20,y:20,v:4,vx:4,vy:0,r:.75,ph:0,alive:true,born:-1}];
  for(let y=18*world.G;y<23*world.G;y++)for(let x=18*world.G;x<24*world.G;x++)world.setOwn(y*world.GW+x,0);
  me.x=2;me.y=2;me.shieldT=100;me.trail=[];updateMobs(.1);const during=mobs[0].x-20;
  world.time=begin+5.1;mobs[0].x=20;updateMobs(.1);return {during,after:mobs[0].x-20};
 });assert.ok(Math.abs(slow.during-.2)<.001);assert.ok(Math.abs(slow.after-.4)<.001);
 // The same final-ten-seconds window as the alarm exposes a direct extension.
 await frame.evaluate(()=>{closePanels();paused=true;endAt=world.time+11;hud()});
 const quickTime=frame.getByRole('button',{name:'시간 30초 연장 · 5 ZU',exact:true});
 assert.equal(await quickTime.isVisible(),false,'no warning action before the alarm window');
 await frame.evaluate(()=>{endAt=world.time+9;paused=false;hud()});
 await quickTime.waitFor();await page.evaluate(()=>window.fixtureDelay=400);
 const debitBefore=await page.evaluate(()=>fixtureCalls.length);
 await quickTime.evaluate(b=>{b.click();b.click()});
 await frame.waitForFunction(()=>OjjudaPhotoHelp.isBusy());
 const frozen=await frame.evaluate(()=>({time:world.time,end:endAt}));
 await page.waitForTimeout(180);assert.equal(await frame.evaluate(()=>world.time),frozen.time,'time stops before purchase network waits');
 await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!paused);
 await frame.evaluate(()=>{paused=true;hud()});
 assert.equal(await frame.evaluate(()=>endAt),frozen.end+30,'extension adds to the unexpired remaining time');
 assert.equal(await page.evaluate(()=>fixtureCalls.length),debitBefore+1,'repeated shortcut taps only purchase once');
 assert.equal(await page.evaluate(()=>fixtureCoins),14);assert.equal(await quickTime.isVisible(),false,'warning clears after extension');
 // Cancelling never debits; the paused panel offers Continue.
 await frame.evaluate(()=>{endAt=world.time+7;paused=false;window.confirm=()=>false;hud()});
 await quickTime.click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy());
 assert.equal(await page.evaluate(()=>fixtureCalls.length),debitBefore+1);assert.equal(await frame.evaluate(()=>paused),true);
 await frame.getByRole('button',{name:'계속하기',exact:true}).click();
 await frame.evaluate(()=>{paused=true;endAt=world.time+80;window.confirm=()=>true;hud()});
 const quickSlow=frame.getByRole('button',{name:'적 감속 5초 · 3 ZU',exact:true});
 assert.equal(await quickSlow.isEnabled(),true);await quickSlow.click();
 await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!paused);await frame.evaluate(()=>{paused=true;hud()});
 assert.equal(await frame.getByRole('button',{name:/적 감속 중/}).isEnabled(),false,'active effect cannot be bought twice');
 assert.equal(await page.evaluate(()=>fixtureCoins),11);
 await frame.evaluate(()=>{world.time+=5.1;hud()});assert.equal(await quickSlow.isEnabled(),true,'can use again after five gameplay seconds');
 for(const width of [320,390,1280]){
  await page.setViewportSize({width,height:844});await frame.evaluate(()=>{paused=false;endAt=world.time+9;hud()});
  assert.equal(await frame.locator('#btns').evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth}),true,'quick actions fit '+width);
  assert.equal(await quickTime.evaluate(n=>{const r=n.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.height>=40}),true,'warning action fits '+width);
  if(width===390&&process.env.PHOTO_HELP_TIMING_SCREENSHOT){await page.waitForTimeout(1100);await frame.locator('body').screenshot({path:process.env.PHOTO_HELP_TIMING_SCREENSHOT});}
 }
 await frame.evaluate(()=>{paused=true;endAt=world.time+80;hud()});
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await frame.evaluate(()=>{paused=true;OjjudaPhotoHelp.open()});assert.equal(await frame.locator('.photo-help').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await frame.locator('.overlay:not(#menu) .panel').evaluate(n=>n.getBoundingClientRect().width<=innerWidth),true);}
 // A real win after paid heart/time/slow help still saves a ranking record.
 await page.evaluate(()=>window.rankFail=true);await frame.evaluate(()=>win());
 await page.getByRole('button',{name:'기록 저장 다시 시도',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>rankCalls.length),1);
 await page.getByRole('button',{name:'기록 저장 다시 시도',exact:true}).click();
 await page.waitForFunction(()=>savedEvents===1);assert.deepEqual(await page.evaluate(()=>rankCalls),[{p_stage:'0'},{p_stage:'0'}]);
 // Only the active game frame can submit valid stage keys; previews are excluded.
 await page.evaluate(()=>{dispatchEvent(new MessageEvent('message',{origin:location.origin,source:window,data:{type:'ojjuda:photottang:clear',stage:'1'}}));});
 await frame.evaluate(()=>parent.postMessage({type:'ojjuda:photottang:clear',stage:'try123'},location.origin));
 await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>rankCalls.length),2);
 await page.evaluate(()=>window.rankDelay=true);
 await frame.evaluate(()=>{parent.postMessage({type:'ojjuda:photottang:clear',stage:'1'},location.origin);parent.postMessage({type:'ojjuda:photottang:clear',stage:'1'},location.origin);});
 await page.waitForFunction(()=>typeof finishRank==='function');assert.equal(await page.evaluate(()=>rankCalls.length),3,'duplicate in-flight clear is coalesced');
 await page.evaluate(()=>{rankDispose();document.querySelector('iframe').remove();finishRank()});
 await page.waitForFunction(()=>savedEvents===2);
 assert.deepEqual(errors,[]);console.log('PASS: ten-second warning shortcut, purchase-time pause, cancellation, repeat-tap guard, direct slow cooldown; real-engine heart continuation preserves territory; 30-second extension; five-second half-speed mobs; duplicate clicks; paid response recovery; 320/390/1280 layouts');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
