const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');const root=path.resolve(__dirname,'..');
const parent=`<!doctype html><html><body><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js';window.testAuth={admin:true,id:'admin-a'};document.querySelector('#open').onclick=()=>{const owner=testAuth.id;openHouseTest({owner,authorized:()=>testAuth.admin&&testAuth.id===owner});};</script></body></html>`;
const roomFitsViewportWidth=()=>{const room=document.querySelector('.room.selected').getBoundingClientRect(),view=document.querySelector('#viewport').getBoundingClientRect(),scale=room.width/1507,left=room.left+12*scale-view.left,right=view.right-(room.right-12*scale);return left>=-.5&&right>=-.5&&left<=20.5&&right<=20.5&&Math.abs(left-right)<1;};
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2.75,hasTouch:true});await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/admin-fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});const page=await context.newPage(),errors=[];await page.clock.install({time:new Date('2026-10-01T18:30:00+09:00')});page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/house-test/index.html');assert.equal(await page.locator('#app').isVisible(),false);await page.goto('https://fixture.test/admin-fixture');await page.locator('#open').click();const frame=()=>page.frames().find(f=>f.url().includes('/house-test/index.html'));await page.waitForSelector('iframe');await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});const f=frame();await f.locator('.room-bg').evaluate(async img=>{if(!img.complete)await new Promise(resolve=>img.onload=resolve);});
assert.equal(await f.locator('.room').count(),1);assert.equal(await f.locator('.apartment-neighbor[aria-hidden="true"]').count(),34);assert.match(await f.locator('#room-count').textContent(),/1 \/ 35/);
await f.waitForFunction(roomFitsViewportWidth);
await page.screenshot({path:'/tmp/house-playtest-mobile.png'});
// Approved assets, clock boundaries, half-cell placement, rollback and curtains.
assert.equal(await f.locator('.curtains').count(),1);
assert.equal(await f.locator('.bookshelf').count(),1);
assert.equal(await f.locator('.furniture').count(),2,'approved bookshelf and desk art are present');
assert.equal(await f.locator('.desk').count(),1);
assert.equal(await f.locator('.chair,.plant,.side-table,.sky').count(),0);
const clock=await f.evaluate(async()=>{const m=await import('/house-test/model.js');return ['05:59','06:00','07:59','08:00','17:59','18:00','19:59','20:00','23:59','00:00'].map(t=>m.roomPeriod(new Date('2026-10-01T'+t+':00+09:00')));});
assert.deepEqual(clock,['night','dusk','dusk','day','day','dusk','dusk','night','night','night']);
for(const [hour,period] of [[8,'day'],[18,'dusk'],[20,'night'],[6,'dusk']]){await page.clock.setSystemTime(new Date(`2026-10-01T${String(hour).padStart(2,'0')}:00:00+09:00`));await page.clock.runFor(15001);assert.match(await f.locator('.room-bg').getAttribute('src'),new RegExp(`room-${period}-v3.webp`));assert.match(await f.locator('#viewport').evaluate(n=>getComputedStyle(n).backgroundImage),/apartment-wall-v1.webp/);}
await page.clock.resume();
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
assert.equal(await f.locator('.floor-grid').count(),1);
assert.equal(await f.locator('.move-controls').count(),0);
assert.equal(await f.getByRole('button',{name:/책장 [←↑↓→]/}).count(),0);
const setShelfRange=async(id,value)=>{await f.locator(id).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);await f.waitForFunction(()=>document.querySelector('.bookshelf').dataset.renderState==='ready');};

const calibration=await f.evaluate(async()=>{const {floorPoint,floorCell}=await import('/house-test/model.js');let error=0;for(let y=0;y<=7;y+=.5)for(let x=0;x<=10;x+=.5){const p=floorPoint(x,y),c=floorCell(p.x,p.y);error=Math.max(error,Math.abs(c.x-x),Math.abs(c.y-y));}return {corners:[[0,0],[10,0],[10,7],[0,7]].map(([x,y])=>floorPoint(x,y)),error};});
for(const [i,wanted] of [[293,614],[1209,614],[1494,910],[12,910]].entries()){assert.ok(Math.abs(calibration.corners[i].x-wanted[0])<.001);assert.ok(Math.abs(calibration.corners[i].y-wanted[1])<.001);}assert.ok(calibration.error<1e-9);
const roomFillsViewport=()=>{const room=document.querySelector('.room.selected').getBoundingClientRect(),viewport=document.querySelector('#viewport'),view=viewport.getBoundingClientRect(),w=viewport.clientWidth,h=viewport.clientHeight,scale=room.width/1507,inset=Math.min(20,Math.min(w,h)*.028),left=room.left+12*scale-view.left,right=view.left+w-(room.right-12*scale),top=room.top+27*scale-view.top,bottom=view.top+h-(room.top+916*scale);return scale>=Math.max(w/1483,h/889)*.944-.001&&Math.max(left,right,top,bottom)<=inset+.5&&((Math.abs(left-inset)<.5&&Math.abs(right-inset)<.5)||(Math.abs(top-inset)<.5&&Math.abs(bottom-inset)<.5));};
await f.waitForFunction(roomFillsViewport);
await page.screenshot({path:'/tmp/house-grid-aligned.png'});
assert.deepEqual(await f.locator('.room-bg').evaluate(im=>({width:im.naturalWidth,height:im.naturalHeight})),{width:1507,height:1044});
await setShelfRange('#bookshelf-gap',.5);
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'8.5');
await f.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'9');
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
for(const direction of ['left','center','right']){
 await f.locator(`[data-direction="${direction}"]:not(.furniture)`).click();assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),direction);await f.waitForFunction(()=>document.querySelector('.bookshelf').dataset.renderState==='ready');assert.match(await f.locator('.bookshelf canvas').getAttribute('data-sources'),new RegExp(`bookshelf-${direction}-v2.webp`));
 // Check the actual rasterized foot pixels against the visible grid,
 // not just the logical saved position or an image bounding rectangle.
 const contactPainted=await f.locator('.bookshelf').evaluate(async button=>{
  const {shelfGeometry}=await import('/house-test/furniture.js');
  const g=shelfGeometry({x:Number(button.dataset.x),y:Number(button.dataset.y),direction:button.dataset.direction}),canvas=button.querySelector('canvas'),ctx=canvas.getContext('2d'),density=Number(canvas.dataset.density);
  const alpha=(x,y)=>x>=0&&y>=0&&x<canvas.width&&y<canvas.height?ctx.getImageData(x,y,1,1).data[3]:0;
  return g.faces.filter(face=>face.part==='body'&&face.plane!=='top').every(face=>face.target.slice(2).every(p=>{
   const x=Math.round((p.x-g.left)*density),y=Math.round((p.y-g.top)*density);
   for(let dy=-8*density;dy<=0;dy++)for(let dx=-3*density;dx<=3*density;dx++)if(alpha(Math.round(x+dx),Math.round(y+dy))>100)return true;
   return false;
  }));
 });assert.ok(contactPainted,`${direction} bookshelf lower body must actually be painted at floor contact`);
 await f.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));await f.waitForFunction(()=>[...document.querySelectorAll('.furniture')].every(n=>n.dataset.renderState==='ready'));await page.screenshot({path:`/tmp/house-shelf-${direction}.png`});
}
// Wall spacing and depth are independent controls for the same saved pose.
await setShelfRange('#bookshelf-depth',1.5);
const sliderTouch=await context.newCDPSession(page),gapSlider=await f.locator('#bookshelf-gap').boundingBox();
const touchRangePoint=fraction=>({x:gapSlider.x+8+(gapSlider.width-16)*fraction,y:gapSlider.y+gapSlider.height/2,id:1});
await sliderTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchRangePoint(0)]});
for(const fraction of [.1,.2,.3])await sliderTouch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touchRangePoint(fraction)]});
await sliderTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
assert.ok(Number(await f.locator('#bookshelf-gap').inputValue())>0,'touch dragging the range moves the shelf away from its wall');
assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),'right');
assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'1.5');
await sliderTouch.detach();
await setShelfRange('#bookshelf-gap',1);
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'8');
assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'1.5');
assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),'right');
assert.equal(await f.locator('#bookshelf-gap-value').textContent(),'1칸');
await page.screenshot({path:'/tmp/house-shelf-wall-gap-mobile.png'});
await setShelfRange('#bookshelf-gap',1.5);
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'7.5');
await setShelfRange('#bookshelf-gap',0);
await setShelfRange('#bookshelf-depth',4);
assert.equal(await f.locator('#placement-done').isDisabled(),true,'bookshelf cannot overlap the approved desk reservation');
assert.equal(await f.locator('#placement-warning').isVisible(),true);
await setShelfRange('#bookshelf-depth',1.5);
await setShelfRange('#bookshelf-gap',4);
assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),'right');
assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'1.5');
await f.locator('button[data-direction="center"]:not(.furniture)').click();
assert.equal(await f.locator('#bookshelf-gap').isVisible(),true);
assert.equal(await f.locator('#bookshelf-gap-label').textContent(),'좌우 위치');
assert.equal(await f.getByRole('slider',{name:'책장 좌우 위치',exact:true}).getAttribute('max'),'8');
await setShelfRange('#bookshelf-depth',1.5);
for(const x of [0,8,3.5]){
 await setShelfRange('#bookshelf-gap',x);
 assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),String(x));
 assert.equal(await f.locator('.bookshelf').getAttribute('data-direction'),'center');
 assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'1.5');
}
await f.getByRole('button',{name:'배치 완료',exact:true}).click();
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
assert.equal(await f.locator('#bookshelf-gap').inputValue(),'3.5','frontal lateral position is saved');
await setShelfRange('#bookshelf-gap',6);
await f.getByRole('button',{name:'취소',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'3.5','cancel restores saved frontal position');
await f.getByRole('button',{name:'책장 배치',exact:true}).click();
await f.evaluate(()=>Promise.all([...document.images].map(im=>im.decode())));
await f.waitForFunction(()=>document.querySelector('.bookshelf').dataset.renderState==='ready');
await page.screenshot({path:'/tmp/house-frontal-sliders.png'});
await f.locator('button[data-direction="right"]:not(.furniture)').click();
const projection=await f.evaluate(async()=>{
 const {shelfGeometry,transformPoint}=await import('/house-test/furniture.js');const {shelfSize}=await import('/house-test/model.js');let error=0,poses=0;
 for(const direction of ['left','center','right']){const {w,d}=shelfSize(direction);for(let y=0;y<=7-d;y+=.5)for(let x=0;x<=10-w;x+=.5){
  const geometry=shelfGeometry({direction,x,y});if(!Number.isFinite(geometry.width)||!Number.isFinite(geometry.height))throw new Error('Invalid furniture bounds');poses++;
  for(const face of geometry.faces){if(!face.matrix)continue;for(const index of [2,3]){const p=transformPoint(face.matrix,face.source[index]),target=face.target[index];error=Math.max(error,Math.hypot(p.x-target.x,p.y-target.y));}}
 }}return {error,poses};
});assert.equal(projection.poses,639);assert.ok(projection.error<1e-7);
const shelfBox=await f.locator('.bookshelf').boundingBox();await page.mouse.move(shelfBox.x+shelfBox.width/2,shelfBox.y+shelfBox.height/2);await page.mouse.down();await page.mouse.move(shelfBox.x+shelfBox.width/2-60,shelfBox.y+shelfBox.height/2+12,{steps:5});await page.mouse.up();const draggedX=Number(await f.locator('.bookshelf').getAttribute('data-x'));assert.ok(draggedX<9&&Number.isInteger(draggedX*2));
await f.locator('button[data-direction="center"]:not(.furniture)').click();await f.locator('button[data-direction="right"]:not(.furniture)').click();
await setShelfRange('#bookshelf-depth',.5);
await f.getByRole('button',{name:'배치 완료',exact:true}).click();
assert.equal(await f.locator('.bookshelf').getAttribute('data-y'),'0.5');
await f.getByRole('button',{name:'방 설정',exact:true}).click();
await f.getByRole('button',{name:'커튼 걷기',exact:true}).click();assert.equal(await f.locator('.curtains').count(),0);
await f.getByRole('button',{name:'커튼 달기',exact:true}).click();assert.equal(await f.locator('.curtains').count(),1);
await page.clock.setSystemTime(new Date('2026-10-01T23:31:00+09:00'));await page.clock.runFor(15001);await page.clock.resume();
await f.waitForFunction(()=>[...document.querySelectorAll('.furniture')].every(n=>n.dataset.renderState==='ready'));
const painted=await f.evaluate(async()=>{
 const {furnitureGeometry}=await import('/house-test/furniture.js');
 return [['bookshelf','body','front',.86]].map(([id,part,plane,v])=>{
  const button=document.querySelector('.'+id),g=furnitureGeometry(id,{x:Number(button.dataset.x),y:Number(button.dataset.y),direction:button.dataset.direction}),face=g.faces.find(f=>f.part===part&&f.plane===plane),c=button.querySelector('canvas'),density=Number(c.dataset.density),ctx=c.getContext('2d');
  const [a,b,d,e]=face.target,p={x:((a.x+b.x)*(1-v)+(d.x+e.x)*v)/2,y:((a.y+b.y)*(1-v)+(d.y+e.y)*v)/2};
  return {id,alpha:ctx.getImageData(Math.round((p.x-g.left)*density),Math.round((p.y-g.top)*density),1,1).data[3]};
 });
});assert.ok(painted.every(p=>p.alpha>150),JSON.stringify(painted));
await page.setViewportSize({width:390,height:844});await f.locator('#home-view').click();
await page.screenshot({path:'/tmp/house-picture-only-mobile.png'});
assert.equal(await f.locator('.actor,.dog,[data-tab="pet"],[data-tab="closet"]').count(),0);await f.locator('[data-tab="diary"]').click();
const transform=await f.locator('#world').getAttribute('style');await f.locator('#zoom-in').click();assert.notEqual(await f.locator('#world').getAttribute('style'),transform);await f.locator('#home-view').click();
const touch=await context.newCDPSession(page),area=await f.locator('#viewport').boundingBox(),touchY=area.y+15;const zoomBefore=await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a);await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:120,y:touchY,id:1},{x:240,y:touchY,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:80,y:touchY,id:1},{x:280,y:touchY,id:2}]});await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.ok(await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)>zoomBefore);await f.locator('#home-view').click();
await f.locator('#expand').click();assert.equal(await f.locator('.expansion').count(),34);assert.equal(await f.locator('.expansion:not(:disabled)').count(),4);
const expansionFit=await f.evaluate(()=>{const v=document.querySelector('#viewport'),inset=Math.min(20,Math.min(v.clientWidth,v.clientHeight)*.028);return {scale:new DOMMatrix(getComputedStyle(document.querySelector('#world')).transform).a,expected:Math.min((v.clientWidth-inset*2)/(1483+1547*2),(v.clientHeight-inset*2)/(889+1084*2))};});
assert.ok(Math.abs(expansionFit.scale-expansionFit.expected)<.000001,'expansion fits only our room and four reachable neighbors');
await f.locator('#viewport').dispatchEvent('wheel',{deltaY:100000});assert.ok(Math.abs(await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)-expansionFit.scale)<.000001,'zooming out from expansion never jumps to a different fit');
await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).click();await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).click();assert.equal(await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).isDisabled(),true);
assert.ok(await f.evaluate(()=>{const v=document.querySelector('#viewport').getBoundingClientRect();return [...document.querySelectorAll('.expansion:not(:disabled)')].every(n=>{const r=n.getBoundingClientRect(),x=(r.left+r.right)/2,y=(r.top+r.bottom)/2;return x>=v.left&&x<=v.right&&y>=v.top&&y<=v.bottom;});}),'newly reachable neighbors stay visible after adding rooms');

const model=await f.evaluate(async()=>{const {normalize,canAdd}=await import('/house-test/model.js');let state=normalize({rooms:[{x:0,y:0},{x:50,y:0},{x:2,y:3},{x:0,y:0}],diary:3});const disconnected=state.rooms.length;for(let i=0;i<8;i++)for(let y=-3;y<=3;y++)for(let x=-2;x<=2;x++)if(canAdd(state.rooms,{x,y}))state.rooms.push({x,y});return {disconnected,count:state.rooms.length,overflow:canAdd(state.rooms,{x:3,y:0})};});assert.deepEqual(model,{disconnected:1,count:35,overflow:false});
await f.locator('#expand').click();await f.locator('#overview').click();
for(const key of ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown'])await f.locator('#viewport').evaluate((v,key)=>{for(let i=0;i<30;i++)v.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));},key);
assert.ok(await f.evaluate(()=>{const v=document.querySelector('#viewport'),box=v.getBoundingClientRect();return [...document.querySelectorAll('.room')].every(n=>{const r=n.getBoundingClientRect(),scale=r.width/1507;return r.left+12*scale>=box.left-.5&&r.right-12*scale<=box.left+v.clientWidth+.5&&r.top+27*scale>=box.top-.5&&r.top+916*scale<=box.top+v.clientHeight+.5;});}),'overview dragging keeps all three owned rooms available');
const firstRoom=await f.locator('.room[data-room="0:0"]').boundingBox();await page.mouse.click(firstRoom.x+firstRoom.width/2,firstRoom.y+firstRoom.width/1507*750);
assert.equal(await f.locator('.room.selected').getAttribute('data-room'),'0:0','overview still lets us enter another owned room');
await f.locator('#expand').click();
await page.screenshot({path:'/tmp/house-playtest-expansion.png'});await f.locator('[data-tab="diary"]').click();await f.locator('#diary').fill('파스텔 우리집 테스트 기록');await f.getByRole('button',{name:'기록 저장',exact:true}).click();await f.locator('#exit').click();await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});assert.match(await frame().locator('#room-count').textContent(),/3 \/ 35/);assert.equal(await frame().locator('.bookshelf').getAttribute('data-y'),'0.5');assert.equal(await frame().locator('.furniture').count(),2);await frame().locator('[data-tab="diary"]').click();assert.equal(await frame().locator('#diary').inputValue(),'파스텔 우리집 테스트 기록');
await page.evaluate(()=>testAuth.id='admin-b');await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});assert.match(await frame().locator('#room-count').textContent(),/1 \/ 35/);await page.evaluate(()=>testAuth.admin=false);await page.waitForSelector('iframe',{state:'detached'});await page.locator('#open').click();assert.equal(await page.locator('iframe').count(),0);
const roomWithinCameraBounds=()=>{
 const v=document.querySelector('#viewport'),box=v.getBoundingClientRect(),room=document.querySelector('.room.selected').getBoundingClientRect(),scale=room.width/1507,inset=Math.min(20,Math.min(v.clientWidth,v.clientHeight)*.028);
 const axis=(start,end,size)=>end-start<=size-inset*2+.5?start>=inset-.5&&end<=size-inset+.5:start<=inset+.5&&end>=size-inset-.5;
 return axis(room.left+12*scale-box.left,room.right-12*scale-box.left,v.clientWidth)&&axis(room.top+27*scale-box.top,room.top+916*scale-box.top,v.clientHeight);
};
const pushCameraToEdges=async f=>{
 for(const key of ['ArrowLeft','ArrowUp','ArrowRight','ArrowDown']){
  await f.locator('#viewport').evaluate((v,key)=>{for(let i=0;i<80;i++)v.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true}));},key);
  assert.ok(await f.evaluate(roomWithinCameraBounds),'arrow keys stop at room bounds');
 }
 const area=await f.locator('#viewport').boundingBox();await page.mouse.move(area.x+2,area.y+area.height/2);await page.mouse.down();await page.mouse.move(area.x+4000,area.y-4000,{steps:3});await page.mouse.up();
 assert.ok(await f.evaluate(roomWithinCameraBounds),'an extreme captured mouse drag cannot lose the room');
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:area.x+2,y:area.y+area.height/2,id:1}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:area.x+area.width-2,y:area.y+10,id:1}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(await f.evaluate(roomWithinCameraBounds),'touch dragging stops at room bounds');
};
const assertMinimumRoomZoom=async f=>{
 for(let i=0;i<30;i++)await f.locator('#zoom-out').evaluate(n=>n.click());
 const minimum=await f.evaluate(()=>{const v=document.querySelector('#viewport'),inset=Math.min(20,Math.min(v.clientWidth,v.clientHeight)*.028);return {scale:new DOMMatrix(getComputedStyle(document.querySelector('#world')).transform).a,expected:.68*Math.min((v.clientWidth-inset*2)/1483,(v.clientHeight-inset*2)/889)};});
 assert.ok(Math.abs(minimum.scale-minimum.expected)<.000001,'repeated minus keeps a single room at 68% of the available contained fit');
 assert.equal(await f.locator('#zoom-out').isDisabled(),true);
 for(let i=0;i<15;i++)await f.locator('#viewport').dispatchEvent('wheel',{deltaY:100000});
 const area=await f.locator('#viewport').boundingBox(),cx=area.x+area.width/2,cy=area.y+area.height/2;
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cx-60,y:cy,id:1},{x:cx+60,y:cy,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cx-2,y:cy,id:1},{x:cx+2,y:cy,id:2}]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 assert.ok(Math.abs(await f.locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)-minimum.scale)<.000001,'wheel and pinch share the same lower zoom limit');
 await pushCameraToEdges(f);
 for(const deltaY of [-10000,10000]){
  await f.locator('#viewport').evaluate((v,deltaY)=>{const r=v.getBoundingClientRect();v.dispatchEvent(new WheelEvent('wheel',{deltaY,clientX:r.right-2,clientY:r.top+2,bubbles:true,cancelable:true}));},deltaY);
  assert.ok(await f.evaluate(roomWithinCameraBounds),'off-center wheel zoom keeps the room within camera bounds');
 }
 await f.locator('#home-view').click();await f.locator('#zoom-in').click();await pushCameraToEdges(f);
 assert.equal(await f.locator('#zoom-out').isDisabled(),false);
};
await page.evaluate(()=>testAuth.admin=true);await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});for(const size of [{width:320,height:740},{width:844,height:390},{width:2560,height:1440},{width:1280,height:800}]){await page.setViewportSize(size);await frame().waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.ok(await frame().locator('#viewport').evaluate(n=>n.clientHeight>=180));await frame().locator('[data-tab="room"]').click();await frame().locator('#home-view').click();await frame().waitForFunction(roomFitsViewportWidth);const before=await frame().locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a);await frame().locator('#zoom-in').click();assert.ok(await frame().locator('#world').evaluate(n=>new DOMMatrix(getComputedStyle(n).transform).a)>before,'zoom-in still enlarges a screen-filling room');await assertMinimumRoomZoom(frame());await frame().locator('#home-view').click();}await page.screenshot({path:'/tmp/house-playtest-desktop.png'});
assert.deepEqual(errors,[]);console.log('PASS: preview gate, role/account isolation, Korea time boundaries, picture-only scene, bookshelf directions/half-cell save and cancel, curtains, movement/zoom, expansion bounds/connectivity, diary persistence and responsive layouts');}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1});
