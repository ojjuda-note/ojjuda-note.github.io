const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'');
world=world.replace('<script type="module">','<link rel="stylesheet" href="/screw-games.css"><script src="/mobile-viewport.js"></script><script src="/screw-loader.js"></script><script src="/world-navigation.js"></script><script src="/game-results.js"></script><script type="module">');
assert.equal(world.split('R.game=factory({').length,2);
world=world.replace('R.game=factory({','R.game=((api)=>factory(api,window.screwFixtureStage))({');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.screwWorld={open:Al,close:El,current:()=>R,
 member(){D.online=true;D.user={id:'fixture-member'};D.isAdmin=false;},
 openFlat(stage){
  El();D.online=true;D.user={id:'fixture-member'};D.isAdmin=false;window.screwFixtureStage=stage;
  Al('screw',{screwMode:'flat'});
 }
};g.tab='friends';H();`+world.slice(world.indexOf('</script>',boot));
const qa=process.env.SCREW_MODES_QA_DIR;if(qa)fs.mkdirSync(qa,{recursive:true});
const font=process.env.SCREW_QA_FONT;
if(font)world=world.replace('</head>','<style>@font-face{font-family:"Noto Sans KR";src:url("/fixture-korean.ttf")}body,button{font-family:"Noto Sans KR",sans-serif}</style></head>');
const screens=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:344,height:882},{width:1280,height:900},{width:1920,height:1080}];

async function canvasTap(page,point){
 const canvas=page.locator('#gcv'),r=await canvas.boundingBox();
 assert.ok(r&&r.width>0&&r.height>0,'the game canvas is visible');
 await page.touchscreen.tap(r.x+point.x*r.width/360,r.y+point.y*r.height/540);
}
async function checkFlatControls(page,cdp){
 const r=await page.locator('#gcv').boundingBox();
 const point=(x,y,id)=>({x:r.x+x*r.width/360,y:r.y+y*r.height/540,id});
 const fingers=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const view=()=>page.evaluate(()=>screwWorld.current().game.state.view.zoom);
 await fingers('touchStart',[point(148,314,1),point(212,314,2)]);
 await fingers('touchMove',[point(111,314,1),point(249,314,2)]);
 assert.ok(await view()>1.8,'spreading two fingers zooms the board');
 await fingers('touchMove',[point(148,314,1),point(212,314,2)]);
 await fingers('touchEnd',[]);
 assert.ok(await view()<1.03,'pinching back restores the original view');
 assert.equal(await page.evaluate(()=>screwWorld.current().game.state.selected),null);
 await page.mouse.move(r.x+r.width/2,r.y+r.height*.55);
 await page.mouse.wheel(0,-150);await page.waitForFunction(()=>screwWorld.current().game.state.view.zoom>1.2);
 const beforePan=await page.evaluate(()=>screwWorld.current().game.state.view.x);
 await fingers('touchStart',[point(180,314,3)]);await fingers('touchMove',[point(216,314,3)]);await fingers('touchEnd',[]);
 assert.ok(await page.evaluate(()=>screwWorld.current().game.state.view.x)<beforePan,'the zoomed board pans');
 await page.mouse.wheel(0,180);await page.waitForFunction(()=>screwWorld.current().game.state.view.zoom===1);
 const zoomButtons=page.locator('[data-g=screw-zoom-in]');
 if(await zoomButtons.isVisible()){
   await zoomButtons.tap();await page.waitForFunction(()=>screwWorld.current().game.state.view.zoom>1);
   await page.locator('[data-g=screw-zoom-reset]').tap();await page.waitForFunction(()=>screwWorld.current().game.state.view.zoom===1);
 }
 await canvasTap(page,{x:224,y:26});assert.ok(await view()>1);
 const move=await page.evaluate(()=>{
   const g=screwWorld.current().game,level=g.state.level;
   const screw=level.screws.find(s=>{
     const q=g.screenPoint(s.hole);
     return q.x>35&&q.x<325&&q.y>155&&q.y<474&&OjjudaScrewGames.canUnscrew(level,s);
   });
   const target=level.holes.find(h=>h.owner===null&&h.screw===null);
   return{id:screw.id,from:g.screenPoint(screw.hole),home:screw.hole.id,to:g.screenPoint(target),target:target.id};
 });
 await canvasTap(page,move.from);
 assert.deepEqual(await page.evaluate(({id})=>{
   const st=screwWorld.current().game.state;
   return [st.selected,st.level.screws[id].hole.id,st.moves,st.pending];
 },move),[move.id,move.home,0,null],'selection leaves the pin and plate in place');
 await page.evaluate(()=>{
   document.querySelector('#gcv').addEventListener('pointerup',()=>{
     const st=screwWorld.current().game.state;
     window.lastFlatMove=[st.moves,st.pending?.kind,st.selected];
   },{once:true});
 });
 await canvasTap(page,move.to);
 assert.deepEqual(await page.evaluate(()=>window.lastFlatMove),[1,'transfer',null],'the second tap starts one flight');
 await page.waitForFunction(()=>!screwWorld.current().game.state.pending);
 assert.equal(await page.evaluate(id=>screwWorld.current().game.state.level.screws[id].hole.id,move.id),move.target);
 await canvasTap(page,{x:258,y:26});assert.equal(await view(),1);
}
async function assertFullscreen(page,size){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 for(const selector of ['#gov','#gov > .gbox']){
  const r=await page.locator(selector).boundingBox();
  assert.ok(r&&Math.abs(r.x)<1&&Math.abs(r.y)<1&&Math.abs(r.width-size.width)<1&&Math.abs(r.height-size.height)<1,`${selector} fills ${size.width}×${size.height}`);
 }
 const canvas=await page.locator('#gcv').boundingBox(),head=await page.locator('#gov .ghead').boundingBox();
 assert.ok(canvas&&head&&canvas.width>0&&canvas.height>0);
 assert.ok(Math.abs(canvas.width/canvas.height-2/3)<.004,'phone and desktop keep the puzzle proportions');
 assert.ok(canvas.x>=-1&&canvas.x+canvas.width<=size.width+1&&canvas.y>=head.y+head.height-1&&canvas.y+canvas.height<=size.height+1,'the board stays on screen');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
}

(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({body:world,contentType:'text/html'});
   if(url.pathname==='/fixture-korean.ttf'&&font)return route.fulfill({path:font,contentType:'font/ttf'});
   const file=path.join(root,url.pathname);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage(),errors=[],engineRequests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{const p=new URL(request.url()).pathname;if(/(?:matter-0|screw3d|screw-flat(?:-physics|-pictures)?\.js)/.test(p))engineRequests.push(p);});
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.screwWorld);
  await page.evaluate(()=>localStorage.setItem('ojjuda-screw-flat-stage-v1','1000'));
  assert.deepEqual(engineRequests,[],'the arcade initially loads no screw engines');
  await page.evaluate(()=>{screwWorld.member();window.screwFixtureStage=4;screwWorld.open('screw');});
  assert.equal(await page.locator('[data-g=screw-start]').count(),2,'both modes are named');
  assert.ok(await page.locator('[data-mode=box]').isEnabled(),'box mode is open');
  assert.ok(await page.locator('[data-mode=flat]').isEnabled(),'flat mode is open to members');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-version-menu.png')});
  assert.deepEqual(engineRequests,[],'choosing a mode is lazy');
  await page.locator('[data-mode=flat]').click();
  await page.waitForFunction(()=>window.screwWorld.current()?.game?.state?.L===4);
  assert.equal(await page.locator('[data-g=screw-stages]').isVisible(),true,'the stage catalog is always available from the game header');
  assert.equal((await page.locator('[data-g=screw-stages]').textContent()).trim(),'단계 선택','the header labels the stage selector clearly');
  await page.locator('[data-g=screw-stages]').click();
  assert.equal(await page.locator('[data-g=screw-stage]').count(),25,'the stage catalog shows 25 stages per page');
  await page.locator('[data-g=screw-stage-back]').click();
  await page.waitForFunction(()=>window.screwWorld.current()?.running===true);
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.L),4);
  assert.equal(await page.locator('#gov').getAttribute('data-screw-mode'),'flat');
  assert.equal(engineRequests.some(p=>p.includes('screw3d')),false,'flat play never loads the box engine');

  const cdp=await context.newCDPSession(page);
  for(const size of screens){
   await page.setViewportSize(size);
   await page.evaluate(()=>screwWorld.openFlat(6));
   await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===6);
   await assertFullscreen(page,size);await checkFlatControls(page,cdp);
   if(qa)await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-${size.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  await page.locator('[data-g=screw-stages]').click();
  await page.locator('[data-g=screw-modes]').click();
  await page.evaluate(()=>screwWorld.openFlat(26));
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===26);
  await page.locator('[data-g=screw-stages]').click();
  assert.equal(await page.locator('[data-g=screw-stage][data-stage="26"]').count(),1,'the catalog opens on the remembered stage page');
  await page.locator('[data-g=screw-stage][data-stage="26"]').click();
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===26);
  await canvasTap(page,{x:224,y:26});
  assert.ok(await page.evaluate(()=>screwWorld.current().game.state.view.zoom>1),'small screws can be magnified');
  await canvasTap(page,{x:258,y:26});
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.view.zoom),1);
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-zoom-26.png')});

  await page.locator('[data-g=screw-stages]').click();
  await page.locator('[data-g=screw-modes]').click();
  await page.evaluate(()=>screwWorld.openFlat(1000));
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===1000);
  await page.locator('[data-g=screw-stages]').click();
  assert.equal(await page.locator('[data-g=screw-stage][data-stage="1000"]').count(),1,'the last page opens automatically for the remembered stage');
  await page.locator('[data-g=screw-stage][data-stage="1000"]').click();
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===1000);
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.screws.length),32);
  await assertFullscreen(page,{width:390,height:844});
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-1000.png')});

  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-g=close]').click();
  if(await page.locator('[data-exit-leave]').isVisible())await page.locator('[data-exit-leave]').click();
  await page.locator('#gov').waitFor({state:'detached'});
  await page.evaluate(()=>screwWorld.open('screw',{screwMode:'box'}));
  await page.waitForFunction(()=>screwWorld.current()?.screwMode==='box'&&screwWorld.current()?.game);
  assert.equal(await page.locator('#gov').count(),1,'a direct box link is still available');
  assert.equal(engineRequests.some(p=>p.includes('screw3d')),true,'box mode loads its own engine when selected');
  await page.evaluate(()=>screwWorld.close());
  // A browser-generated physical clear must replay identically on the reward server.
  const {certified}=require('./helpers/flat-atomic-solution-search.cjs');
  const {verifyClear}=require('../supabase/functions/flat-drill-clear/replay.cjs');
  for(const stage of [25,122,1000]){
   const witness=certified(stage);assert.equal(witness.reason,null);
   const result=await page.evaluate(async({stage,route})=>{
    let proof;const game=OjjudaScrewGames.flat({getUserId:()=>`browser-replay-${stage}`,setScore(){},
     drillAction:async()=>({ok:true,balance:0}),verifyDrill:async value=>{proof=value;return{ok:true,balance:1,reward:'earned'};}},stage);
    await new Promise(resolve=>setTimeout(resolve,0));
    const tap=p=>{game.onDown(p.x,p.y,1);game.onUp(p.x,p.y,1);};
    for(const step of route){
     tap(game.state.level.screws[step.screw].hole);tap(game.state.level.holes[step.to]);
     for(let i=0;i<step.wait*20;i++)game.update(.05);
    }
    for(let i=0;i<160&&!game.state.complete;i++)game.update(.05);
    await new Promise(resolve=>setTimeout(resolve,0));
    const result={complete:game.state.complete,moves:game.state.moves,proof};game.destroy();return result;
   },{stage,route:witness.route});
   assert.equal(result.complete,true,`stage ${stage} clears in Chromium`);assert.equal(result.moves,witness.moves);
   assert.ok(result.proof);assert.equal(verifyClear(stage,result.proof.events,result.proof.endTick),true,'the server accepts the browser physics replay');
  }
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: both screw modes open, six responsive viewports up to 1920px, real pinch, wheel, pan and animated two-tap transfer, stage-26 zoom, stage-1000 render, lazy engines, clean exit and three browser/server physical replays.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
