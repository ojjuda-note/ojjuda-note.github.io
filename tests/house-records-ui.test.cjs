const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.HOUSE_RECORDS_PROOF_DIR||path.resolve(root,'../records-proof');
const fixture=`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js';window.owner='records-a';document.querySelector('#open').onclick=()=>{const account=owner;openHouseTest({owner:account,authorized:()=>owner===account});};</script>`;
const saved={version:13,rooms:[{x:0,y:0,decor:false,curtains:false,shelf:null,furniture:{}}],diary:'기존에 쓴 글을 유지해 주세요.'};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
  await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});if(u.pathname==='/_proof.ttf'&&process.env.HOUSE_RECORDS_PROOF_FONT)return route.fulfill({path:process.env.HOUSE_RECORDS_PROOF_FONT});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
  await context.addInitScript(()=>{
   window.mediaOpens=0;window.mediaDelay=0;window.denyMedia=false;window.failMediaWrite=false;window.liveMediaUrls=new Set();
   const open=IDBFactory.prototype.open;IDBFactory.prototype.open=function(name,...args){if(name==='ojjuda-house-record-media'){mediaOpens++;if(denyMedia)throw new DOMException('fixture denied','SecurityError');const request=open.call(this,name,...args);if(mediaDelay){const delay=mediaDelay,descriptor=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');Object.defineProperty(request,'onsuccess',{set(fn){descriptor.set.call(request,event=>setTimeout(()=>fn.call(request,event),delay));}});}return request;}return open.call(this,name,...args);};
   const add=IDBObjectStore.prototype.add;IDBObjectStore.prototype.add=function(...args){if(this.name==='files'&&failMediaWrite)throw new DOMException('fixture full','QuotaExceededError');return add.apply(this,args);};
   const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=function(blob){const url=create.call(this,blob);liveMediaUrls.add(url);return url;};URL.revokeObjectURL=function(url){liveMediaUrls.delete(url);return revoke.call(this,url);};
  });
  if(process.env.HOUSE_RECORDS_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:RecordProof;src:url(/_proof.ttf)}html,body,button,input,textarea{font-family:RecordProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://fixture.test/fixture');
  await page.evaluate(saved=>localStorage.setItem('ojjuda-house-playtest-v1:records-a',JSON.stringify(saved)),saved);
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').getByRole('tab',{name:'게시판',exact:true}).click();return page.frames().find(frame=>frame.url().includes('/house-test/index.html'));};
  const close=async()=>{await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();};
  const choose=(f,kind)=>f.getByRole('tab',{name:kind,exact:true}).click();
  const mediaList=(f,kind)=>f.evaluate(async kind=>(await import('/house-test/record-media-store.js?v=20261004-records1')).listRecordMedia('records-a',kind),kind);
  let f=await open();assert.equal(await f.getByRole('tab',{name:'게시판',exact:true}).getAttribute('aria-selected'),'true');
  assert.deepEqual(await f.getByRole('tab').allTextContents(),['전체','게시판','사진','동영상']);assert.equal(await f.locator('#diary').inputValue(),saved.diary);
  await f.getByRole('tab',{name:'게시판',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await f.getByRole('tab',{name:'사진',exact:true}).getAttribute('aria-selected'),'true');
  await f.locator('.record-empty').waitFor();
  const photo={name:'우리집.webp',mimeType:'image/webp',buffer:fs.readFileSync(path.join(root,'house-test/assets/entry-house-v1.webp'))};
  await f.locator('input[type=file]').setInputFiles({name:'잘못된.txt',mimeType:'text/plain',buffer:Buffer.from('not a photo')});await f.getByRole('status').filter({hasText:'사진을 선택'}).waitFor();assert.equal((await mediaList(f,'photo')).length,0);
  await f.locator('input[type=file]').setInputFiles([photo,{...photo,name:'<사진 & 추억>.webp'}]);await f.waitForFunction(()=>document.querySelectorAll('.record-card img').length===2);await f.locator('.record-card img').first().evaluate(im=>im.decode());
  assert.equal((await mediaList(f,'photo')).length,2);await page.screenshot({path:path.join(proof,'photos-mobile.png')});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:path.join(proof,'photos-desktop.png')});
  await page.setViewportSize({width:320,height:568});assert.equal(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#panel-body').scrollWidth<=document.querySelector('#panel-body').clientWidth),true);
  await page.setViewportSize({width:390,height:844});
  await f.getByRole('button',{name:'우리집.webp 삭제',exact:true}).click();await f.getByRole('button',{name:'취소',exact:true}).click();assert.equal((await mediaList(f,'photo')).length,2);
  await f.evaluate(()=>failMediaWrite=true);await f.locator('input[type=file]').setInputFiles(photo);await f.getByRole('status').filter({hasText:'저장 공간이 부족'}).waitFor();assert.equal((await mediaList(f,'photo')).length,2,'failed file write rolls back metadata and preserves earlier records');await f.evaluate(()=>failMediaWrite=false);
  await choose(f,'게시판');assert.equal(await f.evaluate(()=>liveMediaUrls.size),0,'leaving a gallery releases every object URL');assert.equal(await f.locator('#diary').inputValue(),saved.diary);
  await f.locator('#diary').fill('글·사진·동영상을 따로 보관해요.');await f.getByRole('button',{name:'기록 저장',exact:true}).click();
  // Produce a playable WebM so the test checks real video persistence and playback.
  const video=Buffer.from(await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=120;const ctx=canvas.getContext('2d'),stream=canvas.captureStream(10),recorder=new MediaRecorder(stream,{mimeType:'video/webm'}),parts=[];recorder.ondataavailable=e=>parts.push(e.data);const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start();let n=0;const paint=setInterval(()=>{ctx.fillStyle=n++%2?'#ccb7e8':'#f7c9bd';ctx.fillRect(0,0,160,120);},50);await new Promise(resolve=>setTimeout(resolve,550));recorder.stop();await done;clearInterval(paint);stream.getTracks().forEach(track=>track.stop());return Array.from(new Uint8Array(await new Blob(parts,{type:'video/webm'}).arrayBuffer()));}));
  await choose(f,'동영상');await f.locator('.record-empty').waitFor();await f.locator('input[type=file]').setInputFiles({name:'집으로 가는 길.webm',mimeType:'video/webm',buffer:video});await f.locator('video').waitFor();assert.equal(await f.locator('video').getAttribute('preload'),'none');assert.equal(await f.locator('video').evaluate(el=>el.autoplay),false);
  await f.getByRole('button',{name:'집으로 가는 길.webm 크게 보기',exact:true}).click();assert.equal(await f.locator('dialog video').evaluate(el=>el.controls),true);await f.locator('dialog video').evaluate(async el=>{el.muted=true;await el.play();});await f.waitForFunction(()=>document.querySelector('dialog video').currentTime>0);await page.screenshot({path:path.join(proof,'videos-mobile.png')});
  await f.locator('dialog button').click();await f.locator('dialog').waitFor({state:'detached'});
  const videoBytes=await f.evaluate(async()=>{const store=await import('/house-test/record-media-store.js?v=20261004-records1'),[record]=await store.listRecordMedia('records-a','video');return Array.from(new Uint8Array(await(await store.readRecordMedia('records-a',record.id)).arrayBuffer()));});assert.deepEqual(Buffer.from(videoBytes),video);
  // A slow media read cannot replace the newly selected text panel.
  await choose(f,'게시판');await f.evaluate(()=>mediaDelay=120);await choose(f,'사진');await choose(f,'게시판');await f.waitForTimeout(180);assert.equal(await f.locator('#diary').inputValue(),'글·사진·동영상을 따로 보관해요.');assert.equal(await f.locator('[data-record-id]').count(),0);assert.equal(await f.evaluate(()=>liveMediaUrls.size),0);await f.evaluate(()=>mediaDelay=0);
  await close();f=await open();assert.equal(await f.locator('#diary').inputValue(),'글·사진·동영상을 따로 보관해요.');await choose(f,'사진');await f.waitForFunction(()=>document.querySelectorAll('.record-card img').length===2);
  await f.getByRole('button',{name:'우리집.webp 삭제',exact:true}).click();await f.getByRole('button',{name:'삭제하기',exact:true}).click();await f.waitForFunction(()=>document.querySelectorAll('.record-card').length===1);assert.equal((await mediaList(f,'photo')).length,1);assert.equal((await mediaList(f,'video')).length,1,'photo deletion cannot remove a video');
  await close();await page.evaluate(()=>owner='records-b');f=await open();assert.equal(await f.locator('#diary').inputValue(),'');await choose(f,'사진');await f.locator('.record-empty').waitFor();await choose(f,'동영상');await f.locator('.record-empty').waitFor();
  await close();await page.evaluate(()=>owner='records-a');f=await open();await f.evaluate(()=>denyMedia=true);await choose(f,'사진');await f.getByRole('status').filter({hasText:'브라우저 설정'}).waitFor();await choose(f,'게시판');assert.equal(await f.locator('#diary').inputValue(),'글·사진·동영상을 따로 보관해요.');
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:records-a')).rooms),saved.rooms);assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({categories:true,existingTextAndRoomPreserved:true,mediaLoadDoesNotBlockText:true,photoAndVideoPersisted:true,realVideoPlayback:true,ownerIsolation:true,atomicQuotaFailure:true,deleteAndCancel:true,storageDeniedKeepsText:true,tabRaceAndURLCleanup:true,mobileWidth:true,errors},null,2));
  console.log('HOUSE RECORDS PASS: categories, preserved diary/room, owner-scoped media, real video playback, reopen, delete/cancel, quota/denied storage, tab races and URL cleanup');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
