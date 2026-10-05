const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const customModule='/house-test/'+fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/from '\.\/(custom-furniture\.js[^']*)'/)[1];
const fixture=`<!doctype html><button id="open">우리집 열기</button><script type="module">import{openHouseTest}from'/house-test/host.js';window.houseOwner='loading-startup-race';document.querySelector('#open').onclick=()=>{const owner=houseOwner;openHouseTest({owner,authorized:()=>owner===houseOwner});};</script>`;
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const waitForRequest=async promise=>{let timer;try{await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Expected runtime request was not made')),15000))]);}finally{clearTimeout(timer);}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}}),requests=[],errors=[],blocks=new Map();let failTable=false;
  const blockNext=file=>{const seen=deferred(),release=deferred();blocks.set(file,{seen,release});return {seen:seen.promise,release:release.resolve};};
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   const name=path.basename(url.pathname);if(name.endsWith('.runtime.json'))requests.push(name);
   const block=blocks.get(name);if(block){blocks.delete(name);block.seen.resolve();await block.release.promise;}
   if(failTable&&name==='coffee-table-v2.runtime.json')return route.fulfill({status:503,contentType:'text/plain',body:'Fixture runtime unavailable'});
   const file=path.resolve(root,'.'+url.pathname);
   return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto('https://fixture.test/fixture');
  const setSave=saved=>page.evaluate(saved=>localStorage.setItem('ojjuda-house-playtest-v1:'+houseOwner,JSON.stringify(saved)),saved);
  const readSave=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('ojjuda-house-playtest-v1:'+houseOwner)));
  const frame=()=>page.frames().find(f=>/\/house-test\/index\.html/.test(f.url()));
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe[title="우리집"]').locator('#app').waitFor({state:'visible'});return frame();};
  const close=async()=>{await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const baseline={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5},chair:{direction:'left',x:8.3,y:4.825,attachedTo:'desk'}}}],diary:'불러오기 전 기록'};
  await setSave(baseline);const startup=blockNext('chair-v1.runtime.json');await page.locator('#open').click();await waitForRequest(startup.seen);
  const latest=structuredClone(baseline);latest.diary='다른 창에서 방을 여는 동안 저장한 최신 기록';latest.rooms[0].furniture.carpet={direction:'center',x:1,y:3};
  await setSave(latest);startup.release();await page.frameLocator('iframe[title="우리집"]').locator('#app').waitFor({state:'visible'});let f=frame();
  await f.locator('[data-furniture="chair"][data-render-state="ready"]').waitFor();await f.locator('[data-furniture="carpet"][data-render-state="ready"]').waitFor();
  assert.equal(requests.filter(name=>name==='carpet-v1.runtime.json').length,1,'the newer snapshot loads its newly added carpet before normalization');
  assert.equal(requests.filter(name=>name==='chair-v1.runtime.json').length,1,'the retry reuses the already prepared chair');
  await f.locator('[data-tab="diary"]').click();assert.equal(await f.locator('#diary').inputValue(),latest.diary);assert.deepEqual(await readSave(),latest,'restoring a newer snapshot does not rewrite it');
  await close(f);assert.deepEqual(await readSave(),latest,'closing preserves the newer diary, added carpet and exact attached chair pose');

  // A delayed menu selection must not take control back after the user leaves it.
  // Clear public artwork so this scenario still exercises a pending network load.
  await page.evaluate(()=>caches.delete('ojjuda-house-built-in-art-v1'));
  await page.evaluate(()=>{houseOwner='loading-selection-race';});
  const empty={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{}}],diary:'메뉴 전환 중에도 유지할 기록'};await setSave(empty);f=await open();await f.locator('[data-tab="room"]').click();
  const selection=blockNext('chair-v1.runtime.json');await f.getByRole('button',{name:'의자 놓기',exact:true}).click();await waitForRequest(selection.seen);
  assert.equal(await f.getByRole('button',{name:'의자 놓기',exact:true}).isDisabled(),true,'a pending card cannot submit repeated selections');assert.equal(await f.getByRole('button',{name:'의자 놓기',exact:true}).getAttribute('aria-busy'),'true');
  await f.locator('[data-tab="diary"]').click();selection.release();
  await f.waitForFunction(async module=>(await import(module)).builtInItemReady('chair'),customModule);
  assert.equal(await f.locator('.record-tabs').isVisible(),true,'a late runtime response cannot reopen the abandoned placement');
  assert.equal(await f.locator('#placement-done').isVisible(),false);assert.equal(await f.locator('[data-furniture="chair"]').count(),0);assert.deepEqual(await readSave(),empty);
  await f.locator('[data-tab="room"]').click();assert.equal(await f.locator('#placement-done').isVisible(),false,'returning to the menu does not revive a cancelled request');

  // A failed on-demand request must clear its pending promise so a retry works.
  failTable=true;const tableRequests=()=>requests.filter(name=>name==='coffee-table-v2.runtime.json').length;
  await f.getByRole('button',{name:'거실 테이블 놓기',exact:true}).click();await f.locator('#notice').filter({hasText:'거실 테이블을 불러오지 못했어요'}).waitFor();
  assert.equal(await f.getByRole('button',{name:'거실 테이블 놓기',exact:true}).isEnabled(),true,'failure restores the card for retry');assert.equal(await f.getByRole('button',{name:'거실 테이블 놓기',exact:true}).getAttribute('aria-busy'),null);
  assert.equal(tableRequests(),2,'a failed response gets one automatic reload');assert.equal(await f.locator('#placement-done').isVisible(),false);assert.equal(await f.locator('[data-furniture="coffee-table"]').count(),0);assert.deepEqual(await readSave(),empty);
  failTable=false;await f.getByRole('button',{name:'거실 테이블 놓기',exact:true}).click();await f.locator('[data-furniture="coffee-table"][data-render-state="ready"]').waitFor();
  assert.equal(tableRequests(),3,'manual retry performs a fresh runtime request after the automatic reload failed');assert.equal(await f.locator('#placement-done').isEnabled(),true);assert.deepEqual(await readSave(),empty,'successful art loading alone does not save a placement');
  await f.getByRole('button',{name:'취소',exact:true}).click();await close(f);assert.deepEqual(await readSave(),empty);assert.deepEqual(errors,[]);
  console.log('HOUSE LOADING RACE PASS: latest snapshot and new runtime preserved; late selection cancelled; 503 retry succeeds without premature saves');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
