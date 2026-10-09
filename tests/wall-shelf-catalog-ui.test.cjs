const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.WALL_SHELF_PROOF_DIR||path.resolve(root,'../wall-shelf-proof');
const bytes=fs.readFileSync(path.join(root,'house-test/assets/oak-wall-shelf-v1.runtime.json')),runtime=JSON.parse(bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'cbf2e748506c9cf2d8485045e4fe85556edb04cd137ec9b88f0b91a8965734e7');
const owner='wall-shelf-built-in-test',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/model\.js\?v=([^"']+)/)[1];
const fixture=`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[],requests=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();requests.push(u.pathname);
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   if(u.pathname==='/_font.ttf'&&process.env.WALL_SHELF_PROOF_FONT)return route.fulfill({path:process.env.WALL_SHELF_PROOF_FONT,contentType:'font/ttf'});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  if(process.env.WALL_SHELF_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:Proof;src:url(/_font.ttf)}body,button,input{font-family:Proof,sans-serif!important}';document.head.append(s);}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-04T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5},sofa:{direction:'left',x:0,y:3}}}],diary:'벽선반 이전 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await page.locator('#open').click();const f=page.frames().find(f=>f.url().includes('/house-test/index.html'))||await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();
  await f.locator('#app').waitFor({state:'visible'});await f.locator('[data-tab="room"]').click();
  const node=()=>f.locator('[data-furniture="item-oak-wall-shelf"][data-render-state="ready"]');
  const ready=()=>node().waitFor();const count=()=>requests.filter(p=>p.endsWith('/oak-wall-shelf-v1.runtime.json')).length;
  const pose=()=>node().evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation||0)}));
  assert.equal(count(),0);assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'벽선반 놓기',exact:true}).click();await ready();assert.equal(count(),1);assert.equal(await f.getByRole('button',{name:'바닥에 놓기',exact:true}).count(),0);
  assert.deepEqual(await pose(),{direction:'right',x:9.6,y:3.5,elevation:2.65});
  for(const d of ['left','center','right']){
   if(!await f.locator('.placement-details').evaluate(el=>el.open))await f.locator('.placement-details > summary').click();await f.locator('#panel button[data-direction="'+d+'"]').click();await ready();const p=runtime.views[d].placement;
   assert.deepEqual(await pose(),{direction:d,x:p.x,y:p.y,elevation:2.65});assert(await f.locator('#placement-done').isEnabled());assert.deepEqual(await read(),saved);
   assert(await node().locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  }
  const behavior=await f.evaluate(async({version,owner})=>{
   const m=await import('/house-test/model.js?v='+version),{listMadeItems}=await import('/house-test/custom-store.js?v='+version);
   const id='item-oak-wall-shelf',p={direction:'left',x:0,y:3.5,elevation:2.65},shelf={id:'bookshelf',direction:'left',x:0,y:3};
   const followsWall=m.normalizePlacement(id,{...p,x:4}),right=m.normalizePlacement(id,{...p,direction:'right',x:2}),back=m.normalizePlacement(id,{...p,direction:'center',x:0,y:4});
   const checks={slots:(await listMadeItems(owner)).length,wallFixed:followsWall.x===0&&right.x===9.6&&back.y===0,
    floorBlocked:!m.canUseFloor(id),deskBelowAllowed:m.canPlaceFurniture(id,{direction:'right',x:9.6,y:3.5,elevation:2.65},[{id:'desk',direction:'right',x:9,y:3.5}]),
    tallBlocked:!m.canPlaceFurniture(id,p,[shelf]),symmetricBlock:!m.canPlaceFurniture('bookshelf',shelf,[{id,...p}]),
    sofaBelowAllowed:m.canPlaceFurniture(id,p,[{id:'sofa',direction:'left',x:0,y:3}]),lowFrameBlocked:!m.canPlaceFurniture(id,{...p,elevation:.5},[{id:'sofa',direction:'left',x:0,y:3}]),
    windowBlocked:!m.canPlaceFurniture(id,{direction:'center',x:4,y:0,elevation:2.65},[]),
    registeredBackAllowed:m.canPlaceFurniture(id,{direction:'center',x:0,y:0,elevation:2.65},[]),
    duplicateBlocked:!m.canPlaceFurniture(id,p,[{id,...p}]),fallback:m.findPlacement(id,[shelf]),
    floatingBlocked:!m.canPlaceFurniture(id,{...p,x:3},[])};
   const drag=m.wallDragPlacement(id,p,0,-25);checks.verticalDrag=drag.x===0&&drag.elevation>p.elevation;
   return checks;
  },{version,owner});assert.equal(behavior.slots,0);for(const [k,v]of Object.entries(behavior))if(k!=='slots')assert(v,k);
  await f.locator('#panel button[data-direction="center"]').click();
  const slider=()=>f.getByRole('slider',{name:'벽면 위치',exact:true});
  await slider().evaluate(el=>{el.value='4';el.dispatchEvent(new Event('input',{bubbles:true}));});assert((await pose()).x!==4||!(await f.locator('#placement-done').isEnabled()),'window placement cannot be committed');
  await slider().evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});assert(await f.locator('#placement-done').isEnabled());
  await f.locator('#panel button[data-direction="left"]').click();
  await f.getByRole('slider',{name:'벽선반 높이',exact:true}).evaluate(el=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});assert((await pose()).elevation!==.5||!(await f.locator('#placement-done').isEnabled()),'intersecting sofa placement cannot be committed');
  await f.getByRole('slider',{name:'벽선반 높이',exact:true}).evaluate(el=>{el.value='2.65';el.dispatchEvent(new Event('input',{bubbles:true}));});assert(await f.locator('#placement-done').isEnabled());
  await ready();const rect=await node().boundingBox(),beforeDrag=await pose();
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2-20,{steps:4});await page.mouse.up();
  const afterDrag=await pose();assert.equal(afterDrag.x,0);assert(afterDrag.elevation>beforeDrag.elevation);assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'벽선반 놓기',exact:true}).click();await ready();assert.equal(count(),1);await f.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture['item-oak-wall-shelf']={direction:'right',x:9.6,y:3.5,elevation:2.65};assert.deepEqual(await read(),installed);
  await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'wall-shelf-desktop.png')});
  await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);await f.locator('#app').waitFor({state:'visible'});await ready();assert.deepEqual(await read(),installed);assert.equal((await pose()).elevation,2.65);
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'벽선반 배치',exact:true}).click();
  if(!await f.locator('.placement-details').evaluate(el=>el.open))await f.locator('.placement-details > summary').click();await f.locator('#panel button[data-direction="left"]').click();await ready();
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);assert.equal((await pose()).elevation,2.65);
  await page.setViewportSize({width:390,height:844});await f.getByRole('button',{name:'벽선반 배치',exact:true}).click();await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:path.join(proof,'wall-shelf-mobile.png')});
  await f.locator('#placement-recall').click();assert.deepEqual(await read(),saved);await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);await f.locator('#app').waitFor({state:'visible'});assert.equal(await node().count(),0);assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({nativeRuntimeUnchanged:true,onDemandOnly:true,threeDirections:true,height:.12,wallPlacement:true,dragVerified:true,behavior,saveReopenCancelRecall:true,existingRoomPreserved:true,mobileWidth:390,errors,missing},null,2));
  console.log('WALL SHELF PASS: native artwork, wall attachment/drag, window/height collisions, three views, save/reopen/cancel/recall, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
