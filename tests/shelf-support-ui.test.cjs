const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const output=process.env.SHELF_SUPPORT_PROOF_DIR||'/tmp/shelf-support-proof';
const plantId='item-shelf-plant',shelfId='item-oak-wall-shelf';
const app=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8');
const modelVersion=app.match(/model\.js\?v=([^'" ]+)/)[1];
const shelfVersion=app.match(/shelf-placement\.js\?v=([^'" ]+)/)[1];
const cases=[
 {direction:'left',shelf:{direction:'left',x:0,y:3.5,elevation:2.75},plant:{direction:'left',x:.02,y:3.8,elevation:2.87}},
 {direction:'center',shelf:{direction:'center',x:0,y:0,elevation:2.6},plant:{direction:'center',x:.62,y:.02,elevation:2.72}},
 {direction:'right',shelf:{direction:'right',x:9.6,y:3.5,elevation:2.75},plant:{direction:'right',x:9.62,y:4.34,elevation:2.87}}
];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const errors=[],missing=[];
 try{
 for(const {direction,shelf,plant}of cases)for(const first of [shelfId,plantId]){
  const owner='shelf-support-'+direction+'-'+first,key='ojjuda-house-playtest-v1:'+owner;
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-09T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5},[first]:first===shelfId?shelf:plant}}],diary:'기존 방과 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  let frame;
  const open=async()=>{await page.locator('#open').click();frame=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();try{await frame.locator('#app').waitFor({state:'visible'});}catch(error){console.error({direction,first,locked:await frame.locator('#locked').innerText(),errors,missing});throw error;}await frame.locator('[data-tab="room"]').click();await frame.getByRole('button',{name:'소품',exact:true}).click();};
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const ready=id=>frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();
  const pose=id=>frame.locator('[data-furniture="'+id+'"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation)}));
  const id=first===shelfId?plantId:shelfId,label=id===plantId?'덩굴 화분':'벽선반';
  await open();await frame.getByRole('button',{name:label+' 놓기',exact:true}).click();await ready(id);
  const expected=await pose(id);
  assert.equal(expected.direction,direction,'new item uses the existing partner wall');
  assert.equal(expected.elevation,id===plantId?plant.elevation:shelf.elevation,'new item fits the changed support height');
  assert(await frame.locator('#placement-done').isEnabled());assert.deepEqual(await read(),saved,'fitting is only a draft');
  assert.equal(await frame.getByRole('slider').count(),0,'fine controls start folded');assert.equal(await frame.locator('#shelf-fit').count(),0,'no extra fit action is required');
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await frame.getByRole('button',{name:label+' 놓기',exact:true}).click();await ready(id);await frame.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture[id]=expected;assert.deepEqual(await read(),installed);
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await open();await ready(plantId);await ready(shelfId);assert.deepEqual(await read(),installed,'both installation orders survive reopening');
  await frame.getByRole('button',{name:'덩굴 화분 배치',exact:true}).click();
  assert.equal(await frame.getByRole('slider').count(),0);assert.deepEqual(await pose(plantId),installed.rooms[0].furniture[plantId]);assert(await frame.locator('#placement-done').isEnabled());
  await frame.locator('.placement-details > summary').click();
  await frame.locator('#accessory-height').evaluate((el,height)=>{el.value=String(height);el.dispatchEvent(new Event('input',{bubbles:true}));},shelf.elevation);
  assert.equal((await pose(plantId)).elevation,plant.elevation,'a small height error snaps to the board top');assert(await frame.locator('#placement-done').isEnabled());
  await frame.locator('#accessory-height').evaluate(el=>{el.value='2.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  assert(!(await frame.locator('#placement-done').isEnabled()),'a real overlap remains blocked');assert.deepEqual(await read(),installed);
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  await frame.getByRole('button',{name:'벽선반 배치',exact:true}).click();
  assert.equal(await frame.getByRole('slider').count(),0);assert.deepEqual(await pose(shelfId),installed.rooms[0].furniture[shelfId]);
  const beforeShelf=await pose(shelfId),beforePlant=await pose(plantId);
  const drag=async(cancel=false)=>{
   const node=frame.locator('[data-furniture="'+shelfId+'"]'),rect=await node.boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height/2;
   await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+7,{steps:3});
   if(cancel){assert.notDeepEqual(await pose(shelfId),beforeShelf);await frame.evaluate(()=>{const captured=[...document.querySelectorAll('[data-furniture]')].find(el=>el.hasPointerCapture(1));if(!captured)throw new Error('drag has no captured pointer');captured.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,pointerType:'mouse',bubbles:true}));});}
   await page.mouse.up();await ready(shelfId);await ready(plantId);
  };
  await drag(true);assert.deepEqual(await pose(shelfId),beforeShelf,'cancelled pointer restores shelf');assert.deepEqual(await pose(plantId),beforePlant,'cancelled pointer restores plant');assert.deepEqual(await read(),installed);
  await drag();const movedShelf=await pose(shelfId),movedPlant=await pose(plantId);
  assert.notDeepEqual(movedShelf,beforeShelf,'one drag moves the shelf');assert.notDeepEqual(movedPlant,beforePlant,'the supported plant follows without another control');
  assert(Math.abs(movedPlant.elevation-movedShelf.elevation-.12)<1e-6);assert(await frame.locator('#placement-done').isEnabled());assert.deepEqual(await read(),installed,'moving both is only a draft');
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await pose(shelfId),beforeShelf);assert.deepEqual(await pose(plantId),beforePlant);assert.deepEqual(await read(),installed);
  await frame.getByRole('button',{name:'벽선반 배치',exact:true}).click();await drag();
  installed.rooms[0].furniture[shelfId]=await pose(shelfId);installed.rooms[0].furniture[plantId]=await pose(plantId);
  await frame.locator('#placement-done').click();assert.deepEqual(await read(),installed,'one install saves the whole pair');
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await open();await ready(shelfId);await ready(plantId);
  assert.deepEqual(await pose(shelfId),installed.rooms[0].furniture[shelfId]);assert.deepEqual(await pose(plantId),installed.rooms[0].furniture[plantId]);assert.deepEqual(await read(),installed);
  await frame.getByRole('button',{name:'벽선반 배치',exact:true}).click();await frame.locator('.placement-details > summary').click();
  for(const d of ['left','center','right']){
   await frame.locator('#panel button[data-direction="'+d+'"]').click();await ready(shelfId);await ready(plantId);
   assert.equal((await pose(shelfId)).direction,d);assert.equal((await pose(plantId)).direction,d);assert(await frame.locator('#placement-done').isEnabled(),'pair fits each wall automatically');
  }
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  const checks=await frame.evaluate(async({plant,shelf,modelVersion,shelfVersion})=>{
   const m=await import('./model.js?v='+modelVersion),fit=await import('./shelf-placement.js?v='+shelfVersion);
   const p={id:'item-shelf-plant',...plant},s={id:'item-oak-wall-shelf',...shelf};
   const obstruction={id:'bookshelf',direction:shelf.direction,x:shelf.direction==='right'?9:0,y:shelf.direction==='center'?0:3};
   return {pair:m.canPlaceFurniture(p.id,p,[s]),reverse:m.canPlaceFurniture(s.id,s,[p]),
    actualOverlapBlocked:!m.canPlaceFurniture(p.id,{...p,elevation:s.elevation},[s]),
    blockerRetained:fit.fitShelfPair(p.id,[s,obstruction])===null,
    noFloatingRescue:fit.plantFollowingShelf({...s,elevation:.2},{shelf:s,plant:p},[])===null};
  },{plant:installed.rooms[0].furniture[plantId],shelf:installed.rooms[0].furniture[shelfId],modelVersion,shelfVersion});for(const [name,ok]of Object.entries(checks))assert(ok,name);
  if(first===shelfId){await frame.locator('#overview').click();await page.screenshot({path:path.join(output,direction+'-mobile.png')});}
  await frame.getByRole('button',{name:'벽선반 배치',exact:true}).click();assert.equal(await frame.locator('#placement-recall').getAttribute('aria-label'),'선반과 화분 회수');await frame.locator('#placement-recall').click();const removed=structuredClone(installed);delete removed.rooms[0].furniture[shelfId];delete removed.rooms[0].furniture[plantId];assert.deepEqual(await read(),removed);
  console.log('PASS',direction,first===shelfId?'shelf then plant':'plant then shelf','automatic fit, folded controls, pair drag/rotation, pointer cancel, collision, save/reopen');
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
