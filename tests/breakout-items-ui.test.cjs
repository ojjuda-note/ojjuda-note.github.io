const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'games/breakout-game.js'),'utf8').replace('    return game;',`    game.inspect=()=>({balls,bricks,drops,paddle,waiting,finished,completed,lives,score,level,speed});
    return game;`);
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,s=>(s.includes('/world-game-assets.js')||s.includes('/game-entry.js'))?s:'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('</head>','<style>@font-face{font-family:"Gowun Dodum";src:url("/qa-font.ttf")}</style></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
window.breakoutTest={
 open(){Al('breakout')},close:El,get current(){return R},audio:[],records:[],pendingRecords:[],holdRecords:false,
 settleRecords(){for(const resolve of this.pendingRecords.splice(0))resolve()},
 freeze(){cancelAnimationFrame(R.raf)},
 step(seconds){const n=Math.ceil(seconds*240);for(let i=0;i<n&&R.running;i++)R.game.update(seconds/n);R.game.draw(R.ctx)},
 hit(kind){
  const game=R.game,s=game.inspect();if(s.waiting)game.onKey(' ');
  const state=game.inspect(),brick=state.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1),ball=state.balls[0];
  for(const b of state.balls)Object.assign(b,{x:180,y:380,vx:0,vy:-state.speed});
  Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+5.1,vx:0,vy:-state.speed});
  const original=Math.random,roll={two:.04,ten:.125,pierce:.21,wide:.3,slow:.44,shrink:.6,fast:.9}[kind],queue=[0,roll];
  Math.random=()=>queue.shift()??.99;try{game.update(1/240)}finally{Math.random=original}
  return game.inspect().drops.at(-1);
 },
 finishStage(){
  const game=R.game,s=game.inspect();if(s.waiting)game.onKey(' ');
  const state=game.inspect(),last=state.bricks.filter(b=>b.on&&!b.solid).at(-1);for(const b of state.bricks)if(!b.solid)b.on=b===last;last.hp=1;
  Object.assign(state.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-state.speed});game.update(1/240);game.draw(R.ctx);
 },
 loseLife(){
  const game=R.game;if(game.inspect().waiting)game.onKey(' ');
  for(const ball of game.inspect().balls)ball.y=565;
  game.update(1/240);
 },
 loseRun(){for(let i=0;i<3&&R.running;i++)this.loseLife()},
 async reachStage(target){
  while(R.game.stage<target){
   const current=R.game.stage;this.finishStage();
   if(R.running||!R.game.stageCleared)throw Error('a cleared stage must wait for its next choice');
   const next=R.ov.querySelector('[data-g="breakout-stage"][data-stage="'+(current+1)+'"]');
   if(!next||next.disabled)throw Error('the next-stage action is unavailable');
   next.click();await Promise.resolve();this.freeze();R.game.draw(R.ctx);
   if(!R.running||R.game.stage!==current+1)throw Error('the next-stage action did not resume the game');
  }
 }
};
for(const [method,kind] of [['arcadeTap','tap'],['arcadeHit','hit'],['arcadeBonus','bonus'],['arcadeBad','bad']])gt[method]=()=>breakoutTest.audio.push(kind);
// Keep the real World lifecycle; only the score transport is held for race checks.
tf=async(game,score)=>{
 breakoutTest.records.push({game,score});
 if(breakoutTest.holdRecords)await new Promise(resolve=>breakoutTest.pendingRecords.push(resolve));
 return {ok:true,best:score};
};
g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  let checks=0;
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]){
   const context=await browser.newContext({viewport:{width,height},hasTouch:width<900,deviceScaleFactor:2});
   await context.route('**/*',route=>{
    const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
    if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
    if(u.pathname==='/games/breakout-game.js')return route.fulfill({contentType:'text/javascript',body:engine});
    if(u.pathname==='/game-controls.js')return route.fulfill({path:path.join(root,'game-controls.js')});
    if(u.pathname==='/game-controls.css')return route.fulfill({path:path.join(root,'game-controls.css')});
    if(u.pathname==='/qa-font.ttf'&&fs.existsSync('/root/.local/share/fonts/qa-gowun-dodum.ttf'))return route.fulfill({path:'/root/.local/share/fonts/qa-gowun-dodum.ttf'});
    const file=path.join(root,u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({path:file});
    return route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.breakoutTest);
   const choices=page.locator('#gscreen [data-g="breakout-stage"]');
   const savedStage=()=>page.evaluate(()=>localStorage.getItem('ojjuda-breakout-last-stage-v1'));
   const snapshot=()=>page.evaluate(()=>{const r=breakoutTest.current,g=r.game,s=g.inspect();return{stage:g.stage,level:s.level,running:r.running,score:s.score,lives:s.lives,balls:s.balls.length,waiting:s.waiting,finished:s.finished,completed:s.completed,cleared:g.stageCleared,speed:s.speed,paddleWidth:s.paddle.w,bricks:s.bricks.length,drops:s.drops.length,piercing:s.balls.some(b=>b.piercing),fullBoard:s.bricks.every(b=>b.on&&b.hp===b.maxHp)}});
   async function assertChoices(level){
    await choices.first().waitFor();assert.equal(await choices.count(),3);
    const values=await choices.evaluateAll(buttons=>buttons.map(button=>{
     const box=button.getBoundingClientRect();return{label:button.textContent,stage:Number(button.dataset.stage),pressed:button.getAttribute('aria-pressed'),disabled:button.disabled,x:box.x,y:box.y,right:box.right,bottom:box.bottom};
    }));
    for(const [i,value] of values.entries()){
     assert.ok(value.label.includes(['이전 단계','지금 단계','다음 단계'][i]));
     assert.equal(value.disabled,(i===0&&level===1)||(i===2&&level===100));
     if(!value.disabled)assert.equal(value.stage,level+i-1);
     assert.equal(value.pressed,null,'level buttons are direct actions, not a selection followed by Start');
     assert.ok(value.x>=-1&&value.right<=width+1&&value.y>=-1&&value.bottom<=height+1,'all three level choices fit inside the viewport: '+JSON.stringify({width,height,level,value}));
     assert.ok(value.bottom-value.y>=44,'each level choice provides a finger-sized touch target');
     assert.ok(Math.abs(value.y-values[0].y)<1,'the choices stay together in one row');
    }
    assert.equal(await page.locator('#gscreen [data-g="start"]').count(),0,'a completed board has no second Start confirmation');
    assert.equal(await page.evaluate(()=>breakoutTest.current.running),false,'the board waits until a level action is chosen');
    assert.equal((await snapshot()).stage,level);
   }
   async function assertFresh(level,bricks){
    const s=await snapshot();
    assert.deepEqual([s.stage,s.level,s.bricks,s.score,s.lives,s.balls,s.waiting,s.running,s.cleared,s.finished,s.completed,s.drops,s.piercing,s.fullBoard,s.paddleWidth],[level,level,bricks,0,3,1,true,true,false,false,false,0,false,true,80]);
    assert.equal(await choices.count(),0,'playing begins immediately without another level question');
    assert.equal(await savedStage(),String(level),'starting commits the selected level');
   }
   async function assertEntry(){
    await page.locator('#gov [data-g="start"]').waitFor();
    assert.equal(await choices.count(),0,'opening the game never asks which level to play');
   }
   async function startEntry(level,bricks){
    await assertEntry();await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>breakoutTest.freeze());
    await assertFresh(level,bricks);
   }
   await page.evaluate(()=>breakoutTest.open());await assertEntry();
   assert.equal(await savedStage(),null,'opening the entry alone does not save a level');
   await startEntry(1,14);
   const canvas=page.locator('#gcv'),box=await canvas.boundingBox(),close=await page.locator('#gov [data-g="close"]').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   assert.ok(close.y>=0&&close.y+close.height<=height,'the exit control stays visible');
   const logicalX=x=>box.x+x/360*box.width,logicalY=y=>box.y+y/540*box.height;
   const pad=page.locator('.breakout-touchpad'),padBox=await pad.boundingBox();
   assert.ok(padBox.height>=80,'finger control area is at least 80 CSS pixels high');
   assert.ok(padBox.y>=box.y+box.height&&padBox.y+padBox.height<=height,'control area stays below the canvas and inside the viewport');
   const padY=padBox.y+padBox.height/2;
   assert.ok(padY-logicalY(502)>=50,'the finger stays at least 50px below the paddle');
   assert.equal(await pad.evaluate(e=>getComputedStyle(e).touchAction),'none');
   await page.mouse.move(logicalX(120),logicalY(450));
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-80)<1,'pointer movement maps to the logical paddle');
   await page.keyboard.press('ArrowRight');assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-110)<1);
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().waiting),true);
   if(width<900)await page.touchscreen.tap(logicalX(180),padY);else await page.mouse.click(logicalX(180),padY);
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().waiting),false,'touch or click launches the attached ball');checks++;
   // Drag in the lower strip: the paddle follows without covering the playing field.
   await page.mouse.move(logicalX(180),padY);await page.mouse.down();
   await page.mouse.move(logicalX(300),padY,{steps:4});
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-260)<1);
   await page.mouse.move(box.x+box.width+20,padY);await page.mouse.up();
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x),280,'captured pointer continues beyond the strip edge');
   if(width===390){
    const touch=await context.newCDPSession(page),scroll=await page.evaluate(()=>scrollY);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:logicalX(180),y:padY}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:logicalX(90),y:padY}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-50)<1,'a real touch drag on the lower strip moves the paddle');
    assert.equal(await page.evaluate(()=>scrollY),scroll,'touch dragging does not scroll the page');
    await touch.detach();
    await page.locator('#gov .gbox').screenshot({path:path.join(require('node:os').tmpdir(),'ojjuda-breakout-touchpad-test.png')});
   }
   async function catchItem(kind){
    const x=await page.evaluate(kind=>breakoutTest.hit(kind).x,kind);
    await page.mouse.move(logicalX(x),logicalY(450));
    return page.evaluate(()=>{
     const s=breakoutTest.current.game.inspect();for(const b of s.balls)Object.assign(b,{x:180,y:360,vx:s.speed,vy:0});
     const item=s.drops.at(-1);breakoutTest.step(Math.max(0,(s.paddle.y-14-item.y)/125));
     const before={width:s.paddle.w,speed:breakoutTest.current.game.inspect().speed};
     breakoutTest.step(1/60);const after=breakoutTest.current.game.inspect();
     return{before,after:{width:after.paddle.w,speed:after.speed,drops:after.drops.length}};
    });
   }
   await catchItem('two');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),2);
   await catchItem('two');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),4);
   await catchItem('ten');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),40,'tenfold multiplies the current four balls');
   await catchItem('pierce');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.filter(b=>b.piercing).length),1);
   assert.deepEqual(await page.evaluate(()=>breakoutTest.audio.filter(k=>k==='bonus')),['bonus','bonus','bonus','bonus']);checks++;
   const grown=await catchItem('wide');assert.equal(grown.after.width,grown.before.width+16);assert.equal(grown.after.drops,0);
   const shrunk=await catchItem('shrink');assert.equal(shrunk.after.width,shrunk.before.width-16);assert.equal(shrunk.after.drops,0);
   const fast=await catchItem('fast');assert.ok(Math.abs(fast.after.speed-fast.before.speed*1.1)<.05,'catching the black speed box raises the actual speed by ten percent');
   const slow=await catchItem('slow');assert.ok(Math.abs(slow.after.speed-slow.before.speed*.9)<.05,'catching a slowdown box lowers the actual speed by ten percent');
   assert.deepEqual(await page.evaluate(()=>breakoutTest.audio.filter(k=>k==='bonus'||k==='bad').slice(-4)),['bonus','bad','bad','bonus']);checks++;
   const speed=await page.evaluate(()=>breakoutTest.current.game.inspect().speed);await page.evaluate(()=>breakoutTest.step(2));
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().speed)-speed-4)<.01);checks++;
   await page.evaluate(()=>{window.firstBreakoutRun=breakoutTest.current.game;breakoutTest.loseLife();breakoutTest.finishStage()});
   await assertChoices(1);const clearedFirst=await snapshot();
   assert.equal(clearedFirst.cleared,true);assert.equal(clearedFirst.finished,false);assert.equal(clearedFirst.lives,2);
   assert.equal(await savedStage(),'1','clearing the board does not enter or save the next stage');
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),0,'an intermediate clear does not finish or submit the run');
   await page.evaluate(()=>{for(let i=0;i<12;i++)breakoutTest.current.game.update(.1)});
   assert.deepEqual(await snapshot(),clearedFirst,'the cleared board stays frozen while choosing');
   await choices.filter({hasText:'다음 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());
   const continuedSecond=await snapshot();
   assert.deepEqual([continuedSecond.stage,continuedSecond.bricks,continuedSecond.score,continuedSecond.lives,continuedSecond.balls,continuedSecond.waiting,continuedSecond.cleared,continuedSecond.running,continuedSecond.drops,continuedSecond.piercing],[2,24,clearedFirst.score,2,1,true,false,true,0,false]);
   assert.ok(Math.abs(continuedSecond.speed-Math.min(460,clearedFirst.speed+20))<.001,'next stage preserves the run speed and its normal stage acceleration');
   assert.equal(await page.evaluate(()=>breakoutTest.current.game===window.firstBreakoutRun),true,'next uses the same run');
   assert.equal(await savedStage(),'2');assert.equal(await choices.count(),0);checks++;
   await page.evaluate(()=>breakoutTest.finishStage());await assertChoices(2);const clearedSecond=await snapshot();
   assert.equal(await savedStage(),'2');await choices.filter({hasText:'다음 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());
   assert.equal((await snapshot()).score,clearedSecond.score);assert.equal((await snapshot()).lives,2);
   assert.equal(await savedStage(),'3');assert.equal(await page.evaluate(()=>breakoutTest.records.length),0);
   const types=await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.bricks.length,s.bricks.some(b=>b.hp===2),s.bricks.some(b=>b.solid),s.balls[0].piercing]});
   assert.deepEqual(types,[34,true,true,false]);checks++;
   if(width===390){
    await catchItem('pierce');await catchItem('ten');
    await page.evaluate(()=>breakoutTest.step(.24));
    // Capture the real renderer after actual item drops and paddle catches.
    await page.locator('#gov .gbox').screenshot({path:process.env.BREAKOUT_SCREENSHOT||path.join(require('node:os').tmpdir(),'ojjuda-breakout-items-20261006.png')});
   }
   await page.evaluate(()=>breakoutTest.finishStage());await assertChoices(3);const clearedThird=await snapshot();
   assert.equal(await savedStage(),'3','the choices refer to the actual cleared stage reached from level 1');
   await page.evaluate(()=>{breakoutTest.holdRecords=true;window.finishedBreakoutRun=breakoutTest.current.game});
   await choices.filter({hasText:'지금 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());await assertFresh(3,34);
   assert.deepEqual(await page.evaluate(()=>breakoutTest.records),[{game:'breakout',score:clearedThird.score}],'replaying records the previous run once');
   assert.equal(await page.evaluate(()=>window.finishedBreakoutRun.finishRun()),false,'an old completed run cannot finish twice');
   await page.evaluate(async()=>{window.restartedBreakoutRun=breakoutTest.current.game;breakoutTest.holdRecords=false;breakoutTest.settleRecords();await new Promise(requestAnimationFrame);breakoutTest.freeze()});
   await assertFresh(3,34);assert.equal(await page.evaluate(()=>breakoutTest.current.game===window.restartedBreakoutRun),true,'a late score response cannot replace the restarted game');
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),1);checks++;
   await page.evaluate(()=>breakoutTest.loseRun());await page.locator('#gres').waitFor();await assertChoices(3);
   const recordsAfterLoss=await page.evaluate(()=>breakoutTest.records.length);
   await choices.filter({hasText:'이전 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());await assertFresh(2,24);
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),recordsAfterLoss,'choosing after game over does not submit the ended run again');checks++;
   await page.evaluate(()=>breakoutTest.finishStage());await assertChoices(2);
   await choices.filter({hasText:'다음 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());
   assert.deepEqual([(await snapshot()).stage,(await snapshot()).score,(await snapshot()).lives],[3,10,3]);
   await page.evaluate(()=>breakoutTest.finishStage());await assertChoices(3);const clearedBeforeClose=await snapshot();
   const recordsBeforeClose=await page.evaluate(()=>breakoutTest.records.length);
   await page.evaluate(()=>breakoutTest.close());assert.equal(await page.locator('#gov').count(),0);
   assert.equal(await savedStage(),'3','closing a clear prompt remembers the cleared stage, not the next stage');
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),recordsBeforeClose+1,'leaving a cleared run records it once');
   assert.deepEqual(await page.evaluate(()=>breakoutTest.records.at(-1)),{game:'breakout',score:clearedBeforeClose.score});
   await page.evaluate(()=>breakoutTest.open());await startEntry(3,34);checks++;
   await page.reload();await page.waitForFunction(()=>window.breakoutTest);
   await page.evaluate(()=>breakoutTest.open());await startEntry(3,34);checks++;
   await page.evaluate(()=>breakoutTest.reachStage(100));
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),0,'continuing through the levels does not submit intermediate runs');
   if(width===390){
    assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().bricks.length),1000);
    await page.locator('#gov .gbox').screenshot({path:path.join(require('node:os').tmpdir(),'ojjuda-breakout-stage100-20261006.png')});
    const metrics=await page.evaluate(()=>{
     const r=breakoutTest.current,g=r.game,s=g.inspect(),brick=s.bricks.find(b=>!b.solid),transform=r.ctx.getTransform(),x=Math.floor((brick.x+brick.w/2)*transform.a+transform.e),y=Math.floor((brick.y+brick.h/2)*transform.d+transform.f);
     const before=Array.from(r.ctx.getImageData(x,y,1,1).data);brick.on=false;g.draw(r.ctx);
     const after=Array.from(r.ctx.getImageData(x,y,1,1).data);
     g.onKey(' ');const frames={},originalRandom=Math.random;Math.random=()=>.99;
     try{
      for(const count of [10,100]){
       const times=[];
       for(let i=0;i<180;i++){
        const state=g.inspect();while(state.balls.length<count)state.balls.push({...state.balls[0],id:1000+state.balls.length,contacts:new Set()});
        // Keep a full board so the capped-ball sample cannot become an empty-board benchmark.
        for(const brick of state.bricks){brick.on=true;brick.hp=brick.maxHp;}
        for(const [j,b] of state.balls.entries())Object.assign(b,{x:24+(j%10)*32,y:104+Math.floor(j/10)*16+(i%4)*2,vx:(j%2?1:-1)*state.speed*Math.sqrt(.96),vy:-state.speed*.2,contacts:new Set()});
        const start=performance.now();g.update(1/60);g.draw(r.ctx);times.push(performance.now()-start);
        if(g.inspect().finished||g.inspect().balls.length!==count)throw Error('the performance sample must keep its full active ball count');
       }
       times.sort((a,b)=>a-b);frames[count]=times[Math.floor(times.length*.95)];
      }
     }finally{Math.random=originalRandom}
     return {before,after,frames};
    });
    assert.notDeepEqual(metrics.before,metrics.after,'destroyed bricks disappear from the cached layer');
    for(const [count,p95] of Object.entries(metrics.frames)){
     assert.ok(p95<40,`1000-brick, ${count}-ball update and draw stay within the regression frame budget`);
     console.log('1000 bricks / '+count+' balls: p95 '+p95.toFixed(2)+' ms');
    }
   }
   await page.evaluate(()=>{while(breakoutTest.current.running)breakoutTest.finishStage()});
   await page.locator('#gres').waitFor();assert.match(await page.locator('#gscreen').innerText(),/100단계 클리어/);
   await assertChoices(100);assert.equal(await page.evaluate(()=>breakoutTest.records.length),1,'the final run submits one terminal result');
   await choices.filter({hasText:'지금 단계'}).click();await page.evaluate(()=>breakoutTest.freeze());await assertFresh(100,1000);
   assert.equal(await page.evaluate(()=>breakoutTest.records.length),1,'restarting the final stage does not duplicate its old result');
   await page.evaluate(()=>breakoutTest.close());assert.equal(await page.locator('#gov').count(),0);
   assert.deepEqual(errors,[],'no application errors while playing, finishing and restarting');checks++;
   await context.close();
  }
  console.log('PASS: '+checks+' World breakout integration checks; touch/pointer/keyboard, falling pickups, elapsed-time acceleration, stage growth, clear-only direct level actions, preserved next-stage runs, replay/exit score settlement, stale-response isolation, saved-level reentry/reload, final-stage boundaries and four viewport sizes');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
