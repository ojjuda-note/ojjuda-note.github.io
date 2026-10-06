const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
S=window.fixtureClient;D.online=true;D.user={id:'adult-member'};window.OjjudaMatgoAccess.configure(S);
window.photoTest={open:Al,close:El};
g.tab='friends';H();g.place={id:'arcade',log:[]};
const host=document.createElement('section');host.id='arcade-test';host.innerHTML=Df();document.body.append(host);
host.addEventListener('click',e=>{const b=e.target.closest('[data-act="game-open"]');if(b)Ln['game-open'](b.dataset)});
`+world.slice(world.indexOf('</script>',boot));
world=world.replace('</head>',`<script>
window.fixtureAge=19;window.fixtureClient={auth:{getUser:async()=>({data:{user:{id:'adult-member'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>({data:name==='get_my_member_identity'?{age:fixtureAge,locked:true}:false})};
</script><script src="/matgo-access.js"></script><script src="/photo-ttang-access.js"></script><script src="/ttang-bridge.js"></script><script src="/photo-ttang-ranking.js"></script><script src="/photo-ttang-bridge.js"></script></head>`);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true}),errors=[];
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.fulfill({body:''});
   if(u.pathname==='/fixture')return r.fulfill({contentType:'text/html',body:world});
   const file=path.join(root,u.pathname);return fs.existsSync(file)&&fs.statSync(file).isFile()?r.fulfill({contentType:u.pathname.endsWith('.js')?'application/javascript':'text/html',body:fs.readFileSync(file)}):r.fulfill({status:404,body:''});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8878/fixture');
  const solo=page.locator('[data-arcade-games="solo"]'),multi=page.locator('[data-arcade-games="multi"]');
  assert.equal(await solo.getByRole('button',{name:'포토땅따먹기 · 만 19세 이상',exact:true}).count(),1);
  assert.equal(await solo.getByRole('button',{name:'월드땅따먹기',exact:true}).count(),0);
  assert.equal(await multi.getByRole('button',{name:'월드땅따먹기',exact:true}).count(),1);
  assert.equal(await multi.getByRole('button',{name:'포토땅따먹기 · 만 19세 이상',exact:true}).count(),0);
  await page.evaluate(()=>fixtureAge=18);
  await solo.getByRole('button',{name:'포토땅따먹기 · 만 19세 이상',exact:true}).click();
  await page.getByText('포토땅따먹기는 만 19세 생일부터 이용할 수 있어요.',{exact:true}).waitFor();
  assert.equal(await page.locator('#photo-ttang-overlay').count(),0,'World rejects an underage member');
  await page.evaluate(()=>fixtureAge=19);
  await solo.getByRole('button',{name:'포토땅따먹기 · 만 19세 이상',exact:true}).click();
  await page.locator('#photo-ttang-overlay iframe').waitFor();
  const frame=await (await page.locator('#photo-ttang-overlay iframe').elementHandle()).contentFrame();
  await frame.waitForSelector('#grid .cell');assert.equal(await frame.title(),'오쭈다 포토땅따먹기');
  assert.equal(await frame.locator('#grid .cell').count(),20);
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});assert.equal(await frame.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  }
  await page.setViewportSize({width:390,height:844});await frame.locator('#grid .cell').first().click();
  await frame.waitForFunction(()=>mode==='play'&&!!me);
  await frame.waitForFunction(()=>photoImg.complete&&photoImg.naturalWidth>0);
  const result=await frame.evaluate(()=>{
   paused=true;startWait=0;world.time=10;world.itemsOn=false;world.items=[];world.events=[];
   world.own.fill(0);world.counts.fill(0);world.counts[0]=world.N;world.trail.fill(0);mySil=0;
   for(const p of world.players){p.alive=false;p.trail=[];p.pts=[];p.tc=new Map();p.bb=[1e9,1e9,-1,-1];}
   Object.assign(me,{alive:true,x:3,y:3,born:-10,shieldT:50,freezeT:0,ang:0,target:0});
   for(let y=20;y<40;y++)for(let x=20;x<40;x++)world.setOwn(y*world.GW+x,me.id);
   const trappedBot=world.addPlayer({noSpawn:true,alive:true,bot:true,color:2,name:'포획 테스트',x:12,y:12,born:-1});
   world.setOwn(world.si(28.5,38.5),trappedBot.id);
   const trappedMob={type:'bounce',x:12,y:15,v:4.2,vx:4.2,vy:0,r:.75,ph:0,alive:true,born:-1};
   const outsideMob={...trappedMob,x:28.5,y:38.5};
   mobs=[trappedMob,outsideMob];respawnQ=[];buildLayers();
   const begin=performance.now();
   for(const [x,y] of [[27,3],[27,37],[3,37],[3,3]]){const dx=x-me.x,dy=y-me.y,n=Math.ceil(Math.hypot(dx,dy)/.05);for(let i=0;i<n;i++){const px=me.x,py=me.y;me.x+=dx/n;me.y+=dy/n;world.visit(me,px,py);}}
   const captured=world.events.some(e=>e.t==='capture'&&e.gained>50000),captureMs=performance.now()-begin;
   updateMobs(.03);
   const trapped={botDead:!trappedBot.alive,mobDead:!trappedMob.alive,outsideAlive:outsideMob.alive,kills:me.kills,
    botRespawn:trappedBot.respawnAt-world.time,mobRespawn:respawnQ[0]?.at-world.time};
   let calls=0;const restore=[];
   for(const c of [octx,osctx,mkx])for(const name of ['clearRect','fillRect']){const original=c[name];c[name]=function(...args){calls++;return original.apply(this,args)};restore.push(()=>c[name]=original);}
   const start=performance.now();flushDirty();const renderMs=performance.now()-start;restore.forEach(fn=>fn());
   // Compare every rendered pixel with the existing single-cell renderer.
   const contexts=[octx,osctx,mkx],before=contexts.map(c=>c.getImageData(0,0,c.canvas.width,c.canvas.height).data);
   for(const c of contexts)c.clearRect(0,0,c.canvas.width,c.canvas.height);
   for(let k=0;k<world.N;k++)if(world.own[k])drawCell(k);
   let equal=contexts.every((c,i)=>c.getImageData(0,0,c.canvas.width,c.canvas.height).data.every((v,j)=>v===before[i][j]));
   const rival=world.addPlayer({noSpawn:true,color:2});
   for(let y=40;y<75;y++)for(let x=40;x<95;x++)world.setOwn(y*world.GW+x,x<65?0:rival.id);
   flushDirty();
   const changed=contexts.map(c=>c.getImageData(0,0,c.canvas.width,c.canvas.height).data);
   for(const c of contexts)c.clearRect(0,0,c.canvas.width,c.canvas.height);
   for(let k=0;k<world.N;k++)if(world.own[k])drawCell(k);
   equal=equal&&contexts.every((c,i)=>c.getImageData(0,0,c.canvas.width,c.canvas.height).data.every((v,j)=>v===changed[i][j]));
   world.setOwn(world.si(8,8),0);flushDirty();
   const small=mkx.getImageData(80,80,1,1).data[3]===0;
   handleEvents();me.speed=0;paused=false;over=true;
   return {captured,trapped,calls,captureMs,renderMs,equal,small,time:world.time};
  });
  console.log('Capture rendering:',result);
  assert.equal(result.captured,true,'real closed trail acquires a large territory');
  assert.deepEqual(result.trapped,{botDead:true,mobDead:true,outsideAlive:true,kills:1,botRespawn:30,mobRespawn:30},'enclosed computers and mobs die and use the existing respawn timers');
  assert.equal(result.small,true,'small updates clear the photo mask');
  assert.equal(result.equal,true,'batched territory, shadows and photo mask preserve every pixel');
  assert.ok(result.calls<5000,'a large capture must not submit hundreds of thousands of canvas operations');
  await frame.waitForFunction(t=>world.time>t+.2,result.time);
  await frame.evaluate(()=>{win();toMenu();});
  await frame.waitForTimeout(3200);
  assert.equal(await frame.locator('.overlay:not(#menu)').count(),0,'leaving the completed round cancels its pending result panel');
  assert.deepEqual(errors,[]);console.log('PASS: large photo capture, exact layer pixels, bounded canvas work, continued animation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
