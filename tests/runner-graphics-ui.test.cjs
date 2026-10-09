const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,s=>s.includes('/world-game-assets.js')||s.includes('/game-entry.js')?s:'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
// The new character has a 36-pixel torso; compare the original physics at that body width.
world=world.replace('let v=72,B=94,j=440+i', 'let v=65,B=101,j=440+i');
world=world.replace('</head>','<style>@font-face{font-family:"Gowun Dodum";src:url("/qa-font.ttf")}</style></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
window.runnerTest={
 open:Al,close:El,baseline:H2,get current(){return R},audio:[],
 freeze(){cancelAnimationFrame(R.raf)},
 step(n=1){for(let i=0;i<n&&R.running;i++)R.game.update(1/120);R.game.draw(R.ctx)},
 compare(){
  function run(factory,seed,pattern){
   let scores=[],ended=[],audio=[],n=0,random=seed;const original=Math.random;
   Math.random=()=>{random=(random*1664525+1013904223)>>>0;return random/4294967296};
   const oldTap=gt.arcadeTap,oldHit=gt.arcadeHit;gt.arcadeTap=()=>audio.push('tap');gt.arcadeHit=()=>audio.push('hit');
   const game=factory({setScore:v=>scores.push(v),end:v=>ended.push(v),sound:{tap:()=>audio.push('tap'),hit:()=>audio.push('hit')}});
   // Compare the unchanged opening before birds enter; their independent cycle is tested below.
   try{for(;n<280&&!ended.length;n++){if(pattern(n))game.onDown();game.update(1/120);if(n%19===0)game.draw(R.ctx)}}
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
  const page=await context.newPage(),artRequests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/games/assets/runner-v2-'))artRequests.push(r.url())});await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.runnerTest);
  assert.deepEqual(artRequests,[],'opening World does not download game artwork');await page.evaluate(()=>OjjudaGameAssets.load('runner'));await page.evaluate(()=>OjjudaRunnerGame.ready);assert.deepEqual(await page.evaluate(()=>OjjudaRunnerGame.ready),[true,true],'both original artwork files load when needed');assert.equal(artRequests.length,2);
  async function open(start=false){await page.evaluate(()=>runnerTest.open('runner'));await page.locator('#gov').waitFor();if(start){await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{runnerTest.freeze();resolve()})));}}
  async function tap(){const b=await page.locator('#gcv').boundingBox();await page.touchscreen.tap(b.x+b.width*.55,b.y+b.height*.6);}
  for(const [width,height] of [[320,568],[390,844],[844,390],[1280,900]]){
   await page.setViewportSize({width,height});await open();
   assert.equal(await page.locator('#gov').getAttribute('data-game'),'runner');assert.equal(await page.locator('.runner-card').count(),1);
   await page.locator('#gov [data-g="start"]').click();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>{runnerTest.freeze();resolve()})));
   const box=await page.locator('#gov .gbox').boundingBox(),canvas=await page.locator('#gcv').boundingBox();
   assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,'the scene and controls fit the viewport');
   const bitmap=await page.locator('#gcv').evaluate(c=>({width:c.width,height:c.height}));
   assert.ok(Math.abs(canvas.width/canvas.height-bitmap.width/bitmap.height)<.002,'the canvas adapts to the display without stretching the character');
   assert.ok(canvas.height>height-90,'the game uses the available screen height');
   await page.evaluate(()=>{runnerTest.freeze();runnerTest.audio=[]});
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
  const camera=await page.evaluate(()=>{
   const game=OjjudaRunnerGame.create({setScore(){},end(){}}),ctx=runnerTest.current.ctx,draw=ctx.drawImage,poses=[];
   ctx.drawImage=function(img,...args){if(img.src?.includes('runner-v2-sprites')){const m=this.getTransform(),dpr=Math.min(2,devicePixelRatio||1);poses.push({top:(m.d*args[5]+m.f)/dpr,bottom:(m.d*(args[5]+args[7])+m.f)/dpr});}return draw.call(this,img,...args)};
   try{game.onDown();for(let n=0;n<40;n++)game.update(1/120);game.onDown();for(let n=0;n<45;n++){game.update(1/120);game.draw(ctx)}}finally{ctx.drawImage=draw;game.destroy()}
   return{count:poses.length,visible:poses.every(p=>p.top>65&&p.bottom<ctx.canvas.height/Math.min(2,devicePixelRatio||1))};
  });
  assert.equal(camera.count,45);assert.ok(camera.visible,'the camera keeps the second jump visible below the score display');
  const warning=await page.evaluate(()=>{
   const ctx=runnerTest.current.ctx,rect=ctx.fillRect,ellipse=ctx.ellipse,random=Math.random,frames=[],sizes=[],baseline=runnerTest.baseline;
   Math.random=()=>.7;
   try{for(const factory of [baseline,OjjudaRunnerGame.create]){
    let frame=0,first=null;const game=factory({setScore(){},end(){}});
    ctx.fillRect=function(x,y,w,h){if(factory===baseline&&w===6&&h===28&&y===412&&x-12<360&&first===null)first=frame;return rect.call(this,x,y,w,h)};
    ctx.ellipse=function(x,y,rx,ry,...args){if(factory!==baseline&&x===15&&y===442&&Math.abs(rx-19.2)<.001&&ry===3){const m=this.getTransform(),dpr=Math.min(2,devicePixelRatio||1),left=m.e/dpr;if(left<360&&first===null)first=frame;if(left>=80&&left<360)sizes.push({x:left,width:30*m.a/dpr,height:28*m.d/dpr});}return ellipse.call(this,x,y,rx,ry,...args)};
    for(;frame<320;frame++){game.update(1/120);game.draw(ctx)}frames.push(first);game.destroy?.();
   }}finally{ctx.fillRect=rect;ctx.ellipse=ellipse;Math.random=random}return{frames,sizes};
  });
  assert.ok(warning.frames.every(Number.isInteger),JSON.stringify(warning.frames));assert.equal(warning.frames[0],warning.frames[1],'the first obstacle keeps the original warning time');
  assert.ok(warning.sizes.length>40&&warning.sizes.some(s=>s.x<110),'obstacle size is checked from the screen edge to the character');
  assert.ok(warning.sizes.every(s=>Math.abs(s.width-30)<.001&&Math.abs(s.height-28)<.001),'obstacles keep the same width and height as they approach');
  const comparison=await page.evaluate(()=>runnerTest.compare());
  assert.equal(comparison.length,18);assert.ok(comparison.every(v=>v.same),'seeded play preserves original physics, spawns, points and sound at the new visible body width');
  assert.ok(comparison.some(v=>v.coins>0),'the comparison exercises coin pickups');assert.ok(comparison.some(v=>v.ended>0),'the comparison exercises obstacle collisions');
  const birds=await page.evaluate(()=>{
   const ctx=runnerTest.current.ctx,ellipse=ctx.ellipse,curve=ctx.quadraticCurveTo,random=Math.random,sizes=[],flaps=[];let both=false,drawn;
   Math.random=()=>.9;
   function play(jump,frames,measure=false){
    const calls=[],scores=[],game=OjjudaRunnerGame.create({setScore:v=>scores.push(v),end:v=>calls.push(v)});
    if(measure){
     ctx.ellipse=function(x,y,rx,ry,...args){const m=this.getTransform(),dpr=Math.min(2,devicePixelRatio||1),left=m.e/dpr;if(left>=0&&left<360){if(x===15&&y===442&&Math.abs(rx-19.2)<.001&&ry===3)drawn.ground=true;if(x===10&&y===10&&rx===7&&ry===7){drawn.bird=true;if(left>=20)sizes.push({x:left,y:m.f/dpr,width:38*m.a/dpr,height:28*m.d/dpr});}}return ellipse.call(this,x,y,rx,ry,...args)};
     ctx.quadraticCurveTo=function(cx,cy,x,y){if(cx===16&&cy===13&&x===24)flaps.push(y);return curve.call(this,cx,cy,x,y)};
    }
    try{for(let n=0;n<frames&&!calls.length;n++){if(jump(n))game.onDown();game.update(1/120);if(measure&&n%4===0){drawn={ground:false,bird:false};game.draw(ctx);both=both||(drawn.ground&&drawn.bird);}}
     const count=scores.length;if(calls.length){game.update(1);game.onDown();game.update(1);}return{ends:calls.length,stopped:!calls.length||scores.length===count};
    }finally{game.destroy();ctx.ellipse=ellipse;ctx.quadraticCurveTo=curve;}
   }
   function flight(flightRoll){
    let frame=0;const positions=[];Math.random=()=>frame>=285&&frame<=292?flightRoll:.9;
    const game=OjjudaRunnerGame.create({setScore(){},end(){}});
    ctx.ellipse=function(x,y,rx,ry,...args){if(x===10&&y===10&&rx===7&&ry===7){const left=this.getTransform().e/Math.min(2,devicePixelRatio||1);if(left>=20&&left<360)positions.push({frame,left});}return ellipse.call(this,x,y,rx,ry,...args)};
    try{for(;frame<420;frame++){if(frame===210)game.onDown();game.update(1/120);game.draw(ctx)}
     const first=positions[0],last=positions.at(-1);return{samples:positions.length,speed:(first.left-last.left)*120/(last.frame-first.frame)};
    }finally{game.destroy();ctx.ellipse=ellipse;Math.random=()=>.9;}
   }
   try{return{under:play(n=>n===210,480,true),contact:play(n=>n===210||n===390,450),over:play(n=>n===210||n===365||n===374,480),sizes,flaps,both,slow:flight(.1),fast:flight(.9)};}
   finally{Math.random=random;ctx.ellipse=ellipse;ctx.quadraticCurveTo=curve;}
  });
  assert.equal(birds.under.ends,0,'running beneath flying birds is safe');assert.equal(birds.over.ends,0,'a timed double jump can clear a bird');
  assert.deepEqual(birds.contact,{ends:1,stopped:true},'touching a bird in midair ends the game once');
  assert.equal(birds.both,true,'flying birds and ground obstacles appear together on separate spawn cycles');
  assert.ok(birds.sizes.length>25&&birds.sizes.some(s=>s.x<90),'birds are measured from the right edge through the player');
  assert.ok(birds.sizes.every(s=>Math.abs(s.width-38)<.001&&Math.abs(s.height-28)<.001),'approaching birds keep their dimensions');
  assert.ok(Math.max(...birds.sizes.map(s=>s.y))-Math.min(...birds.sizes.map(s=>s.y))<.001,'birds keep a steady flight height');
  assert.ok(birds.flaps.some(y=>y<5)&&birds.flaps.some(y=>y>9),'the wings flap while the bird body stays steady');
  assert.ok(birds.slow.samples>50&&birds.fast.samples>50&&birds.fast.speed>birds.slow.speed*1.2,'each bird receives its own randomized flight speed');
  const ended=await page.evaluate(()=>{
   let calls=[],scores=[];const game=OjjudaRunnerGame.create({setScore:v=>scores.push(v),end:v=>calls.push(v)});
   for(let n=0;n<800&&!calls.length;n++)game.update(1/120);
   const count=scores.length;game.update(1);game.onDown();game.update(1);game.destroy();game.onDown();return{calls: calls.length,stopped:count===scores.length};
  });assert.deepEqual(ended,{calls:1,stopped:true},'collision finishes once and teardown cannot keep scoring');
  await page.evaluate(()=>runnerTest.close());await open(true);
  // Capture an actual jump while obstacles and coins approach on the lane.
  await page.evaluate(()=>{const random=Math.random;Math.random=()=>.7;try{runnerTest.step(179);runnerTest.current.game.onDown();runnerTest.step(15)}finally{Math.random=random}});
  if(process.env.RUNNER_PROOF)await page.screenshot({path:process.env.RUNNER_PROOF,type:'png'});
  if(process.env.RUNNER_BIRD_PROOF){
   await page.evaluate(()=>runnerTest.close());await open(true);
   await page.evaluate(()=>{const random=Math.random;Math.random=()=>.9;try{runnerTest.step(210);runnerTest.current.game.onDown();runnerTest.step(210)}finally{Math.random=random}});
   await page.screenshot({path:process.env.RUNNER_BIRD_PROOF,type:'png'});
  }
  await page.evaluate(()=>runnerTest.close());await open();if(process.env.RUNNER_MENU_PROOF)await page.screenshot({path:process.env.RUNNER_MENU_PROOF,type:'png'});
  await page.evaluate(()=>runnerTest.close());await context.close();
  const missingArt=await browser.newContext({viewport:{width:390,height:844}});
  await missingArt.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});if(u.pathname.includes('/games/assets/'))return r.abort();const file=path.join(root,u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?r.fulfill({path:file}):r.abort();});
  const a=await missingArt.newPage();a.on('pageerror',e=>errors.push(e.message));await a.goto('https://fixture.test/world.html');await a.waitForFunction(()=>window.runnerTest);
  await a.evaluate(()=>OjjudaGameAssets.load('runner'));assert.deepEqual(await a.evaluate(()=>OjjudaRunnerGame.ready),[false,false]);await a.evaluate(()=>runnerTest.open('runner'));await a.locator('#gov [data-g="start"]').click();
  assert.equal(await a.evaluate(()=>runnerTest.current.running),true,'missing image files do not block starting the game');await missingArt.close();
  const fallback=await browser.newContext({viewport:{width:390,height:844}});
  await fallback.route('**/*',r=>{const u=new URL(r.request().url());if(u.pathname==='/world.html')return r.fulfill({contentType:'text/html',body:world});return r.abort();});
  const f=await fallback.newPage();f.on('pageerror',e=>errors.push(e.message));await f.goto('https://fixture.test/world.html');await f.waitForFunction(()=>window.runnerTest);await f.evaluate(()=>runnerTest.open('runner'));
  await f.locator('#gov [data-g="start"]').click();assert.equal(await f.evaluate(()=>runnerTest.current.running),true,'the original runner remains playable if graphics fail to load');await fallback.close();
  assert.deepEqual(errors,[]);
  console.log('PASS: independent bird and ground spawn cycles, randomized bird speeds, steady flight dimensions, wing animation, safe passage underneath, double-jump clearance, air collision, four viewports, touch/keyboard controls, 18 opening comparisons, and graphics fallback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
