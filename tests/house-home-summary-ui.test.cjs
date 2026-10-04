const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_SUMMARY_PROOF_DIR||path.resolve(root,'../home-summary-proof');
const fixture=`<!doctype html><meta charset="utf-8"><button id="open">우리집</button><script type="module">
import{openHouseTest}from'/house-test/host.js';
window.owner='summary-a';window.profile={nick:'포근한 하루',bio:'소소한 일상 기록'};
window.teleportEnabled=true;window.teleportCalls=0;window.readOnly=false;
document.querySelector('#open').onclick=()=>{const id=owner;openHouseTest({owner:id,profile,readOnly,authorized:()=>owner===id,onTeleport:teleportEnabled?()=>{teleportCalls++;return new Promise((resolve,reject)=>{window.finishTeleport=error=>error?reject(new Error(error)):resolve();});}:null});};</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});if(u.pathname==='/proof.ttf'&&process.env.HOUSE_SUMMARY_PROOF_FONT)return route.fulfill({path:process.env.HOUSE_SUMMARY_PROOF_FONT});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(process.env.HOUSE_SUMMARY_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:SummaryProof;src:url(/proof.ttf)}html,body,button,input,textarea,select{font-family:SummaryProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');await page.locator('#open').click();await page.frameLocator('iframe').locator('#home-room-open').waitFor();
  let frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));await frame.evaluate(()=>document.fonts.ready);
  await frame.waitForFunction(()=>[...document.querySelectorAll('.room.selected img')].every(im=>im.complete)&&!document.querySelector('.room.selected [data-render-state="loading"]'));
  assert.equal(await frame.locator('#home-profile-nick').textContent(),'포근한 하루');assert.equal(await frame.locator('#home-profile-bio').textContent(),'소소한 일상 기록');
  assert.equal(await frame.locator('#app > header').isVisible(),false,'the summary does not repeat the World/back and Home heading');
  assert.equal(await frame.locator('#world').evaluate(el=>el.inert),true,'the preview cannot edit furniture');
  assert.equal(await frame.locator('#home-room-open').textContent(),'','room thumbnail has no visible label');
  const teleport=()=>frame.locator('#home-teleport');
  assert.equal(await teleport().isVisible(),true,'an enabled host exposes teleport in the home summary');
  await teleport().click();await page.waitForFunction(()=>teleportCalls===1);assert.equal(await teleport().isDisabled(),true,'teleport is disabled while a destination is being chosen');
  await teleport().evaluate(el=>{el.click();el.click();});assert.equal(await page.evaluate(()=>teleportCalls),1,'repeated clicks do not request multiple destinations');
  await page.evaluate(()=>finishTeleport('잠시 후 다시 이동해 주세요.'));await teleport().waitFor({state:'visible'});await frame.waitForFunction(()=>!document.querySelector('#home-teleport').disabled);
  await teleport().click();await page.waitForFunction(()=>teleportCalls===2);await page.evaluate(()=>finishTeleport());await frame.waitForFunction(()=>!document.querySelector('#home-teleport').disabled);
  await frame.getByRole('tab',{name:'노트',exact:true}).click();await frame.locator('#diary').fill('기존 기록');await frame.getByRole('button',{name:'기록 저장',exact:true}).click();
  await frame.waitForFunction(()=>getComputedStyle(document.querySelector('#notice')).opacity==='0');
  const saved=await frame.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:summary-a')));
  for(const [width,height]of [[390,844],[360,800],[320,568],[1280,900],[844,390]]){
   await page.setViewportSize({width,height});
   await frame.waitForFunction(()=>document.querySelector('#viewport').clientWidth>0);
   await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const boxes=await frame.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,bottom:r.bottom,right:r.right};};const roomStyle=getComputedStyle(document.querySelector('#viewport')),bioRange=document.createRange();bioRange.selectNodeContents(document.querySelector('#home-profile-bio'));return {scene:rect('#home-scene'),profile:rect('#home-profile'),bio:rect('#home-profile-bio'),bioTextRight:bioRange.getBoundingClientRect().right,teleport:rect('#home-teleport'),room:rect('#viewport'),panel:rect('#panel'),roomBorder:parseFloat(roomStyle.borderTopWidth)+parseFloat(roomStyle.borderRightWidth)+parseFloat(roomStyle.borderBottomWidth)+parseFloat(roomStyle.borderLeftWidth),roomRadius:parseFloat(roomStyle.borderTopLeftRadius),overflow:document.documentElement.scrollWidth>innerWidth};});
   assert(boxes.profile.right<=boxes.room.x+1,'profile stays left of the compact room in one row');assert(Math.abs(boxes.room.right-boxes.scene.right)<1,'no right inset around the room');assert(boxes.room.w<=420&&boxes.room.h<=220,'preview does not enlarge to full screen');assert(boxes.panel.y>=boxes.scene.bottom,'records start below the unified top row');assert.equal(boxes.overflow,false);
   assert.equal(boxes.roomBorder,0,'the room has no visible frame');assert(boxes.roomRadius>0,'the room keeps rounded corners');assert(boxes.bio.y>=boxes.room.bottom-1,'the introduction begins below the room');assert(Math.abs(boxes.bio.w-boxes.scene.w)<1,'the introduction spans the profile and room together');
   assert(boxes.teleport.x>=boxes.bioTextRight&&boxes.teleport.right<=boxes.scene.right+1&&boxes.teleport.y>=boxes.room.bottom-1&&boxes.teleport.bottom<=boxes.scene.bottom+1,'teleport fits to the right of the introduction without overlapping the room or records');
   const scrolling=await frame.evaluate(()=>{const app=document.querySelector('#app'),scene=document.querySelector('#home-scene'),panel=document.querySelector('#panel-body');const before=scene.getBoundingClientRect().y;app.scrollTop=60;return {distance:before-scene.getBoundingClientRect().y,scroll:app.scrollTop,panelOverflow:getComputedStyle(panel).overflowY};});
   assert(scrolling.scroll===0||Math.abs(scrolling.distance-scrolling.scroll)<1,'the profile and room scroll together with the records');assert.equal(scrolling.panelOverflow,'visible','records do not create a separate scroll area');await frame.locator('#app').evaluate(el=>el.scrollTop=0);
   await page.screenshot({path:path.join(proof,`summary-${width}.png`)});
  }
  await page.setViewportSize({width:390,height:844});await frame.locator('#diary').fill('배치를 바꿔도 내 글은 그대로');
  await frame.locator('#home-room-open').click();assert.equal(await frame.locator('#app > header').isVisible(),true,'decorating retains its exit control');assert.equal(await frame.locator('#home-profile').isVisible(),false);assert.equal(await teleport().isVisible(),false,'room viewing does not expose summary teleport');assert.equal(await frame.locator('.camera').isVisible(),true);assert.equal(await frame.locator('#world').evaluate(el=>el.inert),false);
  await frame.locator('[data-tab="diary"]').click();assert.equal(await frame.locator('#diary').inputValue(),'배치를 바꿔도 내 글은 그대로');
  const rooms=await frame.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:summary-a')).rooms);assert.deepEqual(rooms,saved.rooms,'opening/closing room preview does not change furniture');
  await page.evaluate(()=>{owner='summary-b';teleportEnabled=false;profile={nick:'<img src=x onerror=alert(1)>',bio:'다른 계정\n소개'};});await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);await page.locator('#open').click();await page.frameLocator('iframe').locator('#home-room-open').waitFor();frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));
  assert.equal(await frame.locator('#home-profile-nick').textContent(),'<img src=x onerror=alert(1)>');assert.equal(await frame.locator('#home-profile-nick img').count(),0);assert.equal(await frame.locator('#home-profile-bio').textContent(),'다른 계정 소개');await frame.getByRole('tab',{name:'노트',exact:true}).click();assert.equal(await frame.locator('#diary').inputValue(),'');
  assert.equal(await teleport().isVisible(),false,'standalone hosts without a teleport callback omit the action');
  await page.evaluate(()=>{owner='summary-visitor';readOnly=true;teleportEnabled=true;profile={nick:'이웃집',bio:'함께 나누고 싶은 소소한 이야기를 이곳에 남겨요. 산책과 책, 따뜻한 차를 좋아하는 이웃입니다.'};});await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);await page.locator('#open').click();await page.frameLocator('iframe').locator('#home-room-open').waitFor();frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));
  await page.locator('.house-entry-loading').waitFor({state:'detached'});await frame.evaluate(()=>document.fonts.ready);
  assert.equal(await teleport().isVisible(),true,'read-only visitors can teleport when the host enables it');
  for(const width of [320,390]){await page.setViewportSize({width,height:844});await frame.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const fits=await frame.evaluate(()=>{const bio=document.querySelector('#home-profile-bio'),button=document.querySelector('#home-teleport').getBoundingClientRect(),scene=document.querySelector('#home-scene').getBoundingClientRect(),range=document.createRange();range.selectNodeContents(bio);return range.getBoundingClientRect().right<=button.x&&button.right<=scene.right+1&&document.documentElement.scrollWidth<=innerWidth;});assert.equal(fits,true,'a multiline visitor introduction leaves room for teleport at '+width+'px');await page.screenshot({path:path.join(proof,`visitor-teleport-${width}.png`)});}
  await teleport().click();await page.waitForFunction(()=>teleportCalls===3);await page.evaluate(()=>finishTeleport());await frame.waitForFunction(()=>!document.querySelector('#home-teleport').disabled);
  await frame.locator('#home-room-open').click();assert.equal(await teleport().isVisible(),false);await frame.getByRole('button',{name:'방 구경 끝내기',exact:true}).click();assert.equal(await teleport().isVisible(),true,'returning from the room restores visitor teleport');
  assert.deepEqual(errors,[]);console.log('HOUSE SUMMARY PASS: unified mobile profile/room layout, compact room and full-width bio, teleport capability/busy/failure recovery and right-side fit, visitor entry/return, saved room and diary preservation, account isolation and safe text');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
