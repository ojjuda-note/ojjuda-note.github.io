const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const parent=`<!doctype html><html><body style="overflow:auto"><button id="studio">제작실</button><button id="house">우리집</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js?v=20261003-house-camera2';import{openHouseTest}from'/house-test/host.js?v=20261003-house-camera2';const options={owner:'navigation-test',authorized:()=>true};document.querySelector('#studio').onclick=()=>openFurnitureStudio(options);document.querySelector('#house').onclick=()=>openHouseTest(options);</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),errors=[],missing=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:f});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('https://fixture.test/fixture');await page.locator('#studio').click();
  const studio=()=>page.frames().find(f=>f.url().includes('/anchor-editor/index.html'));
  const house=()=>page.frames().find(f=>/house-test\/index.html/.test(f.url()));
  await page.frameLocator('iframe').locator('#studio-editor').waitFor({state:'visible'});
  const original=studio();await original.locator('#studio-side-table').click();await original.waitForFunction(()=>!document.querySelector('#studio-apply').disabled);
  await original.evaluate(async()=>{
   await(await import('./app.js?v=20261003-house-fix1')).studioFlush();
   window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Simulated full disk','QuotaExceededError');};
   const input=document.querySelector('#furniture-name');input.value='아직 저장하지 못한 최신 작업';input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  // Returning through the house menu must keep this live editor, even if its
  // latest edits cannot be recovered from IndexedDB.
  for(let i=0;i<2;i++){
   await original.locator('#studio-home').click();await page.frameLocator('iframe[title="새 우리집 플레이 테스트"]').locator('#app').waitFor({state:'visible'});
   await house().locator('button[data-category="settings"]').click();await house().getByRole('button',{name:'가구 제작실',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('iframe').length===1);
   assert.equal(studio(),original,'house must return to the existing studio frame');
   assert.equal(await original.locator('#furniture-name').inputValue(),'아직 저장하지 못한 최신 작업');
   assert.equal(await page.evaluate(()=>document.body.style.overflow),'hidden');
  }
  await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();await page.locator('[role="dialog"] > div > span').filter({hasText:'저장 공간이 부족'}).waitFor();
  assert.equal(await page.locator('iframe').count(),1,'failed save must still keep the original studio open');
  await original.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});
  await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);
  assert.equal(await page.evaluate(()=>document.body.style.overflow),'auto');
  // A house opened directly still creates a studio and closes its own overlay.
  await page.locator('#house').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});
  await house().locator('button[data-category="settings"]').click();await house().getByRole('button',{name:'가구 제작실',exact:true}).click();
  await page.frameLocator('iframe[title="관리자 가구 제작실"]').locator('#studio-editor').waitFor({state:'visible'});
  assert.equal(await page.locator('iframe').count(),1);assert.equal(house(),undefined);
  // The editor becomes visible before its IndexedDB recovery read completes.
  await studio().locator('#draft-resume').waitFor({state:'visible'});
  await studio().locator('#draft-resume').click();
  await studio().waitForFunction(()=>document.querySelector('#furniture-name').value==='아직 저장하지 못한 최신 작업');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('HOUSE STUDIO NAVIGATION PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
