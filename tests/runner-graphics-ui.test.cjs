const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,s=>s.includes('/games/runner-game.js')?s:'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('</head>','<style>@font-face{font-family:"Gowun Dodum";src:url("/qa-font.ttf")}</style></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
window.runnerTest={
 open:Al,close:El,get current(){return R},audio:[],
 freeze(){cancelAnimationFrame(R.raf)},
 step(n=1){for(let i=0;i<n&&R.running;i++)R.game.update(1/120);R.game.draw(R.ctx)},
 compare(){
  function run(factory,seed,pattern){
   let scores=[],ended=[],audio=[],n=0,random=seed;const original=Math.random;
   Math.random=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296};
   const oldTap=gt.arcadeTap,oldHit=gt.arcadeHit;gt.arcadeTap=()=>audio.push('tap');gt.arcadeHit=()=>audio.push('hit');
   const game=factory({setScore:v=>scores.push(v),end:v=>ended.push(v),sound:{tap:()=>audio.push('tap'),hit:()=>audio.push('hit')}});
   try{for(;n<3600&&!ended.length;n++){if(pattern(n))game.onDown();game.update(1/120);if(n%19===0)game.draw(R.ctx)}}
   finally{Math.random=original;gt.arcadeTap=oldTap;gt.arcadeHit=oldHit}
   return{scores,ended,audio,steps:n};
  }
  let results=[];
  for(const seed of [1,7,55,188,2026,92837])for(const pattern of [n=>false,n=>n%72===0,n=>n%110===0||n%110===23]){
   const old=run(H2,seed,pattern),fresh=run(OjjudaRunnerGame.create,seed,pattern);results.push({same:JSON.stringify(old)===JSON.stringify(fresh),seed,steps:old.steps,coins:old.audio.filter(v=>v==='hit').length,ended:old.ended.length});
  }
  return results;
 }
};
gt.arcadeTap=()=>runnerTest.audio.push('tap');gt.arcadeHit=()=>runnerTest.audio.push('hit');
g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,deviceScaleFactor:2});
  const errors=[];
  await context.route('**/*',r=>{
   const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();
   if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});
   if(u.pathname==='/qa-font.ttf'){const font='/root/.local/share/fonts/qa-gowun-dodum.ttf';return fs.existsSync(font)?r.fulfill({path:font}):r.abort();}
   const file=path.join(root,u.pathname);if(file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return r.fulfill({path:file});return r.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.runnerTest);
  async function open(start=false){await page.evaluate(()=>runnerTest.open('runner'));await page.locator('#gov').waitFor();if(start){await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>runnerTest.freeze());}}
  async function tap(){const b=await page.locator('#gcv').boundingBox();await page.touchscreen.tap(b.x+b.width*.55,b.y+b.height*.6);}
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]){
   await page.setViewportSize({width,height});await open();
   assert.equal(await page.locator('#gov').getAttribute('data-game'),'runner');assert.equal(await page.locator('.runner-card').count(),1);
   const box=await page.locator('#gov .gbox').boundingBox(),canvas=await page.locator('#gcv').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,'the scene and controls fit the viewport');
   assert.ok(Math.abs(canvas.width/canvas.height-2/3)<.002,'the character and collision geometry keep their proportions');
   const start=page.locator('#gov [data-g="start"]');assert.ok(await start.isVisible());await start.click();await page.evaluate(()=>{runnerTest.freeze();runnerTest.audio=[]});
   await tap();await tap();await tap();assert.deepEqual(await page.evaluate(()=>runnerTest.audio),['tap','tap'],'touch allows exactly two jumps at every size');
   await page.evaluate(()=>runnerTest.close());
  }
  await page.setViewportSize({width:390,height:844});await open(true);
  const sound=page.locator('#gov [data-g="sound"]'),before=await sound.innerHTML();assert.match(before,/<svg/);await sound.click();assert.notEqual(await sound.innerHTML(),before);await sound.click();assert.equal(await sound.innerHTML(),before);
  await page.evaluate(()=>{runnerTest.audio=[]});
  await page.keyboard.press('ArrowUp');await page.keyboard.press('Space');await page.keyboard.press('w');
  assert.deepEqual(await page.evaluate(()=>runnerTest.audio),['tap','tap'],'keyboard shares the two-jump limit');
  await page.evaluate(()=>runnerTest.step(95));await page.keyboard.press('ArrowUp');
  assert.equal(await page.evaluate(()=>runnerTest.audio.filter(v=>v==='tap').length),3,'landing restores the jump count');
  const comparison=await page.evaluate(()=>runnerTest.compare());
  assert.equal(comparison.length,18);assert.ok(comparison.every(v=>v.same),'seeded play matches the original collisions, gravity, spawn timing, speed, points and sound hooks');
  assert.ok(comparison.some(v=>v.coins>0),'the comparison exercises coin pickups');assert.ok(comparison.some(v=>v.ended>0),'the comparison exercises obstacle collisions');
  const ended=await page.evaluate(()=>{
   let calls=[],scores=[];const game=OjjudaRunnerGame.create({setScore:v=>scores.push(v),end:v=>calls.push(v)});
   for(let n=0;n<800&&!calls.length;n++)game.update(1/120);
   const count=scores.length;game.update(1);game.onDown();game.update(1);game.destroy();game.onDown();return{calls: calls.length,stopped:count===scores.length};
  });assert.deepEqual(ended,{calls:1,stopped:true},'collision finishes once and teardown cannot keep scoring');
  await page.evaluate(()=>runnerTest.close());await open(true);
  // Capture an actual jump while obstacles and coins approach on the lane.
  await page.evaluate(()=>{const random=Math.random;Math.random=()=>.7;try{runnerTest.step(179);runnerTest.current.game.onDown();runnerTest.step(15)}finally{Math.random=random}});
  if(process.env.RUNNER_PROOF)await page.screenshot({path:process.env.RUNNER_PROOF,type:'png'});
  await page.evaluate(()=>runnerTest.close());await context.close();
  const fallback=await browser.newContext({viewport:{width:390,height:844}});
  await fallback.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});return r.abort();});
  const f=await fallback.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto('https://fixture.test/world.html');await f.waitForFunction(()=>window.runnerTest);await f.evaluate(()=>runnerTest.open('runner'));
  await f.locator('#gov [data-g="start"]').click();assert.equal(await f.evaluate(()=>runnerTest.current.running),true,'the original runner remains playable if graphics fail to load');await fallback.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: park graphics, four viewports, touch/keyboard double jumps and landing, mute, 18 seeded comparisons with the original runner, collision finish, and graphics fallback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
