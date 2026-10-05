const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const token='20261005-itemcatalog2',id='item-catalog-test-table',owner='catalog-test',key='ojjuda-house-playtest-v1:'+owner;
const baseline=JSON.parse(fs.readFileSync(path.join(root,'house-test/item-assets.json')));
const table={...baseline.assets['coffee-table'],catalog:{label:'목록 등록 테이블',shortLabel:'목록 테이블',width:2,depth:1.5,height:.6,layer:'standing',preview:'assets/coffee-table-center-preview-v2.png',order:1}};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  let add=false,hidden=false,requests=0;const errors=[],context=await browser.newContext({viewport:{width:1100,height:900}});
  await context.route('**/*',async route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${token}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   if(u.pathname.endsWith('/item-assets.json')){await new Promise(resolve=>setTimeout(resolve,150));return route.fulfill({json:{...baseline,assets:{...baseline.assets,...(add?{[id]:{...table,catalog:{...table.catalog,hidden}}}:{})}}});}
   if(u.pathname.endsWith('.runtime.json')){requests++;}
   const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{}}],diary:'보존할 기록'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  let frame;const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));if(!frame){await page.frameLocator('iframe').locator('#locked').waitFor();frame=page.frames().find(f=>f.url().includes('/house-test/index.html'));}await frame.locator('#app').waitFor({state:'visible',timeout:10000}).catch(async e=>{console.error({errors,locked:await frame.locator('#locked').innerText()});throw e;});await frame.locator('[data-tab="room"]').click();};
  const close=async()=>{await frame.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  await open();assert.equal(await frame.getByRole('button',{name:'목록 테이블 놓기',exact:true}).count(),0);await close();
  add=true;await open();assert.equal(await frame.getByRole('button',{name:'목록 테이블 놓기',exact:true}).count(),1,'JSON-only addition appears with unchanged app URLs');assert.equal(requests,0,'catalog does not eagerly download runtime artwork');assert.deepEqual(await read(),saved,'new item does not auto-place or change saved rooms');
  await frame.getByRole('button',{name:'목록 테이블 놓기',exact:true}).click();await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();assert.equal(requests,1);
  for(const direction of ['left','center','right']){await frame.locator('button[data-direction="'+direction+'"]:not(.furniture)').click();await frame.locator('[data-furniture="'+id+'"][data-direction="'+direction+'"][data-render-state="ready"]').waitFor();}
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await frame.getByRole('button',{name:'목록 테이블 놓기',exact:true}).click();await frame.locator('#placement-done').click();const placed=await read();assert(placed.rooms[0].furniture[id]);assert.equal(placed.diary,saved.diary);
  await close();await open();await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();assert.deepEqual(await read(),placed,'placement survives reopening');assert.equal(requests,1,'reopening reuses the same validated artwork');
  const collision=await frame.evaluate(async({id,token})=>{const {canPlaceFurniture,normalize}=await import('/house-test/model.js?v='+token);const p={direction:'left',x:2,y:4};let protectedInvalid=false;try{normalize({version:13,rooms:[{x:0,y:0,shelf:null,furniture:{[id]:{...p,x:999}}}]});}catch{protectedInvalid=true;}return {protectedInvalid,free:canPlaceFurniture(id,p,[]),overlap:canPlaceFurniture(id,p,[{id:'sofa',direction:'left',x:2,y:4}])};},{id,token});assert.deepEqual(collision,{protectedInvalid:true,free:true,overlap:false});
  if(process.env.ITEM_CATALOG_PROOF){await page.screenshot({path:process.env.ITEM_CATALOG_PROOF});}
  await close();hidden=true;await open();assert.equal(await frame.getByRole('button',{name:'목록 테이블 배치',exact:true}).count(),0);await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();assert.deepEqual(await read(),placed,'hidden catalog item retains its saved placement');await close();
  // A valid newer list that accidentally omits a saved item must not normalize
  // that item away or overwrite the room. This also covers first-device misses.
  add=false;await page.locator('#open').click();await page.frameLocator('iframe').locator('#locked p').filter({hasText:'기존 배치는 보존됩니다'}).waitFor();assert.deepEqual(await read(),placed,'missing public definition never erases saved data');
  assert.deepEqual(errors,[]);console.log('ITEM CATALOG PASS: JSON-only addition, lazy fetch, three directions, cancel/save/reopen, collision, hidden item and missing-definition preservation');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
