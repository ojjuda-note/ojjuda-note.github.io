const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.DESK_LAMP_PROOF_DIR||path.resolve(root,'../desk-lamp-proof');
const bytes=fs.readFileSync(path.join(root,'house-test/assets/desk-lamp-v1.runtime.json')),runtime=JSON.parse(bytes);
assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),'76514722592873261426fe1190dc7cef4a50892302c602c800205b2fe7a06b04');
const owner='desk-lamp-built-in-test',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/index.html'),'utf8').match(/app\.js\?v=([^"']+)/)[1];
const fixture=`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[],requests=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();requests.push(u.pathname);
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});
   if(u.pathname==='/_font.ttf'&&process.env.DESK_LAMP_PROOF_FONT)return route.fulfill({path:process.env.DESK_LAMP_PROOF_FONT,contentType:'font/ttf'});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  if(process.env.DESK_LAMP_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:Proof;src:url(/_font.ttf)}body,button,input{font-family:Proof,sans-serif!important}';document.head.append(s);}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-04T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5}}}],diary:'탁상 조명 이전 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await page.locator('#open').click();const f=page.frames().find(f=>f.url().includes('/house-test/index.html'))||await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();
  await f.locator('#app').waitFor({state:'visible'});await f.locator('[data-tab="room"]').click();
  const node=()=>f.locator('[data-furniture="desk-lamp"][data-render-state="ready"]');
  const ready=()=>node().waitFor();const count=()=>requests.filter(p=>p.endsWith('/desk-lamp-v1.runtime.json')).length;
  const pose=()=>node().evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation)}));
  assert.equal(count(),0);assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'탁상 조명 놓기',exact:true}).click();await ready();assert.equal(count(),1);
  assert.deepEqual(await pose(),{direction:'right',x:9.05,y:5.55,elevation:1.4});assert.equal(await f.locator('#bookshelf-gap-value').textContent(),'0.05칸');
  for(const d of ['left','center','right']){
   await f.locator('#panel button[data-direction="'+d+'"]').click();await ready();const p=runtime.views[d].placement;
   assert.deepEqual(await pose(),{direction:d,x:p.x,y:p.y,elevation:1.4});assert(await f.locator('#placement-done').isEnabled());assert.deepEqual(await read(),saved);
   assert(await node().locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  }
  const behavior=await f.evaluate(async({version,owner})=>{
   const {findPlacement,canPlaceFurniture}=await import('/house-test/model.js?v='+version),{listMadeItems}=await import('/house-test/custom-store.js?v='+version);
   const p={direction:'right',x:9,y:3.5,elevation:1.4};
   return {slots:(await listMadeItems(owner)).length,deskAllowed:canPlaceFurniture('desk-lamp',p,[{id:'desk',direction:'right',x:9,y:3.5}]),
    overlapBlocked:!canPlaceFurniture('desk-lamp',p,[{id:'desk-lamp',...p}]),fallback:findPlacement('desk-lamp',[{id:'desk-lamp',...p}])};
  },{version,owner});assert.equal(behavior.slots,0);assert(behavior.deskAllowed&&behavior.overlapBlocked);assert.equal(behavior.fallback.elevation,1.4);
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'탁상 조명 놓기',exact:true}).click();await ready();assert.equal(count(),1);await f.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture['desk-lamp']={direction:'right',x:9.05,y:5.55,elevation:1.4};assert.deepEqual(await read(),installed);
  await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'desk-lamp-desktop.png')});
  await f.evaluate(()=>location.reload());await f.locator('#app').waitFor({state:'visible'});await ready();assert.deepEqual(await read(),installed);assert.equal((await pose()).elevation,1.4);
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'탁상 조명 배치',exact:true}).click();
  await f.locator('#accessory-height').evaluate(el=>{el.value='0';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);assert.equal((await pose()).elevation,1.4);
  await page.setViewportSize({width:390,height:844});await f.getByRole('button',{name:'탁상 조명 배치',exact:true}).click();await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await page.screenshot({path:path.join(proof,'desk-lamp-mobile.png')});
  await f.locator('#placement-recall').click();assert.deepEqual(await read(),saved);await f.evaluate(()=>location.reload());await f.locator('#app').waitFor({state:'visible'});assert.equal(await node().count(),0);assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
  fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({nativeRuntimeUnchanged:true,onDemandOnly:true,threeDirections:true,height:1.4,behavior,saveReopenCancelRecall:true,existingRoomPreserved:true,mobileWidth:390,errors,missing},null,2));
  console.log('DESK LAMP PASS: native runtime, lazy load, three views, height, collision, fallback, save/reopen/cancel/recall, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
