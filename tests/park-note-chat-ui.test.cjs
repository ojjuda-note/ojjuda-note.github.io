const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),read=file=>fs.readFileSync(path.join(root,file),'utf8');
const copy='오늘 하루 어땠나요? 괜찮았나요';
const checkWritingCopy=async frame=>{
 const input=frame.locator('#compose-text');
 assert.equal(await input.getAttribute('placeholder'),copy.replace('? ','?\n'));assert.equal(await input.isVisible(),true);
 assert.equal(await frame.locator('#compose-brand-copy').count(),0,'no duplicate greeting above the card');
 assert.equal(await input.inputValue(),'','the greeting is a placeholder, never card content');
 assert.equal(await input.evaluate(el=>el.matches(':placeholder-shown')&&el.scrollHeight<=el.clientHeight+1),true,'the complete greeting fits the empty input');
 assert.equal(await input.evaluate(el=>{const p=el.getBoundingClientRect(),photo=el.closest('.compose-photo').getBoundingClientRect(),body=el.closest('.composer-body').getBoundingClientRect();return p.top>=photo.top&&p.bottom<=photo.bottom&&p.left>=photo.left&&p.right<=photo.right&&p.top>=body.top&&p.bottom<=body.bottom; }),true,'the greeting appears inside the visible photo card before writing');
};
// Old bookmarks, direct feature URLs and authenticated returns share one World entry.
for(const [from,to] of [
 ['/note/?card=abc&keep=memo','/world.html?place=park&card=abc&keep=memo'],
 ['/note/glasses.html','/world.html?place=park&view=glasses'],
 ['/park/?compose=memo','/world.html?place=park&compose=memo']]){
 let result;const url=new URL(from,'https://fixture.test');const scope={URL,location:{href:url.href,origin:url.origin,replace:href=>result=href}};scope.window=scope;scope.parent=scope;
 vm.runInNewContext(read('park/route.js'),scope);assert.equal(result,'https://fixture.test'+to);
}
let world=read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'').replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-navigation.js','world-pull-refresh.js','world-places.js','world-park-notes.js'].map(read).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.parkFixture={state:g,enter(id){xf(id,1);clearInterval(g.placeT);g.placeT=null;},
 user(id){D.user=id?{id}:null;worldParkNotes.sync();},render:H,repaint:Bf,actions:Ln,open:action=>worldParkNotes.open(action),close:()=>worldParkNotes.close()};
 D.isAdmin=false;gm(()=>{g.tab='friends';g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});g.tab='friends';H();worldParkNotes.route();
 `+world.slice(world.indexOf('</script>',boot));
// Run the real editor and navigation, replacing only remote account/feed data.
// Seeding before integration.js also exercises queued World-menu actions on first load.
const identity=`authKnown=ready=true;session={user:{id:'fixture-member'}};myIdentity={gender:'male'};myIdentityReady=true;myGender='male';updateAuth();consumeInitialCard();
window.populateParkFixture=()=>{feed.hidden=false;detail.hidden=true;document.getElementById('connection-status').hidden=true;
 document.getElementById('feed-list').replaceChildren(...Array.from({length:9},(_,i)=>cardElement({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),kind:'memo',body:'공원에서 나누는 오늘의 이야기 '+(i+1),tags:['일상'],background_key:'plain',created_at:new Date().toISOString()})));
};`;
const park=read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace('</body>',()=>'<script>'+['park/route.js','note/feed-swipe.js','note/preview.js','note/navigation.js'].map(read).join('\n')+'\n'+identity+'\n'+read('park/integration.js')+'</script></body>');
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
 const source=new URL(await iframe.getAttribute('src'),'https://fixture.test');assert.equal(source.pathname,'/park/');assert.equal(source.searchParams.get('embedded'),'1');assert.equal(source.searchParams.get('compose'),'memo');assert.equal(source.searchParams.get('v'),'20261004-folder-kind1');
 let frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.OjjudaParkFull?.navigate);
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 if(process.env.OJJUDA_COPY_PROOF_DIR){fs.mkdirSync(process.env.OJJUDA_COPY_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OJJUDA_COPY_PROOF_DIR,'composer-initial-390.png')});}
 await checkWritingCopy(frame);
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
 await frame.locator('#close-composer').click();
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),true,'canceling direct composer close preserves the draft');
 assert.equal(await frame.locator('#compose-text').inputValue(),'아직 작성 중인 공원의 이야기');
 await frame.evaluate(()=>backdrop.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),true,'canceling backdrop close preserves the draft');
 await page.locator('.bottomnav [data-tab="my"]').click();
 assert.equal(await iframe.count(),1,'unsaved content blocks leaving through the World menu');
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),true,'Back protects unsaved text too');
 await frame.evaluate(()=>window.confirm=()=>true);
 await page.evaluate(()=>parkFixture.close());
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false);
 await page.evaluate(()=>parkFixture.open('compose'));
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 await frame.locator('#compose-text').fill('직접 닫기를 확인한 글');
 await frame.evaluate(()=>{window.discardConfirmCount=0;window.confirm=()=>{window.discardConfirmCount++;return true;};});
 await frame.locator('#close-composer').click();
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false,'accepting direct close discards the draft');
 assert.equal(await frame.evaluate(()=>discardConfirmCount),1,'direct close asks once');
 await page.evaluate(()=>parkFixture.open('compose'));
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 assert.equal(await frame.locator('#compose-text').inputValue(),'','discarded content is not restored');
 await frame.locator('#close-composer').click();
 assert.equal(await frame.locator('#composer-backdrop').isVisible(),false);
 assert.equal(await frame.evaluate(()=>discardConfirmCount),1,'empty composer closes without another question');
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
  assert.equal(await frame.locator('#note-announcement').count(),0,width+': Park uses the single World notice');
  assert.equal(await frame.locator('.mobile-top:visible,.side:visible,.bottomnav:visible,.write-fab:visible').count(),0,width+': no duplicate app chrome');
  assert.equal(await page.locator('.topbar .brand:visible,.side > .brand:visible').count(),1,width+': one World brand');
  assert.equal(await page.locator('.ojjuda-copy--world:visible').count(),1,width+': one visible World greeting');
  assert.equal(await page.locator('.ojjuda-copy--world:visible').textContent(),copy);
  assert.equal(await frame.locator('.ojjuda-copy--feed').textContent(),copy);
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
  await checkWritingCopy(frame);
  await page.locator('.park-compose-fab').waitFor({state:'hidden'});
  const composer=await frame.locator('.composer').boundingBox();
  const frameRect=await iframe.boundingBox();
  assert.ok(composer.y>=frameRect.y-1&&composer.y+composer.height<=frameRect.y+frameRect.height+1,width+': composer fits above World navigation');
  if(process.env.OJJUDA_COPY_PROOF_DIR){fs.mkdirSync(process.env.OJJUDA_COPY_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.OJJUDA_COPY_PROOF_DIR,`composer-${width}.png`)});}
  await page.evaluate(()=>parkFixture.close());
 }
 await page.setViewportSize({width:390,height:850});
 await frame.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
 await page.screenshot({path:'/tmp/ojjuda-world-park-single-ui.png',fullPage:true});
 // Collections remain available in Park; the shared menu no longer lists Park shortcuts.
 for(const action of ['saved','mine','events']){
  await page.locator('.bottomnav [data-tab="my"]').click();
  assert.equal(await iframe.count(),0,'World menu exits the current Park view');
  assert.equal(await page.locator('[data-my-group=park],[data-park-action]').count(),0);
  await page.evaluate(action=>parkFixture.open(action),action);
  await iframe.waitFor();frame=await (await iframe.elementHandle()).contentFrame();
  await frame.waitForFunction(mode=>typeof feedMode!=='undefined'&&feedMode===mode,action);
  assert.equal(await frame.locator('#feed').isVisible(),true,action+': queued action opens its real collection');
  assert.equal(await frame.locator('#note-my-screen').isVisible(),false,action+': collection does not expose a second app menu');
 }
 await frame.evaluate(()=>OjjudaParkFull.navigate('menu'));
 await page.locator('.my-hub').waitFor();
 assert.equal(await iframe.count(),0,'child menu action opens the shared World menu');
 await page.evaluate(()=>parkFixture.open('event-new'));await iframe.waitFor();frame=await (await iframe.elementHandle()).contentFrame();
 await frame.locator('#composer-backdrop').waitFor({state:'visible'});
 assert.equal(await frame.evaluate(()=>kind),'event','World menu opens the complete event composer');
 await page.evaluate(()=>parkFixture.close());
 await frame.evaluate(()=>shareCard('00000000-0000-4000-8000-000000000001'));
 assert.match(await frame.locator('#note-share-url').inputValue(),/\/world.html\?place=park&card=/,'new share links use World');
 await frame.evaluate(()=>{closeManagement();window.fixtureToken='old-account';});
 // A slow inquiry submission must retain its iframe when World navigation is used.
 await frame.addScriptTag({content:read('note/support.js')});
 await frame.evaluate(()=>{
   OjjudaNoteSupport.install({getUserId:()=>session.user.id,client:{
     auth:{onAuthStateChange(){}},schema:()=>({rpc:async name=>{
       if(name==='submit_inquiry')return new Promise(resolve=>window.finishInquiry=()=>resolve({error:{message:'offline'}}));
       return {data:name==='get_note_state'?{}:[]};
     }})
   }});
   OjjudaNoteSupport.open();
 });
 await frame.locator('#note-inquiry-body').fill('저장 중 화면을 이동해도 사라지면 안 되는 문의');
 await frame.getByRole('button',{name:'문의 보내기',exact:true}).click();
 await frame.waitForFunction(()=>typeof finishInquiry==='function');
 await page.locator('.bottomnav [data-tab="my"]').click();
 assert.equal(await iframe.count(),1,'World navigation cannot destroy a submitting inquiry');
 assert.equal(await frame.locator('#note-inquiry-body').inputValue(),'저장 중 화면을 이동해도 사라지면 안 되는 문의');
 await frame.evaluate(()=>finishInquiry());
 await frame.getByText('보내지 못했어요. 작성한 내용은 유지됩니다. 다시 시도해 주세요.').waitFor();
 await frame.evaluate(()=>OjjudaNoteSupport.close());
 // Closing a charge dialog does not cancel its server request. Keep the host
 // alive until the response has updated the shared balance.
 await frame.addScriptTag({content:read('ju-charge.js')});
 await frame.evaluate(()=>{
   window.chargeCalls=0;window.chargeBalance=null;
   OjjudaCharge.install({getUserId:()=>session.user.id,source:'note',onBalance:coins=>window.chargeBalance=coins,client:{
     rpc:async name=>{
       if(name==='beta_charge'){window.chargeCalls++;return new Promise(resolve=>window.finishCharge=()=>resolve({data:{ok:true,coins:110,added:10}}));}
       return {data:{ok:true,enabled:true,coins:chargeCalls?110:100,left:chargeCalls?4:5,limit:5}};
     }
   }});
   OjjudaCharge.open();
 });
 await frame.getByRole('button',{name:'10쭈 무료 충전',exact:true}).click();
 await frame.waitForFunction(()=>typeof finishCharge==='function');
 await frame.getByRole('button',{name:'충전창 닫기',exact:true}).click();
 await page.locator('.bottomnav [data-tab="my"]').click();
 assert.equal(await iframe.count(),1,'World navigation cannot interrupt a pending charge after its dialog closes');
 await frame.evaluate(()=>finishCharge());
 await frame.waitForFunction(()=>chargeBalance===110);
 assert.equal(await frame.evaluate(()=>chargeCalls),1,'one click sends one charge');
 assert.equal(await frame.evaluate(()=>canCloseParkNote()),true,'navigation resumes after the charge finishes');
 await page.evaluate(()=>parkFixture.user('another-user'));
 await page.waitForFunction(()=>document.querySelector('[data-park-app] iframe').contentWindow.fixtureToken===undefined);
 await page.evaluate(()=>parkFixture.enter('cafe'));
 assert.equal(await page.locator('[data-park-app]').count(),0,'leaving removes the old account app');
 assert.equal(await page.locator('#plog,#pmsg,[data-act="pl-send"]').count(),3,'cafe chat remains available');
 await page.locator('#pmsg').fill('카페의 대화는 그대로');await page.locator('[data-act="pl-send"]').click();
 assert.ok((await page.locator('#plog').textContent()).includes('카페의 대화는 그대로'));
 // Exercise the real child -> postMessage -> parent navigation path.
 await page.evaluate(()=>parkFixture.enter('park'));await iframe.waitFor();
 frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.OjjudaParkFull?.navigate);
 assert.equal(await frame.evaluate(()=>OjjudaParkFull.embedded),true);
 await frame.evaluate(()=>OjjudaParkFull.navigate('library'));
 await page.waitForFunction(()=>parkFixture.state.tab==='place'&&parkFixture.state.place?.id==='library');
 assert.equal(await iframe.count(),0,'the Park library message invokes the real previous-place step');
 // The actual feed drag uses that same bridge; the opposite edge stops.
 await page.evaluate(()=>parkFixture.enter('park'));await iframe.waitFor();
 frame=await (await iframe.elementHandle()).contentFrame();await frame.waitForFunction(()=>window.OjjudaParkFull?.navigate);
 await frame.evaluate(()=>{populateParkFixture();window.scrollTo({top:0,behavior:'instant'});});
 const activeSort=await frame.locator('.feed-sort-tabs .selected').getAttribute('data-sort');
 const dragPark=async dx=>{
  const box=await frame.locator('.note-feed-viewport').boundingBox(),x=box.x+box.width*(dx<0?.75:.25),y=box.y+80;
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y,{steps:8});await page.mouse.up();
 };
 await dragPark(-150);
 await frame.waitForFunction(()=>!document.getElementById('feed').matches('.note-feed-dragging,.note-feed-settling'));
 assert.equal(await page.evaluate(()=>parkFixture.state.place.id),'park','the embedded feed cannot swipe beyond Park');
 assert.equal(await frame.locator('.feed-sort-tabs .selected').getAttribute('data-sort'),activeSort,'place gestures preserve the filter');
 await dragPark(150);
 await page.waitForFunction(()=>parkFixture.state.tab==='place'&&parkFixture.state.place?.id==='library');
 assert.equal(await iframe.count(),0,'a real embedded card swipe reaches the library without skipping places');
 assert.deepEqual(errors,[]);
 console.log('PASS: real Park feed swipes and postMessage library navigation, single World chrome/scroller, full Park editor and World-menu collections, queued navigation, account reset, sharing, responsive composer, cafe chat, pending inquiry/charge navigation guards, and preserved drafts/scroll across render/back/leave');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
