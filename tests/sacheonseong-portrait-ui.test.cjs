const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),origin='https://fixture.test';
const KEY='ojjuda-sacheonseong-v1',RECORDS='ojjuda-sacheonseong-records-v1';
const viewports=[
 {width:320,height:568},{width:390,height:844},{width:430,height:932},
 {width:844,height:390},{width:344,height:882},{width:673,height:841},
 {width:1280,height:900}
];
// Keep the production app intact. Only the dedicated boundary fixture moves
// existing faces into known positions, preserving the generated tile counts.
const boundaryFixture=`
if(window.__sacheonseongBoundaryFixture){
 const engine=window.TileGarden,generate=engine.generate;
 engine.generate=(...args)=>{
  const made=generate(...args),grid=made.grid,rows=grid.length,cols=grid[0].length;
  const pairs=[
   {edge:'right',a:{r:0,c:cols-1},b:{r:2,c:cols-1}},
   {edge:'bottom',a:{r:rows-1,c:0},b:{r:rows-1,c:2}},
   {edge:'spare',a:{r:4,c:0},b:{r:4,c:1}}
  ];
  const fixed=new Set();
  const faces=[...new Set(grid.flat().filter(value=>value!==engine.EMPTY))];
  pairs.forEach((pair,i)=>[pair.a,pair.b].forEach(target=>{
   if(grid[target.r][target.c]===faces[i]){fixed.add(target.r+','+target.c);return;}
   let source;
   for(let r=0;r<rows&&!source;r++)for(let c=0;c<cols;c++){
    if(grid[r][c]===faces[i]&&!fixed.has(r+','+c)){source={r,c};break;}
   }
   if(!source)throw Error('Missing fixture face');
   [grid[target.r][target.c],grid[source.r][source.c]]=[grid[source.r][source.c],grid[target.r][target.c]];
   fixed.add(target.r+','+target.c);
  }));
  window.__sacheonseongBoundaryPairs=pairs.slice(0,2);
  return made;
 };
}`;
async function routeFiles(context){
 await context.route('**/*',route=>{
  const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
  const file=path.join(root,url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
  if(url.pathname==='/games/sacheonseong/engine.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(file,'utf8')+'\n'+boundaryFixture});
  return route.fulfill({path:file});
 });
}
async function openPage(context,stage,boundary=false){
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(({stage,boundary,KEY,RECORDS})=>{
  window.__sacheonseongBoundaryFixture=boundary;
  window.__sacheonseongNow=1700000000000;Date.now=()=>window.__sacheonseongNow;
  localStorage.setItem(KEY,JSON.stringify({stage,unlocked:15,sound:false}));
  localStorage.setItem(RECORDS,JSON.stringify({[stage]:[{id:'previous-record',duration:9000,at:1690000000000}]}));
 },{stage,boundary,KEY,RECORDS});
 await page.goto(origin+'/games/sacheonseong/index.html');
 await page.waitForFunction(()=>document.querySelectorAll('.tile:not(.empty)').length>0&&parseFloat(document.getElementById('board-canvas').style.getPropertyValue('--tile'))>0);
 await settle(page);
 return {page,errors};
}
async function settle(page){await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}
async function snapshot(page){
 return page.evaluate(({KEY,RECORDS})=>({state:JSON.parse(localStorage.getItem(KEY)),records:JSON.parse(localStorage.getItem(RECORDS)),selected:[...document.querySelectorAll('.tile[aria-pressed="true"]')].map(el=>({r:Number(el.dataset.r),c:Number(el.dataset.c)})),timer:document.getElementById('timer').textContent}),{KEY,RECORDS});
}
async function layout(page){
 return page.evaluate(KEY=>{
  const grid=JSON.parse(localStorage.getItem(KEY)).grid,canvas=document.getElementById('board-canvas'),viewport=document.getElementById('board-scroll');
  const rect=element=>{const b=element.getBoundingClientRect();return{x:b.x,y:b.y,width:b.width,height:b.height};};
  return {rows:grid.length,cols:grid[0].length,total:grid.flat().filter(value=>value!==-1).length,canvas:rect(canvas),viewport:rect(viewport),tile:rect(document.querySelector('.tile:not(.empty)')),gap:parseFloat(canvas.style.getPropertyValue('--gap')),pad:parseFloat(canvas.style.getPropertyValue('--pad')),controls:[...document.querySelectorAll('.topbar,.game-hud,.game-actions,.game-actions button')].map(rect),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,fit:document.getElementById('zoom-fit').getAttribute('aria-pressed')};
 },KEY);
}
function assertFits(value,label){
 const {canvas,viewport}=value;
 assert.equal(value.fit,'true',`${label}: full-board view is active`);
 assert(canvas.width>0&&canvas.height>0,`${label}: board has visible dimensions`);
 assert(canvas.x>=viewport.x-.75&&canvas.y>=viewport.y-.75&&canvas.x+canvas.width<=viewport.x+viewport.width+.75&&canvas.y+canvas.height<=viewport.y+viewport.height+.75,`${label}: whole rectangular board fits its viewport ${JSON.stringify({canvas,viewport})}`);
 assert(value.scrollWidth<=value.width+1&&value.scrollHeight<=value.height+1,`${label}: the page never overflows`);
 for(const box of value.controls)assert(box.x>=-.75&&box.y>=-.75&&box.x+box.width<=value.width+.75&&box.y+box.height<=value.height+.75,`${label}: headers and controls remain on screen`);
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
    for(const stage of [6,7,15]){
     const {page,errors}=await openPage(context,stage);
     try{
      const value=await layout(page),label=`stage ${stage}, ${viewport.width}x${viewport.height}`;
      assertFits(value,label);assert.equal(value.total,4*stage*stage,`${label}: original tile total`);
      assert(value.cols<=stage*2&&value.rows>=stage*2,`${label}: portrait layout uses fewer columns without losing tiles`);
      if(viewport.width===390&&stage===6){
       assert.equal(value.cols,9);assert.equal(value.rows,16);
       const squareFit=Math.min((value.viewport.width-16-22)/12,(value.viewport.height-20-22)/(12*1.19));
       assert(value.tile.width>squareFit*1.20,`${label}: tiles are at least 20% wider`);
      }
      if([844,673,1280].includes(viewport.width))assert.equal(value.cols,stage*2,`${label}: wide screens retain the square shape`);
      // The last occupied cell must not focus a nonexistent column or padded
      // cell; rectangular grids previously used their row count as this bound.
      const last=await page.evaluate(()=>{const el=[...document.querySelectorAll('.tile:not(.empty)')].at(-1);return{r:Number(el.dataset.r),c:Number(el.dataset.c)};});
      const lastTile=page.locator(tileSelector(last));await lastTile.focus();await page.keyboard.press('ArrowRight');
      assert.equal(await lastTile.evaluate(el=>el===document.activeElement),true,`${label}: keyboard stops at the last real column`);
      assert.deepEqual(errors,[],`${label}: no runtime errors`);
      await screenshot(page,`stage-${stage}-${viewport.width}x${viewport.height}`);
     }finally{await page.close();}
    }
   }finally{await context.close();}
  }
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  try{
   await routeFiles(context);
   const {page,errors}=await openPage(context,6,true);
   // Capture the actual painted connection before its short removal animation
   // clears it, so slow CI scheduling cannot miss the SVG.
   await page.evaluate(()=>{
    window.__sacheonseongRoutes=[];
    new MutationObserver(()=>{
     const line=document.querySelector('#connection polyline');if(!line)return;
     const canvas=document.getElementById('board-canvas'),bounds=canvas.getBoundingClientRect();
     window.__sacheonseongRoutes.push({points:line.getAttribute('points').trim().split(/\s+/).map(point=>point.split(',').map(Number)),width:bounds.width,height:bounds.height,pad:parseFloat(canvas.style.getPropertyValue('--pad'))});
    }).observe(document.getElementById('connection'),{childList:true});
   });
   const pairs=await page.evaluate(()=>window.__sacheonseongBoundaryPairs);
   for(let i=0;i<pairs.length;i++){
    const pair=pairs[i];
    await page.locator(tileSelector(pair.a)).tap();
    await page.locator(tileSelector(pair.b)).tap();
    await page.waitForFunction(count=>window.__sacheonseongRoutes.length>=count,i+1);
    const route=await page.evaluate(index=>window.__sacheonseongRoutes[index],i);
    assert.equal(route.points.length,4,`${pair.edge}: matching uses two outside turns`);
    for(const [x,y] of route.points)assert(x>=0&&x<=route.width+.75&&y>=0&&y<=route.height+.75,`${pair.edge}: connection stays inside the actual rectangular canvas`);
    const outside=Math.max(...route.points.map(point=>point[pair.edge==='right'?0:1])),edge=(pair.edge==='right'?route.width:route.height)-route.pad/2;
    assert(Math.abs(outside-edge)<.75,`${pair.edge}: outside lane follows the correct row/column boundary`);
    await page.waitForFunction(({a,b})=>[a,b].every(p=>document.querySelector(`.tile[data-r="${p.r}"][data-c="${p.c}"]`).classList.contains('empty')),pair);
   }
   assert.equal((await layout(page)).total,140,'real touch matches remove exactly four tiles');
   const selected={r:3,c:0};await page.locator(tileSelector(selected)).tap();
   await page.evaluate(()=>window.__sacheonseongNow+=12500);
   await page.waitForFunction(()=>document.getElementById('timer').textContent==='00:12.50');
   const before=await snapshot(page),initialTile=(await layout(page)).tile.width;
   for(let i=0;i<4;i++)await page.locator('#zoom-in').click();
   assert((await layout(page)).tile.width>initialTile*1.8,'zoom enlarges portrait tiles');
   const area=await page.locator('#board-scroll').evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
   const touch=await context.newCDPSession(page),point={id:1,x:area.x+area.width*.7,y:area.y+area.height*.65};
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,x:point.x-70,y:point.y-90}]});
   await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();
   const scroll=await page.locator('#board-scroll').evaluate(el=>({left:el.scrollLeft,top:el.scrollTop}));
   assert(scroll.left>20&&scroll.top>20,'one-finger dragging pans the enlarged rectangular board');
   assert.deepEqual(await snapshot(page),before,'zoom and pan keep the selected tile, clock, progress and records');
   await screenshot(page,'stage-6-portrait-zoom-pan');
   await page.locator('#zoom-fit').click();assertFits(await layout(page),'return from zoom');
   for(const viewport of [{width:844,height:390},{width:673,height:841},{width:320,height:568},{width:390,height:844}]){
    await page.setViewportSize(viewport);await settle(page);
    assertFits(await layout(page),`rotation ${viewport.width}x${viewport.height}`);
    assert.deepEqual(await snapshot(page),before,'rotation preserves the exact active grid, run ID, clock, selection and records');
   }
   await screenshot(page,'stage-6-after-rotation');
   assert.deepEqual(errors,[],'matching, zoom, pan and rotation produce no runtime errors');
  }finally{await context.close();}
  console.log('PASS: Chromium fits 6/7/15 stages on seven phone, landscape, foldable and desktop viewports; larger phone tiles, last-column keyboard access, both outside lanes, touch matching, zoom/pan and rotation preserve progress and records.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
