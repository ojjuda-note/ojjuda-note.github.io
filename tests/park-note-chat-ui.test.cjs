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
 user(id){D.user=id?{id}:null;worldParkNotes.sync();},render:H,repaint:Bf,close:()=>worldParkNotes.close()};
 D.isAdmin=false;g.tab='friends';H();worldParkNotes.route();
 `+world.slice(world.indexOf('</script>',boot));
const park=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',()=>'<script>'+['park/route.js','note/preview.js','note/navigation.js','park/integration.js'].map(read).join('\n')+'</script></body>');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
 const context=await browser.newContext({viewport:{width:360,height:800}});
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
 const frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>typeof canCloseParkNote==='function');
 // Exercise the real, complete editor and navigation with local fixture identity; no live writes.
 await frame.evaluate(()=>{authKnown=ready=true;session={user:{id:'fixture-member'}};myIdentity={gender:'male'};myIdentityReady=true;myGender='male';updateAuth();consumeInitialCard();window.fixtureToken='kept';});
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 await frame.locator('#compose-text').fill('아직 작성 중인 공원의 이야기');
 await frame.locator('#compose-more > summary').click();
 await frame.locator('#compose-font').selectOption('serif');
 assert.equal(await frame.locator('#card-photo-file,#event-photo-file,#compose-effect,#compose-box-transparency').count(),4,'all photo and styling controls migrated');
 assert.equal(await frame.locator('[data-sort]').count()>2,true,'latest, popular and nearby sorting migrated');
 assert.equal(await frame.locator('#note-account-menu #event-start').count(),1,'event authoring migrated');
 assert.equal(await frame.locator('#note-change-nickname,#note-change-password,#note-logout,#note-delete-account').count(),4,'account tools migrated');
 assert.equal(await frame.locator('[data-collection]').count()>=2,true,'saved and owned cards migrated');
 await page.locator('[data-park-expand]').click();
 assert.equal(await page.locator('[data-park-app]').evaluate(n=>n.classList.contains('park-app-full')),true);
 await page.evaluate(()=>{parkFixture.repaint();parkFixture.render();});
 assert.equal(await frame.evaluate(()=>fixtureToken),'kept','world/presence rendering retains browsing context');
 assert.equal(await frame.locator('#compose-text').inputValue(),'아직 작성 중인 공원의 이야기');
 assert.equal(await frame.locator('#compose-font').inputValue(),'serif');
 await frame.evaluate(()=>window.confirm=()=>false);
 await page.evaluate(()=>document.querySelector('[data-act="pl-leave"]').click());
 assert.equal(await iframe.count(),1,'unsaved content blocks leaving');
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),true,'Back protects unsaved text too');
 await frame.evaluate(()=>window.confirm=()=>true);
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false);
 await frame.locator('.bottomnav [data-note-my]').click();
 assert.equal(await frame.locator('#note-my-screen').isVisible(),true,'complete menu opens within park');
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#note-my-screen').isVisible(),false);
 await page.locator('[data-park-expand]').click();
 await page.locator('#pmsg').fill('공원의 실시간 대화');await page.locator('[data-act="pl-send"]').click();
 assert.ok((await page.locator('#plog').textContent()).includes('공원의 실시간 대화'));
 await page.locator('#pmsg').fill('전송 전 메시지');await page.evaluate(()=>parkFixture.render());
 assert.equal(await page.locator('#pmsg').inputValue(),'전송 전 메시지');
 for(const width of [320,360,768,1280]){
  await page.setViewportSize({width,height:850});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': World fits');
  assert.ok(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': full Park app fits');
 }
 await page.setViewportSize({width:360,height:800});
 await page.screenshot({path:'/tmp/ojjuda-full-park.png',fullPage:true});
 await frame.evaluate(()=>shareCard('00000000-0000-4000-8000-000000000001'));
 assert.match(await frame.locator('#note-share-url').inputValue(),/\/world.html\?place=park&card=/,'new share links use World');
 await page.evaluate(()=>parkFixture.user('another-user'));
 await page.waitForFunction(()=>document.querySelector('[data-park-app] iframe').contentWindow.fixtureToken===undefined);
 await page.evaluate(()=>parkFixture.enter('cafe'));
 assert.equal(await page.locator('[data-park-app]').count(),0,'leaving removes the old account app');
 assert.deepEqual(errors,[]);
 console.log('PASS: complete Park application, legacy routing, editor/menu/features, account reset, World sharing, responsive layouts, live chat and unsaved state across render/fullscreen/back/leave');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
