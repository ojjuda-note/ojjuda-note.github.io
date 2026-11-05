const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=name=>fs.readFileSync(path.join(root,name),'utf8');
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'');
world=world.replace('<script type="module">','<script src="/mobile-viewport.js"></script><script src="/screw-loader.js"></script><script src="/world-navigation.js"></script><script src="/game-results.js"></script><script type="module">');
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
const screens=[{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:344,height:882},{width:1280,height:900}];

async function canvasTap(page,point){
 const canvas=page.locator('#gcv'),r=await canvas.boundingBox();
 assert.ok(r&&r.width>0&&r.height>0,'the game canvas is visible');
 await page.touchscreen.tap(r.x+point.x*r.width/360,r.y+point.y*r.height/540);
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

  for(const size of screens){
   await page.setViewportSize(size);await assertFullscreen(page,size);
   if(qa&&[320,390].includes(size.width))await page.locator('#gov').screenshot({path:path.join(qa,`screw-flat-covered-${size.width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});
  const choice=await page.evaluate(()=>{
   const game=screwWorld.current().game,level=game.state.level;
   const screw=level.screws.find(s=>OjjudaScrewGames.canUnscrew(level,s));
   const hole=level.holes.find(h=>h.owner===null&&h.screw===null);
   return{id:screw.id,from:game.screenPoint(screw.hole),to:game.screenPoint(hole),toId:hole.id};
  });
  await canvasTap(page,choice.from);
  assert.deepEqual(await page.evaluate(id=>{
   const state=screwWorld.current().game.state,s=state.level.screws[id];
   return{held:s.hole===null,selected:state.selected,moves:state.moves,pending:state.pending?.kind};
  },choice.id),{held:true,selected:choice.id,moves:1,pending:'lift'},'the first tap physically lifts the chosen screw');
  await page.evaluate(()=>{const g=screwWorld.current().game;for(let i=0;i<10;i++)g.update(.05);});
  await canvasTap(page,choice.to);
  await page.evaluate(()=>{const g=screwWorld.current().game;for(let i=0;i<10;i++)g.update(.05);});
  assert.equal(await page.evaluate(id=>screwWorld.current().game.state.level.screws[id].hole.id,choice.id),choice.toId,'the second tap seats the screw');
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.moves),1,'seating adds no extra move');
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-lift-and-seat.png')});

  await page.locator('[data-g=screw-stages]').click();
  await page.locator('[data-g=screw-modes]').click();
  await page.evaluate(()=>screwWorld.openFlat(26));
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===26);
  await page.locator('[data-g=screw-stages]').click();
  assert.equal(await page.locator('[data-g=screw-stage][data-stage="26"]').count(),1,'the catalog opens on the remembered stage page');
  await page.locator('[data-g=screw-stage][data-stage="26"]').click();
  await page.waitForFunction(()=>screwWorld.current()?.game?.state?.L===26);
  await canvasTap(page,{x:240,y:26});
  assert.ok(await page.evaluate(()=>screwWorld.current().game.state.view.zoom>1),'small screws can be magnified');
  await canvasTap(page,{x:240,y:26});
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
  assert.equal(await page.evaluate(()=>screwWorld.current().game.state.level.screws.length),100);
  await assertFullscreen(page,{width:390,height:844});
  if(qa)await page.locator('#gov').screenshot({path:path.join(qa,'screw-flat-1000.png')});

  page.once('dialog',dialog=>dialog.accept());await page.locator('[data-g=close]').click();
  await page.locator('#gov').waitFor({state:'detached'});
  await page.evaluate(()=>screwWorld.open('screw',{screwMode:'box'}));
  await page.waitForFunction(()=>screwWorld.current()?.screwMode==='box'&&screwWorld.current()?.game);
  assert.equal(await page.locator('#gov').count(),1,'a direct box link is still available');
  assert.equal(engineRequests.some(p=>p.includes('screw3d')),true,'box mode loads its own engine when selected');
  await page.evaluate(()=>screwWorld.close());
  assert.deepEqual(errors,[]);
  await context.close();
  console.log('PASS: both screw modes open, responsive 320/390/844/1280px, actual flat lift-seat touch, stage-26 zoom, stage-1000 render, lazy engines and clean exit.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
