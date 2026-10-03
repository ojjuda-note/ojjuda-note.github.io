const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const{chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.FLOOR_LAMP_PROOF_DIR||path.resolve(root,'../floor-lamp-deploy-proof');
const bytes=fs.readFileSync(path.join(root,'house-test/assets/floor-lamp-v1.runtime.json')),runtime=JSON.parse(bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'1913d26469adebeb36c93ca8be3ce8d05eb1a2df5209498f2ddb0c552fc073dc','deploy the approved studio runtime unchanged');
const owner='floor-lamp-built-in',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/index.html'),'utf8').match(/app\.js\?v=([^"']+)/)[1];
const fixture=`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),requests=[],errors=[],missing=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();requests.push(u.pathname);
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   if(u.pathname==='/_font.otf'&&process.env.FLOOR_LAMP_PROOF_FONT)return route.fulfill({contentType:'font/otf',path:process.env.FLOOR_LAMP_PROOF_FONT});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  if(process.env.FLOOR_LAMP_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:LampProof;src:url(/_font.otf)}body,button,input{font-family:LampProof,sans-serif!important}';document.head.append(s);}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-03T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture:{desk:{direction:'right',x:9,y:3.5},sofa:{direction:'left',x:0,y:3},'coffee-table':{direction:'left',x:2,y:4},carpet:{direction:'center',x:1,y:3}}}],diary:'스탠드 조명 추가 전 기록 유지'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();await page.frameLocator('iframe[title="우리집"]').locator('#app').waitFor({state:'visible'});const f=page.frames().find(f=>f.url().includes('/house-test/index.html'));await f.locator('[data-tab="room"]').click();return f;};
  const close=async f=>{await f.locator('#exit').click();await page.locator('iframe[title="우리집"]').waitFor({state:'detached'});};
  const ready=f=>f.locator('[data-furniture="floor-lamp"][data-render-state="ready"]').waitFor();
  const pose=f=>f.locator('[data-furniture="floor-lamp"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y)}));
  const count=()=>requests.filter(p=>p.endsWith('/floor-lamp-v1.runtime.json')).length;
  let f=await open();assert.equal(count(),0);assert.equal(await f.locator('[data-furniture="floor-lamp"]').count(),0);assert.deepEqual(await read(),saved);
  assert.equal(await f.getByRole('button',{name:'스탠드 조명 놓기',exact:true}).count(),1);
  await f.getByRole('button',{name:'소품',exact:true}).click();assert.equal(await f.getByRole('button',{name:'스탠드 조명 놓기',exact:true}).count(),0);
  await f.getByRole('button',{name:'가구',exact:true}).click();await f.getByRole('button',{name:'스탠드 조명 놓기',exact:true}).click();await ready(f);assert.equal(count(),1);
  const directions={};
  for(const d of['left','center','right']){
   await f.locator('#panel button[data-direction="'+d+'"]').click();await ready(f);const p=runtime.views[d].placement;
   assert.deepEqual(await pose(f),{direction:d,x:p.x,y:p.y});assert.equal(await f.locator('#placement-done').isEnabled(),true);assert.deepEqual(await read(),saved);
   directions[d]=await f.locator('[data-furniture="floor-lamp"] canvas').evaluate(c=>({width:c.width,height:c.height,painted:c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)}));assert(directions[d].painted);
  }
  const native=await f.evaluate(async({version,owner})=>{
   const{FURNITURE}=await import('/house-test/furniture-catalog.js?v='+version),{canPlaceFurniture}=await import('/house-test/model.js?v='+version),{listMadeItems}=await import('/house-test/custom-store.js?v='+version);
   return{dimensions:{width:FURNITURE['floor-lamp'].width,depth:FURNITURE['floor-lamp'].depth,height:FURNITURE['floor-lamp'].height},slots:(await listMadeItems(owner)).length,
    sofaBlocked:!canPlaceFurniture('floor-lamp',{direction:'left',x:0,y:3},[{id:'sofa',direction:'left',x:0,y:3}]),
    deskBlocked:!canPlaceFurniture('floor-lamp',{direction:'right',x:8.5,y:4},[{id:'desk',direction:'right',x:9,y:3.5}]),
    carpetAllowed:canPlaceFurniture('floor-lamp',{direction:'center',x:4,y:3.5},[{id:'carpet',direction:'center',x:1,y:3}])};
  },{version,owner});assert.deepEqual(native.dimensions,runtime.dimensions);assert.equal(native.slots,0);assert(native.sofaBlocked&&native.deskBlocked&&native.carpetAllowed);
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'스탠드 조명 놓기',exact:true}).click();await ready(f);assert.equal(count(),1,'reuse selected artwork');
  await f.locator('#panel button[data-direction="left"]').click();await f.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture['floor-lamp']={direction:'left',x:0,y:1.5};assert.deepEqual(await read(),installed);
  await f.locator('#overview').click();await f.evaluate(()=>document.fonts.ready);await f.waitForFunction(()=>getComputedStyle(document.querySelector('#notice')).opacity==='0');await page.screenshot({path:path.join(proof,'floor-lamp-desktop.png')});
  await close(f);f=await open();await ready(f);assert.deepEqual(await read(),installed);assert.deepEqual(await pose(f),installed.rooms[0].furniture['floor-lamp']);
  await f.getByRole('button',{name:'스탠드 조명 배치',exact:true}).click();await f.locator('#panel button[data-direction="center"]').click();await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  await page.setViewportSize({width:390,height:844});await f.getByRole('button',{name:'스탠드 조명 배치',exact:true}).click();await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:path.join(proof,'floor-lamp-mobile.png')});
  await f.locator('#placement-recall').click();assert.deepEqual(await read(),saved);await close(f);const before=count();f=await open();assert.equal(count(),before);assert.equal(await f.locator('[data-furniture="floor-lamp"]').count(),0);assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({approvedRuntimeUnchanged:true,menu:'furniture',onDemandOnly:true,notAutoPlaced:true,directions,native,saveReopenCancelRecall:true,existingRoomAndDiaryPreserved:true,mobileWidth:390,errors,missing},null,2));
  console.log('FLOOR LAMP PASS: approved runtime, lazy load, three views, collisions, save/reopen/cancel/recall and preserved existing room');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
