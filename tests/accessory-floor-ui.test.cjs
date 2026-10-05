const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.ACCESSORY_FLOOR_PROOF_DIR||path.resolve(root,'../accessory-floor-proof');
const owner='accessory-floor-test',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/index.html'),'utf8').match(/app\.js\?v=([^"']+)/)[1];
const labels={'cream-floral-cushion':'크림 꽃무늬 쿠션','sage-cushion':'세이지 쿠션','peach-cushion':'피치 쿠션','pink-check-cushion':'분홍 체크 쿠션','clover-mug':'클로버 머그컵'};
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   if(u.pathname==='/_font.ttf'&&process.env.ACCESSORY_FLOOR_PROOF_FONT)return route.fulfill({path:process.env.ACCESSORY_FLOOR_PROOF_FONT,contentType:'font/ttf'});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();return route.fulfill({path:file});
  });
  if(process.env.ACCESSORY_FLOOR_PROOF_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:Proof;src:url(/_font.ttf)}body,button,input{font-family:Proof,sans-serif!important}';document.head.append(s);}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-05T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{sofa:{direction:'left',x:0,y:2},'coffee-table':{direction:'left',x:2.5,y:4},'clover-mug':{direction:'left',x:2.9,y:4.6,elevation:.6},...Object.fromEntries(Object.keys(labels).filter(id=>id.endsWith('cushion')).map((id,i)=>[id,{direction:'center',x:4+i*1.2,y:4.5,elevation:.81}]))}}],diary:'바닥 배치 후에도 보존할 기록'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  await page.locator('#open').click();const f=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();
  const ready=()=>f.waitForFunction(()=>[...document.querySelectorAll('.furniture')].every(n=>n.dataset.renderState==='ready'));
  await f.locator('#app').waitFor({state:'visible'});await ready();await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();
  const edit=async id=>{await f.getByRole('button',{name:labels[id]+' 배치',exact:true}).click();await ready();};
  const pose=id=>f.locator('[data-furniture="'+id+'"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation)}));
  for(const id of Object.keys(labels)){
   const before=await read();await edit(id);await f.getByRole('button',{name:'바닥에 놓기',exact:true}).click();await ready();assert.equal((await pose(id)).elevation,0);assert.equal(await f.locator('#accessory-floor').getAttribute('aria-pressed'),'true');assert(await f.locator('#placement-done').isEnabled());assert.deepEqual(await read(),before);
   if(id==='cream-floral-cushion'){await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),before);assert.equal((await pose(id)).elevation,.81);await edit(id);await f.locator('#accessory-floor').click();}
   if(id==='clover-mug'){const p=await pose(id);assert(p.x>=4||p.x+.5<=2.5||p.y>=6||p.y+.5<=4,'floor button finds space outside the table');}
   await f.locator('#placement-done').click();assert.equal((await read()).rooms[0].furniture[id].mode,'floor');
  }
  const installed=await read();await f.evaluate(()=>location.reload());await f.locator('#app').waitFor({state:'visible'});await ready();assert.deepEqual(await read(),installed);
  const geometry=await f.evaluate(async version=>{
   const {furnitureGeometry}=await import('/house-test/furniture.js?v='+version),{normalizePlacement,canPlaceFurniture,findFloorPlacement,canUseFloor}=await import('/house-test/model.js?v='+version),{resolveAccessoryDrag}=await import('/house-test/sofa-accessory-placement.js?v='+version);
   const floor={direction:'center',x:4,y:4.5,elevation:0,mode:'floor'},results=[];
   for(const id of ['cream-floral-cushion','sage-cushion','peach-cushion','pink-check-cushion'])for(const direction of ['left','center','right']){
    const down=furnitureGeometry(id,{...floor,direction}),up=furnitureGeometry(id,{...floor,direction,elevation:.81});results.push({id,direction,flat:down.height<up.height*.65,finite:down.art.layers[0].triangles.every(t=>t.target.every(p=>Number.isFinite(p.x+p.y))),imageKept:down.art.layers[0].image===up.art.layers[0].image});
   }
   const sofa={id:'sofa',direction:'center',x:3,y:3},held=resolveAccessoryDrag('sage-cushion',{...floor,x:3.5,y:3.5},sofa);
   return {results,held,free:normalizePlacement('sage-cushion',{...floor,elevation:1}),blocked:!canPlaceFurniture('sage-cushion',{...floor,x:3.5,y:3.5},[sofa]),floor:findFloorPlacement('sage-cushion',[sofa],{...floor,x:3.5,y:3.5}),wallExcluded:!canUseFloor('botanical-frame')};
  },version);
  assert(geometry.results.every(r=>r.flat&&r.finite&&r.imageKept));assert.equal(geometry.held.elevation,0);assert.equal(geometry.free.mode,undefined);assert(geometry.blocked&&geometry.floor&&geometry.wallExcluded);
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.locator('#overview').click();await f.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(proof,'accessory-floor-room.png')});
  await edit('sage-cushion');await page.setViewportSize({width:390,height:844});await f.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);await f.locator('#accessory-floor').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(proof,'accessory-floor-mobile.png')});
  await f.locator('#accessory-height').evaluate(el=>{el.value='1';el.dispatchEvent(new Event('input',{bubbles:true}));});await ready();assert.equal(await f.locator('#accessory-floor').getAttribute('aria-pressed'),'false');await f.locator('#placement-done').click();assert.equal((await read()).rooms[0].furniture['sage-cushion'].mode,undefined);assert.equal((await read()).rooms[0].furniture['sage-cushion'].elevation,1);
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({floorSaveCancelReload:true,mugClearsTable:true,geometry,mobile390:true,raiseAgain:true,errors},null,2));console.log('ACCESSORY FLOOR PASS: clear floor placement, four cushions/three views, original images, save/cancel/reload, raise again, mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
