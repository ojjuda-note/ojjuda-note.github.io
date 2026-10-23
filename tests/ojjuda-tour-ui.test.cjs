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
    if(u.pathname==='/host.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/world-tour-game.css"><button id="launch">오쭈다 마블</button><script src="/world-tour-game.js"></script><script>window.records=[];document.getElementById("launch").onclick=()=>OjjudaTourGame.open({nickname:"여행친구",owner:"qa-member",onScore:async(won,id)=>{records.push({won,id});return {ok:records.length>1}}});</script>'});
    const file=path.resolve(root,'.'+u.pathname+(u.pathname.endsWith('/')?'index.html':''));
    return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
   });
   await page.goto('https://fixture.test/host.html');await page.locator('#launch').click();
   const frame=page.frameLocator('iframe');
   await frame.locator('#tourTitle').waitFor();
   const embedded=page.frames().find(f=>f.url().includes('/games/ojjuda-tour/'));
   await embedded.waitForFunction(()=>document.querySelector('#rows input')?.value==='여행친구').catch(async error=>{console.error({width,errors,names:await frame.locator('#rows input').evaluateAll(inputs=>inputs.map(input=>input.value))});throw error});
   assert.equal(await frame.locator('.game-entry').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'entry fits '+width);
   assert.equal(await frame.locator('body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'no horizontal scrolling '+width);
   await frame.locator('[data-tour-mode=together]').click();
   await frame.locator('#minus').click();await frame.locator('#minus').click();
   await frame.locator('.ge-more > summary').nth(0).click();
   assert.equal(await frame.locator('#rows input').count(),2);
   assert.equal(await frame.locator('#rows').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'roster fits '+width);
   await frame.locator('.ge-more > summary').nth(0).click();
   if(width===390){
    await frame.locator('#plus').click();await frame.locator('[data-tour-mode=computer]').click();
    await frame.locator('#startBtn').click();
    await frame.locator('#game').waitFor({state:'visible',timeout:60000});
    await frame.locator('#three').evaluate(()=>new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(R.ok&&R.diceReady){clearInterval(timer);resolve()}else if(++attempts>200){clearInterval(timer);reject(Error('3D game did not become ready'))}},100)}));
    // Save the actual WebGL board for layout review, including each building level.
    await frame.getByRole('button',{name:'시점 초기화',exact:true}).click();
    await embedded.waitForFunction(()=>Math.abs(R.cam.D-R.overD)<.02&&Math.abs(R.cam.el-OVER_EL)<.002);
    const layout=await frame.locator('#three').evaluate(()=>{
     const sizes=R.tiles.map(tile=>{tile.userData.slab.geometry.computeBoundingBox();const size=new THREE.Vector3();tile.userData.slab.geometry.boundingBox.getSize(size);return [size.x,size.z].map(v=>+v.toFixed(5))});
     return {tiles:R.tiles.length,footprints:[...new Set(sizes.map(size=>size.join(' × ')))]};
    });
    console.log('Board layout:',JSON.stringify(layout));
    fs.mkdirSync('/tmp/ojjuda-tour-proof',{recursive:true});
    await frame.locator('#boardbox').screenshot({path:'/tmp/ojjuda-tour-proof/equal-tiles.png'});
    await frame.locator('#three').evaluate(()=>{
     window.layoutCheckpoint={owner:{...G.owner},level:{...G.level}};
     for(let side=0;side<4;side++){const i=T.findIndex((t,i)=>Math.floor(i/8)===side&&t.t==='city');G.owner[i]=side%G.players.length;G.level[i]=side+1;}
     sync3D();
    });
    await page.waitForTimeout(1100);
    await frame.locator('#boardbox').screenshot({path:'/tmp/ojjuda-tour-proof/equal-tiles-buildings.png'});
    await frame.locator('#three').evaluate(()=>{Object.assign(G,window.layoutCheckpoint);delete window.layoutCheckpoint;sync3D()});
    const point=await frame.locator('#three').evaluate(canvas=>{const p=R.diceHit.position.clone().project(R.camera);return{x:(p.x+1)*canvas.clientWidth/2,y:(1-p.y)*canvas.clientHeight/2}});
    await frame.locator('#three').click({position:point});
    await frame.locator('#three').evaluate(()=>new Promise((resolve,reject)=>{let attempts=0;const timer=setInterval(()=>{if(G.players[0].pos>0){clearInterval(timer);resolve()}else if(++attempts>400){clearInterval(timer);reject(Error('dice did not move the player'))}},100)}));
    assert.equal(await frame.locator('#three').evaluate(canvas=>canvas.width>0&&canvas.height>0),true);
    await page.getByRole('button',{name:'게임 목록으로 돌아가기'}).click();
    await page.locator('#launch').click();
    await frame.locator('#resumeBtn').waitFor({state:'visible'});
    await frame.locator('#resumeBtn').click();
    await frame.locator('#game').waitFor({state:'visible',timeout:60000});
    assert.equal(await frame.locator('#three').evaluate(()=>G.players.length),3,'member checkpoint resumed');
    await page.frames().find(f=>f.url().includes('/games/ojjuda-tour/')).waitForFunction(()=>R.diceReady);
    // End the waiting test turn, then exercise a real insolvent payment and its dialog.
    await frame.locator('#three').evaluate(()=>{
     GEN++;if(rollResolve){const finish=rollResolve;rollResolve=null;finish()}
     const p=G.players[0],city=T.findIndex(t=>t.t==='city');p.money=10;
     G.owner[city]=0;G.level[city]=4;G.fest[city]=1;
     const proceeds=r10(T[city].p/2)+[1,2,3,4].reduce((sum,lv)=>sum+r10(costLv(city,lv)/2),0);
     window.eliminationFinished=pay(p,p.money+proceeds,G.players[1]);
    });
    await frame.getByRole('heading',{name:'탈락',exact:true}).waitFor();
    assert.match(await frame.locator('#sBody').innerText(),/잔액이 0원이고 판매할 도시나 건물이 없어요/);
    await frame.getByRole('button',{name:'관전하기',exact:true}).click();
    await frame.locator('#three').evaluate(()=>window.eliminationFinished);
    assert.equal(await frame.locator('#eliminationStatus').isVisible(),true);
    assert.match(await frame.locator('#players .out').innerText(),/탈락[\s\S]*관전 중/);
    assert.equal(await frame.locator('#eliminationStatus').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'mobile elimination banner fits');
    assert.equal(await frame.locator('#quitBtn').isVisible(),false);
    assert.equal(await frame.locator('#three').evaluate(()=>R.pieces[0].g.visible),false,'eliminated piece leaves the board');
    await frame.locator('#three').evaluate(()=>{void gameLoop()});
    await page.frames().find(f=>f.url().includes('/games/ojjuda-tour/')).waitForFunction(()=>G.turn!==0&&G.players[G.turn].pos>0,{},{timeout:40000});
    assert.equal(await frame.locator('#three').evaluate(()=>canControlTurn()),false,'spectator cannot control computer turns');
    await page.getByRole('button',{name:'게임 목록으로 돌아가기'}).click();await page.locator('#launch').click();
    await frame.locator('#resumeBtn').waitFor({state:'visible'});await frame.locator('#resumeBtn').click();
    await frame.locator('#game').waitFor({state:'visible'});
    assert.equal(await frame.locator('#three').evaluate(()=>G.players[0].bankrupt&&spectating()),true,'resume keeps eliminated spectator');
    assert.equal(await frame.locator('#eliminationStatus').isVisible(),true);
    await frame.locator('#three').evaluate(()=>endScreen(G.players[1],'라운드 종료'));
    await frame.getByRole('button',{name:'다시 저장',exact:true}).waitFor();
    await frame.getByRole('button',{name:'다시 저장',exact:true}).click();
    await frame.getByText('게임 순위에 기록했어요. 우승은 연승으로 집계돼요.',{exact:true}).waitFor();
    const records=await page.evaluate(()=>window.records);
    assert.equal(records.length,2);assert.equal(records[0].won,false,'elimination records a loss under the current win-streak contract');assert.equal(records[1].id,records[0].id);
    assert.equal(await frame.locator('#s2Body').evaluate(el=>el.scrollWidth<=el.clientWidth+1),true,'result receipt fits mobile');
   }
   await page.getByRole('button',{name:'게임 목록으로 돌아가기'}).click();
   assert.equal(await page.locator('dialog').count(),0);
   assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('gaming')),false);
   assert.deepEqual(errors,[]);
   console.log('PASS: viewport '+width);await page.close();
  }
  console.log('PASS: responsive entry, WebGL, dice, liquidation dialog, elimination banner, continued AI play and spectator resume');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
