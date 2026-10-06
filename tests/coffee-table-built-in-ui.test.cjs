const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const parent=`<!doctype html><html><body><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=20261006-vine1';document.querySelector('#open').onclick=()=>openHouseTest({owner:'table-built-in',authorized:()=>true});</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:f});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5}}}],diary:'기존 기록 보존'};
  await page.evaluate(value=>localStorage.setItem('ojjuda-house-playtest-v1:table-built-in',JSON.stringify(value)),saved);
  const frame=()=>page.frames().find(f=>f.url().includes('/house-test/index.html'));
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});await frame().locator('[data-tab="room"]').click();return frame();};
  let f=await open();assert.equal(await f.locator('[data-furniture="coffee-table"]').count(),0,'new built-in is not added to saved rooms');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:table-built-in'))),saved);
  const records=await f.evaluate(async()=>{const {listMadeItems}=await import('/house-test/custom-store.js?v=20261006-vine1');return (await listMadeItems('table-built-in')).length;});assert.equal(records,0,'built-in does not consume a user-created item slot');
  await f.getByRole('button',{name:'거실 테이블 놓기',exact:true}).click();
  for(const direction of ['left','center','right']){
   await f.locator(`button[data-direction="${direction}"]:not(.furniture)`).click();
   await f.locator(`[data-furniture="coffee-table"][data-direction="${direction}"][data-render-state="ready"]`).waitFor();
   const rendered=await f.locator('[data-furniture="coffee-table"]').evaluate(async el=>{const {furnitureGeometry}=await import('/house-test/furniture.js?v=20261006-vine1');const pose={direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)},g=furnitureGeometry('coffee-table',pose),canvas=el.querySelector('canvas');return {anchors:g.anchors.length,width:canvas.width,height:canvas.height,finite:g.anchors.every(p=>Number.isFinite(p.x+p.y))};});
   assert.equal(rendered.anchors,4);assert(rendered.width>0&&rendered.height>0&&rendered.finite);
  }
  const collision=await f.evaluate(async()=>{const {canPlaceFurniture}=await import('/house-test/model.js?v=20261006-vine1');const pose={direction:'left',x:2,y:4};return {free:canPlaceFurniture('coffee-table',pose,[]),overlap:canPlaceFurniture('coffee-table',pose,[{id:'sofa',direction:'left',x:2,y:4}]),gap:canPlaceFurniture('coffee-table',pose,[{id:'sofa',direction:'left',x:0,y:3}])};});
  assert.deepEqual(collision,{free:true,overlap:false,gap:true});
  await f.locator('button[data-direction="left"]:not(.furniture)').click();
  for(const [id,value]of [['#bookshelf-gap',2],['#bookshelf-depth',4]])await f.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await f.locator('#placement-done').click();await f.locator('[data-furniture="coffee-table"][data-render-state="ready"]').waitFor();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:table-built-in')));
  assert.deepEqual(stored.rooms[0].furniture['coffee-table'],{direction:'left',x:2,y:4});assert.deepEqual(stored.rooms[0].furniture.desk,saved.rooms[0].furniture.desk);assert.equal(stored.diary,saved.diary);
  await page.screenshot({path:'/tmp/coffee-table-built-in-desktop.png'});
  await f.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));f=await open();
  await f.locator('[data-furniture="coffee-table"][data-render-state="ready"]').waitFor();assert.equal(await f.locator('[data-furniture="coffee-table"]').getAttribute('data-x'),'2');
  await page.setViewportSize({width:390,height:844});assert(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/tmp/coffee-table-built-in-mobile.png'});
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('COFFEE TABLE BUILT-IN PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
