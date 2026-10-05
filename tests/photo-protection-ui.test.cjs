const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.route('**/*',route=>route.abort());
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,''));
  await page.addStyleTag({content:read('note/style.css')+read('note/features.css')+read('photo-protection.css')});
  await page.addScriptTag({content:read('photo-protection.js')});
  await page.addScriptTag({content:read('note/preview.js')});
  await page.evaluate(()=>{
   const photo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="tomato"/></svg>');
   session={user:{id:'test-viewer'}};
   feed.hidden=true;detail.hidden=false;
   for(const own of [false,true]){
    const card={id:own?'own-card':'other-card',kind:'memo',body:'사진 보호 점검',tags:['응원'],background_key:'plain',is_mine:own};
    const item=cardElement(card,false,true);slot.append(item);
    applyCardPhoto(item.querySelector('.card-photo-thumb'),photo);
   }
  });
  const other=page.locator('[data-card-id="other-card"] .card-photo-thumb');
  const own=page.locator('[data-card-id="own-card"] .card-photo-thumb');
  const blocked=async(locator,event)=>locator.evaluate((el,name)=>!el.dispatchEvent(new Event(name,{bubbles:true,cancelable:true})),event);
  for(const event of ['contextmenu','dragstart']){
   assert.equal(await blocked(other.locator('img'),event),true);
   assert.equal(await blocked(own.locator('img'),event),false);
  }
  await other.click();
  const full=page.locator('.note-photo-lightbox img');
  assert.equal(await full.getAttribute('data-protect-photo'),'true');
  assert.equal(await blocked(full,'contextmenu'),true);
  await page.keyboard.press('Escape');
  await own.click();
  assert.equal(await full.getAttribute('data-protect-photo'),'false');
  assert.equal(await blocked(full,'contextmenu'),false);
  await page.keyboard.press('Escape');
  // Exercise the actual World photo renderers with two independent owners.
  const world=read('world.html');
  const diary=world.slice(world.indexOf('function Lg('),world.indexOf('function qg('));
  const viewer=world.slice(world.indexOf('function mediaCommentViewer('),world.indexOf('function Kb('));
  await page.evaluate(({diary,viewer})=>{
    window.w=s=>String(s);window.Et={photo:{src:'data:image/png;base64,',thumb:'data:image/png;base64,'}};
    window.worldOwner={isMe:false,album:[{id:'photo',type:'image',caption:'검사',comments:[]}]};
    window.Rt=()=>worldOwner;window.ct=html=>{document.getElementById('world-photo-test').innerHTML=html};window.Yn=()=>'';window.z=selector=>document.querySelector(selector);
    window.$={folders:[],tvMedia:null};window.D={online:false};
    const host=document.createElement('div');host.id='world-photo-test';document.body.append(host);
    window.eval(diary+viewer);host.innerHTML=Lg(worldOwner,'photo');
  },{diary,viewer});
  const worldImage=page.locator('#world-photo-test img');
  assert.equal(await blocked(worldImage,'contextmenu'),true);
  await page.evaluate(()=>{worldOwner.isMe=true;ct(Lg(worldOwner,'photo'))});
  assert.equal(await blocked(worldImage,'contextmenu'),false);
  await page.evaluate(()=>{worldOwner.isMe=false;nm('photo')});
  assert.equal(await blocked(worldImage,'contextmenu'),true);
  assert.equal(await worldImage.evaluate(el=>getComputedStyle(el).webkitUserDrag),'none');
  assert.deepEqual(errors,[]);
  console.log('PASS: other-member photo context menus and dragging blocked in Note thumbnails/lightbox and World diary/viewer; own photos, opening and keyboard close preserved');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
