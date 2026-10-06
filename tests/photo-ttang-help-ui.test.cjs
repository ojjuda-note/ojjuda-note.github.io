const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const fixture=`<style>html,body{margin:0;height:100%}iframe{width:100%;height:100%;border:0}</style><script>
 window.fixtureUid='11111111-1111-4111-8111-111111111111';window.fixtureCoins=30;window.fixtureCalls=[];window.fixtureLost=false;const receipts={};
 window.OjjudaPhotoTtangAccess={allowed:()=>true,subscribe:()=>()=>{},check:async()=>({userId:fixtureUid})};
 window.OjjudaPhotoTtangBridge={client:{from(){},auth:{getUser:async()=>({data:{user:{id:fixtureUid}}})},rpc(name,args){const promise=(async()=>{
 if(name==='photo_is_admin')return {data:false};if(name!=='photo_help_buy')throw Error(name);
 fixtureCalls.push(args);await new Promise(r=>setTimeout(r,80));let r=receipts[args.p_request_id];if(!r){const price=args.p_kind==='time'?5:3;fixtureCoins-=price;r=receipts[args.p_request_id]={ok:true,price,coins:fixtureCoins,duration_seconds:args.p_kind==='time'?30:args.p_kind==='slow'?5:0};}
 if(fixtureLost){fixtureLost=false;return {error:{message:'response lost'}}}return {data:{...r,coins:fixtureCoins}};
 })();return {then:promise.then.bind(promise),abortSignal:()=>promise};}}};
 </script><iframe src="/games/photo-ttang.html"></iframe>`;
 await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='photo.test')return route.fulfill({body:''});if(url.pathname==='/')return route.fulfill({contentType:'text/html',body:fixture});const f=path.join(root,url.pathname);return fs.existsSync(f)?route.fulfill({body:fs.readFileSync(f),contentType:f.endsWith('.js')?'application/javascript':'text/html'}):route.fulfill({status:404,body:''});});
 await page.goto('https://photo.test/');const frame=page.frames().find(f=>f.url().includes('/games/'));
 frame.on('pageerror',e=>errors.push(e.message));await frame.waitForFunction(()=>!!window.OjjudaPhotoHelp);await frame.locator('#grid .cell').first().click();
 await frame.evaluate(()=>{sound=false;window.confirm=()=>true;paused=true;startWait=0;world.time=10;endAt=100;lives=0;me.alive=false;over=true;});
 const before=await frame.evaluate(()=>({owned:Array.from(world.own),count:world.counts[me.id]}));
 await frame.getByRole('button',{name:'쭈로 도움받기',exact:true}).click();await frame.locator('[data-photo-help=heart]').evaluate(b=>{b.click();b.click()});
 assert.equal(await frame.evaluate(()=>OjjudaPhotoTtang.canLeave()),false);await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&lives===1);
 assert.equal(await page.evaluate(()=>fixtureCoins),27);assert.equal(await page.evaluate(()=>fixtureCalls.length),1);
 const after=await frame.evaluate(()=>{paused=true;return {owned:Array.from(world.own),alive:me.alive,lives,over}});assert.deepEqual(after.owned,before.owned);assert.equal(after.alive,true);assert.equal(after.over,false);
 // A timeout can be extended without throwing away territory.
 await frame.evaluate(()=>{endAt=world.time;over=true;paused=true;OjjudaPhotoHelp.open()});
 const timeBefore=await frame.evaluate(()=>world.time);await frame.locator('[data-photo-help=time]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!over);await frame.evaluate(()=>paused=true);assert.equal(await frame.evaluate(()=>endAt),timeBefore+30);assert.equal(await page.evaluate(()=>fixtureCoins),22);
 // Lost response retains the request, then applies the paid effect exactly once.
 await page.evaluate(()=>fixtureLost=true);await frame.getByRole('button',{name:'쭈로 도움받기',exact:true}).click();await frame.locator('[data-photo-help=slow]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&document.querySelector('.photo-help [role=status]').textContent.includes('결과를 확인하지'));
 assert.equal(await page.evaluate(()=>fixtureCoins),19);await frame.locator('[data-photo-help=slow]').click();await frame.waitForFunction(()=>!OjjudaPhotoHelp.isBusy()&&!paused);await frame.evaluate(()=>paused=true);assert.equal(await page.evaluate(()=>fixtureCoins),19);
 const calls=await page.evaluate(()=>fixtureCalls);assert.equal(calls[2].p_request_id,calls[3].p_request_id);
 const slow=await frame.evaluate(()=>{
  const begin=world.time;world.events=[];world.itemsOn=false;mobs=[{type:'bounce',x:20,y:20,v:4,vx:4,vy:0,r:.75,ph:0,alive:true,born:-1}];
  for(let y=18*world.G;y<23*world.G;y++)for(let x=18*world.G;x<24*world.G;x++)world.setOwn(y*world.GW+x,0);
  me.x=2;me.y=2;me.shieldT=100;me.trail=[];updateMobs(.1);const during=mobs[0].x-20;
  world.time=begin+5.1;mobs[0].x=20;updateMobs(.1);return {during,after:mobs[0].x-20};
 });assert.ok(Math.abs(slow.during-.2)<.001);assert.ok(Math.abs(slow.after-.4)<.001);
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});await frame.evaluate(()=>{paused=true;OjjudaPhotoHelp.open()});assert.equal(await frame.locator('.photo-help').evaluate(n=>n.scrollWidth<=n.clientWidth+1),true);assert.equal(await frame.locator('.overlay:not(#menu) .panel').evaluate(n=>n.getBoundingClientRect().width<=innerWidth),true);}
 assert.deepEqual(errors,[]);console.log('PASS: real-engine heart continuation preserves territory; 30-second extension; five-second half-speed mobs; duplicate clicks; paid response recovery; 320/390/1280 layouts');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
