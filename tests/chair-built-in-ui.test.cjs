const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.CHAIR_PROOF_DIR||path.resolve(root,'../chair-deploy-proof'),proofFont=process.env.CHAIR_PROOF_FONT;
const runtime=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets/chair-v1.runtime.json')));
const owner='chair-built-in',key='ojjuda-house-playtest-v1:'+owner;
const parent=`<!doctype html><html><body><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=20261003-lamp1';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});
  const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(proofFont&&u.pathname==='/_proof-font/NotoSansCJKkr-Regular.otf')return route.fulfill({contentType:'font/otf',path:proofFont});
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}
   return route.fulfill({path:file});
  });
  if(proofFont)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
   const style=document.createElement('style');style.textContent='@font-face{font-family:ChairProof;src:url("/_proof-font/NotoSansCJKkr-Regular.otf") format("opentype");font-display:block}html,body,button,input,textarea{font-family:ChairProof,sans-serif!important}';document.head.append(style);
  },{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5},'coffee-table':{direction:'center',x:2,y:4},carpet:{direction:'center',x:1,y:3}}}],diary:'의자 추가 전 가구와 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const readSave=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});const f=page.frames().find(f=>f.url().includes('/house-test/index.html'));await f.evaluate(()=>document.fonts.ready);await f.locator('[data-tab="room"]').click();return f;};
  const close=async f=>{await f.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const pose=f=>f.locator('[data-furniture="chair"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)}));
  const range=(f,id,value)=>f.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const ready=f=>f.locator('[data-furniture="chair"][data-render-state="ready"]').waitFor();
  let f=await open();
  assert.equal(await f.locator('[data-furniture="chair"]').count(),0,'approved chair is not automatically added to existing rooms');
  assert.deepEqual(await readSave(),saved);
  // Migration validation needs the runtime loaded through the real item menu.
  await f.getByRole('button',{name:'의자 놓기',exact:true}).click();await ready(f);await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await readSave(),saved);
  const catalogue=await f.evaluate(async()=>{
   const {FURNITURE}=await import('/house-test/furniture-catalog.js?v=20261003-lamp1'),{listMadeItems}=await import('/house-test/custom-store.js?v=20261003-lamp1'),{normalize,canPlaceFurniture}=await import('/house-test/model.js?v=20261003-lamp1');
   const legacyPose={direction:'left',x:7.5,y:4.5},legacy=normalize({version:7,rooms:[{x:0,y:0,shelf:null,furniture:{chair:legacyPose}}],diary:'legacy-chair-diary'});
   const c=FURNITURE.chair;return {label:c.label,shortLabel:c.shortLabel,dimensions:{width:c.width,depth:c.depth,height:c.height},autoPlace:c.autoPlace,layer:c.layer,picture:c.picture,preferredViews:c.preferredViews,slots:(await listMadeItems('chair-built-in')).length,freshRoomHasChair:normalize(null).rooms.some(r=>!!r.furniture.chair),legacyPoseValidWithLoadedRuntime:canPlaceFurniture('chair',legacyPose,[]),legacyChairPresent:!!legacy.rooms[0].furniture.chair,legacyDiary:legacy.diary};
  });
  assert.equal(catalogue.label,'원목 책상 의자');assert.equal(catalogue.shortLabel,'의자');assert.deepEqual(catalogue.dimensions,runtime.dimensions);
  assert.equal(catalogue.autoPlace,false);assert.equal(catalogue.layer,'standing');assert.equal(catalogue.picture,'made');assert.equal(catalogue.slots,0);assert.equal(catalogue.freshRoomHasChair,false);
  assert.equal(catalogue.legacyPoseValidWithLoadedRuntime,true,'legacy migration must be tested after the approved runtime is actually loaded');
  assert.equal(catalogue.legacyChairPresent,false,'a retired v7 chair must not resurrect as the approved replacement');assert.equal(catalogue.legacyDiary,'legacy-chair-diary');
  for(const direction of ['left','center','right'])assert.deepEqual(catalogue.preferredViews[direction],runtime.views[direction].placement,'built-in directions use the exact registered runtime placements');
  assert.equal(await f.getByRole('button',{name:'의자 놓기',exact:true}).count(),1);
  await f.getByRole('button',{name:'소품',exact:true}).click();assert.equal(await f.getByRole('button',{name:'의자 놓기',exact:true}).count(),0,'chair belongs in the furniture menu');
  await f.getByRole('button',{name:'가구',exact:true}).click();await f.getByRole('button',{name:'의자 놓기',exact:true}).click();await ready(f);
  await f.getByRole('checkbox',{name:'책상과 연결',exact:true}).uncheck();await ready(f);
  assert.deepEqual(await pose(f),{direction:'left',x:7.5,y:4.5});
  const directionResults={};
  for(const direction of ['center','right','left']){
   await f.locator(`button[data-direction="${direction}"]:not(.furniture)`).click();await ready(f);
   const expected=runtime.views[direction].placement;assert.deepEqual(await pose(f),{direction,x:expected.x,y:expected.y});
   assert.equal(await f.locator('#placement-done').isEnabled(),true);
   const rendered=await f.locator('[data-furniture="chair"] canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height,painted:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0)}));
   assert(rendered.painted&&rendered.width>0&&rendered.height>0);directionResults[direction]={...await pose(f),painted:rendered.painted};
   assert.deepEqual(await readSave(),saved,'direction selection stays temporary until placement is completed');
   await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'chair-direction-'+direction+'.png')});
  }
  await range(f,'#bookshelf-gap',8);assert.equal(await f.locator('#placement-done').isDisabled(),true,'chair cannot intersect the existing desk');assert.equal(await f.locator('#placement-warning').isVisible(),true);
  await range(f,'#bookshelf-gap',7.5);assert.equal(await f.locator('#placement-done').isEnabled(),true);
  await f.locator('button[data-direction="center"]:not(.furniture)').click();assert.equal(await f.locator('#placement-done').isEnabled(),true,'standing chair may overlap the floor carpet');
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await f.locator('[data-furniture="chair"]').count(),0);assert.deepEqual(await readSave(),saved);
  await f.getByRole('button',{name:'의자 놓기',exact:true}).click();await f.getByRole('checkbox',{name:'책상과 연결',exact:true}).uncheck();await f.locator('#placement-done').click();await ready(f);
  const withChair=structuredClone(saved);withChair.rooms[0].furniture.chair={direction:'left',x:7.5,y:4.5};assert.deepEqual(await readSave(),withChair,'only the explicitly placed chair changes the saved room');
  await close(f);f=await open();await ready(f);assert.deepEqual(await pose(f),withChair.rooms[0].furniture.chair);assert.deepEqual(await readSave(),withChair);
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await f.locator('button[data-direction="right"]:not(.furniture)').click();assert.deepEqual(await pose(f),{direction:'right',x:4,y:4.5});
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await pose(f),withChair.rooms[0].furniture.chair);assert.deepEqual(await readSave(),withChair,'canceling a direction change preserves the old pose');
  await f.getByRole('button',{name:'책상 배치',exact:true}).click();await f.locator('button[data-direction="center"]:not(.furniture)').click();
  assert.deepEqual(await f.locator('[data-furniture="desk"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)})),{direction:'center',x:3.5,y:0},'ordinary desk retains its existing direction behavior');
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await readSave(),withChair);
  await f.locator('#overview').click();await f.waitForFunction(()=>getComputedStyle(document.querySelector('#notice')).opacity==='0');await page.screenshot({path:path.join(proof,'chair-built-in-desktop.png')});
  await page.setViewportSize({width:390,height:844});await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'chair-built-in-mobile.png')});
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await f.getByRole('button',{name:'회수',exact:true}).click();assert.deepEqual(await readSave(),saved);
  await close(f);f=await open();assert.equal(await f.locator('[data-furniture="chair"]').count(),0,'a removed chair must not return on reload');assert.deepEqual(await readSave(),saved);
  const slotsAfter=await f.evaluate(async()=>{const {listMadeItems}=await import('/house-test/custom-store.js?v=20261003-lamp1');return (await listMadeItems('chair-built-in')).length;});assert.equal(slotsAfter,0,'built-in chair never consumes a user-created slot');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'chair-built-in-verification.json'),JSON.stringify({menu:'furniture',notAutoPlaced:true,retiredV7ChairDiscardedWithRuntimeLoaded:true,legacyDiaryPreserved:true,directions:directionResults,standingCollisionRejected:true,floorCarpetOverlapAllowed:true,cancelPreserved:true,savedAndReopened:true,existingFurnitureAndDiaryPreserved:true,ordinaryDeskDirectionPreserved:true,removedChairStayedRemoved:true,userCreatedSlots:slotsAfter,errors,missing},null,2));
  console.log('CHAIR BUILT-IN PASS: furniture menu, registered three views, collisions, cancel, save/reopen, removal and preserved rooms/slots');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
