const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.SHELF_PLANT_PROOF_DIR||path.resolve(root,'../shelf-plant-proof');
const runtime=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets/shelf-plant-v1.runtime.json')));
const owner='shelf-plant-test',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/model\.js\?v=([^"']+)/)[1];
assert.equal(runtime.version,3);assert.equal(runtime.shapePolicy,1);
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[],requests=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();requests.push(u.pathname);
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-06T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5},sofa:{direction:'left',x:0,y:3},'item-oak-wall-shelf':{direction:'left',x:0,y:1.7,elevation:2.65}}}],diary:'화분 추가 전 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await page.locator('#open').click();const f=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();
  await f.locator('#app').waitFor({state:'visible'});await f.locator('[data-tab="room"]').click();
  const node=()=>f.locator('[data-furniture="item-shelf-plant"][data-render-state="ready"]'),ready=()=>node().waitFor();
  const pose=()=>node().evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation)}));
  const count=()=>requests.filter(p=>p.endsWith('/shelf-plant-v1.runtime.json')).length;
  assert.equal(count(),0);assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'덩굴 화분 놓기',exact:true}).click();await ready();assert.equal(count(),1);
  assert.equal(await f.getByRole('button',{name:'바닥에 놓기',exact:true}).count(),0);
  for(const d of ['left','center','right']){
   await f.locator('#panel button[data-direction="'+d+'"]').click();await ready();const p=runtime.views[d].placement;
   assert.deepEqual(await pose(),{direction:d,x:p.x,y:p.y,elevation:2.77});assert(await f.locator('#placement-done').isEnabled());assert.deepEqual(await read(),saved);
   assert(Number(await f.locator('#accessory-height').getAttribute('min'))>1);
   assert(await node().locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  }
  const behavior=await f.evaluate(async({version,owner})=>{
   const suffix='?v='+version,m=await import('/house-test/model.js'+suffix),a=await import('/house-test/custom-furniture.js'+suffix),{FURNITURE}=await import('/house-test/furniture-catalog.js'+suffix),{listMadeItems}=await import('/house-test/custom-store.js'+suffix),rt=await import('/house-test/anchor-editor/runtime.js'+suffix);
   const id='item-shelf-plant',p={...FURNITURE[id].preferredViews.right},desk={id:'desk',direction:'right',x:9,y:3.5},lower={...p,elevation:2.3},min=m.minimumFurnitureElevation(id,'right');
   const raw=await(await fetch('/house-test/assets/shelf-plant-v1.runtime.json')).json();rt.validateRuntime(raw);
   const checks={slots:(await listMadeItems(owner)).length,floorBlocked:!m.canUseFloor(id),unpreparedRejected:!rt.runtimePoseValid(raw,p),
    beneathFloorBlocked:!m.canPlaceFurniture(id,{...p,elevation:min-.01},[]),minimumClamped:m.normalizePlacement(id,{...p,elevation:0}).elevation===min,
    deskBelowAllowed:m.canPlaceFurniture(id,p,[desk]),leavesTouchingDeskBlocked:!m.canPlaceFurniture(id,lower,[desk]),symmetricBlock:!m.canPlaceFurniture('desk',desk,[{id,...lower}]),
    duplicateBlocked:!m.canPlaceFurniture(id,p,[{id,...p}]),wallBlocked:!m.canPlaceFurniture(id,{...p,x:0},[]),
    ordinarySurfaceFloor:m.canUseFloor('clover-mug'),shelfNotOnFloor:!m.canUseFloor('item-oak-wall-shelf')};
   checks.allShelves=['left','center','right'].every(d=>{const s={...FURNITURE['item-oak-wall-shelf'].preferredViews[d]};if(d==='left')s.y=1.7;return m.canPlaceFurniture(id,FURNITURE[id].preferredViews[d],[{id:'item-oak-wall-shelf',...s}]);});
   const before=performance.now();for(let i=0;i<10;i++)m.canPlaceFurniture(id,lower,[desk,{id,...p}]);checks.collisionTenCallsMs=performance.now()-before;
   return checks;
  },{version,owner});
  assert.equal(behavior.slots,0);for(const [k,v]of Object.entries(behavior))if(!['slots','collisionTenCallsMs'].includes(k))assert(v,k);
  const loadsBeforeCancel=count();
  await f.locator('#accessory-height').evaluate(el=>{el.value='2.3';el.dispatchEvent(new Event('input',{bubbles:true}));});await ready();assert(!(await f.locator('#placement-done').isEnabled()),'leaves hitting the table cannot be committed');
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'덩굴 화분 놓기',exact:true}).click();await ready();assert.equal(count(),loadsBeforeCancel);await f.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture['item-shelf-plant']={direction:'right',x:9.62,y:4.34,elevation:2.77};assert.deepEqual(await read(),installed);
  await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'shelf-plant-desktop.png')});
  await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);await f.locator('#app').waitFor({state:'visible'});await ready();assert.deepEqual(await read(),installed);
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'덩굴 화분 배치',exact:true}).click();
  await f.locator('#panel button[data-direction="right"]').click();await ready();await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  await page.setViewportSize({width:390,height:844});await f.getByRole('button',{name:'덩굴 화분 배치',exact:true}).click();await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:path.join(proof,'shelf-plant-mobile.png')});
  await f.locator('#placement-recall').click();assert.deepEqual(await read(),saved);
  await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);await f.locator('#app').waitFor({state:'visible'});assert.equal(await node().count(),0);assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({threeViews:true,behavior,saveCancelReopenRecall:true,existingRoomPreserved:true,onDemandOnly:true,mobileWidth:390,errors,missing},null,2));
  console.log('SHELF PLANT PASS: three views, support contacts, floor/leaf collisions, no new slots, save/cancel/reopen/recall and mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
