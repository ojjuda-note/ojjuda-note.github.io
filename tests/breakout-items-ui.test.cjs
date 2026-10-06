const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
const engine=fs.readFileSync(path.join(root,'games/breakout-game.js'),'utf8').replace('    return game;',`    game.inspect=()=>({balls,bricks,drops,paddle,waiting,finished,completed,lives,score,level,speed,droppedInTurn});
    return game;`);
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,s=>s.includes('/games/breakout-game.js')?s:'')
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
  Object.assign(ball,{x:brick.x+22,y:brick.y+brick.h+6,vx:0,vy:-state.speed});
  const original=Math.random,roll={two:.1,ten:.6,pierce:.9}[kind],queue=state.droppedInTurn?[0,roll]:[roll];
  Math.random=()=>queue.shift()??.99;try{game.update(1/240)}finally{Math.random=original}
  return game.inspect().drops.at(-1);
 },
 finishStage(){
  const game=R.game,s=game.inspect();if(s.waiting)game.onKey(' ');
  const state=game.inspect(),last=state.bricks.filter(b=>b.on&&!b.solid).at(-1);for(const b of state.bricks)if(!b.solid)b.on=b===last;last.hp=1;
  Object.assign(state.balls[0],{x:last.x+22,y:last.y+last.h+6,vx:0,vy:-state.speed});game.update(1/240);game.draw(R.ctx);
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
    if(u.pathname==='/qa-font.ttf'&&fs.existsSync('/root/.local/share/fonts/qa-gowun-dodum.ttf'))return route.fulfill({path:'/root/.local/share/fonts/qa-gowun-dodum.ttf'});
    return route.abort();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.breakoutTest&&window.OjjudaBreakoutGame);
   await page.evaluate(()=>breakoutTest.open());await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>breakoutTest.freeze());
   const canvas=page.locator('#gcv'),box=await canvas.boundingBox(),close=await page.locator('#gov [data-g="close"]').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=height+1);
   assert.ok(close.y>=0&&close.y+close.height<=height,'the exit control stays visible');
   const logicalX=x=>box.x+x/360*box.width,logicalY=y=>box.y+y/540*box.height;
   await page.mouse.move(logicalX(120),logicalY(450));
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-80)<1,'pointer movement maps to the logical paddle');
   await page.keyboard.press('ArrowRight');assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().paddle.x)-110)<1);
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().waiting),true);
   if(width<900)await page.touchscreen.tap(logicalX(180),logicalY(450));else await page.mouse.click(logicalX(180),logicalY(450));
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().waiting),false,'touch or click launches the attached ball');checks++;
   async function catchItem(kind){
    const x=await page.evaluate(kind=>breakoutTest.hit(kind).x,kind);
    await page.mouse.move(logicalX(x),logicalY(450));
    await page.evaluate(()=>{
     const s=breakoutTest.current.game.inspect();for(const b of s.balls)Object.assign(b,{x:180,y:360,vx:s.speed,vy:0});
     const item=s.drops.at(-1);breakoutTest.step((s.paddle.y-10-item.y)/125+1/240);
    });
   }
   await catchItem('two');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),2);
   await catchItem('ten');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.length),10);
   await catchItem('pierce');assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().balls.filter(b=>b.piercing).length),1);
   assert.deepEqual(await page.evaluate(()=>breakoutTest.audio.filter(k=>k==='bonus')),['bonus','bonus','bonus']);checks++;
   const speed=await page.evaluate(()=>breakoutTest.current.game.inspect().speed);await page.evaluate(()=>breakoutTest.step(2));
   assert.ok(Math.abs(await page.evaluate(()=>breakoutTest.current.game.inspect().speed)-speed-10)<.01);checks++;
   await page.evaluate(()=>{breakoutTest.finishStage();breakoutTest.finishStage()});
   assert.equal(await page.evaluate(()=>breakoutTest.current.game.inspect().level),3);
   const types=await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.bricks.length,s.bricks.some(b=>b.hp===2),s.bricks.some(b=>b.solid),s.balls[0].piercing]});
   assert.deepEqual(types,[15,true,true,false]);checks++;
   if(width===390){
    await catchItem('pierce');await catchItem('ten');
    await page.evaluate(()=>breakoutTest.step(.24));
    // Capture the real renderer after actual item drops and paddle catches.
    await page.locator('#gov .gbox').screenshot({path:process.env.BREAKOUT_SCREENSHOT||'/workspace/scratch/ojjuda-breakout-items-20261006.png'});
   }
   await page.evaluate(()=>{while(breakoutTest.current.running)breakoutTest.finishStage()});
   await page.locator('#gres').waitFor();assert.match(await page.locator('#gscreen').innerText(),/100단계 클리어/);
   await page.locator('#gscreen [data-g="start"]').click();await page.evaluate(()=>breakoutTest.freeze());
   assert.deepEqual(await page.evaluate(()=>{const s=breakoutTest.current.game.inspect();return[s.level,s.bricks.length,s.score,s.lives,s.balls.length,s.waiting]}),[1,14,0,3,1,true]);
   await page.evaluate(()=>breakoutTest.close());assert.equal(await page.locator('#gov').count(),0);
   assert.deepEqual(errors,[],'no application errors while playing, finishing and restarting');checks++;
   await context.close();
  }
  console.log('PASS: '+checks+' World breakout integration checks; touch/pointer/keyboard, three falling pickups, sound hooks, elapsed-time acceleration, stage growth, steel/tough bricks, completion/restart, and four viewport sizes');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
