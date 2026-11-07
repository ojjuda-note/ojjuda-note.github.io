const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const E=require('../games/sacheonseong/engine.js');
const root=path.join(__dirname,'..'),origin='https://fixture.test';
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
const viewports=[
 {width:320,height:568},{width:390,height:844},{width:430,height:932},
 {width:844,height:390},{width:344,height:882},{width:673,height:841},
 {width:1280,height:900}
];
async function routeFiles(context){
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  const file=path.join(root,url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
  return route.fulfill({path:file});
 });
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function openPage(context,stage){
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({stage,KEY,RECORDS})=>{
  window.__sacheonseongNow=1700000000000;Date.now=()=>window.__sacheonseongNow;
  localStorage.setItem(KEY,JSON.stringify({stage,unlocked:200,sound:false}));
  localStorage.setItem(RECORDS,JSON.stringify({[stage]:[{id:'previous-record',duration:9000,at:1690000000000}]}));
 },{stage,KEY,RECORDS});
 await page.goto(origin+'/games/sacheonseong/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('.tile:not(.empty)').length>0&&parseFloat(document.getElementById('board-canvas').style.getPropertyValue('--tile'))>0);
 await settle(page);return {page,errors};
}
async function snapshot(page){return page.evaluate(({KEY,RECORDS})=>({state:JSON.parse(localStorage.getItem(KEY)),records:JSON.parse(localStorage.getItem(RECORDS)),timer:document.getElementById('timer').textContent}),{KEY,RECORDS});}
async function layout(page){
 return page.evaluate(KEY=>{
  const state=JSON.parse(localStorage.getItem(KEY)),canvas=document.getElementById('board-canvas'),viewport=document.getElementById('board-scroll');
  const rect=element=>{const b=element.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
  const grids=[state.grid,...state.upcoming],faceCounts=new Map();
  grids.flat(2).forEach(v=>{if(v!==-1)faceCounts.set(v,(faceCounts.get(v)||0)+1);});
  return {state:{stage:state.stage,layerCount:state.layerCount,floor:state.floor,total:state.totalTiles},rows:state.grid.length,cols:state.grid[0].length,
   active:state.grid.flat().filter(v=>v!==-1).length,total:grids.flat(2).filter(v=>v!==-1).length,
   gaps:state.grid.flat().filter(v=>v===-1).length,faceCounts:[...faceCounts.values()],
   validFaces:grids.flat(2).every(v=>v===-1||(Number.isInteger(v)&&!!window.GardenFaces[v])),
   lower:document.querySelectorAll('.board-underlay').length,buttons:document.querySelectorAll('.tile').length,
   remaining:document.getElementById('remaining').textContent.match(/\d+/g).map(Number),
   canvas:rect(canvas),viewport:rect(viewport),tile:rect(document.querySelector('.tile:not(.empty)')),
   controls:[...document.querySelectorAll('.topbar,.game-hud,.game-actions,.game-actions button')].map(rect),
   width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,
   fit:document.getElementById('zoom-fit').getAttribute('aria-pressed')};
 },KEY);
}
function assertFits(value,label){
 const {canvas,viewport}=value;
 assert.equal(value.fit,'true',`${label}: whole-board view`);
 assert(canvas.width>0&&canvas.height>0,`${label}: visible board`);
 assert(canvas.x>=viewport.x-.75&&canvas.y>=viewport.y-.75&&canvas.x+canvas.width<=viewport.x+viewport.width+.75&&canvas.y+canvas.height<=viewport.y+viewport.height+.75,`${label}: board fits viewport ${JSON.stringify({canvas,viewport})}`);
 assert(value.scrollWidth<=value.width+1&&value.scrollHeight<=value.height+1,`${label}: no page overflow`);
 for(const box of value.controls)assert(box.x>=-.75&&box.y>=-.75&&box.x+box.width<=value.width+.75&&box.y+box.height<=value.height+.75,`${label}: controls remain visible`);
}
const tileSelector=p=>`.tile[data-r="${p.r}"][data-c="${p.c}"]`;
async function screenshot(page,name){
 if(!process.env.SACHEONSEONG_QA_DIR)return;
 fs.mkdirSync(process.env.SACHEONSEONG_QA_DIR,{recursive:true});
 await page.screenshot({path:path.join(process.env.SACHEONSEONG_QA_DIR,name+'.png')});
}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  for(const viewport of viewports){
   const context=await browser.newContext({viewport,isMobile:viewport.width<900,hasTouch:true,reducedMotion:'reduce'});
   try{
    await routeFiles(context);
    for(const stage of viewport.width===390||viewport.width===1280?[6,12,18,200]:[6,12,18]){
     const {page,errors}=await openPage(context,stage);
     try{
      const value=await layout(page),label=`stage ${stage}, ${viewport.width}x${viewport.height}`;
      assertFits(value,label);
      assert.equal(value.state.layerCount,E.layerCount(stage),`${label}: expected floors`);
      assert.equal(value.lower,E.layerCount(stage)-1,`${label}: lower-floor shadow cards`);
      assert.equal(value.total,E.stageInfo(stage).total,`${label}: combined floor count`);
      assert.deepEqual(value.remaining,[value.total,value.total],`${label}: HUD includes all layers`);
      assert(value.gaps>0&&value.buttons>value.active,`${label}: varied silhouette has empty spaces`);
      assert(value.validFaces,`${label}: symbols all exist`);
      assert(value.faceCounts.includes(2)&&value.faceCounts.includes(4)&&value.faceCounts.every(n=>n===2||n===4),`${label}: two- and four-copy faces mixed`);
      assert(value.tile.width>=1,`${label}: visible interactive tiles`);
      const last=await page.evaluate(()=>{const tile=[...document.querySelectorAll('.tile:not(.empty)')].at(-1);return{r:Number(tile.dataset.r),c:Number(tile.dataset.c)};});
      const lastTile=page.locator(tileSelector(last));await lastTile.focus();await page.keyboard.press('ArrowRight');
      assert.equal(await lastTile.evaluate(el=>el===document.activeElement),true,`${label}: keyboard stays within the row`);
      await page.locator('#all-stages').click();
      assert.equal(await page.locator('.stage-card').count(),200,`${label}: 200 stage cards`);
      for(const number of [6,12,18])assert.match(await page.locator(`.stage-card[data-stage="${number}"]`).getAttribute('aria-label'),new RegExp(`${E.layerCount(number)}층`));
      assert.match(await page.locator(`.stage-card[data-stage="${stage}"]`).getAttribute('aria-label'),new RegExp(`${value.total}개의 패`));
      await page.locator('#modal-close').click();
      assert.deepEqual(errors,[],`${label}: no script errors`);
      await screenshot(page,`stage-${stage}-${viewport.width}x${viewport.height}`);
     }finally{await page.close();}
    }
   }finally{await context.close();}
  }
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
   await routeFiles(context);const {page,errors}=await openPage(context,7);
   const move=await page.evaluate(()=>window.TileGarden.moves(JSON.parse(localStorage.getItem('ojjuda-sacheonseong-v1')).grid));
   const before=await snapshot(page);await page.locator(tileSelector(move.a)).tap();await page.locator(tileSelector(move.b)).tap();
   await page.waitForFunction(before=>JSON.parse(localStorage.getItem('ojjuda-sacheonseong-v1')).grid.flat().filter(v=>v!==-1).length===before-2,before.state.grid.flat().filter(v=>v!==-1).length);
   assert.equal((await layout(page)).total,E.stageInfo(7).total-2,'touch removes one pair across a layered stage');
   const progress=await snapshot(page),tileSize=(await layout(page)).tile.width;
   for(let i=0;i<4;i++)await page.locator('#zoom-in').click();
   assert((await layout(page)).tile.width>tileSize*1.5,'zoom enlarges tiny tiles');
   await page.locator('#zoom-fit').click();assertFits(await layout(page),'return from zoom');
   for(const viewport of [{width:844,height:390},{width:673,height:841},{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(viewport);await settle(page);
    assertFits(await layout(page),`rotation ${viewport.width}x${viewport.height}`);
    assert.deepEqual(await snapshot(page),progress,'rotation and zoom preserve board and records');
   }
   await screenshot(page,'stage-7-rotation-touch');
   assert.deepEqual(errors,[],'matching, zoom and rotation cause no errors');
   await page.close();
  }finally{await context.close();}
  console.log('PASS: irregular 2–8 layer boards fit seven viewport sizes; 200 stages, mixed pairs/quads, touch selection, zoom and rotation.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
