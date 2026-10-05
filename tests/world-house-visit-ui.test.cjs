const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');

// Exercise the production visit loader, random teleport handler and renderer.
// Only startup/auth and the database transport are replaced; no live data is used.
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};')
 .replace('</head>','<script>'+fs.readFileSync(path.join(root,'world-house-visit.js'),'utf8')+'</script></head>');
const boot=world.indexOf('j1(()=>H());gm(');assert(boot>0);
world=world.slice(0,boot)+`
const fixtureReads=[],fixtureWrites=[],fixtureHolds=new Map();
const fixtureProfile=id=>({id,nickname:id==='closed-house'?'문닫은 이웃':'방문할 이웃',bio:'이웃의 소개',mood:'😊',mood_text:'쉬는 중',door_closed:id==='closed-house',visits_today:2,visits_total:10,visits_day:ws()});
const fixtureDate='2026-10-04T00:00:00Z';
function fixtureQuery(table){
 let filters=[],single=false,head=false,columns='*';
 const q={
  select(_columns,options={}){columns=_columns;head=!!options.head;return q;},
  eq(key,value){filters.push([key,value]);return q;},
  is(key,value){filters.push([key,value]);return q;},
  in(){return q;},order(){return q;},limit(){return q;},range(){return q;},or(){return q;},
  maybeSingle(){single=true;return q;},single(){single=true;return q;},
  then(resolve,reject){return Promise.resolve().then(async()=>{
   fixtureReads.push({table,filters,columns});let rows=[];
   const owner=filters.find(([key])=>key==='id'||key==='user_id'||key==='owner_id')?.[1]||'open-house';
   if(table==='profiles'&&fixtureHolds.has(owner))await fixtureHolds.get(owner).promise;
   if(table==='profiles')rows=[fixtureProfile(owner)];
   else if(table==='diaries')rows=[{id:'old-diary',user_id:owner,title:'이전 다이어리',body:'예전에 공유한 글',visibility:'all',created_at:'2026-10-01T00:00:00Z',likes:0}];
   else if(table==='house_posts')rows=[
    {id:'new-post',user_id:owner,body:'새 공개 게시글',visibility:'all',folder_id:null,created_at:'2026-10-04T03:00:00Z',deleted_at:null},
    {id:'folder-post',user_id:owner,body:'공개 폴더가 허용한 게시글',visibility:'me',folder_id:'public-folder',created_at:'2026-10-02T00:00:00Z',deleted_at:null},
    {id:'private-post',user_id:owner,body:'방문자에게 숨겨야 할 비공개 글',visibility:'me',folder_id:null,created_at:fixtureDate,deleted_at:null,fixtureVisible:false}
   ];
   else if(table==='media_folders')rows=[
    {id:'public-folder',user_id:owner,name:'노트 모음',kind:'text',visibility:'all'},
    {id:'photo-folder',user_id:owner,name:'앨범 모음',kind:'photo',visibility:'all'},
    {id:'video-folder',user_id:owner,name:'비디오 모음',kind:'video',visibility:'all'},
    {id:'private-folder',user_id:owner,name:'비공개 폴더',kind:'photo',visibility:'me',fixtureVisible:false}
   ];
   else if(table==='media')rows=[
    {id:'public-photo',user_id:owner,type:'image',caption:'공개 앨범 사진',path:owner+'/public-photo.jpg',thumb_path:owner+'/public-photo-thumb.jpg',duration:0,visibility:'all',folder_id:null,created_at:'2026-10-04T02:00:00Z'},
    {id:'folder-photo',user_id:owner,type:'image',caption:'폴더가 허용한 사진',path:owner+'/folder-photo.jpg',thumb_path:owner+'/folder-photo-thumb.jpg',duration:0,visibility:'me',folder_id:'photo-folder',created_at:'2026-10-03T00:00:00Z'},
    {id:'public-video',user_id:owner,type:'video',caption:'공개 비디오 설명',path:owner+'/public-video.mp4',thumb_path:owner+'/public-video-thumb.jpg',duration:13,visibility:'all',folder_id:'video-folder',created_at:'2026-10-04T01:00:00Z'},
    {id:'private-photo',user_id:owner,type:'image',caption:'방문자에게 숨겨야 할 사진',path:owner+'/private-photo.jpg',duration:0,visibility:'me',folder_id:null,created_at:fixtureDate,fixtureVisible:false}
   ];
   else if(table==='guestbook')rows=[{id:'guest-message',owner_id:owner,author_id:'other-member',author_nick:'방문한 친구',body:'방명록에 남겨 둔 인사',secret:false,hidden:false,created_at:fixtureDate}];
   else if(table==='intros')rows=[{id:'neighbor-intro',owner_id:owner,author_id:'other-member',author_nick:'소개한 친구',body:'다정한 이웃이에요',created_at:fixtureDate}];
   // Simulated RLS output: inaccessible records never reach the page. Actual
   // database policy coverage lives in the dedicated house RLS tests.
   rows=rows.filter(row=>row.fixtureVisible!==false).map(({fixtureVisible,...row})=>row);
   return {data:head?null:single?(rows[0]||null):rows,count:head?1:null,error:null};
  }).then(resolve,reject);}
 };return q;
}
S={from:fixtureQuery,storage:{from(){return {createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:'https://fixture.test/fixture-media/'+encodeURIComponent(path)})),error:null})};}},rpc:async(name,args)=>{
 fixtureWrites.push({name,args});
 if(name==='house_room_load')return {data:args.p_owner==='current-member'?{ok:true,found:false,canEdit:true}:{ok:true,found:true,canEdit:false,revision:'11111111-1111-4111-8111-111111111111',updatedAt:fixtureDate,snapshot:{version:13,rooms:[{x:0,y:0,decor:false,curtains:false,shelf:null,furniture:{}},{x:1,y:0,decor:false,curtains:false,shelf:null,furniture:{}}]}},error:null};
 if(name==='house_room_save')return {data:{ok:true,revision:'22222222-2222-4222-8222-222222222222',updatedAt:fixtureDate},error:null};
 return {data:null,error:null};
}};
D.online=true;D.user={id:'current-member'};D.isAdmin=false;D.doorReady=true;D.mediaReady=true;D.foldersReady=true;
P.loaded=true;P.at=Date.now();$.friends=[];g.tab='friends';H();
window.visitTest={state:g,auth:D,model:$,actions:sr,render:H,visit:Ol,localVisit:sm,reads:fixtureReads,writes:fixtureWrites,
 resetReads(){fixtureReads.length=0;},
 hold(id){let release;const promise=new Promise(resolve=>release=resolve);fixtureHolds.set(id,{promise,release});},
 release(id){fixtureHolds.get(id)?.release();fixtureHolds.delete(id);},
 addLocal(){const room=Ao().room;$.friends=[{id:'local-neighbor',nick:'체험 이웃',bio:'체험 소개',mood:'😊',moodText:'안녕',avatar:{},room,rooms:[room],roomIdx:0,diary:[{id:'local-diary',title:'체험 기록',body:'체험 이웃의 공개 글',vis:'all',at:Date.now(),likes:0}],album:[],guestbook:[],intros:[],visits:{today:0,total:0}}];}
};
`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
   if(url.pathname.startsWith('/fixture-media/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="240"><rect width="320" height="240" fill="#dde8df"/><circle cx="160" cy="120" r="60" fill="#a9c5b0"/></svg>'});
   const file=path.resolve(root,'.'+url.pathname);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.visitTest);
  const noOwnerLoading=async(label)=>{
   assert.equal(await page.locator('[data-house-entry]').count(),0,label+': a visit cannot render the owner-only loading placeholder');
   assert.equal(await page.locator('iframe[title="우리집"]').count(),0,label+': visiting never opens the editable owner house');
   if(await page.evaluate(()=>visitTest.auth.online&&visitTest.state.visitData?.real&&!visitTest.state.visitData?.doorClosed)){
    await page.locator('[data-house-visit-entry] iframe').waitFor({state:'attached',timeout:10000});
    await page.locator('[data-house-visit-entry] [aria-busy="false"]').waitFor({timeout:10000});
    await page.frameLocator('[data-house-visit-entry] iframe').locator('#app').waitFor({state:'visible',timeout:10000});
   }
   assert.doesNotMatch(await page.locator('main.main').innerText(),/우리집을 불러오는 중/);
  };
  // Teleport reaches a real user through the existing database loader.
  await page.locator('[data-act="surf"]').click();
  await page.waitForFunction(()=>visitTest.state.visiting==='u:open-house');
  await noOwnerLoading('teleport');
  assert.equal(await page.frameLocator('[data-house-visit-entry] iframe').locator('#home-profile-nick').innerText(),'방문할 이웃');
  assert.match(await page.locator('main.main').innerText(),/새 공개 게시글/,'new account-backed posts must appear when the database permits the visit');
  assert.match(await page.locator('main.main').innerText(),/공개 폴더가 허용한 게시글/,'folder visibility can grant access even when the post has its old private visibility');
  assert.equal(await page.locator('#d-body,[data-act="diary-del"]').count(),0,'a visitor has no owner edit/delete controls');
  const visitorFrame=page.frameLocator('[data-house-visit-entry] iframe');
  assert.equal(await visitorFrame.locator('.room').count(),2,'the visitor displays the saved remote geometry');
  assert.equal(await visitorFrame.locator('#expand').isVisible(),false,'a visitor cannot expand the owner’s house');
  assert.equal(await visitorFrame.locator('#panel').isVisible(),false,'the editable house panel is hidden in the visitor frame');
  assert.equal(await page.evaluate(()=>visitTest.reads.some(row=>row.table==='house_posts'&&row.filters.some(([key,value])=>key==='user_id'&&value==='open-house'))),true);
  assert.equal(await page.evaluate(()=>visitTest.reads.some(row=>/trash|user_private/.test(row.table))),false,'visiting does not request private account or trash data');

  // The modern visitor feed combines current notes, historical diary entries,
  // photos and videos without enabling any owner controls.
  const section=label=>page.getByRole('tab',{name:label,exact:true});
  const rowTexts=()=>page.locator('article[data-visit-record]').allTextContents();
  assert.equal(await section('전체').getAttribute('aria-selected'),'true','teleport opens the unified all-record feed');
  assert.deepEqual(await page.getByRole('tab').allTextContents().then(labels=>labels.filter(label=>['전체','노트','앨범','비디오'].includes(label))),['전체','노트','앨범','비디오']);
  const chronological=['새 공개 게시글','공개 앨범 사진','공개 비디오 설명','폴더가 허용한 사진','공개 폴더가 허용한 게시글','이전 다이어리'];
  assert.deepEqual((await rowTexts()).map(text=>chronological.find(label=>text.includes(label))),chronological,'all visible current and legacy records use descending creation order');
  assert.equal(await page.locator('[data-act="visit-folder"]').count(),0,'all records has no kind-specific folder strip');
  assert.doesNotMatch(await page.locator('main.main').innerText(),/방문자에게 숨겨야|비공개 폴더/,'server-excluded private records and folders never appear');
  assert.equal(await page.locator('[data-act="diary-post"],[data-act="fd-new"],[data-act="fd-edit"],[data-act="diary-del"],[aria-label="우리집 설정"]').count(),0,'visitors cannot create, configure or delete owner records');
  assert.equal(await page.evaluate(()=>visitTest.reads.some(row=>row.table==='media_folders'&&row.columns.includes('kind'))),true,'folder categories are loaded from the server');
  assert.equal(await page.evaluate(()=>visitTest.reads.some(row=>/house_friend_groups|trash|user_private/.test(row.table))),false,'the visitor loader never requests private groups or trash');

  const beforeTabScroll=await page.evaluate(()=>window.scrollY);
  await section('노트').click();
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(()=>window.scrollY),beforeTabScroll,'visitor categories do not push the profile off screen');
  assert.deepEqual(await page.locator('article[data-visit-record]').evaluateAll(rows=>rows.map(row=>row.dataset.recordKind)),['text','text','text']);
  assert.equal(await page.locator('[data-act="visit-folder"][data-id="public-folder"]').count(),1);
  assert.equal(await page.locator('[data-act="visit-folder"][data-id="photo-folder"],[data-act="visit-folder"][data-id="video-folder"]').count(),0,'note folders do not include media folders');
  await page.locator('[data-act="visit-folder"][data-id="public-folder"]').click();
  assert.equal((await rowTexts()).length,1);
  assert.match((await rowTexts())[0],/공개 폴더가 허용한 게시글/,'folder access takes precedence over the old per-record private flag');
  await page.locator('[data-act="visit-note"][data-id="folder-post"][data-source="post"]').click();
  assert.match(await page.locator('#modal-root').innerText(),/공개 폴더가 허용한 게시글/,'a current note opens in the reader');
  assert.equal(await page.locator('#modal-root textarea,#modal-root [data-act="diary-del"]').count(),0);
  await page.locator('#modal-root [data-act="close"]').click();
  await page.locator('[data-act="visit-folder"][data-id="none"]').click();
  assert.deepEqual((await rowTexts()).map(text=>chronological.find(label=>text.includes(label))),['새 공개 게시글','이전 다이어리'],'unclassified notes preserve historical diary entries');
  await page.locator('[data-act="visit-note"][data-id="old-diary"][data-source="diary"]').click();
  assert.match(await page.locator('#modal-root').innerText(),/이전 다이어리|예전에 공유한 글/);
  await page.locator('#modal-root [data-act="close"]').click();

  await section('앨범').click();
  assert.equal(await page.locator('[data-act="visit-folder"][data-id="photo-folder"]').count(),1);
  assert.equal(await page.locator('[data-act="visit-folder"][data-id="public-folder"],[data-act="visit-folder"][data-id="video-folder"]').count(),0);
  assert.deepEqual(await page.locator('article[data-visit-record]').evaluateAll(rows=>rows.map(row=>row.dataset.recordKind)),['photo','photo']);
  await page.locator('[data-act="visit-folder"][data-id="photo-folder"]').click();
  assert.equal((await rowTexts()).length,1);
  await page.locator('[data-act="open-media"][data-id="folder-photo"]').first().click();
  assert.match(await page.locator('#modal-root').innerText(),/폴더가 허용한 사진/,'media retains the existing full-size viewer and caption');
  assert.equal(await page.locator('#modal-root .viewer img').count(),1);
  assert.equal(await page.locator('#modal-root [data-act="m-save"],#modal-root [data-act="m-del"]').count(),0);
  await page.locator('#modal-root [data-act="close"]').click();
  await section('비디오').click();
  assert.equal(await page.locator('[data-act="visit-folder"][data-id="video-folder"]').count(),1);
  assert.deepEqual(await page.locator('article[data-visit-record]').evaluateAll(rows=>rows.map(row=>row.dataset.recordKind)),['video']);
  await page.locator('[data-act="open-media"][data-id="public-video"]').first().click();
  assert.equal(await page.locator('#modal-root video[controls]').count(),1,'videos still open a playable media viewer');
  assert.match(await page.locator('#modal-root').innerText(),/공개 비디오 설명/);
  await page.locator('#modal-root [data-act="close"]').click();

  assert.equal(await page.locator('.visit-sections,[data-act="sec"][data-sec="guestbook"],[data-act="sec"][data-sec="intro"]').count(),0,'visitors see the four record categories without a second menu line');
  assert.deepEqual(await page.evaluate(()=>({guestbook:visitTest.state.visitData.guestbook.length,intros:visitTest.state.visitData.intros.length})),{guestbook:1,intros:1},'removing navigation does not discard existing guestbook or introduction data');
  for(const sec of ['guestbook','intro']){
   await page.evaluate(sec=>visitTest.actions.sec({sec}),sec);
   assert.equal(await section('전체').getAttribute('aria-selected'),'true','older section targets fall back to the unified record feed');
   assert.equal(await page.locator('#g-text,.visit-community').count(),0);
  }
  await page.evaluate(()=>visitTest.actions.sec({sec:'all'}));
  await section('전체').focus();await page.keyboard.press('ArrowRight');
  assert.equal(await section('노트').getAttribute('aria-selected'),'true','record tabs support keyboard navigation');
  await page.keyboard.press('ArrowRight');
  assert.equal(await section('앨범').getAttribute('aria-selected'),'true');
  await page.evaluate(()=>visitTest.actions.sec({sec:'all'}));
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'modern visitor layout fits '+width+'px');
   assert.equal(await page.locator('article[data-visit-record]').count(),6);
   assert.equal(await visitorFrame.locator('#home-profile-photo').isDisabled(),true,'visitor profile photo remains read only');
   if(process.env.VISIT_PROOF_DIR){await page.evaluate(()=>{window.scrollTo({top:0,left:0,behavior:'instant'});return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});fs.mkdirSync(process.env.VISIT_PROOF_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.VISIT_PROOF_DIR,'visitor-'+width+'.png'),fullPage:true});}
  }
  await page.setViewportSize({width:390,height:844});

  // A closed door is a completed destination, not an endless loading state.
  await page.evaluate(()=>{visitTest.resetReads();return visitTest.visit('closed-house');});
  await noOwnerLoading('closed door');
  assert.match(await page.locator('main.main').innerText(),/문닫은 이웃/);
  assert.match(await page.locator('main.main').innerText(),/문.*닫|쉬고|비공개/);
  assert.doesNotMatch(await page.locator('main.main').innerText(),/새 공개 게시글|공개 폴더가 허용한 게시글|예전에 공유한 글/);
  assert.equal(await page.evaluate(()=>visitTest.reads.some(row=>['house_posts','diaries','media','guestbook','intros'].includes(row.table))),false,'a closed door stops before requesting its contents');

  // A direct friend visit uses the same completed rendering path.
  await page.evaluate(()=>visitTest.visit('open-house','diary'));
  await noOwnerLoading('direct friend visit');
  assert.equal(await page.frameLocator('[data-house-visit-entry] iframe').locator('#home-profile-nick').innerText(),'방문할 이웃');
  await page.evaluate(()=>visitTest.visit('open-house','album'));
  assert.equal(await page.locator('#panel [data-sec="album"]').getAttribute('aria-selected'),'true','revisiting the same house with another section refreshes its record panel');
  await page.evaluate(()=>visitTest.visit('open-house','diary'));
  assert.equal(await page.locator('#panel [data-sec="diary"]').getAttribute('aria-selected'),'true');
  const visitsBefore=await page.evaluate(()=>visitTest.writes.filter(row=>row.name==='record_visit').length);
  await page.evaluate(async()=>{visitTest.state.surfRecent=[];await visitTest.actions.surf();await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));});
  assert.equal(await page.evaluate(()=>visitTest.writes.filter(row=>row.name==='record_visit').length),visitsBefore,'teleport excludes the current real user id even when the view uses a u: prefix');

  // Moving from a mounted own house disposes its iframe without overwriting the destination.
  await page.evaluate(()=>visitTest.actions.tab({tab:'home'}));
  await page.locator('iframe[title="우리집"]').waitFor({state:'attached'});
  await page.locator('[data-house-entry] [aria-busy="false"]').waitFor();
  await page.evaluate(()=>visitTest.state.surfRecent=[]);
  await page.frameLocator('iframe[title="우리집"]').getByRole('button',{name:'순간이동',exact:true}).click();
  await page.waitForFunction(()=>visitTest.state.visiting==='u:open-house');
  await noOwnerLoading('own home teleport to neighbor');
  assert.equal(await page.frameLocator('[data-house-visit-entry] iframe').getByRole('button',{name:'순간이동',exact:true}).isVisible(),true,'the new destination can teleport again');
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),'u:open-house');
  assert.equal(await page.frameLocator('[data-house-visit-entry] iframe').locator('#home-profile-nick').innerText(),'방문할 이웃');
  await page.evaluate(()=>visitTest.actions.tab({tab:'friends'}));
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),null);
  assert.equal(await page.locator('.world-main').count(),1);

  // Cancelling during random destination selection must not reopen a home.
  await page.evaluate(()=>{visitTest.actions.tab({tab:'home'});visitTest.resetReads();visitTest.state.surfRecent=[];visitTest.hold('open-house');visitTest.pending=visitTest.actions.surf({authorized:()=>visitTest.state.tab==='home'});});
  await page.waitForFunction(()=>visitTest.reads.some(row=>row.table==='profiles'&&row.columns==='id'));
  await page.evaluate(async()=>{visitTest.actions.tab({tab:'life'});visitTest.release('open-house');await visitTest.pending;});
  assert.equal(await page.evaluate(()=>visitTest.state.tab),'life','cancelled teleport selection preserves the current menu');
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),null);
  await page.evaluate(()=>visitTest.actions.tab({tab:'friends'}));

  // Slow database responses cannot replace a more recent destination/account.
  const startDelayed=async id=>{
   await page.evaluate(id=>{visitTest.hold(id);visitTest.pending=visitTest.visit(id);},id);
   await page.waitForFunction(id=>visitTest.reads.some(row=>row.table==='profiles'&&row.filters.some(([key,value])=>key==='id'&&value===id)),id);
  };
  const finishDelayed=id=>page.evaluate(async id=>{visitTest.release(id);await visitTest.pending;},id);
  await startDelayed('slow-a');
  await page.evaluate(()=>visitTest.visit('fast-b'));
  await finishDelayed('slow-a');
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),'u:fast-b','the latest visit wins when an earlier database response arrives last');
  await page.evaluate(()=>visitTest.actions.tab({tab:'friends'}));
  await startDelayed('slow-navigation');
  await page.evaluate(()=>visitTest.actions.tab({tab:'life'}));
  await finishDelayed('slow-navigation');
  assert.equal(await page.evaluate(()=>visitTest.state.tab),'life','a finished visit cannot pull the member away from another menu');
  await page.evaluate(()=>visitTest.actions.tab({tab:'friends'}));
  await startDelayed('slow-roundtrip');
  await page.evaluate(()=>{visitTest.actions.tab({tab:'life'});visitTest.actions.tab({tab:'friends'});});
  await finishDelayed('slow-roundtrip');
  assert.equal(await page.evaluate(()=>visitTest.state.tab),'friends','returning to the original menu does not revive an abandoned visit');
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),null);
  await startDelayed('slow-account');
  await page.evaluate(()=>{visitTest.auth.user={id:'different-member'};visitTest.render();});
  await finishDelayed('slow-account');
  assert.equal(await page.evaluate(()=>visitTest.state.visiting),null,'a visit started by another account cannot commit');
  await page.evaluate(()=>{visitTest.auth.user={id:'current-member'};});

  // Local demo friends follow sm(), which previously had the same lost branch.
  await page.evaluate(()=>{visitTest.auth.online=false;visitTest.auth.user=null;visitTest.addLocal();visitTest.localVisit('local-neighbor');});
  await noOwnerLoading('demo friend visit');
  assert.match(await page.locator('main.main').innerText(),/체험 이웃/);
  assert.match(await page.locator('main.main').innerText(),/체험 기록/);
  assert.doesNotMatch(await page.locator('main.main').innerText(),/로그인하면 나만의 방/,'guest demo visiting is different from opening an owned room');
  for(const width of [320,390,1280]){
   await page.setViewportSize({width,height:844});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'visit layout fits '+width+'px');
  }
  assert.deepEqual(errors,[],'visiting and leaving produce no uncaught browser errors');
  console.log('PASS: direct visitor record tabs without redundant menus, chronological current and legacy records, category folders, read-only media and note viewers, retained guestbook data, keyboard/mobile layout, closed doors and visit races.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
