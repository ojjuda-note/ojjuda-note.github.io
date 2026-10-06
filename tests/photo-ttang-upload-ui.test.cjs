const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'games/photo-ttang.html'),'utf8');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'photo-ttang-')),photo=path.join(dir,'photo.jpg');
fs.writeFileSync(photo,Buffer.from(html.match(/data:image\/jpeg;base64,([A-Za-z0-9+/=]+)/)[1],'base64'));
const invalid=path.join(dir,'broken.jpg');fs.writeFileSync(invalid,'not an image');
const mock=`<script>
window.savedPhotos=[];window.photoUploads=[];
window.ojjudaSupabase={auth:{getUser:async()=>({data:{user:{id:'11111111-1111-4111-8111-111111111111'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},rpc:async name=>({data:name==='get_my_member_identity'?{age:19,locked:true}:false}),
 storage:{from:()=>({upload:async(name,blob,options)=>{photoUploads.push({name,size:blob.size,type:blob.type,options});return{error:null}},createSignedUrl:async p=>({data:{signedUrl:p}})})},
 from:()=>{const q={select(){return q},neq(){return q},eq(){return q},order(){return q},limit(){return q},then(resolve,reject){return Promise.resolve({data:[],error:null}).then(resolve,reject)},insert:async row=>{if(window.failPhotoSave)return{error:new Error('등록 재시도 확인')};savedPhotos.push(row);return{error:null}}};return q;}};
</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  async function fixture(cvScript,slowVision=false){
   const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[],requests=[];
   await context.route('**/*',r=>{
    const u=new URL(r.request().url());
    if(u.hostname==='127.0.0.1'&&u.pathname.endsWith('.js'))return r.fulfill({contentType:'application/javascript',path:path.join(root,u.pathname)});
    if(u.hostname==='127.0.0.1')return u.pathname==='/photo.jpg'?r.fulfill({contentType:'image/jpeg',path:photo}):r.fulfill({contentType:'text/html',body:html.replace('</head>',mock+'</head>')});
    if(slowVision&&u.pathname.includes('/@mediapipe/tasks-vision@'))return new Promise(resolve=>setTimeout(resolve,8000)).then(()=>r.abort());
    if(u.pathname.includes('/opencv-js@')){requests.push(u.pathname);return cvScript?r.fulfill({contentType:'application/javascript',body:cvScript}):r.abort();}
    return r.abort();
   });
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:8879/photo');
   await page.waitForSelector('#grid .cell');return{page,context,errors,requests};
  }
  // Emscripten may export a thenable that resolves to itself. The loader must not
  // mistake a named DOM element for OpenCV or assimilate that module forever.
  for(const script of [
   'var cv=Promise.resolve({Mat:function(){}});',
   'var cv={then(resolve){setTimeout(()=>{cv.Mat=function(){};resolve(cv)},5)}};',
   'var cv={};setTimeout(()=>{cv.Mat=function(){};cv.onRuntimeInitialized()},5);'
  ]){
   const f=await fixture(script);
   await f.page.evaluate(()=>{window.cvLoadDone=false;loadCV().then(()=>window.cvLoadDone=true);});
   await f.page.waitForFunction(()=>window.cvLoadDone,{},{timeout:2000});
   assert.equal(f.requests.length,1);assert.deepEqual(f.errors,[]);await f.context.close();
  }
  const f=await fixture(undefined,true),page=f.page;
  // Failed CDN initialization is retryable, and offline image preparation still
  // produces a playable stage instead of leaving the picker spinning.
  assert.equal(await page.evaluate(async()=>{let failures=0;for(let n=0;n<2;n++){try{await loadCV()}catch{failures++}}return failures}),2);
  assert.equal(f.requests.length,2);
  await page.click('#uploadBtn');await page.setInputFiles('#file',invalid);
  await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').textContent(),/JPG·PNG/);
  await page.setInputFiles('#file',photo);
  await page.waitForSelector('#try',{timeout:30000});
  assert.equal(await page.getByAltText('게임 판 미리보기').evaluate(im=>im.complete&&im.naturalWidth>0),true);
  assert.equal(await page.locator('#try').isEnabled(),true);
  assert.equal(await page.locator('#send').isEnabled(),false);
  // The editor photo belongs between its toolbars, including on small phones.
  // It must never float over the painting or zoom buttons.
  for(const [width,height] of [[320,568],[390,844],[844,390]]){
   await page.setViewportSize({width,height});await page.click('#fix');await page.waitForSelector('#ed');
   const bounds=await page.locator('#ed').evaluate(ed=>{
    const box=ed.closest('.panel'),r=ed.getBoundingClientRect(),p=box.getBoundingClientRect();
    const paint=box.querySelector('.fixbtns').getBoundingClientRect(),zoom=box.querySelector('#zin').parentElement.getBoundingClientRect();
    return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,panelLeft:p.left,panelRight:p.right,paintBottom:paint.bottom,zoomTop:zoom.top};
   });
   assert.ok(bounds.left>=bounds.panelLeft&&bounds.right<=bounds.panelRight,'photo stays within the adjustment panel');
   assert.ok(bounds.top>=bounds.paintBottom,'painting controls stay above the photo');
   assert.ok(bounds.zoomTop>=bounds.bottom,'zoom controls stay below the photo');
   for(const selector of ['[data-m="0"]','[data-m="1"]','#zin','#zout']){
    const button=page.locator(selector);await button.scrollIntoViewIfNeeded();
    assert.equal(await button.evaluate(b=>{const r=b.getBoundingClientRect();return b.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'editor controls are not covered by the photo');
   }
   await page.click('[data-m="0"]');assert.equal(await page.locator('[data-m="0"]').evaluate(b=>b.classList.contains('on')),true);
   await page.click('[data-m="1"]');await page.click('#done');await page.waitForSelector('#try');
  }
  await page.setViewportSize({width:390,height:844});
  await page.check('#ag');assert.equal(await page.locator('#send').isEnabled(),true);
  await page.evaluate(()=>window.failPhotoSave=true);await page.click('#send');
  await page.getByText('등록 재시도 확인',{exact:true}).waitFor();assert.equal(await page.locator('#send').isEnabled(),true);
  await page.evaluate(()=>window.failPhotoSave=false);await page.click('#send');await page.getByText('등록했어요!',{exact:true}).waitFor();
  const saved=await page.evaluate(()=>({rows:savedPhotos,uploads:photoUploads}));assert.equal(saved.rows.length,1);
  assert.equal(saved.rows[0].visibility,'friends');assert.equal(saved.rows[0].status,'approved');
  assert.ok(saved.rows[0].sil_pct>=35&&saved.rows[0].sil_pct<=75);
  assert.equal(saved.rows[0].mask_rle.split(',').map(Number).reduce((a,b)=>a+b,0),300*400);
  assert.ok(saved.uploads.every(u=>u.size>0&&u.type==='image/jpeg'&&u.options.upsert===false));
  await page.click('#ok');await page.click('#uploadBtn');await page.setInputFiles('#file',photo);await page.waitForSelector('#try',{timeout:30000});
  await page.click('[data-v="public"]');await page.check('#ag');await page.click('#send');await page.getByText('등록했어요!',{exact:true}).waitFor();
  const shared=await page.evaluate(()=>savedPhotos[1]);assert.equal(shared.visibility,'public');assert.equal(shared.status,'pending');
  await page.getByText('관리자가 확인하면 모두에게 보여요.',{exact:false}).waitFor();
  await page.click('#ok');await page.click('#uploadBtn');await page.setInputFiles('#file',photo);await page.waitForSelector('#try',{timeout:30000});
  await page.click('#try');await page.waitForFunction(()=>mode==='play'&&photoImg.complete&&photoImg.naturalWidth>0);
  assert.equal(await page.locator('#hud').isVisible(),true);await page.click('#pause');assert.equal(await page.getByText('잠깐 쉬는 중').isVisible(),true);await page.click('#go');
  // Registration keeps its required coverage range; a real photo can still be
  // tried immediately when automatic detection needs manual correction.
  for(const fill of [10,90]){
   await page.evaluate(async({file,fill})=>{
    toMenu();const im=await readImage(await(await fetch(file)).blob());
    const c=document.createElement('canvas');c.width=300;c.height=400;c.getContext('2d').drawImage(im,0,0,300,400);
    const m=new Uint8Array(300*400);m.fill(1,0,Math.round(m.length*fill/100));
    const src={canvas:c,m,mw:300,mh:400,kind:'thing'};src.crop=cropFor(src,1,150,200);
    const o=panel('<div id="up"></div>');stepPreview(o.querySelector('#up'),src,o);
   },{file:'/photo.jpg',fill});
   assert.equal(await page.locator('#try').isEnabled(),true);await page.check('#ag');assert.equal(await page.locator('#send').isEnabled(),false);
   await page.click('#try');assert.equal(await page.evaluate(()=>mode), 'play');
  }
  const masks=await page.evaluate(()=>{const m=new Uint8Array(100);cleanMask(m,10,10);return Array.from(m)});assert.ok(masks.every(v=>v===0));
  const respawn=await page.evaluate(()=>{
   paused=true;LIST=PHOTOS;startStage(14);paused=true;sound=false;
   const bot=world.players.find(p=>p.bot);world.time=10;world.kill(bot,me.id,'cut');
   const at=bot.respawnAt;world.time=39.98;world.step(.01);const before=bot.alive;world.time=40;world.step(0);const after=bot.alive;
   mobs=mobs.slice(0,1);const m=mobs[0];world.time=50;world.setOwn(world.si(m.x,m.y),me.id);updateMobs(0);
   const killed=mobs.length,queued=respawnQ[0].at;world.time=79.99;updateMobs(0);const mobBefore=mobs.length;
   world.time=80;updateMobs(0);const mobAfter=mobs.length;const born=mobs[0].born;startStage(0);
   return{at,before,after,killed,queued,mobBefore,mobAfter,born,pending:respawnQ.length};
  });
  assert.deepEqual(respawn,{at:40,before:false,after:true,killed:0,queued:80,mobBefore:0,mobAfter:1,born:80,pending:0});
  assert.deepEqual(f.errors,[]);await f.context.close();
  console.log('PASS: OpenCV readiness, retry, offline photo preview, trial start, registration retry, coverage rules, and 30-second bot/mob respawn');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});
