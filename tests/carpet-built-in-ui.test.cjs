const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.CARPET_PROOF_DIR||path.resolve(root,'../carpet-deploy-proof');
const proofFont=process.env.CARPET_PROOF_FONT;
const parent=`<!doctype html><html><body><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=20261006-sofaparts1';document.querySelector('#open').onclick=()=>openHouseTest({owner:'carpet-built-in',authorized:()=>true});</script></body></html>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});
  const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(proofFont&&u.pathname==='/_proof-font/NotoSansCJKkr-Regular.otf')return route.fulfill({contentType:'font/otf',path:proofFont});if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const f=path.join(root,u.pathname);if(!f.startsWith(root+'/')||!fs.existsSync(f)||!fs.statSync(f).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:f});});
  if(proofFont)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='@font-face{font-family:CarpetProof;src:url("/_proof-font/NotoSansCJKkr-Regular.otf") format("opentype");font-display:block}html,body,button,input,textarea{font-family:CarpetProof,sans-serif!important}';document.head.append(style);},{once:true}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('https://fixture.test/fixture');
  const key='ojjuda-house-playtest-v1:carpet-built-in';
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{
   desk:{direction:'right',x:9,y:3.5},'coffee-table':{direction:'center',x:2,y:4},'blanket-floor':{direction:'center',x:2,y:0,elevation:0,mode:'floor'}
  }}],diary:'카펫 추가 전 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const readSave=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe').locator('#app').waitFor({state:'visible'});const f=page.frames().find(f=>f.url().includes('/house-test/index.html'));if(proofFont){await page.evaluate(()=>document.fonts.ready);await f.evaluate(()=>document.fonts.ready);}await f.locator('[data-tab="room"]').click();return f;};
  const close=async f=>{await f.locator('#exit').click();await page.waitForFunction(()=>!document.querySelector('iframe'));};
  const range=(f,id,value)=>f.locator(id).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  const pose=f=>f.locator('[data-furniture="carpet"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)}));
  let f=await open();
  assert.equal(await f.locator('[data-furniture="carpet"]').count(),0,'new carpet must not auto-place in an existing room');
  assert.deepEqual(await readSave(),saved,'opening the room must preserve its existing save');
  await f.locator('[data-furniture="coffee-table"][data-render-state="ready"]').waitFor();
  await f.locator('[data-furniture="blanket-floor"][data-render-state="ready"]').waitFor();
  assert.equal(await f.getByRole('button',{name:'카펫 놓기',exact:true}).count(),0,'floor item belongs in the accessories menu');
  await f.getByRole('button',{name:'소품',exact:true}).click();
  await f.getByRole('button',{name:'카펫 놓기',exact:true}).click();
  assert.deepEqual(await pose(f),{direction:'center',x:1,y:3});
  for(const direction of ['left','right','center']){
   await f.locator(`button[data-direction="${direction}"]:not(.furniture)`).click();
   await f.locator(`[data-furniture="carpet"][data-direction="${direction}"][data-render-state="ready"]`).waitFor();
   const image=await f.locator('[data-furniture="carpet"] canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height,visible:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data.some((v,i)=>i%4===3&&v>0)}));
   assert(image.width>0&&image.height>0&&image.visible,`${direction} carpet must draw actual pixels`);
   const geometry=await f.locator('[data-furniture="carpet"]').evaluate(async el=>{const {furnitureGeometry}=await import('/house-test/furniture.js?v=20261006-sofaparts1');const g=furnitureGeometry('carpet',{direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)});return {anchors:g.anchors,footprint:g.footprint};});
   assert.equal(geometry.anchors.length,4);assert.deepEqual(geometry.anchors,geometry.footprint,`${direction} carpet handles must mark the floor footprint rather than transparent image padding`);
  }
  await range(f,'#bookshelf-gap',1);await range(f,'#bookshelf-depth',0);
  assert(await f.locator('#placement-done').isDisabled(),'overlapping the existing floor blanket must block saving');
  assert(await f.locator('#placement-warning').isVisible());
  await range(f,'#bookshelf-depth',3);
  assert(await f.locator('#placement-done').isEnabled(),'carpet may overlap the standing coffee table');
  assert.equal(await f.locator('#placement-warning').isVisible(),false);
  await f.locator('#overview').click();
  await page.screenshot({path:path.join(proof,'carpet-placement-desktop.png')});
  await f.getByRole('button',{name:'취소',exact:true}).click();
  assert.equal(await f.locator('[data-furniture="carpet"]').count(),0);
  assert.deepEqual(await readSave(),saved,'cancel must not alter the existing room');
  await f.getByRole('button',{name:'카펫 놓기',exact:true}).click();await f.locator('#placement-done').click();
  const withCarpet=structuredClone(saved);withCarpet.rooms[0].furniture.carpet={direction:'center',x:1,y:3};
  assert.deepEqual(await readSave(),withCarpet,'only the explicit carpet placement is added');
  await f.locator('#overview').click();
  await f.waitForFunction(()=>getComputedStyle(document.querySelector('#notice')).opacity==='0');
  await page.screenshot({path:path.join(proof,'carpet-built-in-desktop.png')});
  await close(f);f=await open();
  await f.locator('[data-furniture="carpet"][data-render-state="ready"]').waitFor();
  assert.deepEqual(await pose(f),{direction:'center',x:1,y:3});assert.deepEqual(await readSave(),withCarpet);
  await page.setViewportSize({width:390,height:844});
  await f.waitForFunction(()=>innerWidth===390&&document.documentElement.scrollWidth<=innerWidth);
  await f.locator('#overview').click();
  const visible=await f.locator('[data-furniture="carpet"]').evaluate(el=>{const a=el.getBoundingClientRect(),b=document.querySelector('#viewport').getBoundingClientRect();return a.width>0&&a.height>0&&a.right>b.left&&a.left<b.right&&a.bottom>b.top&&a.top<b.bottom;});
  assert(visible,'the overview shows the carpet in the small mobile viewport');
  await page.screenshot({path:path.join(proof,'carpet-built-in-mobile.png')});
  await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'카펫 배치',exact:true}).click();
  await f.getByRole('button',{name:'회수',exact:true}).click();assert.deepEqual(await readSave(),saved,'removal preserves all original furniture and diary');
  await close(f);f=await open();assert.equal(await f.locator('[data-furniture="carpet"]').count(),0,'removed carpet must not return after reopening');
  assert.deepEqual(await readSave(),saved);assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  console.log('CARPET BUILT-IN PASS: accessories, three views, floor/standing overlap, cancel, save/reopen, removal, mobile and existing room preservation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
