const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const parent=`<!doctype html><html><body><button id="open">새 우리집 테스트</button><script type="module">import{openHouseTest}from'/house-test/host.js';window.testAuth={admin:true,id:'admin-a'};document.querySelector('#open').onclick=()=>{const owner=testAuth.id;openHouseTest({owner,authorized:()=>testAuth.admin&&testAuth.id===owner});};</script></body></html>`;
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/admin-fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});const page=await context.newPage(),errors=[];await page.clock.install({time:new Date('2026-10-01T18:30:00+09:00')});page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/house-test/index.html');assert.equal(await page.locator('#app').isVisible(),false);await page.goto('https://fixture.test/admin-fixture');await page.locator('#open').click();const frame=()=>page.frames().find(f=>f.url().includes('/house-test/index.html'));await page.waitForSelector('iframe');await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});const f=frame();await f.locator('.room-bg').evaluate(async img=>{if(!img.complete)await new Promise(resolve=>img.onload=resolve);});
assert.equal(await f.locator('.room').count(),1);assert.match(await f.locator('#room-count').textContent(),/1 \/ 35/);
await page.screenshot({path:'/tmp/house-playtest-mobile.png'});
// Approved assets, clock boundaries, half-cell placement, rollback and curtains.
assert.equal(await f.locator('.curtains').count(),1);
assert.equal(await f.locator('.bookshelf').count(),1);
const clock=await f.evaluate(async()=>{const m=await import('/house-test/model.js');return ['05:59','06:00','07:59','08:00','17:59','18:00','19:59','20:00','23:59','00:00'].map(t=>m.roomPeriod(new Date('2026-10-01T'+t+':00+09:00')));});
assert.deepEqual(clock,['night','dusk','dusk','day','day','dusk','dusk','night','night','night']);
for(const [hour,period] of [[8,'day'],[18,'dusk'],[20,'night'],[6,'dusk']]){await page.clock.setSystemTime(new Date(`2026-10-01T${String(hour).padStart(2,'0')}:00:00+09:00`));await page.clock.runFor(15001);assert.match(await f.locator('.room-bg').getAttribute('src'),new RegExp(`room-${period}-v3.webp`));}
await page.clock.resume();
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
assert.equal(await f.locator('.floor-grid').count(),1);
const calibration=await f.evaluate(async()=>{const {floorPoint,floorCell}=await import('/house-test/model.js');let error=0;for(let y=0;y<=7;y+=.5)for(let x=0;x<=10;x+=.5){const p=floorPoint(x,y),c=floorCell(p.x,p.y);error=Math.max(error,Math.abs(c.x-x),Math.abs(c.y-y));}return {corners:[[0,0],[10,0],[10,7],[0,7]].map(([x,y])=>floorPoint(x,y)),error};});
for(const [i,wanted] of [[293,614],[1209,614],[1494,910],[12,910]].entries()){assert.ok(Math.abs(calibration.corners[i].x-wanted[0])<.001);assert.ok(Math.abs(calibration.corners[i].y-wanted[1])<.001);}assert.ok(calibration.error<1e-9);
await f.waitForFunction(()=>{const room=document.querySelector('.room').getBoundingClientRect(),view=document.querySelector('#viewport').getBoundingClientRect();return room.left-view.left>=20&&view.right-room.right>=20;});
await page.screenshot({path:'/tmp/house-grid-aligned.png'});
assert.deepEqual(await f.locator('.room-bg').evaluate(im=>({width:im.naturalWidth,height:im.naturalHeight})),{width:1507,height:1044});
await f.getByRole('button',{name:'책장 ← 0.5칸',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'8.5');
await f.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'9');
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
for(const direction of ['left','center','right']){
 await f.locator(`[data-direction="${direction}"]:not(.furniture)`).click();assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),direction);assert.match(await f.locator('.bookshelf img[data-part=body][data-plane=front]').getAttribute('src'),new RegExp(`bookshelf-${direction}-v1.webp`));
 // Check the actual CSS-transformed contact pixels against the visible grid,
 // not just the logical saved position or an image bounding rectangle.
 const contactError=await f.locator('.bookshelf').evaluate(button=>{
  const points=document.querySelector('.floor-grid polygon.contact').points;
  const contacts={right:{front:[[315,1368],[637,1501]],side:[[637,1501],[750,1429]]},left:{front:[[415,1481],[718,1374]],side:[[285,1438],[415,1481]]},center:{front:[[293,1470],[731,1470]],side:[[637,1501],[750,1429]]}}[button.dataset.direction];
  let error=0;[...button.querySelectorAll('img[data-part="body"]:not([data-plane="top"])')].forEach(image=>{
   const matrix=new DOMMatrix(getComputedStyle(image).transform),corners=image.dataset.corners.split(',').map(Number);
   contacts[image.dataset.plane].forEach(([x,y],i)=>{
    const p=matrix.transformPoint(new DOMPoint(x,y)),target=points[corners[i]];
    error=Math.max(error,Math.hypot(p.x/p.w+parseFloat(button.style.left)-target.x,p.y/p.w+parseFloat(button.style.top)-target.y));
   });
  });return error;
 });assert.ok(contactError<.1,`${direction} visible foot mismatch: ${contactError}`);
 await f.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));await page.screenshot({path:`/tmp/house-shelf-${direction}.png`});
}
const projection=await f.evaluate(async()=>{
 const {shelfGeometry,transformPoint}=await import('/house-test/furniture.js');const {shelfSize}=await import('/house-test/model.js');let error=0,poses=0;
 for(const direction of ['left','center','right']){const {w,d}=shelfSize(direction);for(let y=0;y<=7-d;y+=.5)for(let x=0;x<=10-w;x+=.5){
  const geometry=shelfGeometry({direction,x,y});if(!Number.isFinite(geometry.width)||!Number.isFinite(geometry.height))throw new Error('Invalid furniture bounds');poses++;
  for(const face of geometry.faces){if(!face.matrix)continue;for(const index of [2,3]){const p=transformPoint(face.matrix,face.source[index]),target=face.target[index];error=Math.max(error,Math.hypot(p.x-target.x,p.y-target.y));}}
 }}return {error,poses};
});assert.equal(projection.poses,639);assert.ok(projection.error<1e-7);
const shelfBox=await f.locator('.bookshelf').boundingBox();await page.mouse.move(shelfBox.x+shelfBox.width/2,shelfBox.y+shelfBox.height/2);await page.mouse.down();await page.mouse.move(shelfBox.x+shelfBox.width/2-60,shelfBox.y+shelfBox.height/2+12,{steps:5});await page.mouse.up();const draggedX=Number(await f.locator('.bookshelf').getAttribute('data-x'));assert.ok(draggedX<9&&Number.isInteger(draggedX*2));
await f.locator('button[data-direction="center"]').click();await f.locator('button[data-direction="right"]:not(.furniture)').click();
await f.getByRole('button',{name:'책장 ↓ 0.5칸',exact:true}).click();
await f.getByRole('button',{name:'배치 완료',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'0.5');
await f.getByRole('button',{name:'커튼 걷기',exact:true}).click();assert.equal(await f.locator('.curtains').count(),0);
await f.getByRole('button',{name:'커튼 달기',exact:true}).click();assert.equal(await f.locator('.curtains').count(),1);
// One desk at a time: inspect the three directions and reject a real shelf collision.
assert.equal(await f.locator('.desk').count(),1);
await page.clock.setSystemTime(new Date('2026-10-01T12:00:00+09:00'));await page.clock.runFor(15001);await page.clock.resume();
await page.setViewportSize({width:1050,height:950});
await f.locator('#home-view').click();await f.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
await page.screenshot({path:'/tmp/house-desk-right.png'});
await f.getByRole('button',{name:'책상 배치',exact:true}).click();
for(const direction of ['left','center']){
 await f.locator(`button[data-direction="${direction}"]:not(.furniture)`).click();
 assert.equal(await f.locator('.desk').getAttribute('data-direction'),direction);
 assert.match(await f.locator('.desk img[data-part=tabletop][data-plane=front]').getAttribute('src'),new RegExp(`desk-${direction}-v1.webp`));
 await f.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
 await page.screenshot({path:`/tmp/house-desk-${direction}.png`});
}
await f.locator('button[data-direction="right"]:not(.furniture)').click();
assert.ok(await f.locator('#placement-done').isDisabled(),'desk cannot be committed over the shelf');
assert.ok(await f.locator('#placement-warning').isVisible());
await f.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await f.locator('.desk').getAttribute('data-y'),'4','cancel restores the saved desk');
await f.getByRole('button',{name:'책상 배치',exact:true}).click();await f.getByRole('button',{name:'책상 ← 0.5칸',exact:true}).click();
assert.ok(await f.locator('#placement-done').isDisabled(),'desk cannot overlap the new chair');
await f.getByRole('button',{name:'취소',exact:true}).click();
await f.getByRole('button',{name:'책상 배치',exact:true}).click();await f.getByRole('button',{name:'책상 ↑ 0.5칸',exact:true}).click();
await f.getByRole('button',{name:'배치 완료',exact:true}).click();
assert.equal(await f.locator('.desk').getAttribute('data-y'),'3.5');
assert.equal(await f.locator('.chair').count(),1);
await f.getByRole('button',{name:'의자 배치',exact:true}).click();await f.getByRole('button',{name:'의자 → 0.5칸',exact:true}).click();
assert.ok(await f.locator('#placement-done').isDisabled(),'chair cannot overlap the desk');
await f.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await f.locator('.chair').getAttribute('data-x'),'7.5');
await page.setViewportSize({width:390,height:844});await f.locator('#home-view').click();
await page.screenshot({path:'/tmp/house-desk-mobile.png'});
await f.locator('[data-tab="pet"]').click();
const left=await f.locator('.actor:not(.dog)').evaluate(n=>parseFloat(n.style.left));const rect=await f.locator('#viewport').boundingBox(),roomBox=await f.locator('.room').boundingBox(),walkPoint=await f.evaluate(async()=>{const {floorPoint,ROOM}=await import('/house-test/model.js');const p=floorPoint(2,5);return {x:p.x/ROOM.width,y:p.y/ROOM.height};});await f.locator('#viewport').click({position:{x:roomBox.x+roomBox.width*walkPoint.x-rect.x,y:roomBox.y+roomBox.height*walkPoint.y-rect.y}});await f.waitForFunction(x=>parseFloat(document.querySelector('.actor:not(.dog)').style.left)!==x,left);
const transform=await f.locator('#world').getAttribute('style');await f.locator('#zoom-in').click();assert.notEqual(await f.locator('#world').getAttribute('style'),transform);await f.locator('#home-view').click();
const touch=await context.newCDPSession(page),area=await f.locator('#viewport').boundingBox(),touchY=area.y+area.height*.45;const zoomBefore=await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:touchY,id:1},{x:240,y:touchY,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:touchY,id:1},{x:280,y:touchY,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)>zoomBefore);await f.locator('#home-view').click();
await f.getByRole('button',{name:'따라오기',exact:true}).click();assert.equal(await f.getByRole('button',{name:'따라오기 멈춤',exact:true}).count(),1);
await f.getByRole('button',{name:'공 던지기',exact:true}).click();await f.waitForFunction(()=>document.querySelector('.dog').classList.contains('playing'));await f.waitForFunction(()=>document.querySelector('#notice').textContent.includes('공을 가져왔어요'),{},{timeout:10000});assert.equal(await f.locator('.ball').isVisible(),false);
await f.getByRole('button',{name:'쓰다듬기',exact:true}).click();assert.equal(await f.locator('.heart').count(),1);
await f.locator('#expand').click();assert.equal(await f.locator('.expansion').count(),34);assert.equal(await f.locator('.expansion:not(:disabled)').count(),4);await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).click();await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).click();assert.equal(await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).isDisabled(),true);
const model=await f.evaluate(async()=>{const {normalize,canAdd}=await import('/house-test/model.js');let state=normalize({rooms:[{x:0,y:0},{x:50,y:0},{x:2,y:3},{x:0,y:0}],diary:3});const disconnected=state.rooms.length;for(let i=0;i<8;i++)for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++)if(canAdd(state.rooms,{x,y}))state.rooms.push({x,y});return {disconnected,count:state.rooms.length,overflow:canAdd(state.rooms,{x:3,y:0})};});assert.deepEqual(model,{disconnected:1,count:35,overflow:false});
await page.screenshot({path:'/tmp/house-playtest-expansion.png'});await f.locator('[data-tab="diary"]').click();await f.locator('#diary').fill('파스텔 우리집 테스트 기록');await f.getByRole('button',{name:'기록 저장',exact:true}).click();await f.locator('#exit').click();await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});assert.match(await frame().locator('#room-count').textContent(),/3 \/ 35/);assert.equal(await frame().locator('.bookshelf').getAttribute('data-y'),'0.5');assert.equal(await frame().locator('.desk').getAttribute('data-y'),'3.5');assert.equal(await frame().locator('.chair').getAttribute('data-x'),'7.5');await frame().locator('[data-tab="diary"]').click();assert.equal(await frame().locator('#diary').inputValue(),'파스텔 우리집 테스트 기록');
await page.evaluate(()=>testAuth.id='admin-b');await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});assert.match(await frame().locator('#room-count').textContent(),/1 \/ 35/);await page.evaluate(()=>testAuth.admin=false);await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();assert.equal(await page.locator('iframe').count(),0);
await page.evaluate(()=>testAuth.admin=true);await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});for(const size of [{width:320,height:740},{width:844,height:390},{width:1280,height:800}]){await page.setViewportSize(size);await frame().waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(await frame().locator('#viewport').evaluate(n=>n.clientHeight>=180));await frame().locator('[data-tab="pet"]').click();}await page.screenshot({path:'/tmp/house-playtest-desktop.png'});
assert.deepEqual(errors,[]);console.log('PASS: preview gate, role/account isolation, Korea time boundaries, bookshelf and desk directions/half-cell save and cancel, inter-item collision, curtains, movement/zoom, pet fetch/follow, expansion bounds/connectivity, diary persistence and responsive layouts');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
