const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,s=>s.includes('/world-game-assets.js')||s.includes('/game-entry.js')?s:'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('</head>','<style>@font-face{font-family:"Gowun Dodum";src:url("/qa-font.ttf")}</style></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
window.moleTest={
 open:Al, close:El,
 get current(){return R},
 freeze(){cancelAnimationFrame(R.raf)},
 seed(kind){const random=Math.random;let n=0;Math.random=()=>[0,kind,0][n++%3];try{R.game.update(.61)}finally{Math.random=random}R.game.draw(R.ctx)},
 picture(){const random=Math.random;let values=[0,.5,0,0,.05,0,0,.17,0],n=0;Math.random=()=>values[n++]||0;try{R.game.update(.59);R.game.update(.02);R.game.update(.36);R.game.update(.36)}finally{Math.random=random}R.game.draw(R.ctx)},
 draw(dt=0){if(dt)R.game.update(dt);R.game.draw(R.ctx)},
 audio:[]
};
gt.arcadeHit=()=>moleTest.audio.push('hit');gt.arcadeBonus=()=>moleTest.audio.push('bonus');gt.arcadeBad=()=>moleTest.audio.push('bad');
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
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.moleTest);
  async function open(start=false){await page.evaluate(()=>moleTest.open('mole'));await page.locator('#gov').waitFor();if(start){await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>moleTest.freeze());}}
  async function tap(x,y){const b=await page.locator('#gcv').boundingBox();await page.touchscreen.tap(b.x+x/360*b.width,b.y+y/540*b.height);await page.evaluate(()=>moleTest.draw());}
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]){
   await page.setViewportSize({width,height});await open();
   assert.equal(await page.locator('#gov').getAttribute('data-game'),'mole');assert.equal(await page.locator('.mole-card').count(),1);
   if(width===390){const sound=page.locator('#gov [data-g="sound"]'),before=await sound.innerHTML();await sound.click();assert.notEqual(await sound.innerHTML(),before,'mute changes the native speaker icon');await sound.click();assert.equal(await sound.innerHTML(),before,'unmute restores the speaker icon');}
   assert.ok(await page.locator('#gov [data-g="start"]').isVisible());
   await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>moleTest.freeze());
   const box=await page.locator('#gov .gbox').boundingBox(),canvas=await page.locator('#gcv').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,'garden and controls fit the viewport');
   assert.ok(Math.abs(canvas.width/canvas.height-2/3)<.002,'the targets keep their original proportions');
   await page.evaluate(()=>{moleTest.freeze();moleTest.seed(.5)});
   await tap(60,180);assert.equal(await page.locator('#gsc').textContent(),'1점','a touch hits the visible mole at every size');
   await tap(60,180);assert.equal(await page.locator('#gsc').textContent(),'1점','the hit animation cannot award another point');
   await page.evaluate(()=>moleTest.close());
  }
  await page.setViewportSize({width:390,height:844});
  // The presentation keeps the established score values and sound hooks.
  for(const [kind,score,audio] of [[.5,'1점','hit'],[.05,'3점','bonus'],[.17,'0점','bad']]){
   await open(true);await page.evaluate(k=>moleTest.seed(k),kind);await tap(60,180);
   assert.equal(await page.locator('#gsc').textContent(),score);assert.equal(await page.evaluate(()=>moleTest.audio.at(-1)),audio);
   await page.evaluate(()=>moleTest.close());
  }
  const timing=await page.evaluate(()=>{
   let ended=[],scores=[];const game=OjjudaMoleGame.create({setScore:v=>scores.push(v),end:v=>ended.push(v)});
   game.update(29.99);const before=ended.length;game.update(.02);game.update(1);game.onDown(60,180);return{before,ended,scores};
  });
  assert.deepEqual(timing,{before:0,ended:[0],scores:[]},'the round lasts 30 seconds and finishes once');
  // Capture the real new renderer with all three targets and its hammer effect.
  await open(true);await page.evaluate(()=>moleTest.picture());await tap(180,180);await page.evaluate(()=>moleTest.draw(.08));
  if(process.env.MOLE_PROOF)await page.screenshot({path:process.env.MOLE_PROOF,type:'png'});
  await page.evaluate(()=>moleTest.close());
  await context.close();
  // A failed art request still leaves the established game playable.
  const fallback=await browser.newContext({viewport:{width:390,height:844}});
  await fallback.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});return r.abort();});
  const f=await fallback.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto('https://fixture.test/world.html');await f.waitForFunction(()=>window.moleTest);await f.evaluate(()=>moleTest.open('mole'));
  await f.locator('#gov [data-g="start"]').click();assert.equal(await f.evaluate(()=>moleTest.current.running),true);await fallback.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: garden graphics, four viewport sizes, touch and repeated-hit rules, normal/gold/bomb points and audio, 30-second finish, and offline art fallback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
