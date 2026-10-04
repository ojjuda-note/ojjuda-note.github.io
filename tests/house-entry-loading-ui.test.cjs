const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_ENTRY_PROOF||path.resolve(root,'../house-entry-proof');
const fixture=`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js';window.allowed=true;document.querySelector('#open').onclick=()=>openHouseTest({owner:'entry-test',authorized:()=>allowed});</script>`;
const gate=()=>{let release;const promise=new Promise(r=>release=r);return{promise,release};};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  let background=gate(),shelf=gate(),breakArt=false;
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   if(/\/room-(day|dusk|night)-/.test(u.pathname))await background?.promise;
   if(/\/assets\/bookshelf-.*\.webp$/.test(u.pathname))await shelf?.promise;
   if(breakArt&&/\/entry-.*\.webp$/.test(u.pathname))return route.fulfill({status:503,body:'unavailable'});
   const file=path.resolve(root,'.'+u.pathname);try{return file.startsWith(root+path.sep)&&fs.existsSync(file)?await route.fulfill({path:file}):await route.abort();}catch{}
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'left',x:0,y:0},furniture:{}}],diary:'그대로 보존할 기록'};
  await page.evaluate(saved=>localStorage.setItem('ojjuda-house-playtest-v1:entry-test',JSON.stringify(saved)),saved);
  await page.locator('#open').click();await page.locator('.house-entry-scene[data-art-ready]').waitFor();
  const f=page.frames().find(f=>f.url().includes('/house-test/index.html'));
  await f.waitForFunction(()=>document.querySelector('#app')?.hidden===false);
  assert.equal(await page.locator('.house-entry-loading').innerText(),'','no visible loading copy');
  assert.equal(await page.locator('iframe').evaluate(el=>el.inert),true);
  assert.equal(await page.locator('iframe').evaluate(el=>getComputedStyle(el).visibility),'hidden');
  assert.equal(await page.locator('.house-entry-jjuda').getAttribute('src').then(src=>src.endsWith('/entry-jjuda-back-v1.webp')),true);
  await page.locator('.house-entry-jjuda').evaluate(im=>im.decode());
  await page.locator('.house-entry-walk').evaluate(el=>{for(const animation of el.getAnimations()){animation.pause();animation.currentTime=800;}});
  await page.screenshot({path:path.join(proof,'loading-mobile.png')});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(proof,'loading-desktop.png')});
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.house-entry-walk').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.setViewportSize({width:320,height:568});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const bg=background;background=null;bg.release();await f.waitForFunction(()=>[...document.querySelectorAll('.room.selected .room-bg')].every(im=>im.complete));
  assert.equal(await page.locator('.house-entry-loading').count(),1,'initialization and background alone must not expose unpainted furniture');
  const art=shelf;shelf=null;art.release();await page.locator('.house-entry-loading').waitFor({state:'detached',timeout:5000});
  assert.equal(await page.locator('iframe').evaluate(el=>el.inert),false);assert.equal(await f.locator('.record-tabs').isVisible(),true);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:entry-test'))),saved);
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();assert.equal(await page.locator('iframe').count(),0);
  // Closing and account revocation both work while the illustration is visible.
  background=gate();await page.locator('#open').click();await page.locator('.house-entry-loading').waitFor();await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();background.release();background=null;assert.equal(await page.locator('[role="dialog"]').count(),0);
  background=gate();await page.locator('#open').click();await page.locator('.house-entry-loading').waitFor();await page.evaluate(()=>allowed=false);await page.locator('[role="dialog"]').waitFor({state:'detached'});background.release();background=null;
  await page.evaluate(()=>allowed=true);breakArt=true;await page.locator('#open').click();await page.locator('.house-entry-loading').waitFor({state:'detached',timeout:5000});assert.equal(await page.frameLocator('iframe').locator('.record-tabs').isVisible(),true,'missing illustration cannot hold up a ready room');
  assert.deepEqual(errors,[]);await page.close();
  const timeoutContext=await browser.newContext();await timeoutContext.addInitScript(()=>{const original=window.setTimeout;window.setTimeout=(fn,ms,...args)=>original(fn,ms===20000?80:ms,...args);});
  await timeoutContext.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});if(u.pathname.endsWith('/house-test/index.html'))return route.fulfill({contentType:'text/html',body:'<!doctype html><p>fixture waiting</p>'});const file=path.resolve(root,'.'+u.pathname);return fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
  const timeoutPage=await timeoutContext.newPage();await timeoutPage.goto('https://fixture.test/fixture');await timeoutPage.locator('#open').click();await timeoutPage.getByRole('status').filter({hasText:'불러오지 못했어요'}).waitFor();assert.equal(await timeoutPage.locator('.house-entry-loading').count(),0);assert.equal(await timeoutPage.getByRole('button',{name:'우리집 닫기',exact:true}).isEnabled(),true);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({rearView:true,noLoadingCopy:true,waitsForRoomPaint:true,noAnimationDelay:true,reducedMotion:true,closeAndAuthorization:true,missingArtAndTimeout:true,savedRoomPreserved:true,errors},null,2));
  console.log('HOUSE ENTRY LOADING PASS: rear view, no copy, paint readiness, reduced motion, close/revoke, failed art, timeout and preserved saved room');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
