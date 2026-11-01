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
 open(){Al('breakout')},close:El,get current(){return R},audio:[],
 freeze(){cancelAnimationFrame(R.raf)},
 step(seconds){const n=Math.ceil(seconds*240);for(let i=0;i<n&&R.running;i++)R.game.update(seconds/n);R.game.draw(R.ctx)},
 hit(kind){
  const game=R.game,s=game.inspect();if(s.waiting)game.onKey(' ');
  const state=game.inspect(),brick=state.bricks.filter(b=>b.on&&!b.solid&&b.hp===1).at(-1),ball=state.balls[0];
  for(const b of state.balls)Object.assign(b,{x:180,y:380,vx:0,vy:-state.speed});
  Object.assign(ball,{x:brick.x+brick.w/2,y:brick.y+brick.h+6,vx:0,vy:-state.speed});
  const original=Math.random,roll={two:.1,ten:.6,pierce:.9}[kind],queue=[0,roll];
  Math.random=()=>queue.shift()??.99;try{game.update(1/240)}finally{Math.random=original}
  return game.inspect().drops.at(-1);
 },
 finishStage(){
  const game=R.game,s=game.inspect();if(s.waiting)game.onKey(' ');
  const state=game.inspect(),last=state.bricks.filter(b=>b.on&&!b.solid).at(-1);for(const b of state.bricks)if(!b.solid)b.on=b===last;last.hp=1;
  Object.assign(state.balls[0],{x:last.x+last.w/2,y:last.y+last.h+6,vx:0,vy:-state.speed});game.update(1/240);game.draw(R.ctx);
 },
 loseRun(){
  for(let i=0;i<3&&R.running;i++){
   const game=R.game;if(game.inspect().waiting)game.onKey(' ');
   for(const ball of game.inspect().balls)ball.y=565;
   game.update(1/240);
  }
 }
};
for(const [method,kind] of [['arcadeTap','tap'],['arcadeHit','hit'],['arcadeBonus','bonus'],['arcadeBad','bad']])gt[method]=()=>breakoutTest.audio.push(kind);
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
   async function assertChoices(level,selected=level){
    await choices.first().waitFor();assert.equal(await choices.count(),3);
    const values=await choices.evaluateAll(buttons=>buttons.map(button=>{
     const box=button.getBoundingClientRect();return{label:button.textContent,stage:Number(button.dataset.stage),pressed:button.getAttribute('aria-pressed'),disabled:button.disabled,x:box.x,y:box.y,right:box.right,bottom:box.bottom};
    }));
    for(const [i,value] of values.entries()){
     assert.ok(value.label.includes(['이전 단계','지금 단계','다음 단계'][i]));
     assert.equal(value.disabled,(i===0&&level===1)||(i===2&&level===100));
     if(!value.disabled)assert.equal(value.stage,level+i-1);
     assert.equal(value.pressed,i===selected-level+1?'true':'false');
     assert.ok(value.x>=-1&&value.right<=width+1&&value.y>=-1&&value.bottom<=height+1,'all three level choices fit inside the viewport');
     assert.ok(value.bottom-value.y>=44,'each level choice provides a finger-sized touch target');
     assert.ok(Math.abs(value.y-values[0].y)<1,'the choices stay together in one row');
    }
    assert.match(await page.locator('#gscreen [data-g="start"]').innerText(),new RegExp(selected+'단계 시작'));
   }
   async function startSelected(level,bricks){
    await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>breakoutTest.freeze());
    assert.deepEqual(await page.evaluate(()=>{const g=breakoutTest.current.game,s=g.inspect();return[g.stage,s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting]}),[level,level,bricks,0,3,1,true]);
    assert.equal(await savedStage(),String(level),'starting commits the selected level');
   }
   await page.evaluate(()=>breakoutTest.open());await assertChoices(1);
   assert.equal(await savedStage(),null,'opening the selector alone does not save a level');
   await startSelected(1,14);
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
    await page.evaluate(()=>{
     const s=breakoutTest.current.game.inspect();for(const b of s.balls)Object.assign(b,{x:180,y:360,vx:s.speed,vy:0});
     const item=s.drops.at(-1);breakoutTest.step((s.paddle.y-10-item.y)/125+1/240);
    });
   }
   await catchItem('two');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),2);
   await catchItem('two');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),4);
   await catchItem('ten');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),10);
   await catchItem('pierce');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.filter(b=>b.piercing).length),1);
   assert.deepEqual(await page.evaluate(()=>breakoutTest.audio.filter(k=>k==='bonus')),['bonus','bonus','bonus','bonus']);checks++;
   const speed=await page.evaluate(()=>breakoutTest.current.game.inspect().speed);await page.evaluate(()=>breakoutTest.step(2));
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().speed)-speed-4)<.01);checks++;
   await page.evaluate(()=>{breakoutTest.finishStage();breakoutTest.finishStage()});
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().level),3);
   const types=await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.bricks.length,s.bricks.some(b=>b.hp===2),s.bricks.some(b=>b.solid),s.balls[0].piercing]});
   assert.deepEqual(types,[34,true,true,false]);checks++;
   if(width===390){
    await catchItem('pierce');await catchItem('ten');
    await page.evaluate(()=>breakoutTest.step(.24));
    // Capture the real renderer after actual item drops and paddle catches.
    await page.locator('#gov .gbox').screenshot({path:process.env.BREAKOUT_SCREENSHOT||path.join(require('node:os').tmpdir(),'ojjuda-breakout-items-20261006.png')});
   }
   await page.evaluate(()=>breakoutTest.loseRun());await page.locator('#gres').waitFor();
   await assertChoices(3);assert.equal(await savedStage(),'3','the result choices use the actual stage reached from level 1');
   await choices.filter({hasText:'이전 단계'}).click();await assertChoices(3,2);
   assert.equal(await savedStage(),'3','selecting a previous level does not save until Start');
   await startSelected(2,24);checks++;
   await page.evaluate(()=>breakoutTest.close());await page.evaluate(()=>breakoutTest.open());await assertChoices(2);
   await choices.filter({hasText:'다음 단계'}).click();await assertChoices(2,3);
   assert.equal(await savedStage(),'2','selecting a next level does not save until Start');
   await startSelected(3,34);checks++;
   await page.evaluate(()=>breakoutTest.close());await page.evaluate(()=>breakoutTest.open());await assertChoices(3);
   await choices.filter({hasText:'다음 단계'}).click();await assertChoices(3,4);
   await page.evaluate(()=>breakoutTest.close());assert.equal(await page.locator('#gov').count(),0);
   assert.equal(await savedStage(),'3','closing the menu cancels an unstarted selection');
   await page.evaluate(()=>breakoutTest.open());await assertChoices(3);
   await choices.filter({hasText:'지금 단계'}).click();await startSelected(3,34);
   assert.deepEqual(await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting]}),[3,34,0,3,1,true],'closing and reopening World starts a fresh board at the last entered level');checks++;
   await page.reload();await page.waitForFunction(()=>window.breakoutTest);
   await page.evaluate(()=>breakoutTest.open());await assertChoices(3);await startSelected(3,34);
   assert.deepEqual(await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting]}),[3,34,0,3,1,true],'a full page reload also restores the saved level');checks++;
   if(width===390){
    await page.evaluate(()=>{while(breakoutTest.current.game.inspect().level<100)breakoutTest.finishStage();});
    assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().bricks.length),1000);
    await page.locator('#gov .gbox').screenshot({path:path.join(require('node:os').tmpdir(),'ojjuda-breakout-stage100-20261006.png')});
    const metrics=await page.evaluate(()=>{
     const r=breakoutTest.current,g=r.game,s=g.inspect(),brick=s.bricks.find(b=>!b.solid),transform=r.ctx.getTransform(),x=Math.floor((brick.x+brick.w/2)*transform.a+transform.e),y=Math.floor((brick.y+brick.h/2)*transform.d+transform.f);
     const before=Array.from(r.ctx.getImageData(x,y,1,1).data);brick.on=false;g.draw(r.ctx);
     const after=Array.from(r.ctx.getImageData(x,y,1,1).data);
     g.onKey(' ');const times=[];
     for(let i=0;i<180;i++){
      const state=g.inspect();while(state.balls.length<10)state.balls.push({...state.balls[0],id:1000+state.balls.length,contacts:new Set()});
      for(const [j,b] of state.balls.entries())Object.assign(b,{x:24+j*32,y:150+(i%20)*5,vx:j%2?state.speed:-state.speed,vy:-state.speed*.2});
      const start=performance.now();g.update(1/60);g.draw(r.ctx);times.push(performance.now()-start);
     }
     times.sort((a,b)=>a-b);return {before,after,p95:times[Math.floor(times.length*.95)]};
    });
    assert.notDeepEqual(metrics.before,metrics.after,'destroyed bricks disappear from the cached layer');
    assert.ok(metrics.p95<40,'1000-brick, ten-ball update and draw stay within the regression frame budget');
    console.log('1000 bricks / 10 balls: p95 '+metrics.p95.toFixed(2)+' ms');
   }
   await page.evaluate(()=>{while(breakoutTest.current.running)breakoutTest.finishStage()});
   await page.locator('#gres').waitFor();assert.match(await page.locator('#gscreen').innerText(),/100단계 클리어/);
   await assertChoices(100);await startSelected(100,1000);
   assert.deepEqual(await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting]}),[100,1000,0,3,1,true]);
   await page.evaluate(()=>breakoutTest.close());assert.equal(await page.locator('#gov').count(),0);
   assert.deepEqual(errors,[],'no application errors while playing, finishing and restarting');checks++;
   await context.close();
  }
  console.log('PASS: '+checks+' World breakout integration checks; touch/pointer/keyboard, three falling pickups, sound hooks, elapsed-time acceleration, stage growth, steel/tough bricks, previous/current/next selection and cancellation, saved-level reentry/page reload/final restart, and four viewport sizes');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
