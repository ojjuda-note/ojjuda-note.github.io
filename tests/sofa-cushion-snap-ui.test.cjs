const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.CUSHION_SNAP_PROOF_DIR||path.resolve(root,'../house-opening-proof/cushion-snap'),font=process.env.CHAIR_PROOF_FONT;
const owner='local-cushion-snap',key='ojjuda-house-playtest-v1:'+owner,version='20261006-vine1';
// Authored seat dimensions, deliberately independent of the snap helper.
const seats={'cream-floral-cushion':{u:.66,v:.58,width:.78,bottom:.81},'sage-cushion':{u:1.79,v:.48,width:.76,bottom:.81},'peach-cushion':{u:.63,v:.30,width:.68,bottom:.89},'pink-check-cushion':{u:2.91,v:.49,width:.74,bottom:.81}};
const labels={'cream-floral-cushion':'크림 꽃무늬 쿠션','sage-cushion':'세이지 쿠션','peach-cushion':'피치 쿠션','pink-check-cushion':'분홍 체크 쿠션'},ids=Object.keys(seats);
const sofas={left:{direction:'left',x:0,y:3},center:{direction:'center',x:3,y:0},right:{direction:'right',x:7.5,y:3}};
const expected=(id,sofa)=>{const s=seats[id],offset={left:{x:s.v-.25,y:3.5-s.u-s.width/2},center:{x:s.u-s.width/2,y:s.v-.25},right:{x:1.5-s.v-.25,y:s.u-s.width/2}}[sofa.direction];return {direction:sofa.direction,x:Number((sofa.x+offset.x).toFixed(6)),y:Number((sofa.y+offset.y).toFixed(6)),elevation:s.bottom};};
(async()=>{
 fs.mkdirSync(proof,{recursive:true});const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1100,height:960}}),errors=[],missing=[],results=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});if(font&&u.pathname==='/proof-font.otf')return route.fulfill({path:font,contentType:'font/otf'});if(u.pathname==='/favicon.ico')return route.fulfill({status:204});const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});});
  if(font)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:CushionProof;src:url(/proof-font.otf)}body,button,input,output{font-family:CushionProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');let f;
  const node=id=>f.locator('[data-furniture="'+id+'"]');
  const pose=id=>node(id).evaluate(n=>({direction:n.dataset.direction,x:Number(n.dataset.x),y:Number(n.dataset.y),...(n.dataset.elevation===undefined?{}:{elevation:Number(n.dataset.elevation)})}));
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const ready=()=>f.waitForFunction(()=>[...document.querySelectorAll('.furniture')].every(n=>n.dataset.renderState==='ready'));
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});f=page.frames().find(f=>f.url().includes('/house-test/index.html'));await ready();await f.evaluate(()=>document.fonts.ready);await f.locator('[data-tab="room"]').click();};
  const close=async()=>{await f.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const edit=async id=>{await f.locator('[data-category="accessories"]').click();await f.getByRole('button',{name:labels[id]+' 배치',exact:true}).click();await ready();await f.locator('#overview').click();};
  const dragTo=async(id,target,cancel=false)=>{
   const initial=await pose(id),movement=await f.evaluate(async({id,initial,target,version})=>{const {floorPoint}=await import('/house-test/model.js?v='+version),{itemSize}=await import('/house-test/furniture-catalog.js?v='+version),size=itemSize(id,initial.direction),from=floorPoint(initial.x+size.w/2,initial.y+size.d),to=floorPoint(target.x+size.w/2,target.y+size.d),scale=new DOMMatrixReadOnly(getComputedStyle(document.querySelector('#world')).transform).a;return {dx:(to.x-from.x)*scale,dy:(to.y-from.y)*scale};},{id,initial,target,version});
   const start=await node(id).evaluate(el=>{const b=el.getBoundingClientRect(),v=document.querySelector('#viewport').getBoundingClientRect();for(const fy of [.5,.25,.75])for(const fx of [.5,.25,.75]){const x=b.left+b.width*fx,y=b.top+b.height*fy,hit=document.elementFromPoint(x,y);if(x>v.left+2&&x<v.right-2&&y>v.top+2&&y<v.bottom-2&&(hit===el||el.contains(hit)))return {x,y};}throw new Error('Selected cushion has no pointer-accessible point');});
   const frameBox=await page.locator('iframe').boundingBox();await node(id).evaluate(el=>el.addEventListener('pointerdown',e=>el.dataset.testPointer=String(e.pointerId),{once:true}));await page.mouse.move(frameBox.x+start.x,frameBox.y+start.y);await page.mouse.down();assert(await node(id).evaluate(el=>el.hasPointerCapture(Number(el.dataset.testPointer))),'real mouse pointer is captured by the selected cushion');await page.mouse.move(frameBox.x+start.x+movement.dx,frameBox.y+start.y+movement.dy);await ready();
   if(cancel)await node(id).evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:Number(el.dataset.testPointer),pointerType:'mouse',bubbles:true})));await page.mouse.up();await ready();return pose(id);
  };
  for(const [direction,sofa]of Object.entries(sofas)){
   const baseline={version:13,rooms:[{x:0,y:0,decor:true,curtains:false,shelf:null,furniture:{sofa:{...sofa},'blanket-sofa':{direction:sofa.direction,x:sofa.x+{left:.38,center:.01,right:.02}[direction],y:sofa.y+{left:1.89,center:.38,right:.01}[direction],elevation:.025,mode:'sofa'},...Object.fromEntries(ids.map((id,i)=>[id,{direction:direction==='center'?'right':'center',x:3+i,y:5,elevation:0}]))}}],diary:'쿠션 자동 정렬 후에도 보존할 기록'};
   await page.evaluate(({key,baseline})=>localStorage.setItem(key,JSON.stringify(baseline)),{key,baseline});await open();
   for(const id of ids){
    const before=await read(),original=await pose(id);await edit(id);assert.equal(await f.locator('input[data-accessory]').count(),0,'obsolete parent accessory checkboxes are absent');const snapped=await dragTo(id,{x:sofa.x+.5,y:sofa.y+.5});assert.deepEqual(snapped,expected(id,sofa),direction+'/'+id+' snaps to the authored seat, direction and height');assert.equal(Number(await f.locator('#accessory-height').inputValue()),seats[id].bottom,'height control follows the snapped seat exactly');assert.equal(await f.locator('#panel-body button[data-direction="'+direction+'"]').getAttribute('aria-pressed'),'true');assert.deepEqual(await pose('sofa'),sofa);assert.deepEqual(await read(),before,'a drag only changes the draft');
    await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await pose(id),original);assert.deepEqual(await read(),before);
    await edit(id);await dragTo(id,{x:sofa.x+.5,y:sofa.y+.5});await f.getByRole('button',{name:'설치',exact:true}).click();const saved=await read();assert.deepEqual(saved.rooms[0].furniture[id],expected(id,sofa));assert.equal('attachedTo' in saved.rooms[0].furniture[id],false,'snapping does not create a parent link');for(const other of ids.filter(v=>v!==id))assert.deepEqual(saved.rooms[0].furniture[other],before.rooms[0].furniture[other]);
   }
   await close();await open();for(const id of ids)assert.deepEqual(await pose(id),expected(id,sofa));await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'snapped-'+direction+'.png')});
   // Pull every cushion away from its seat. The actual pointer path must
   // lower it to the floor; no separate height adjustment is required.
   const floorPoses={};
   for(const [index,id]of ids.entries()){
    const installed=await read(),away={x:(direction==='right'?2:4)+index*.5,y:5};
    if(index===0){await edit(id);assert.deepEqual(await dragTo(id,away,true),expected(id,sofa));assert.deepEqual(await read(),installed);await f.getByRole('button',{name:'취소',exact:true}).click();}
    await edit(id);const detached=await dragTo(id,away);assert.equal(detached.direction,sofa.direction);assert.equal(detached.elevation,0,'dragging '+id+' off the sofa places it on the floor');assert.equal(Number(await f.locator('#accessory-height').inputValue()),0,'the height slider follows the floor drop');assert(Math.hypot(detached.x-away.x,detached.y-away.y)<1e-5,'real pointer movement reaches the independent target within subpixel projection precision');assert.deepEqual(await read(),installed,'the floor drop remains a draft until installed');
    if(index===0){await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await pose(id),expected(id,sofa));assert.deepEqual(await read(),installed);await edit(id);await dragTo(id,away);}
    floorPoses[id]=await pose(id);await f.getByRole('button',{name:'설치',exact:true}).click();assert.deepEqual((await read()).rooms[0].furniture[id],floorPoses[id]);
   }
   await close();await open();for(const id of ids)assert.deepEqual(await pose(id),floorPoses[id],'installed floor placement survives reopening');await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'floor-'+direction+'.png')});
   const propPoses=Object.fromEntries(await Promise.all(ids.map(async id=>[id,await pose(id)])));await f.locator('[data-category="furniture"]').click();await f.getByRole('button',{name:'소파 배치',exact:true}).click();await f.locator('#bookshelf-depth').evaluate((input,y)=>{input.value=String(y);input.dispatchEvent(new Event('input',{bubbles:true}));},sofa.y+.5);await f.getByRole('button',{name:'설치',exact:true}).click();for(const id of ids)assert.deepEqual(await pose(id),propPoses[id],'later sofa movement never drags independent cushions along');results.push({direction,fourCushionsSnap:true,cancelAndSave:true,allFourFloorDropZeroHeight:true,dragAwayAndPointerCancel:true,noParentCoupling:true});await close();
   console.log('CUSHION SNAP VIEW PASS:',direction);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({results,errors,missing},null,2));console.log('CUSHION SNAP PASS: real pointer movement, authored four-cushion placement in three views, floor drops, independent save and cancellation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
