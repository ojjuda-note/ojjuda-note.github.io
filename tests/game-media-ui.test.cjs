const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[],photos=[];
  page.on('pageerror',e=>errors.push(e.message));
  let failPhoto=true;
  await page.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/host')return route.fulfill({contentType:'text/html',body:`<!doctype html><script>
    window.OjjudaPhotoTtangAccess={allowed:()=>true,subscribe:()=>()=>{},check:async()=>true};
    </script><iframe src="/games/photo-ttang.html" style="width:100%;height:800px"></iframe>`});
   if(u.pathname.startsWith('/assets/game-media/photo-')){
    photos.push(u.pathname);
    if(failPhoto&&u.pathname.includes('-preview-'))return route.abort();
   }
   const file=path.join(root,u.pathname);
   return fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.fulfill({status:404,body:''});
  });
  await page.goto('https://fixture.test/host');
  const frame=page.frames().find(f=>f.url().includes('/games/photo-ttang.html'));
  await frame.locator('#photoStart').waitFor();
  await frame.waitForFunction(()=>!!window.OjjudaPhotoHelp);
  assert.deepEqual(photos,[],'opening the menu does not download all photos');
  await frame.locator('#photoStart').click();
  await frame.getByRole('button',{name:'다시 불러오기',exact:true}).waitFor();
  assert.equal(await frame.evaluate(()=>world.time),0,'failed image does not consume playing time');
  assert.equal(await frame.locator('.photo-help').count(),0,'loading errors never offer paid help');
  assert.equal(await frame.getByRole('button',{name:'ZU로 도움받기',exact:true}).isDisabled(),true);
  await frame.evaluate(()=>OjjudaPhotoHelp.open());
  assert.equal(await frame.locator('#retryPhoto').isVisible(),true,'help cannot dismiss image recovery');
  assert.equal(new Set(photos).size,2,'only the selected stage preview and full photo are requested');
  failPhoto=false;
  await frame.getByRole('button',{name:'다시 불러오기',exact:true}).click();
  await frame.waitForFunction(()=>photoImg.complete&&photoImg.naturalWidth===600&&fullImg.naturalWidth>0);
  await frame.evaluate(()=>{startWait=0;me.speed=0;mobs=[];});
  await frame.waitForFunction(()=>world.time>0);
  assert.equal(await frame.evaluate(()=>paused),false,'retry resumes the same round');
  assert.deepEqual(errors,[]);
  await page.goto('https://fixture.test/games/ojjuda-tour/index.html');
  await page.getByRole('button',{name:'게임 시작하기',exact:true}).waitFor();
  const fonts=await page.evaluate(async()=>{
   await document.fonts.load('20px Jua','오쭈다 마블');
   await document.fonts.load('20px "Black Han Sans"','오쭈다 마블');
   return [...document.fonts].map(f=>({family:f.family,status:f.status}));
  });
  assert.ok(fonts.some(f=>f.family.replaceAll('"','')==='Jua'&&f.status==='loaded'));
  assert.ok(fonts.some(f=>f.family.replaceAll('"','')==='Black Han Sans'&&f.status==='loaded'));
  assert.equal(await page.evaluate(()=>THREE.REVISION),'128','extracted renderer loads');
  assert.deepEqual(errors,[]);
  console.log('PASS: photo lazy requests, failed-image recovery, preserved image dimensions, complete WOFF2 fonts and renderer');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
