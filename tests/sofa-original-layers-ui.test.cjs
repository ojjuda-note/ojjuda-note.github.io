// Candidate data is reviewed in the actual house UI without changing the live
// manifest, a member's storage, or the existing studio/account access gates.
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),output=path.resolve(process.env.QA_OUTPUT_DIR||path.join(root,'..','sofa-reference'));
const owner='original-sofa-review',version='20261006-vine1';
(async()=>{
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1200,height:1080},deviceScaleFactor:2}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.clock.install({time:new Date('2026-10-06T12:00:00+09:00')});
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();
   if(url.pathname==='/review')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">열기</button><script type="module">import {openHouseTest} from '/house-test/host.js';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   if(url.pathname==='/house-test/item-assets.json'){
    const manifest=JSON.parse(fs.readFileSync(path.join(root,url.pathname))),file='sofa-registration-v10.runtime.json',bytes=fs.readFileSync(path.join(root,'house-test/assets',file));
    manifest.assets.sofa={...manifest.assets.sofa,file,revision:crypto.createHash('sha256').update(bytes).digest('hex').slice(0,16)};
    return route.fulfill({json:manifest});
   }
   const file=path.resolve(root,'.'+url.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile()?route.fulfill({path:file}):route.abort();
  });
  await page.goto('https://fixture.test/review');let home;
  const ready=async()=>{await home.locator('#app').waitFor({state:'visible'});await home.locator('body').evaluate(async()=>{await Promise.all([...document.querySelectorAll('.room-bg')].map(im=>im.decode()));await new Promise(resolve=>{const check=()=>document.querySelector('.furniture[data-render-state="loading"]')?requestAnimationFrame(check):resolve();check();});});assert.equal(await home.locator('.furniture[data-render-state="error"]').count(),0);};
  const open=async()=>{await page.locator('#open').click();home=page.frameLocator('iframe[title="우리집"]');await ready();await home.locator('[data-tab="room"]').click();};
  const close=async()=>{await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await page.locator('iframe').waitFor({state:'detached'});};
  const sofa=()=>home.locator('[data-furniture="sofa"]');
  const pose=()=>sofa().evaluate(n=>({x:+n.dataset.x,y:+n.dataset.y,direction:n.dataset.direction}));
  const slide=async(id,n)=>{await home.locator(id).evaluate((el,value)=>{el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));},String(n));await ready();};
  await open();await home.locator('[data-category="furniture"]').click();await home.getByRole('button',{name:'소파 놓기',exact:true}).click();await ready();
  // Wait for approved artwork after the catalog placeholder becomes ready.
 await sofa().locator('canvas[data-layers]').waitFor({state:'attached'});
 assert.equal(await sofa().locator('canvas').getAttribute('data-layers'),'right-arm body left-arm');
  assert((await sofa().locator('canvas').getAttribute('data-sources')).includes('sofa-original-layers-v1/side.png'));
  await home.locator('#placement-done').click();await ready();
  await home.locator('.room[data-room="0:0"]').screenshot({path:path.join(output,'sofa-original-room.png')});
  await home.getByRole('button',{name:'소파 배치',exact:true}).click();await slide('#bookshelf-gap',.5);await slide('#bookshelf-depth',2.5);await home.locator('#placement-done').click();const saved=await pose();
  await close();await open();assert.deepEqual(await pose(),saved,'moving and reopening keeps the placement');
  await home.locator('[data-category="furniture"]').click();await home.getByRole('button',{name:'소파 배치',exact:true}).click();await slide('#bookshelf-gap',1);await home.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await pose(),saved,'cancel keeps the saved pose');
  const conflict=await home.locator('body').evaluate(async version=>{const {canPlaceFurniture}=await import('./model.js?v='+version);return canPlaceFurniture('sofa',{x:0,y:3,direction:'left'},[{id:'bookshelf',x:0,y:3,direction:'left'}]);},version);assert.equal(conflict,false);
  assert.deepEqual(errors,[]);console.log('Original sofa UI PASS: real renderer, original layers, move, install, cancel, reopen and furniture collision.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
