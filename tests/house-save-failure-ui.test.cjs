const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const parent=`<!doctype html><button id="open">우리집 열기</button><script type="module">import{openHouseTest}from'/house-test/host.js';document.querySelector('#open').onclick=()=>openHouseTest({owner:'save-failure',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const file=path.join(root,u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});return page.frames().find(f=>f.url().includes('/house-test/index.html'));};
  let f=await open();
  await f.locator('[data-tab="diary"]').click();await f.locator('#diary').fill('저장한 기록');await f.getByRole('button',{name:'기록 저장',exact:true}).click();await f.locator('[data-tab="room"]').click();
  const saved=()=>page.evaluate(()=>localStorage.getItem('ojjuda-house-playtest-v1:save-failure'));
  const baseline=await saved();assert.ok(baseline);
  await f.evaluate(()=>{window.originalSetItem=Storage.prototype.setItem;window.failStorage=true;Storage.prototype.setItem=function(key,value){if(window.failStorage&&key.startsWith('ojjuda-house-playtest-v1:'))throw new DOMException('quota','QuotaExceededError');return window.originalSetItem.call(this,key,value);};});
  await f.getByRole('button',{name:'책장 배치',exact:true}).click();
  await f.locator('#bookshelf-gap').evaluate(input=>{input.value='0.5';input.dispatchEvent(new Event('input',{bubbles:true}));});
  await f.locator('#placement-done').click();
  assert.equal(await f.locator('#placement-done').isVisible(),true,'failed placement must retain its draft for retry');
  assert.match(await f.locator('#notice').textContent(),/저장.*못/);assert.equal(await f.locator('#save-warning').isVisible(),true);assert.equal(await saved(),baseline);
  assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'8.5');
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'9','cancel restores committed placement after failed save');
  await f.getByRole('button',{name:'책장 배치',exact:true}).click();await f.getByRole('button',{name:'치우기',exact:true}).click();assert.equal(await f.locator('#placement-done').isVisible(),true);assert.equal(await f.locator('.bookshelf').count(),1);await f.getByRole('button',{name:'취소',exact:true}).click();
  await f.getByRole('button',{name:'방 설정',exact:true}).click();await f.getByRole('button',{name:'커튼 걷기',exact:true}).click();assert.equal(await f.locator('.curtains').count(),1);await f.getByRole('button',{name:'빈방 보기',exact:true}).click();assert.equal(await f.locator('.furniture').count(),2);
  await f.locator('#expand').click();await f.getByRole('button',{name:'오른쪽 → 확장',exact:true}).click();assert.equal(await f.locator('.room').count(),1);await f.locator('#expand').click();assert.equal(await saved(),baseline);
  await f.locator('[data-tab="diary"]').click();await f.locator('#diary').fill('복구할 새 기록');await f.getByRole('button',{name:'기록 저장',exact:true}).click();assert.match(await f.locator('#notice').textContent(),/저장할 수 없/);assert.equal(await f.locator('#diary').inputValue(),'복구할 새 기록');assert.equal(await saved(),baseline);
  await f.evaluate(()=>{window.failStorage=false;});await f.getByRole('button',{name:'기록 저장',exact:true}).click();assert.equal(await f.locator('#save-warning').isVisible(),false);assert.equal(JSON.parse(await saved()).diary,'복구할 새 기록');
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'가구',exact:true}).click();await f.getByRole('button',{name:'책장 배치',exact:true}).click();await f.locator('#bookshelf-gap').evaluate(input=>{input.value='0.5';input.dispatchEvent(new Event('input',{bubbles:true}));});await f.locator('#placement-done').click();assert.equal(await f.locator('#placement-done').count(),0);assert.equal(JSON.parse(await saved()).rooms[0].shelf.x,8.5);
  await f.locator('#exit').click();await page.waitForSelector('iframe',{state:'detached'});f=await open();assert.equal(await f.locator('.bookshelf').getAttribute('data-x'),'8.5');await f.locator('[data-tab="diary"]').click();assert.equal(await f.locator('#diary').inputValue(),'복구할 새 기록');assert.deepEqual(errors,[]);
  console.log('PASS: storage failure preserves placement draft and diary, rolls back room changes, and supports successful retry/reopen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
