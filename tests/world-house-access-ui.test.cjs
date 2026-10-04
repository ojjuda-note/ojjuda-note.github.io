const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const makeAlbumFixture=require('./fixtures/house-album.cjs');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_PUBLIC_PROOF_DIR||path.resolve(root,'../house-public-proof'),proofFont=process.env.HOUSE_PUBLIC_PROOF_FONT;
let world=fs.readFileSync(path.join(root,'world.html'),'utf8').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-navigation.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert(boot>0);
world=world.slice(0,boot)+`
window.houseWorldTest={state:g,auth:D,actions:sr,render:H};
U.cleanupMedia=async()=>({});U.overview=async()=>({});U.contentFeed=async()=>[];U.chatFeed=async()=>[];
const makeAlbum=${makeAlbumFixture.toString()};window.albumFixture=makeAlbum();albumFixture.state.owner='world-member-a';S=albumFixture.client;const baseRPC=S.rpc,rooms=new Map();S.rpc=async(name,args)=>{albumFixture.state.owner=D.user?.id;if(name==='house_room_load'){const saved=rooms.get(args.p_owner);return {data:{ok:true,found:!!saved,canEdit:true,...saved}};}if(name==='house_room_save'){const saved={snapshot:args.p_snapshot,revision:crypto.randomUUID(),updatedAt:new Date().toISOString()};rooms.set(args.p_owner,saved);return {data:{ok:true,...saved}};}return baseRPC(name,args);};S.auth={signOut:async()=>{sessionStorage.setItem('fixture-logged-out','yes');D.user=null;D.online=false;D.isAdmin=false;H();}};
if(!localStorage.getItem('ojjuda-house-playtest-v1:world-member-a'))localStorage.setItem('ojjuda-house-playtest-v1:world-member-a',JSON.stringify({version:13,rooms:[{x:0,y:0,curtains:true,shelf:null,furniture:{}}],diary:'기존 기기 원본'}));
gm(()=>{g.tab='friends';g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
D.online=!sessionStorage.getItem('fixture-logged-out');D.user=D.online?{id:'world-member-a'}:null;D.isAdmin=false;g.tab='friends';H();
`+world.slice(world.indexOf('</script>',boot));
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(proofFont&&u.pathname==='/_proof-font/NotoSansCJKkr-Regular.otf')return route.fulfill({contentType:'font/otf',path:proofFont});if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();});
  if(proofFont)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:HouseProof;src:url("/_proof-font/NotoSansCJKkr-Regular.otf") format("opentype");font-display:block}html,body,button,input,textarea,select{font-family:HouseProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage(),entryArt=[];page.on('request',r=>{if(/\/entry-(house|jjuda)-/.test(r.url()))entryArt.push(r.url());});page.on('pageerror',e=>{errors.push(e.message);console.error('PAGE ERROR:',e.message);});await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.houseWorldTest&&history.state?.ojjudaWorld==='main');
  const home=()=>page.frames().find(f=>/\/house-test\/index\.html/.test(f.url()));
  const ready=async()=>{await page.frameLocator('iframe[title="우리집"]').locator('#app').waitFor({state:'visible'});await page.locator('[data-house-inline][aria-busy="false"]').waitFor();await page.locator('.house-entry-loading').waitFor({state:'detached'});assert.equal(await page.locator('.house-entry-loading').count(),0,'the entrance illustration is removed after the room is ready');await home().evaluate(()=>document.fonts.ready);assert.equal(await home().locator('[data-tab="diary"]').getAttribute('aria-pressed'),'true');assert.equal(await home().locator('.record-tabs').isVisible(),true);return home();};
  const noFrames=()=>page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);
  const main=()=>page.waitForFunction(()=>houseWorldTest.state.tab==='friends'&&history.state?.ojjudaWorld==='main');
  // Leaving during room loading cancels the entry without a late reopen.
  let releaseEntry;const delayedEntry=new Promise(resolve=>releaseEntry=resolve);
  await context.route('**/house-test/index.html*',async route=>{await delayedEntry;try{await route.fallback();}catch{}});
  assert.equal(await page.locator('.wd-home').evaluate(button=>{button.click();return [...document.querySelectorAll('[data-house-entry] button')].some(button=>button.textContent.trim()==='나가기');}),false,'the first World render has no temporary exit button before the house module opens');await page.locator('[data-house-inline]').waitFor();
  assert.equal(await page.locator('[data-house-inline]').getAttribute('aria-busy'),'true');
  assert.equal(await page.locator('[data-house-inline]').getByRole('button',{name:'우리집 닫기',exact:true}).count(),0,'ordinary World home uses its existing navigation during loading');
  await page.locator('.house-entry-loading').waitFor({state:'visible'});
  await page.waitForFunction(()=>[...document.querySelectorAll('.house-entry-loading img')].length===2&&[...document.querySelectorAll('.house-entry-loading img')].every(image=>image.complete&&image.naturalWidth>0));
  assert.equal(await page.locator('.house-entry-scene').isVisible(),true,'쭈다 entrance artwork is visible while the inline room loads');
  await page.locator('.sidenav [data-tab="my"]').click();await noFrames();releaseEntry();await context.unroute('**/house-test/index.html*');
  assert.equal(await page.evaluate(()=>houseWorldTest.state.tab),'my');
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'friends'}));await main();
  assert.equal(await page.locator('.wd-home').getAttribute('aria-label'),'우리집 들어가기');await page.locator('.wd-home').click();let f=await ready();assert.equal(await page.evaluate(()=>houseWorldTest.state.tab),'home');
  assert.equal(await page.locator('main.main [data-house-inline] iframe[title="우리집"]').count(),1,'home is mounted in the World content column');
  assert.equal(await page.locator('[role="dialog"][aria-label="우리집"]').count(),0,'ordinary home does not open a dialog');
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'','World stays scrollable');
  assert.equal(await page.locator('.side').isVisible(),true,'desktop navigation stays visible beside the house');
  await f.getByRole('tab',{name:'노트',exact:true}).click();await f.getByRole('button',{name:'＋ 글쓰기',exact:true}).click();await f.getByLabel('노트 글',{exact:true}).fill('화면 갱신 중인 미저장 글');const original=f;
  await page.evaluate(()=>houseWorldTest.render());assert.equal(home(),original,'shared World updates must keep the live frame connected');
  assert.equal(await f.getByLabel('노트 글',{exact:true}).inputValue(),'화면 갱신 중인 미저장 글');
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));assert.equal(home(),original);assert.equal(await page.locator('iframe').count(),1,'reselecting home never creates another room');
  assert(entryArt.some(url=>url.includes('/entry-house-v1.webp'))&&entryArt.some(url=>url.includes('/entry-jjuda-back-v1.webp')),'ordinary home requests both the house and 쭈다 entrance artwork');
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();assert.equal(await f.getByRole('button',{name:'가구 제작실',exact:true}).count(),0);await f.locator('[data-tab="diary"]').click();await f.getByRole('tab',{name:'노트',exact:true}).click();await f.getByRole('button',{name:'＋ 글쓰기',exact:true}).click();await f.getByLabel('노트 글',{exact:true}).fill('실제 월드 회원의 개인 집');await f.getByRole('button',{name:'노트에 저장',exact:true}).click();await page.waitForFunction(()=>albumFixture.db.house_posts.some(row=>row.body==='실제 월드 회원의 개인 집'));assert.equal(await f.locator('#diary,.local-records,.record-diary-editor').count(),0);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:world-member-a')).diary),'기존 기기 원본');
  await f.locator('[data-tab="room"]').click();await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'world-member-house-desktop.png')});await f.locator('#exit').click();await noFrames();await main();
  await page.setViewportSize({width:390,height:844});await page.locator('.bottomnav [data-tab="home"]').click();f=await ready();
  const worldNav=await page.locator('.bottomnav').boundingBox(),panel=await f.locator('#panel').boundingBox(),houseNav=await f.locator('#panel .panel-head nav').boundingBox();assert(worldNav&&panel&&houseNav);const houseFrame=await page.locator('iframe[title="우리집"]').boundingBox();assert(Math.abs(houseFrame.y+houseFrame.height-worldNav.y)<=3,'the house frame meets the World menu');assert(houseNav.y>=panel.y&&houseNav.y-panel.y<=24&&houseNav.height<=56,'compact tabs sit within the panel top padding');assert.equal(await f.locator('#app > nav').count(),0);assert.deepEqual(await f.locator('nav [data-tab]').evaluateAll(nodes=>nodes.map(n=>n.dataset.tab)),['diary','room']);
  await f.waitForFunction(()=>[...document.querySelectorAll('.furniture')].every(n=>n.dataset.renderState==='ready'));await page.evaluate(()=>document.fonts.ready);await f.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(error=>{throw new Error(error.message+" "+image.src+" connected="+image.isConnected);});}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});await page.screenshot({path:path.join(proof,'world-house-menus-mobile.png')});
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(image=>{image.loading="eager";return image.decode().catch(error=>{throw new Error(error.message+" "+image.src+" connected="+image.isConnected);});}));});await page.screenshot({path:path.join(proof,'world-house-accessories-mobile.png')});await f.getByRole('button',{name:'가구',exact:true}).click();
  for(const size of [{width:320,height:568},{width:440,height:500},{width:640,height:360},{width:844,height:390}]){
   await page.setViewportSize(size);
   for(const tab of ['diary','room']){
    await f.locator('[data-tab="'+tab+'"]').click();
    if(tab==='room')await f.locator('#home-view').click();else {await f.getByRole('tab',{name:'노트',exact:true}).click();await f.getByRole('button',{name:'＋ 글쓰기',exact:true}).click();}
    // As in the cafe, short screens may scroll the World content column.
    await page.evaluate(()=>{const house=document.querySelector('[data-house-inline]'),nav=document.querySelector('.bottomnav').getBoundingClientRect();window.scrollTo(0,Math.max(0,house.getBoundingClientRect().bottom+scrollY-nav.top));});
    await f.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const visibility=await f.evaluate(()=>{
     const view=document.querySelector('#viewport').getBoundingClientRect(),camera=document.querySelector('.camera').getBoundingClientRect(),panel=document.querySelector('#panel').getBoundingClientRect(),room=document.querySelector('.room.selected').getBoundingClientRect(),scale=room.width/1507;
     const separate=b=>b.left>=view.right-.5||b.top>=view.bottom-.5||b.right<=view.left+.5||b.bottom<=view.top+.5;
     const summary=document.querySelector('#app').classList.contains('records-home'),crop=summary?{left:38,right:39,top:58,bottom:910}:{left:12,right:12,top:27,bottom:916};
     return {cameraOutsideRoom:separate(camera),panelOutsideRoom:separate(panel),wholeRoom:room.left+crop.left*scale>=view.left-.5&&room.right-crop.right*scale<=view.right+.5&&room.top+crop.top*scale>=view.top-.5&&room.top+crop.bottom*scale<=view.bottom+.5,furnitureVisible:[...document.querySelectorAll('.room.selected .furniture')].every(n=>{const b=n.getBoundingClientRect();return b.left>=view.left-.5&&b.right<=view.right+.5&&b.top>=view.top-.5&&b.bottom<=view.bottom+.5;})};
    });
    assert.deepEqual(visibility,{cameraOutsideRoom:true,panelOutsideRoom:true,wholeRoom:true,furnitureVisible:true},'all furniture, including the right-hand desk, remains clear of camera controls and menus');
    const before=await f.locator('#panel-tabs').boundingBox();
    await f.locator('#panel-body').evaluate(el=>el.scrollTop=el.scrollHeight);
    const after=await f.locator('#panel-tabs').boundingBox(),panel=await f.locator('#panel').boundingBox(),nav=await page.locator('.bottomnav').boundingBox();
    assert(Math.abs(before.y-after.y)<1,'scrolling the content keeps both house tabs available');
    if(tab==='room')assert(panel.y+panel.height<=nav.y+3,'short screens keep the tools above the World menu');
    assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    if(tab==='diary'){const button=f.getByRole('button',{name:'노트에 저장',exact:true});await button.scrollIntoViewIfNeeded();const save=await button.boundingBox(),body=await f.locator('#panel-body').boundingBox();assert(save.y>=body.y-.5&&save.y+save.height<=body.y+body.height+.5&&save.y+save.height<=nav.y,'the entire save button fits inside the panel above navigation '+JSON.stringify({size,save,body,nav}));await f.locator('#app').evaluate(el=>el.scrollTop=0);}
    await page.screenshot({path:path.join(proof,'world-house-'+size.width+'x'+size.height+'-'+tab+'.png')});
   }
  }
  await page.setViewportSize({width:390,height:844});await f.locator('[data-tab="diary"]').click();await f.getByRole('button',{name:'글 보기: 실제 월드 회원의 개인 집',exact:true}).waitFor();await page.evaluate(()=>history.back());await noFrames();await main();
  await page.locator('.wd-home').click();await ready();await page.locator('.bottomnav [data-tab="my"]').click();await noFrames();assert.equal(await page.evaluate(()=>houseWorldTest.state.tab),'my','the visible World menu remains clickable and closes home without overwriting its destination');
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));await ready();await page.evaluate(()=>{houseWorldTest.auth.user={id:'world-member-b'};houseWorldTest.render();});await noFrames();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:world-member-a')).diary),'기존 기기 원본');
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));f=await ready();await f.locator('[data-tab="diary"]').click();assert.equal(await f.locator('#diary').count(),0);assert.equal(await f.locator('[data-record-type="text"]').count(),0);
  await page.evaluate(()=>houseWorldTest.actions.logout());await page.locator('[data-act="confirm-ok"]').evaluate(el=>el.click());await page.waitForFunction(()=>window.houseWorldTest&&!houseWorldTest.auth.online&&sessionStorage.getItem('fixture-logged-out')==='yes');await noFrames();
  await page.evaluate(()=>houseWorldTest.actions.tab({tab:'home'}));assert.equal(await page.locator('[data-house-entry]').count(),1);assert.equal(await page.locator('iframe').count(),0);assert.match(await page.locator('[data-house-entry]').textContent(),/로그인/);
  await page.evaluate(async()=>{houseWorldTest.auth.online=true;houseWorldTest.auth.user={id:'admin-a'};houseWorldTest.auth.isAdmin=true;houseWorldTest.actions.tab({tab:'friends'});await houseWorldTest.actions['furniture-studio']();});assert.equal(await page.locator('iframe[title="관리자 가구 제작실"]').count(),0,'an admin must enter admin mode before opening the studio');
  await page.locator('.wd-home').click();f=await ready();await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'방 설정',exact:true}).click();assert.equal(await f.getByRole('button',{name:'가구 제작실',exact:true}).count(),0,'ordinary house settings remain free of creation tools even for an admin');await f.locator('#exit').click();await noFrames();
  await page.evaluate(()=>{houseWorldTest.auth.isAdmin=false;houseWorldTest.state.tab='admin';return houseWorldTest.actions['furniture-studio']();});assert.equal(await page.locator('iframe').count(),0,'forging an admin tab does not grant a member studio access');
  await page.evaluate(()=>{houseWorldTest.auth.isAdmin=true;houseWorldTest.actions.tab({tab:'admin'});return houseWorldTest.actions['furniture-studio']();});await page.frameLocator('iframe[title="관리자 가구 제작실"]').locator('#studio-editor').waitFor({state:'visible'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(proof,'world-admin-studio-mobile.png')});
  await page.evaluate(()=>houseWorldTest.auth.isAdmin=false);await noFrames();assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'world-house-access-verification.json'),JSON.stringify({ordinaryMemberBuildingAndBottomNavigation:true,inlineWorldContent:true,sharedRenderPreservesDraft:true,loadingExitCancelsEntry:true,inlineEntranceVisibleWhileLoading:true,entranceRemovedAfterRoomReady:true,shortScreenPageScroll:true,ownOwnerSave:true,houseCloseReturnsToNeighborhood:true,browserBackClosesHouse:true,panelMeetsWorldMenuWithoutExtraRow:true,houseTabsInPanelHeading:true,diarySelectedOnEveryOpening:true,menuSwitchPreservesDestination:true,accountChangeClosesAndIsolates:true,realLogoutHandlerClosesHouse:true,signedOutShowsLogin:true,ordinaryHomeHasNoStudioForAnyRole:true,studioRequiresAdminRoleAndAdminMode:true,studioClosesOnRevocation:true,errors},null,2));
  console.log('WORLD HOUSE ACCESS PASS: member building/nav ownership, close/back/menu/account/logout behavior, signed-out login and admin-mode-only studio');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
