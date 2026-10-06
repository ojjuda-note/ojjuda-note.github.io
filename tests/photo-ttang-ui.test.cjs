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
  const input=await context.newCDPSession(page),box=await frame.locator('#gameCanvas').boundingBox();
  const x=Math.round(box.x+box.width/2),y=Math.round(box.y+box.height*.65);
  await frame.evaluate(()=>{paused=true;me.target=0;startWait=3;me.freezeT=.8;});
  await input.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-2}]});
  assert.equal(await frame.evaluate(()=>me.target),0,'tiny finger jitter must not change direction');
  assert.equal(await frame.evaluate(()=>startWait),3,'tiny finger jitter must preserve the start countdown');
  await input.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-6}]});
  assert.ok(Math.abs(await frame.evaluate(()=>me.target)+Math.PI/2)<.001,'a small upward drag must turn immediately');
  assert.ok(await frame.evaluate(()=>startWait<=.01&&me.freezeT<=.001),'the first small drag must start movement immediately');
  await input.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  assert.equal(await frame.evaluate(()=>joys.size),0,'releasing the finger must release the joystick');
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});
   await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const radii=await frame.evaluate(()=>{
    const arcs=[],arc=ctx.arc,stroke=ctx.stroke;let lastArc=null;
    ctx.arc=function(x,y,r,a,b,...rest){lastArc={x,y,r,a,b};return arc.call(this,x,y,r,a,b,...rest)};
    ctx.stroke=function(...args){if(lastArc?.x===0&&lastArc?.y===0&&lastArc.b-lastArc.a>=TAU&&this.strokeStyle==='#ffffff')arcs.push(lastArc.r+this.lineWidth/2);return stroke.apply(this,args)};
    try{draw(0)}finally{ctx.arc=arc;ctx.stroke=stroke}
    return{drawn:arcs,hit:world.bodyRadius(me)*view().S,line:world.trailRadius*view().S*2};
   });
   assert.equal(radii.drawn.length,1,'one visible player body');
   assert.ok(Math.abs(radii.drawn[0]-radii.hit)<1e-8,'drawn body including its outline equals the collision radius');
   assert.ok(radii.line>=5,'small screens retain the visible line width');
  }
  await page.setViewportSize({width:390,height:844});
  await frame.evaluate(()=>{paused=false;});await input.detach();await frame.click('#pause');
  assert.equal(await frame.getByText('잠깐 쉬는 중').isVisible(),true);await frame.click('#go');
  await frame.evaluate(()=>win());assert.equal(await frame.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-photo-ttang'))['0'].done),1);
  await frame.evaluate(()=>toMenu());assert.equal(await frame.locator('#grid .cell:not([disabled])').count(),2);
  await page.getByRole('button',{name:'포토땅따먹기 닫기',exact:true}).click();assert.equal(await page.locator('#photo-ttang-overlay').count(),0);
  await multi.getByRole('button',{name:'월드땅따먹기',exact:true}).click();
  const old=await(await page.locator('#ttang-overlay iframe').elementHandle()).contentFrame();await old.waitForSelector('#duoBtn');
  assert.equal(await old.title(),'오쭈다 월드땅따먹기');await old.locator('#soloBtn').tap();
  await old.waitForFunction(()=>mode==='solo'&&world.time>.1&&me.alive);assert.equal(await old.locator('#hud').isVisible(),true,'practice starts through the real World arcade');
  await old.locator('#quit').tap();await old.locator('#yes').tap();await old.click('#duoBtn');assert.equal(await old.locator('#mk').isVisible(),true);
  await page.evaluate(()=>photoTest.open('photo_ttang'));assert.equal(await page.locator('#ttang-overlay').count(),0);
  await page.locator('#photo-ttang-overlay iframe').waitFor();const next=await(await page.locator('#photo-ttang-overlay iframe').elementHandle()).contentFrame();await next.waitForSelector('#grid .cell');
  await next.press('body','Escape');await page.waitForSelector('#photo-ttang-overlay',{state:'detached'});
  assert.deepEqual(errors,[]);console.log('PASS: real solo/multi categories, names, 20 photos, mobile layout, small touch drags, play, pause, World practice, clear progress, reopen, mutual cleanup and Escape');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
