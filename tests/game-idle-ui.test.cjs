const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const {fixture,ids}=require('./tank-online-fixture.cjs');
const root=path.join(__dirname,'..'),origin='https://game-idle.test';
const host=`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/multiplayer-entry.css"><button id="open">탱크게임</button>
<script src="/world-game-assets.js"></script><script src="/multiplayer-entry.js"></script><script>
document.getElementById('open').onclick=async()=>{await OjjudaGameAssets.load('tank');OjjudaTankGame.open({owner:'fixture-member',client:{functions:{invoke:async(_,{body})=>({data:await tankFixtureInvoke(body),error:null})}}});};
</script>`;

async function instrument(target,game){
 await target.evaluate(game=>{
  window.idleWork={draws:0,steps:0,domWrites:0};
  const oldDraw=draw;draw=function(...args){idleWork.draws++;return oldDraw.apply(this,args);};
  if(game==='tank'){const oldStep=step;step=function(...args){idleWork.steps++;return oldStep.apply(this,args);};}
  else{const oldStep=World.prototype.step;World.prototype.step=function(...args){idleWork.steps++;return oldStep.apply(this,args);};}
  new MutationObserver(records=>idleWork.domWrites+=records.length).observe(document.body,{attributes:true,childList:true,subtree:true});
 },game);
}
async function sample(target){
 await target.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await target.evaluate(()=>{idleWork.draws=idleWork.steps=idleWork.domWrites=0;});
 await target.waitForTimeout(1000);
 return target.evaluate(()=>({...idleWork}));
}
async function idle(target,label){
 await target.waitForFunction(()=>document.body.dataset.mpEntry==='true');
 assert.equal(await target.locator('#cv').isVisible(),false);
 const work=await sample(target);console.log(JSON.stringify({phase:label,...work}));
 assert.equal(work.draws,0,label+' does not redraw a concealed battlefield');
 assert.equal(work.steps,0,label+' does not simulate a concealed battlefield');
}
async function playing(target,label){
 await target.waitForFunction(()=>document.body.dataset.mpEntry==='false');
 assert.equal(await target.locator('#cv').isVisible(),true);
 const work=await sample(target);console.log(JSON.stringify({phase:label,...work}));
 assert.ok(work.draws>0&&work.steps>0,label+' resumes normal animation and simulation');
}

(async()=>{
 const service=await fixture();
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:707,height:739}}),errors=[];
  context.on('page',page=>{page.on('pageerror',e=>errors.push(e.message));page.on('dialog',dialog=>dialog.accept());});
  await context.exposeFunction('tankFixtureInvoke',body=>service.call(ids[0],body));
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname==='/host.html')return route.fulfill({contentType:'text/html',body:host});
   const file=path.resolve(root,'.'+url.pathname);
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
   return route.fulfill({path:file,contentType:/\.(js|mjs)$/.test(file)?'text/javascript':/\.css$/.test(file)?'text/css':/\.html$/.test(file)?'text/html':undefined});
  });
  const tank=await context.newPage();await tank.goto(origin+'/host.html');await tank.locator('#open').click();
  const content=tank.frameLocator('.tank-game-dialog iframe');await content.locator('#startSolo:not([disabled])').waitFor();
  let frame=tank.frames().find(f=>f.url().includes('/games/tank/index.html'));
  await instrument(frame,'tank');await idle(frame,'tank entry');
  await content.locator('#startSolo').click();await playing(frame,'tank play');
  assert.equal(await frame.evaluate(()=>TankOnline.canAim()),true);
  await tank.evaluate(async()=>{if(document.fullscreenElement)await document.exitFullscreen();});
  await tank.locator('.tank-game-dialog .tour-game-header button').click();await tank.locator('#open').click();
  await content.locator('#resumeMatch:not([disabled])').waitFor();frame=tank.frames().find(f=>f.url().includes('/games/tank/index.html'));
  await instrument(frame,'tank');await idle(frame,'tank saved-game entry');
  await content.locator('#resumeMatch').click();await playing(frame,'tank resumed play');
  await content.locator('#surrender').click();await idle(frame,'tank returned entry');await tank.close();

  const ttang=await context.newPage();await ttang.goto(origin+'/games/ttang.html');
  await instrument(ttang,'ttang');await idle(ttang,'ttang entry');
  await ttang.locator('#soloBtn').click();await playing(ttang,'ttang play');
  await ttang.evaluate(()=>OjjudaTtang.menu());await idle(ttang,'ttang returned entry');
  await ttang.locator('#soloBtn').click();await playing(ttang,'ttang restarted play');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS: concealed Tank/Ttang entrances perform no drawing or simulation; play, resume and reentry keep running.');
 }finally{await browser.close();await service.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
