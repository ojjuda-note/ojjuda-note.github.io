const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const output=process.env.SHELF_CROWDED_PROOF_DIR||'/tmp/shelf-crowded-proof';
const plantId='item-shelf-plant',shelfId='item-oak-wall-shelf';
const app=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8'),modelVersion=app.match(/model\.js\?v=([^'" ]+)/)[1];
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const errors=[],missing=[];
 try{for(const layout of [0,1]){
  const existing=false,owner='shelf-crowded-'+layout,key='ojjuda-house-playtest-v1:'+owner;
  const context=await browser.newContext({viewport:{width:390,height:844}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.clock.setFixedTime(new Date('2026-10-09T12:50:00+09:00'));await page.goto('https://fixture.test/fixture');
  // Previously saved desk accessories use their original registration positions.
  const furniture={desk:{direction:'right',x:9,y:3.5},chair:{direction:'left',x:8.3,y:4.825,attachedTo:'desk'},
   'desk-lamp':{direction:'right',x:9,y:3.5+layout*.1,elevation:1.4},'pencil-cup':{direction:'right',x:9.2,y:5.7+layout*.1,elevation:1.4},
   'open-book':{direction:'right',x:9.1,y:4.4+layout*.1,elevation:1.4},'item-desk-frame':{direction:'right',x:9.73,y:5.7+layout*.1,elevation:1.4},
   [shelfId]:{direction:'right',x:9.6,y:3.5,elevation:2.65},...(existing?{[plantId]:{direction:'right',x:9.62,y:3.9,elevation:2.77}}:{})};
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:{direction:'right',x:9,y:1.5},furniture}],diary:'사진 속 기존 방과 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  let frame;const open=async()=>{await page.locator('#open').click();frame=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();await frame.locator('#app').waitFor({state:'visible',timeout:10000}).catch(async error=>{console.error({locked:await frame.locator('#locked').innerText(),errors,missing});throw error;});await frame.locator('[data-tab="room"]').click();await frame.getByRole('button',{name:'소품',exact:true}).click();};
  const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const node=id=>frame.locator('[data-furniture="'+id+'"]'),ready=id=>node(id).filter({has:frame.locator('canvas')}).waitFor();
  const pose=id=>node(id).evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation||0)}));
  const z=id=>node(id).evaluate(el=>Number(el.style.zIndex));
  await open();assert.deepEqual(await read(),saved);
  await frame.getByRole('button',{name:'덩굴 화분 '+(existing?'배치':'놓기'),exact:true}).click();await ready(plantId);
  await page.screenshot({path:path.join(output,'layout-'+layout+'-selection.png')});
  assert(await frame.locator('#placement-done').isEnabled(),'the crowded saved room can install a supported plant without manual controls');
  assert((await z(shelfId))>(await z('bookshelf')),'a shelf in front paints in front of the bookcase');
  const plant=await pose(plantId),shelf=await pose(shelfId),lamp=await pose('desk-lamp');
  assert.deepEqual(shelf,furniture[shelfId],'the chosen shelf stays in place');
  assert(Math.abs(plant.elevation-shelf.elevation-.12)<1e-6);assert(plant.y>=shelf.y&&plant.y+.36<=shelf.y+1.2+1e-6);
  assert.notDeepEqual(lamp,furniture['desk-lamp'],'only the obstructing lamp needs room');
  assert.equal(lamp.direction,'right');assert.equal(lamp.elevation,1.4);assert(lamp.x>=9&&lamp.x+.9<=10+1e-6&&lamp.y>=3.5&&lamp.y+.9<=6.5+1e-6,'lamp remains on the desk');
  const arranged={};for(const id of ['desk-lamp','pencil-cup','open-book','item-desk-frame'])arranged[id]=await pose(id);
  assert.equal(await frame.getByRole('slider').count(),0);assert.deepEqual(await read(),saved,'auto clearance is only a preview');
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);assert.deepEqual(await pose('desk-lamp'),furniture['desk-lamp']);
  await frame.getByRole('button',{name:'덩굴 화분 '+(existing?'배치':'놓기'),exact:true}).click();await ready(plantId);await frame.locator('#placement-done').click();
  const installed=structuredClone(saved);installed.rooms[0].furniture[plantId]=plant;Object.assign(installed.rooms[0].furniture,arranged);assert.deepEqual(await read(),installed);
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await open();await ready(plantId);assert.deepEqual(await read(),installed);
  await frame.getByRole('button',{name:'덩굴 화분 배치',exact:true}).click();await ready(plantId);assert.deepEqual(await pose(plantId),plant);assert.deepEqual(await pose('desk-lamp'),lamp);assert(await frame.locator('#placement-done').isEnabled());
  const checks=await frame.evaluate(async({modelVersion,plant,lamp,room})=>{const m=await import('./model.js?v='+modelVersion),others=m.furniturePlacements(room);return {group:m.canPlaceGroup(others,[]),originalLampBlocked:!m.canPlaceFurniture('item-shelf-plant',plant,[{id:'desk-lamp',direction:'right',x:9,y:3.5,elevation:1.4}])};},{modelVersion,plant,lamp,room:installed.rooms[0]});assert.deepEqual(checks,{group:true,originalLampBlocked:true});
  await frame.getByRole('button',{name:'취소',exact:true}).click();
  await frame.getByRole('button',{name:'가구',exact:true}).click();await frame.getByRole('button',{name:'책장 배치',exact:true}).click();
  await frame.locator('#bookshelf-depth').evaluate(el=>{el.value='5';el.dispatchEvent(new Event('input',{bubbles:true}));});await ready('bookshelf');
  assert((await z('bookshelf'))>(await z(shelfId)),'moving the bookcase in front reverses their drawing order');
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  await context.close();console.log('PASS crowded room','layout '+layout,'automatic desk clearance, support, true depth, cancel/save/reopen');
 }assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
