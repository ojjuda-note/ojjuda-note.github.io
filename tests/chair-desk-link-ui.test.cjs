const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.CHAIR_LINK_PROOF_DIR||path.resolve(root,'../chair-desk-link-proof'),proofFont=process.env.CHAIR_PROOF_FONT;
const owner='chair-desk-link',key='ojjuda-house-playtest-v1:'+owner;
const modelURL='/house-test/model.js?v=20261005-openbook1',catalogURL='/house-test/furniture-catalog.js?v=20261005-openbook1';
const runtime=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets/chair-v1.runtime.json')));
const parent=`<!doctype html><html><body><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=20261005-openbook1';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script></body></html>`;
const plain=p=>({direction:p.direction,x:p.x,y:p.y});
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
   const style=document.createElement('style');style.textContent='@font-face{font-family:ChairLinkProof;src:url("/_proof-font/NotoSansCJKkr-Regular.otf") format("opentype");font-display:block}html,body,button,input,textarea{font-family:ChairLinkProof,sans-serif!important}';document.head.append(style);
  },{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});await page.goto('https://fixture.test/fixture');
  const baseline={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5},carpet:{direction:'center',x:1,y:3}}}],diary:'책상과 의자 연결 후에도 보존할 기록'};
  await page.evaluate(({key,baseline})=>localStorage.setItem(key,JSON.stringify(baseline)),{key,baseline});
  const readSave=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});const frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));await frame.evaluate(()=>document.fonts.ready);await frame.locator('[data-tab="room"]').click();return frame;};
  const close=async f=>{await f.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const pose=(f,id)=>f.locator(`[data-furniture="${id}"]`).evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)}));
  const pair=async f=>({desk:await pose(f,'desk'),chair:await pose(f,'chair')});
  const ready=f=>f.locator('[data-furniture="chair"][data-render-state="ready"]').waitFor();
  const link=f=>f.getByRole('checkbox',{name:'책상과 연결',exact:true});
  const range=(f,id,value)=>f.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const direction=(f,id)=>f.locator(`button[data-direction="${id}"]:not(.furniture)`).click();
  const assertPair=async f=>{
   await ready(f);const rendered=await pair(f);
   const expected=await f.evaluate(async({desk,modelURL,catalogURL})=>{
    const {chairForDesk}=await import(modelURL),{itemSize}=await import(catalogURL);
    return {chair:chairForDesk(desk),deskSize:itemSize('desk',desk.direction),chairSize:itemSize('chair',chairForDesk(desk).direction)};
   },{desk:rendered.desk,modelURL,catalogURL});
   assert(expected.chair,'a linked desk has an exact derived chair');
   assert.equal(expected.chair.attachedTo,'desk');assert.deepEqual(rendered.chair,plain(expected.chair));
   // Independently measure the two drawn floor rectangles along the desk-front axis.
   const axis=rendered.desk.direction==='center'?'y':'x',size=axis==='y'?'d':'w';
   const overlap=Math.min(rendered.desk[axis]+expected.deskSize[size],rendered.chair[axis]+expected.chairSize[size])-Math.max(rendered.desk[axis],rendered.chair[axis]);
   assert(Math.abs(overlap-.5)<1e-6,`linked chair must tuck exactly 0.5 cells under the desk, got ${overlap}`);
   const painted=await f.locator('[data-furniture="chair"] canvas.furniture-paint').evaluate(canvas=>canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0));
   assert(painted,'linked chair retains its actual registered artwork');return rendered;
  };
  const movePair=async f=>{
   const before=await pair(f);
   const change=await f.evaluate(async({desk,modelURL,catalogURL,baseline})=>{
    const {chairForDesk,canPlaceGroup,FLOOR}=await import(modelURL),{itemSize}=await import(catalogURL);
    const others=[{id:'bookshelf',...baseline.rooms[0].shelf},{id:'carpet',...baseline.rooms[0].furniture.carpet}];
    for(const [axis,delta]of [['x',-.5],['x',.5],['y',-.5],['y',.5]]){
     const next={...desk,[axis]:desk[axis]+delta},chair=chairForDesk(next);
     if(chair&&canPlaceGroup([{id:'desk',...next},{id:'chair',...chair}],others))return {id:axis==='y'?'#bookshelf-depth':'#bookshelf-gap',value:axis==='y'?next.y:next.direction==='right'?FLOOR.width-itemSize('desk',next.direction).w-next.x:next.x,desk:next};
    }
    return null;
   },{desk:before.desk,modelURL,catalogURL,baseline});
   assert(change,'representative linked placement has a legal half-cell neighbor');await range(f,change.id,change.value);
   const after=await assertPair(f);assert.deepEqual(after.desk,change.desk);assert.notDeepEqual(after.chair,before.chair);
   assert.equal(await f.locator('#placement-done').isEnabled(),true);return after;
  };
  const expectedSave=(base,poses)=>{const result=structuredClone(base);result.rooms[0].furniture.desk=poses.desk;result.rooms[0].furniture.chair={...poses.chair,attachedTo:'desk'};return result;};
  const dragAndCancelPair=async f=>{
   const before=await assertPair(f),saved=await readSave();await f.locator('#overview').click();
   const canvasPositions=()=>f.locator('[data-furniture="desk"] canvas.furniture-paint,[data-furniture="chair"] canvas').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {kind:n.parentElement.dataset.furniture+':'+n.className,x:r.x,y:r.y};}));
   const beforeCanvas=await canvasPositions();assert.equal(beforeCanvas.length,3,'desk, chair and desk-front overlay are present');
   const movement=await f.evaluate(async({desk,modelURL,catalogURL,baseline})=>{
    const {chairForDesk,canPlaceGroup,floorPoint}=await import(modelURL),{itemSize}=await import(catalogURL),size=itemSize('desk',desk.direction);
    const others=[{id:'bookshelf',...baseline.rooms[0].shelf},{id:'carpet',...baseline.rooms[0].furniture.carpet}];
    for(const [axis,delta]of [['x',-.5],['x',.5],['y',-.5],['y',.5]]){const next={...desk,[axis]:desk[axis]+delta},chair=chairForDesk(next);if(!chair||!canPlaceGroup([{id:'desk',...next},{id:'chair',...chair}],others))continue;
     const a=floorPoint(desk.x+size.w/2,desk.y+size.d),b=floorPoint(next.x+size.w/2,next.y+size.d),scale=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#world')).transform).a;return {desk:next,dx:(b.x-a.x)*scale,dy:(b.y-a.y)*scale};}
    return null;
   },{desk:before.desk,modelURL,catalogURL,baseline});assert(movement);
   const chair=f.locator('[data-furniture="chair"]');await chair.evaluate(el=>el.addEventListener('pointerdown',e=>{el.dataset.testPointerId=String(e.pointerId);},{once:true}));
   const box=await chair.boundingBox(),start={x:box.x+box.width/2,y:box.y+box.height/2};await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(start.x+movement.dx,start.y+movement.dy,{steps:4});
   const moved=await assertPair(f);assert.deepEqual(moved.desk,movement.desk);assert.notDeepEqual(moved.chair,before.chair);
   const movedCanvas=await canvasPositions();for(let i=0;i<beforeCanvas.length;i++){assert.equal(movedCanvas[i].kind,beforeCanvas[i].kind);assert(Math.abs(movedCanvas[i].x-beforeCanvas[i].x)+Math.abs(movedCanvas[i].y-beforeCanvas[i].y)>1,'real pointer drag moves each furniture and overlay canvas');}
   await chair.evaluate(el=>{const pointerId=Number(el.dataset.testPointerId);if(!el.hasPointerCapture(pointerId))throw new Error('real mouse pointer was not captured');el.dispatchEvent(new PointerEvent('pointercancel',{pointerId,pointerType:'mouse',bubbles:true}));});await page.mouse.up();
   assert.deepEqual(await assertPair(f),before);assert.deepEqual(await canvasPositions(),beforeCanvas,'pointer cancellation restores all rendered canvas positions');assert.deepEqual(await readSave(),saved,'drag and pointer cancellation do not change committed data');
  };
  let f=await open();assert.deepEqual(await readSave(),baseline);
  await f.getByRole('button',{name:'의자 놓기',exact:true}).click();assert.equal(await link(f).isChecked(),true);
  const initial=await assertPair(f);assert.deepEqual(initial.desk,baseline.rooms[0].furniture.desk,'a valid existing desk stays where it was');assert.deepEqual(await readSave(),baseline);
  await range(f,'#bookshelf-depth',3);assert.equal(await f.locator('#placement-done').isDisabled(),true,'linked desk cannot move into the unrelated bookshelf');assert.equal(await f.locator('#placement-warning').isVisible(),true);assert.deepEqual(await readSave(),baseline);
  await range(f,'#bookshelf-depth',3.5);assert.equal(await f.locator('#placement-done').isEnabled(),true);await assertPair(f);
  const views={};
  for(const id of ['left','center','right']){
   await direction(f,id);const poses=await assertPair(f);assert.equal(poses.desk.direction,id);assert.equal(await f.locator('#placement-done').isEnabled(),true);assert.deepEqual(await readSave(),baseline);views[id]=poses;
   assert.deepEqual(poses.desk,{direction:id,...{left:{x:3.5,y:4},center:{x:3.5,y:0},right:{x:9,y:3.5}}[id]},'linked direction changes start from the visually approved pair poses');
   await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'chair-desk-link-'+id+'.png')});
  }
  const firstPair=await pair(f);await f.locator('#placement-done').click();let committed=expectedSave(baseline,firstPair);assert.deepEqual(await readSave(),committed);
  await close(f);f=await open();assert.deepEqual(await assertPair(f),firstPair);assert.deepEqual(await readSave(),committed,'reopen preserves the exact fractional linked pose');
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await dragAndCancelPair(f);await f.getByRole('button',{name:'취소',exact:true}).click();
  await f.getByRole('button',{name:'책상 배치',exact:true}).click();await direction(f,'center');await movePair(f);assert.deepEqual(await readSave(),committed);await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await assertPair(f),firstPair);assert.deepEqual(await readSave(),committed);
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await direction(f,'left');await assertPair(f);await f.locator('[data-tab="diary"]').click();await f.locator('[data-tab="room"]').click();assert.deepEqual(await assertPair(f),firstPair);assert.deepEqual(await readSave(),committed,'leaving the menu discards both linked drafts');
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();const retryPair=await movePair(f);
  await f.evaluate(()=>{window.__originalSetItem=Storage.prototype.setItem;window.__failHouseSave=true;window.__houseWrites=[];Storage.prototype.setItem=function(key,value){if(key.startsWith('ojjuda-house-playtest-v1:')){window.__houseWrites.push({failed:window.__failHouseSave,data:JSON.parse(value)});if(window.__failHouseSave)throw new DOMException('quota','QuotaExceededError');}return window.__originalSetItem.call(this,key,value);};});
  await f.locator('#placement-done').click();assert.equal(await f.locator('#placement-done').isVisible(),true);assert.equal(await f.locator('#save-warning').isVisible(),true);assert.deepEqual(await readSave(),committed);assert.deepEqual(await assertPair(f),retryPair,'failed save keeps both drafts available for retry');
  const failedWrites=await f.evaluate(()=>window.__houseWrites);assert.equal(failedWrites.length,1);assert.deepEqual(failedWrites[0].data,expectedSave(committed,retryPair),'the attempted single write already contains both linked poses');
  await f.evaluate(()=>{window.__failHouseSave=false;});await f.locator('#placement-done').click();committed=expectedSave(committed,retryPair);assert.deepEqual(await readSave(),committed);assert.equal(await f.locator('#save-warning').isVisible(),false);const retryWrites=await f.evaluate(()=>window.__houseWrites);assert.equal(retryWrites.length,2);assert.deepEqual(retryWrites[1].data,committed);await f.evaluate(()=>{Storage.prototype.setItem=window.__originalSetItem;});
  await f.getByRole('button',{name:'책상 배치',exact:true}).click();await direction(f,'right');const rightPair=await assertPair(f);await f.locator('#placement-done').click();committed=expectedSave(committed,rightPair);assert.deepEqual(await readSave(),committed);
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await link(f).uncheck();await ready(f);assert.deepEqual(await pose(f,'desk'),rightPair.desk);assert.deepEqual(await pose(f,'chair'),plain(runtime.views.left.placement),'unlink restores the registered standalone starting pose');
  await f.locator('#placement-done').click();const standalone=structuredClone(committed);standalone.rooms[0].furniture.chair=plain(runtime.views.left.placement);assert.deepEqual(await readSave(),standalone);
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();assert.equal(await link(f).isChecked(),false,'an existing independent chair is not silently linked');await link(f).check();const relinked=await assertPair(f);await f.locator('#placement-done').click();committed=expectedSave(standalone,relinked);assert.deepEqual(await readSave(),committed);
  await f.locator('#overview').click();await f.waitForFunction(()=>getComputedStyle(document.querySelector('#notice')).opacity==='0');await page.screenshot({path:path.join(proof,'chair-desk-link-desktop.png')});
  await page.setViewportSize({width:390,height:844});await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await f.getByRole('button',{name:'의자 배치',exact:true}).click();assert.equal(await link(f).isChecked(),true);await movePair(f);await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'chair-desk-link-mobile.png')});await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await readSave(),committed);
  await f.getByRole('button',{name:'의자 배치',exact:true}).click();await f.getByRole('button',{name:'회수',exact:true}).click();const chairRemoved=structuredClone(committed);delete chairRemoved.rooms[0].furniture.chair;assert.deepEqual(await readSave(),chairRemoved);assert.deepEqual(await pose(f,'desk'),committed.rooms[0].furniture.desk,'removing the child keeps its parent');
  await f.getByRole('button',{name:'의자 놓기',exact:true}).click();await assertPair(f);await f.locator('#placement-done').click();await f.getByRole('button',{name:'책상 배치',exact:true}).click();await f.getByRole('button',{name:'책상과 의자 회수',exact:true}).click();const bothRemoved=structuredClone(chairRemoved);delete bothRemoved.rooms[0].furniture.desk;assert.deepEqual(await readSave(),bothRemoved);assert.equal(await f.locator('[data-furniture="desk"],[data-furniture="chair"]').count(),0);
  await close(f);f=await open();assert.deepEqual(await readSave(),bothRemoved);assert.equal(await f.locator('[data-furniture="desk"],[data-furniture="chair"]').count(),0,'removed pair stays removed after reopening');assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'chair-desk-link-verification.json'),JSON.stringify({newChairLinksToExistingDesk:true,views,independentOverlapMeasurement:.5,parentAndChildMovement:true,realPointerDragMovesAllThreeCanvases:true,pointerCancelRestoresBothPosesAndCanvases:true,unrelatedFurnitureCollisionRejected:true,cancelAndMenuExitPreserved:true,atomicSaveFailureAndRetry:true,savedAndReopened:true,unlinkAndRelink:true,standaloneNotAutomaticallyLinked:true,childRemovalPreservesDesk:true,parentRemovalRemovesBoth:true,mobileMovementAndNoOverflow:true,existingShelfCarpetAndDiaryPreserved:true,errors,missing},null,2));
  console.log('CHAIR DESK LINK PASS: exact half-cell tuck, grouped direction/move, atomic save/retry, cancel/menu exit, unlink/relink, removal and mobile');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
