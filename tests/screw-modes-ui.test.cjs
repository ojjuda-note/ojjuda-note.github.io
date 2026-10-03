const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame=window.ScrewBoxFixture;');
world=world.replace('<script type="module">','<script src="/fixture-box.js"></script><script src="/screw-flat.js"></script><script src="/world-navigation.js"></script><script type="module">');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.screwWorld={open:Al,close:El,current:()=>R};g.tab='friends';H();`+world.slice(world.indexOf('</script>',boot));
const box='(function(){'+read('screw3d.js').replace(/export \{[^}]*\};/,'')+'window.ScrewBoxFixture=screw3d;})();';
const qa=process.env.SCREW_MODES_QA_DIR;if(qa)fs.mkdirSync(qa,{recursive:true});
const font=process.env.SCREW_QA_FONT;
if(font)world=world.replace('</head>','<style>@font-face{font-family:"Noto Sans KR";src:url("/fixture-korean.ttf")}body,button{font-family:"Noto Sans KR",sans-serif}</style></head>');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(u.pathname==='/fixture-box.js')return route.fulfill({contentType:'text/javascript',body:box});
   if(u.pathname==='/fixture-korean.ttf'&&font)return route.fulfill({contentType:'font/ttf',path:font});
   const file=path.join(root,u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.screwWorld);
  if(font)await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>{localStorage.setItem('ojjuda-screw-stage','5');localStorage.removeItem(OjjudaScrewGames.STAGE_KEY)});
  for(const size of [{width:320,height:568},{width:390,height:844},{width:1280,height:900}]){
   await page.setViewportSize(size);await page.evaluate(()=>screwWorld.open('screw'));
   assert.equal(await page.locator('[data-g=screw-start]').count(),2,'the existing game opens exactly two version choices');
   assert.equal(await page.evaluate(()=>screwWorld.current().running),false,'the chooser does not start a game');
   assert.equal(await page.locator('[data-g=screw-modes]').isVisible(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   for(const mode of ['box','flat']){
    const button=page.locator(`[data-g=screw-start][data-mode=${mode}]`);await button.scrollIntoViewIfNeeded();
    const b=await button.boundingBox();assert.ok(b.width>150 && b.height>80,'both version choices are substantial touch targets');
    assert.ok(b.x>=0 && b.x+b.width<=size.width && b.y>=0 && b.y+b.height<=size.height,'both choices remain reachable on the screen');
   }
   if(qa&&size.width===390)await page.locator('#gov').screenshot({path:path.join(qa,'screw-version-menu.png')});
   await page.locator('[data-mode=flat]').click();
   await page.waitForFunction(()=>screwWorld.current()?.game?.state);
   assert.equal(await page.locator('#gov').getAttribute('data-screw-mode'),'flat');
   assert.match(await page.locator('.ghead .gt').innerText(),/평면형/);
   assert.equal(await page.locator('.ghead').evaluate(el=>el.scrollWidth<=el.clientWidth),true,'mode title, score and controls fit the phone header');
   assert.equal(await page.locator('[data-g=screw-modes]').isVisible(),true);
   if(qa&&size.width===390)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-covered.png')});
   await page.locator('[data-g=screw-modes]').click();
   await page.locator('[data-mode=box]').click();
   assert.equal(await page.evaluate(()=>window.__ojjScrew3d.L),5,'the box version keeps the pre-existing stage');
   assert.match(await page.locator('.ghead .gt').innerText(),/박스형/);
   assert.equal(await page.locator('.ghead').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
   await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
   assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),1,'switching versions never overwrites flat progress');
   await page.locator('[data-g=close]').click();assert.equal(await page.locator('#gov').count(),0);
  }
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>screwWorld.open('screw'));await page.locator('[data-mode=flat]').click();
  const ids=await page.evaluate(()=>screwWorld.current().game.state.level.solution.slice());
  const canvas=page.locator('#gcv');
  for(const id of ids){
   const q=await page.evaluate(id=>{const level=screwWorld.current().game.state.level,s=level.screws[id];if(!OjjudaScrewGames.canUnscrew(level,s))throw Error('Blocked solution screw');return OjjudaScrewGames.screwPoint(s)},id);
   const b=await canvas.boundingBox();await page.touchscreen.tap(b.x+q.x*b.width/360,b.y+q.y*b.height/540);
   assert.notEqual(await page.evaluate(id=>screwWorld.current().game.state.level.screws[id].state,id),'in','a real phone touch removes the visible screw');
   await page.evaluate(()=>{const r=screwWorld.current();for(let n=0;n<36;n++)r.game.update(.05);r.game.draw(r.ctx)});
  }
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.complete),true,'touch play removes every plate and reveals the picture');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-revealed.png')});
  await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),2);
  await page.locator('[data-g=screw-modes]').click();await page.locator('[data-mode=flat]').click();
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),2,'reopening continues the flat version independently');
  // Every picture renderer executes, including later stages outside the tutorial.
  for(let stage=1;stage<=6;stage++)await page.evaluate(stage=>{
   localStorage.setItem(OjjudaScrewGames.STAGE_KEY,String(stage));
   const game=OjjudaScrewGames.flat({setScore(){},end(){}});game.state.level.plates.forEach(p=>p.state='gone');game.draw(screwWorld.current().ctx);game.destroy();
  },stage);
  assert.deepEqual(errors,[]);
  console.log('PASS: existing game chooser, both versions at 320/390/1280px, preserved box progress, actual touch completion, revealed artwork, all six pictures and independent flat continuation.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
