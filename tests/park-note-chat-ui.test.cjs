const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
// Old bookmarks, direct feature URLs and authenticated returns share one World entry.
for(const [from,to] of [
 ['/note/?card=abc&keep=memo','/world.html?place=park&card=abc&keep=memo'],
 ['/note/glasses.html','/world.html?place=park&view=glasses'],
 ['/park/?compose=memo','/world.html?place=park&compose=memo']]){
 let result;const url=new URL(from,'https://fixture.test');const scope={URL,location:{href:url.href,origin:url.origin,replace:href=>result=href}};scope.window=scope;scope.parent=scope;
 vm.runInNewContext(read('park/route.js'),scope);assert.equal(result,'https://fixture.test'+to);
}
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-places.js','world-park-notes.js'].map(read).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.parkFixture={state:g,enter(id){xf(id,1);clearInterval(g.placeT);g.placeT=null;},
 user(id){D.user=id?{id}:null;worldParkNotes.sync();},render:H,repaint:Bf,actions:Ln,open:action=>worldParkNotes.open(action),close:()=>worldParkNotes.close()};
 D.isAdmin=false;g.tab='friends';H();worldParkNotes.route();
 `+world.slice(world.indexOf('</script>',boot));
// Run the real editor and navigation, replacing only remote account/feed data.
// Seeding before integration.js also exercises queued World-menu actions on first load.
const identity=`authKnown=ready=true;session={user:{id:'fixture-member'}};myIdentity={gender:'male'};myIdentityReady=true;myGender='male';updateAuth();consumeInitialCard();
window.populateParkFixture=()=>{feed.hidden=false;detail.hidden=true;document.getElementById('connection-status').hidden=true;
 const announcement=document.getElementById('note-announcement');announcement.hidden=false;document.getElementById('note-announcement-copy').textContent='공원에서 마음을 나누세요.';
 document.getElementById('feed-list').replaceChildren(...Array.from({length:9},(_,i)=>cardElement({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),kind:'memo',body:'공원에서 나누는 오늘의 이야기 '+(i+1),tags:['일상'],background_key:'plain',created_at:new Date().toISOString()})));
};`;
const park=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',()=>'<script>'+['park/route.js','note/preview.js','note/navigation.js'].map(read).join('\n')+'\n'+identity+'\n'+read('park/integration.js')+'</script></body>');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext({viewport:{width:390,height:850}});
 await context.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(url.pathname==='/park/')return route.fulfill({contentType:'text/html',body:park});
   const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('https://fixture.test/world.html?place=park&compose=memo');
 const iframe=page.locator('[data-park-app] iframe');await iframe.waitFor();
 assert.match(await iframe.getAttribute('src'),/\/park\/\?embedded=1&compose=memo/);
 let frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.OjjudaParkFull?.navigate);
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 await frame.evaluate(()=>window.fixtureToken='kept');
 await frame.locator('#compose-text').fill('아직 작성 중인 공원의 이야기');
 await frame.locator('#compose-more > summary').click();
 await frame.locator('#compose-font').selectOption('serif');
 assert.equal(await frame.locator('#card-photo-file,#event-photo-file,#compose-effect,#compose-box-transparency').count(),4,'all photo and styling controls migrated');
 assert.equal(await frame.locator('[data-sort]').count()>2,true,'latest, popular and nearby sorting migrated');
 assert.equal(await frame.locator('#note-account-menu #event-start').count(),1,'event authoring migrated');
 assert.equal(await frame.locator('#note-change-nickname,#note-change-password,#note-logout,#note-delete-account').count(),4,'account tools migrated');
 assert.equal(await frame.locator('[data-collection]').count()>=2,true,'saved and owned cards migrated');
 await page.evaluate(()=>{parkFixture.repaint();parkFixture.render();});
 assert.equal(await frame.evaluate(()=>fixtureToken),'kept','world/presence rendering retains browsing context');
 assert.equal(await frame.locator('#compose-text').inputValue(),'아직 작성 중인 공원의 이야기');
 assert.equal(await frame.locator('#compose-font').inputValue(),'serif');
 await frame.evaluate(()=>window.confirm=()=>false);
 await page.locator('.bottomnav [data-tab="my"]').click();
 assert.equal(await iframe.count(),1,'unsaved content blocks leaving through the World menu');
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),true,'Back protects unsaved text too');
 await frame.evaluate(()=>window.confirm=()=>true);
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false);
 await page.evaluate(()=>parkFixture.open('compose'));
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 await frame.locator('#compose-text').fill('다른 목록으로 이동하기 전의 작성 중인 글');
 await frame.evaluate(()=>{window.discardConfirmCount=0;window.confirm=()=>{window.discardConfirmCount++;return true;};});
 await page.evaluate(()=>parkFixture.open('saved'));
 assert.equal(await frame.evaluate(()=>discardConfirmCount),1,'changing collections asks to discard a draft exactly once');
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false);
 assert.equal(await frame.evaluate(()=>feedMode),'saved');
 await page.evaluate(()=>parkFixture.open('feed'));
 assert.equal(await page.locator('#pstage,.place-art-hint,[data-park-entry],[data-park-expand],.park-app-tools').count(),0,'park has no scene, expansion toolbar or surrounding park box');
 assert.equal(await page.locator('#plog,#pmsg,[data-act="pl-send"],[data-act="pl-react"],.park-live-chat,#ppanel').count(),0,'park chat is absent');
 assert.equal(await page.locator('main.main > [data-park-app]').count(),1,'cards form the direct World page content');
 const before=await page.evaluate(()=>parkFixture.state.place.log.length);
 await page.evaluate(()=>{parkFixture.actions['pl-send']();parkFixture.actions['pl-react']({v:'👋'});parkFixture.render()});
 assert.equal(await page.evaluate(()=>parkFixture.state.place.log.length),before,'park chat actions remain disabled');
 assert.equal(await frame.evaluate(()=>fixtureToken),'kept');
 // The World header/navigation remain fixed while the Park feed is the only page scroller.
 await frame.evaluate(()=>populateParkFixture());
 for(const width of [320,390,832,1280]){
  await page.setViewportSize({width,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': World fits');
  assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),width+': Park fits');
  assert.equal(await frame.locator('.mobile-top:visible,.side:visible,.bottomnav:visible,.write-fab:visible').count(),0,width+': no duplicate app chrome');
  assert.equal(await page.locator('.topbar .brand:visible,.side > .brand:visible').count(),1,width+': one World brand');
  assert.equal(await page.locator('.bottomnav:visible,.sidenav:visible').count(),1,width+': one World navigation');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight+1),width+': parent has no second vertical scrollbar');
  await frame.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
  const rect=await iframe.boundingBox();
  await page.mouse.move(rect.x+rect.width/2,rect.y+Math.min(180,rect.height/2));
  await page.mouse.wheel(0,520);
  await frame.waitForFunction(()=>scrollY>100);
  assert.equal(await page.evaluate(()=>scrollY),0,width+': scrolling the cards does not scroll World');
  const scroll=await frame.evaluate(()=>scrollY);
  await page.evaluate(()=>{parkFixture.repaint();parkFixture.render();});
  assert.equal(await frame.evaluate(()=>scrollY),scroll,width+': World updates preserve card scroll position');
  await page.locator('[data-park-action="compose"]').click();
  await frame.locator('#composer-backdrop').waitFor({state:'visible'});
  await page.locator('.park-compose-fab').waitFor({state:'hidden'});
  const composer=await frame.locator('.composer').boundingBox();
  const frameRect=await iframe.boundingBox();
  assert.ok(composer.y>=frameRect.y-1&&composer.y+composer.height<=frameRect.y+frameRect.height+1,width+': composer fits above World navigation');
  await page.evaluate(()=>parkFixture.close());
 }
 await page.setViewportSize({width:390,height:850});
 await frame.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:'/tmp/ojjuda-world-park-single-ui.png',fullPage:true});
 // Every migrated collection is available through the actual World menu, including first-frame loads.
 for(const action of ['saved','mine','events']){
  await page.locator('.bottomnav [data-tab="my"]').click();
  assert.equal(await iframe.count(),0,'World menu exits the current Park view');
  const button=page.locator('[data-park-action="'+action+'"]');
  const group=button.locator('xpath=ancestor::details');if(await group.count())await group.evaluate(node=>node.open=true);
  await button.click();
  await iframe.waitFor();frame=await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(mode=>typeof feedMode!=='undefined'&&feedMode===mode,action);
  assert.equal(await frame.locator('#feed').isVisible(),true,action+': queued action opens its real collection');
  assert.equal(await frame.locator('#note-my-screen').isVisible(),false,action+': collection does not expose a second app menu');
 }
 await frame.evaluate(()=>OjjudaParkFull.navigate('menu'));
 await page.locator('[data-my-group="park"]').waitFor();
 assert.equal(await iframe.count(),0,'child menu action opens the shared World menu');
 const eventStart=page.locator('[data-park-action="event-new"]');
 await eventStart.locator('xpath=ancestor::details').evaluate(node=>node.open=true);
 await eventStart.click();await iframe.waitFor();frame=await (await iframe.elementHandle()).contentFrame();
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 assert.equal(await frame.evaluate(()=>kind),'event','World menu opens the complete event composer');
 await page.evaluate(()=>parkFixture.close());
 await frame.evaluate(()=>shareCard('00000000-0000-4000-8000-000000000001'));
 assert.match(await frame.locator('#note-share-url').inputValue(),/\/world.html\?place=park&card=/,'new share links use World');
 await frame.evaluate(()=>{closeManagement();window.fixtureToken='old-account';});
 await page.evaluate(()=>parkFixture.user('another-user'));
 await page.waitForFunction(()=>document.querySelector('[data-park-app] iframe').contentWindow.fixtureToken===undefined);
 await page.evaluate(()=>parkFixture.enter('cafe'));
 assert.equal(await page.locator('[data-park-app]').count(),0,'leaving removes the old account app');
 assert.equal(await page.locator('#plog,#pmsg,[data-act="pl-send"]').count(),3,'cafe chat remains available');
 await page.locator('#pmsg').fill('카페의 대화는 그대로');await page.locator('[data-act="pl-send"]').click();
 assert.ok((await page.locator('#plog').textContent()).includes('카페의 대화는 그대로'));
 assert.deepEqual(errors,[]);
 console.log('PASS: single World chrome/scroller, full Park editor and World-menu collections, queued navigation, account reset, sharing, responsive composer, cafe chat, and preserved drafts/scroll across render/back/leave');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
