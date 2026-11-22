const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://ojjuda.kr';
const storageOrigin = 'https://fixture.supabase.co';
const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const fixtureDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'ojjuda-admin-media-'));

function generateMedia() {
  const run = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...args, '-y'], {stdio:'pipe'});
  const video = path.join(fixtureDirectory, 'synthetic.mp4');
  const photo = path.join(fixtureDirectory, 'synthetic.jpg');
  run(['-f','lavfi','-i','testsrc2=size=160x90:rate=12','-t','2','-an',
    '-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-movflags','+faststart',video]);
  run(['-i',video,'-frames:v','1','-update','1',photo]);
  return {video:fs.readFileSync(video),photo:fs.readFileSync(photo)};
}

// Entirely synthetic moderator data. Storage URLs are intercepted below and
// return only the tiny local JPEG/MP4 generated from FFmpeg's test pattern.
function installFixture() {
  const id = number => `10000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
  const actor=id(99),storageOrigin='https://fixture.supabase.co';
  const card=(number,extra={})=>({id:id(number),author_id:actor,kind:'memo',body:`공개 테스트 영상·사진 ${number}`,
    hidden:false,tags:[],created_at:'2026-11-21T00:00:00Z',total_count:4,...extra});
  const media=(number,kind='photo')=>({card_id:id(number),
    photo_bucket:kind==='event'?'note-event-photos':'note-card-photos',photo_path:`${actor}/${id(number)}.jpg`,
    video_bucket:kind==='video'?'note-card-videos':null,video_path:kind==='video'?`${actor}/${id(number)}.mp4`:null,
    duration:kind==='video'?2:null,width:kind==='video'?160:null,height:kind==='video'?90:null});
  const state=window.__mediaFixture={calls:[],signatures:[],failVideo:false,deferVideo:false,releaseVideo:null,
    cards:[card(1),card(2),card(3,{kind:'event'}),card(4)],
    archive:[card(10,{total_count:1,archive_reason:'admin',archived_at:'2026-11-20T00:00:00Z',purge_after:'2099-12-31T00:00:00Z',reply_count:1})],
    thread:[card(10,{total_count:2}),card(11,{kind:'comment',parent_id:id(10),total_count:2})],
    media:[media(1),media(2,'video'),media(3,'event'),media(10),media(11,'video')]};
  const sign=async(bucket,paths,expiresIn,single)=>{
    state.signatures.push({bucket,paths:[...paths],expiresIn,single});
    const url=value=>`${storageOrigin}/storage/v1/object/sign/${bucket}/${value}?token=public-fixture`;
    const result=()=>single?{data:{signedUrl:url(paths[0])}}:{data:paths.map(value=>({path:value,signedUrl:url(value)}))};
    if(bucket==='note-card-videos'&&state.failVideo)return {error:{message:'synthetic signing failure'}};
    if(bucket==='note-card-videos'&&state.deferVideo)return new Promise(resolve=>{state.releaseVideo=()=>resolve(result());});
    return result();
  };
  window.OJJUDA_CONFIG={supabaseUrl:storageOrigin,supabaseKey:'public-fixture-key'};
  window.__adminClient={
    schema(name){if(name!=='ojjuda_note')throw Error('unexpected_fixture_schema');return this;},
    auth:{getSession:async()=>({data:{session:{user:{id:actor}}}}),
      onAuthStateChange(handler){state.authChange=handler;return {data:{subscription:{unsubscribe(){}}}};}},
    storage:{from(bucket){return {createSignedUrls:(paths,expiresIn)=>sign(bucket,paths,expiresIn,false),
      createSignedUrl:(value,expiresIn)=>sign(bucket,[value],expiresIn,true)};}},
    async rpc(name,args={}){
      state.calls.push({name,args});
      if(name==='is_note_moderator')return {data:true};
      if(name==='admin_cards')return {data:state.cards.map(row=>({...row,hidden:args.p_state==='hidden'}))};
      if(['admin_risk_cards','admin_risk_passed_ids','admin_expired_archive_queue','admin_pending_photo_cleanup','admin_actions'].includes(name))return {data:[]};
      if(name==='admin_archived_cards')return {data:state.archive};
      if(name==='admin_archived_thread')return {data:state.thread};
      if(name==='admin_card_media_paths')return {data:state.media.filter(row=>args.p_ids.includes(row.card_id))};
      throw Error('unexpected_fixture_rpc:'+name);
    }
  };
}

const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="/note/admin.css"><style>
*{box-sizing:border-box}body{margin:0;padding:12px;background:#f5f6fc;font:14px/1.6 system-ui,sans-serif}
#host{max-width:1000px;margin:0 auto}</style></head><body><main id="host"></main>
<script src="/note/admin.js"></script><script>
window.__mediaReady=OjjudaNoteAdmin.mount(document.getElementById('host'),{client:__adminClient,initialTab:'cards'});
</script></body></html>`;

(async()=>{
  let browser;
  try{
    const fixtures=generateMedia();
    assert.ok(fixtures.video.length>500&&fixtures.photo.length>100,'real encoded fixtures exist');
    browser=await chromium.launch({headless:true,
      executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.CHROMIUM_PATH||undefined,
      args:['--no-sandbox','--disable-dev-shm-usage']});
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'ko-KR',serviceWorkers:'block'});
    await context.addInitScript(installFixture);
    const mediaRequests=[],errors=[],unexpected=[];
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if(url.origin===storageOrigin&&url.pathname.startsWith('/storage/v1/object/sign/')){
        mediaRequests.push(url.pathname);
        if(url.pathname.includes('/note-card-videos/'))return route.fulfill({contentType:'video/mp4',body:fixtures.video,headers:{'Cache-Control':'no-store'}});
        if(url.pathname.includes('/note-card-photos/')||url.pathname.includes('/note-event-photos/'))return route.fulfill({contentType:'image/jpeg',body:fixtures.photo,headers:{'Cache-Control':'no-store'}});
      }
      if(url.origin===origin){
        if(url.pathname==='/admin-media-fixture.html')return route.fulfill({contentType:'text/html; charset=utf-8',body:html});
        if(['/note/admin.js','/note/admin.css'].includes(url.pathname))return route.fulfill({
          contentType:url.pathname.endsWith('.js')?'text/javascript':'text/css',body:fs.readFileSync(path.join(root,url.pathname))});
        if(url.pathname==='/favicon.ico')return route.fulfill({status:204});
      }
      // Optional web fonts are deliberately local/empty in this offline fixture.
      if(url.hostname==='fonts.googleapis.com')return route.fulfill({contentType:'text/css',body:''});
      unexpected.push(url.origin+url.pathname);await route.abort();
    });
    const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/admin-media-fixture.html',{waitUntil:'networkidle'});
    await page.evaluate(()=>__mediaReady);
    await page.waitForFunction(()=>document.querySelectorAll('.na-card-media img').length===3);
    const photoButton=page.locator(`.na-card-media[data-card-id="${id(1)}"] [aria-label="업로드 사진 크게 보기"]`);
    const videoButton=page.locator(`.na-card-media[data-card-id="${id(2)}"] [aria-label="동영상 보기"]`);
    assert.equal(mediaRequests.some(url=>url.includes('/note-card-videos/')),false,'list display downloads no video bytes');
    assert.equal(await page.evaluate(()=>__mediaFixture.signatures.some(call=>call.bucket==='note-card-videos')),false);
    const eventPhoto=page.locator(`.na-card-media[data-card-id="${id(3)}"] img`);
    await eventPhoto.scrollIntoViewIfNeeded();
    await page.waitForFunction(cardId=>document.querySelector(`.na-card-media[data-card-id="${cardId}"] img`)?.naturalWidth>0,id(3));
    assert.ok(mediaRequests.some(url=>url.includes('/note-event-photos/')),'event photo uses its authorized bucket');
    for(const width of [320,390,750]){
      await page.setViewportSize({width,height:844});
      const fit=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
      assert.ok(fit.scroll<=fit.width+1,`media list fits ${width}px: ${JSON.stringify(fit)}`);
    }
    const proof=process.env.PARK_ADMIN_MEDIA_PROOF_DIR;
    if(proof){fs.mkdirSync(proof,{recursive:true});await page.screenshot({path:path.join(proof,'admin-media-list-750.png'),fullPage:true});}
    await page.setViewportSize({width:390,height:844});
    await photoButton.click();
    const dialog=page.locator('.na-media-dialog'),image=dialog.locator('img');
    await image.waitFor({state:'visible'});
    await page.waitForFunction(()=>{const img=document.querySelector('.na-media-dialog img');return img?.naturalWidth>0;});
    assert.deepEqual(await image.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[160,90]);
    if(proof)await page.screenshot({path:path.join(proof,'admin-photo-preview-390.png')});
    await dialog.getByRole('button',{name:'닫기',exact:true}).click();
    await dialog.waitFor({state:'hidden'});
    assert.equal(await photoButton.evaluate(node=>document.activeElement===node),true,'closing restores the originating thumbnail focus');

    await videoButton.click();
    const player=page.locator('.na-media-video');await player.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.na-media-video')?.getAttribute('src'));
    await player.evaluate(async video=>{video.muted=true;await video.play();});
    await page.waitForFunction(()=>{const video=document.querySelector('.na-media-video');return video?.readyState>=2&&video.currentTime>0;});
    const realPlayer=await player.evaluate(video=>({controls:video.controls,inline:video.playsInline,width:video.videoWidth,height:video.videoHeight}));
    assert.deepEqual(realPlayer,{controls:true,inline:true,width:160,height:90},'the actual native player decodes the signed MP4 fixture');
    assert.equal(await page.evaluate(()=>__mediaFixture.signatures.filter(call=>call.bucket==='note-card-videos').length),1);
    const playerHandle=await player.elementHandle();
    if(proof)await page.screenshot({path:path.join(proof,'admin-video-preview-390.png')});
    await page.evaluate(()=>OjjudaNoteAdmin.refresh());
    await videoButton.waitFor({state:'visible'});
    assert.deepEqual(await playerHandle.evaluate(video=>({paused:video.paused,src:video.getAttribute('src'),poster:video.getAttribute('poster')})),
      {paused:true,src:null,poster:null},'refresh pauses playback and discards expiring signed URLs');

    await page.locator('.na-search select').selectOption('hidden');
    await page.locator('.na-search').getByRole('button',{name:'검색',exact:true}).click();
    await page.waitForFunction(()=>__mediaFixture.calls.filter(call=>call.name==='admin_cards').at(-1).args.p_state==='hidden');
    await videoButton.waitFor({state:'visible'});
    await page.evaluate(()=>OjjudaNoteAdmin.selectTab('archive'));
    await page.locator(`.na-card-media[data-card-id="${id(10)}"] img`).waitFor({state:'visible'});
    await page.getByRole('button',{name:'원문·답글 보기',exact:true}).click();
    const archivedVideo=page.locator(`.na-card-media[data-card-id="${id(11)}"] [aria-label="동영상 보기"]`);
    await archivedVideo.waitFor({state:'visible'});
    await page.evaluate(()=>{__mediaFixture.failVideo=true;});
    await archivedVideo.click();
    const archivedSlot=page.locator(`.na-card-media[data-card-id="${id(11)}"]`);
    await archivedSlot.locator('.na-media-error').waitFor({state:'visible'});
    await page.evaluate(()=>{__mediaFixture.failVideo=false;});
    await archivedSlot.getByRole('button',{name:'다시 불러오기',exact:true}).click();
    await player.waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('.na-media-video')?.getAttribute('src'));
    await player.evaluate(async video=>{video.muted=true;await video.play();});
    await page.waitForFunction(()=>document.querySelector('.na-media-video')?.currentTime>0);
    const archivedHandle=await player.elementHandle();
    await page.evaluate(()=>OjjudaNoteAdmin.selectTab('actions'));
    await dialog.waitFor({state:'hidden'});
    assert.deepEqual(await archivedHandle.evaluate(video=>({paused:video.paused,src:video.getAttribute('src')})),{paused:true,src:null});

    await page.evaluate(()=>OjjudaNoteAdmin.selectTab('cards'));
    await videoButton.waitFor({state:'visible'});
    await page.evaluate(()=>{__mediaFixture.deferVideo=true;});
    await videoButton.click();await page.waitForFunction(()=>typeof __mediaFixture.releaseVideo==='function');
    await page.evaluate(async()=>{OjjudaNoteAdmin.unmount();__mediaFixture.releaseVideo();await new Promise(resolve=>setTimeout(resolve,0));});
    assert.equal(await page.locator('.na-media-dialog[open]').count(),0);
    assert.equal(await page.locator('video[src]').count(),0,'late signing cannot restore media after administrator unmount');
    assert.deepEqual(errors,[]);assert.deepEqual(unexpected,[]);
    console.log('PASS: moderator photo/event thumbnails, real MP4 playback, hidden/archive replies, retry, viewport and signed-media cleanup');
  }finally{
    await browser?.close();fs.rmSync(fixtureDirectory,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
