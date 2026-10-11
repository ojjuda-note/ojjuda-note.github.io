const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const width of [320,390,1280]){
   const page=await browser.newPage({viewport:{width,height:844},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
    if(u.pathname==='/host.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/world-tour-game.css"><button id="launch">오쭈다 투어</button><script src="/world-tour-game.js"></script><script>document.getElementById("launch").onclick=()=>OjjudaTourGame.open({nickname:"여행친구",owner:"qa-member"});</script>'});
    const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
    return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
   });
   await page.goto('https://fixture.test/host.html');await page.locator('#launch').click();
   const frame=page.frameLocator('iframe');
   await frame.locator('#tourTitle').waitFor();
   const embedded=page.frames().find(f=>f.url().includes('/games/ojjuda-tour/'));
   await embedded.waitForFunction(()=>document.querySelector('#rows input')?.value==='여행친구');
   assert.equal(await frame.locator('.game-entry').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'entry fits '+width);
   assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'no horizontal scrolling '+width);
   await frame.locator('[data-tour-mode=together]').click();
   await frame.locator('#minus').click();await frame.locator('#minus').click();
   await frame.locator('.ge-more > summary').nth(0).click();
   assert.equal(await frame.locator('#rows input').count(),2);
   assert.equal(await frame.locator('#rows').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'roster fits '+width);
   await frame.locator('.ge-more > summary').nth(0).click();
   if(width===390){
    await frame.locator('#startBtn').click();
    await frame.locator('#game').waitFor({state:'visible',timeout:60000});
    await frame.locator('#three').evaluate(()=>new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(R.ok&&R.diceReady){clearInterval(timer);resolve()}else if(++attempts>200){clearInterval(timer);reject(Error('3D game did not become ready'))}},100)}));
    const point=await frame.locator('#three').evaluate(canvas=>{const p=R.diceHit.position.clone().project(R.camera);return{x:(p.x+1)*canvas.clientWidth/2,y:(1-p.y)*canvas.clientHeight/2}});
    await frame.locator('#three').click({position:point});
    await frame.locator('#three').evaluate(()=>new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(G.players[0].pos>0){clearInterval(timer);resolve()}else if(++attempts>400){clearInterval(timer);reject(Error('dice did not move the player'))}},100)}));
    assert.equal(await frame.locator('#three').evaluate(canvas=>canvas.width>0&&canvas.height>0),true);
    await page.getByRole('button',{name:'게임 목록으로 돌아가기'}).click();
    await page.locator('#launch').click();
    await frame.locator('#resumeBtn').waitFor({state:'visible'});
    await frame.locator('#resumeBtn').click();
    await frame.locator('#game').waitFor({state:'visible',timeout:60000});
    assert.equal(await frame.locator('#three').evaluate(()=>G.players.length),2,'member checkpoint resumed');
   }
   await page.getByRole('button',{name:'게임 목록으로 돌아가기'}).click();
   assert.equal(await page.locator('dialog').count(),0);
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('gaming')),false);
   assert.deepEqual(errors,[]);
   await page.close();
  }
  console.log('PASS: 320/390/1280px entry, member handshake, real WebGL start, dice movement, exit and saved tour resume');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
