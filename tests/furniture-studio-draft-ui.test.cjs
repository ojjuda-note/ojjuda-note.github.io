const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const parent=`<!doctype html><html><body><button id="open">제작실</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js?v=20261003-houseopen2';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'draft-test',authorized:()=>true});</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext(),errors=[],missing=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:f});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('https://fixture.test/fixture');
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#studio-editor').waitFor({state:'visible'});return page.frames().find(f=>f.url().includes('/anchor-editor/'));};
  let frame=await open();await frame.locator('#studio-side-table').click();await frame.waitForFunction(()=>!document.querySelector('#studio-apply').disabled);
  await frame.locator('#furniture-name').evaluate(el=>{el.value='저장된 이름';el.dispatchEvent(new Event('change',{bubbles:true}));});
  await frame.waitForFunction(()=>document.querySelector('#draft-status').textContent.includes('자동 임시저장됨'));
  await page.evaluate(()=>{const doc=document.querySelector('iframe').contentDocument,el=doc.querySelector('#furniture-name');el.value='닫기 직전 변경';el.dispatchEvent(new Event('change',{bubbles:true}));[...document.querySelectorAll('button')].find(b=>b.textContent==='제작실 닫기').click();});
  await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);
  frame=await open();
  const saved=await frame.evaluate(async()=>{const {loadDraft}=await import('./draft-store.js?v=20261003-houseopen2');return (await loadDraft()).project.name;});
  assert.equal(saved,'닫기 직전 변경');console.log('PASS last edit survives immediate close');
  await frame.locator('#draft-resume').click();await frame.waitForFunction(()=>document.querySelector('#furniture-name').value==='닫기 직전 변경');
  await frame.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Simulated full disk','QuotaExceededError');};});
  await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();
  await page.locator('[role="dialog"] > div > span').filter({hasText:'저장 공간이 부족'}).waitFor();
  assert.equal(await page.locator('iframe').count(),1);assert.equal(await frame.locator('#furniture-name').inputValue(),'닫기 직전 변경');
  assert.equal(await frame.locator('#studio-editor').evaluate(el=>el.inert),false);
  await frame.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});
  await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('iframe').length===0);
  console.log('PASS failed save keeps editor open and retry succeeds');
  frame=await open();await frame.locator('#library-object').selectOption('blanket-bed');await frame.locator('#library-load').click();
  await frame.waitForFunction(()=>document.querySelector('#set-summary').textContent.includes('원본 그림 3/3'));
  const imageSources=await frame.evaluate(async()=>{const {loadDraft}=await import('./draft-store.js?v=20261003-houseopen2');await new Promise(r=>setTimeout(r,1500));const p=(await loadDraft()).project;return Object.values(p.views).map(v=>({data:v.source.data.slice(0,23),width:v.source.width,height:v.source.height}));});
  assert(imageSources.every(v=>v.data.startsWith('data:image/webp;base64,')&&v.width===1536&&v.height===1024));
  console.log('PASS optimized blanket sources load and autosave');
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);console.log('STUDIO DRAFT PASS');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
