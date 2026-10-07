const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const output=process.env.ROOM_DEFAULT_PROOF_DIR||'/tmp/room-default-proof';
const owner='reference-placement-test',key='ojjuda-house-playtest-v1:'+owner;
const entries=[
 ['sofa','소파','가구','left'],['side-table','협탁','가구','left'],
 ['floor-lamp','스탠드 조명','가구','left'],['bookshelf','책장','가구','right'],
 ['window-plant','창가 화분','가구','right'],['desk','책상','가구','right'],['chair','의자','가구','left'],
 ['carpet','카펫','소품','center'],['coffee-table','거실 테이블','가구','left'],
 ['table-plant','협탁 화분','소품','left'],['table-books','책 두 권','소품','left'],
 ['clover-mug','클로버 머그컵','소품','left'],['table-succulent','작은 다육이','소품','left'],
 ['desk-lamp','탁상 조명','소품','right'],['open-book','펼친 책','소품','right'],['pencil-cup','연필꽂이','소품','right'],
 ['botanical-frame','원목 액자','소품','left'],['item-oak-wall-shelf','벽선반','소품','right'],
 ['item-shelf-plant','덩굴 화분','소품','right'],['item-desk-frame','탁상 액자','소품','right'],
 ['cream-floral-cushion','크림 꽃무늬 쿠션','소품','left'],['sage-cushion','세이지 쿠션','소품','left'],
 ['peach-cushion','피치 쿠션','소품','left'],['pink-check-cushion','분홍 체크 쿠션','소품','left'],
 ['blanket-floor','분홍 담요','소품','left'],
];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const report={placements:[],errors:[]};let page;
 fs.mkdirSync(output,{recursive:true});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<button id="open">우리집</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=20261007-room1';document.querySelector('#open').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});</script>`});
   const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
  await page.clock.setFixedTime(new Date('2026-10-07T12:00:00+09:00'));
  await page.goto('https://fixture.test/fixture');
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{}}],diary:'내가 쓴 기록'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});
  let frame;const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const open=async()=>{await page.locator('#open').click();frame=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();await frame.locator('#app').waitFor({state:'visible'});await frame.locator('[data-tab="room"]').click();};
  const pose=id=>frame.locator('[data-furniture="'+id+'"]').evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation||0)}));
  await open();assert.deepEqual(await read(),saved,'opening the catalog never installs items automatically');
  // Selecting a soft furnishing first uses the same reference seat as selecting it after the sofa.
  for(const [id,label,p]of [['cream-floral-cushion','크림 꽃무늬 쿠션',{direction:'left',x:.33,y:4.45,elevation:.81}],['blanket-floor','분홍 담요',{direction:'left',x:.38,y:3.89,elevation:.025}]]){
   await frame.getByRole('button',{name:'소품',exact:true}).click();
   await frame.getByRole('button',{name:label+' 놓기',exact:true}).click();
   await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();
   assert.deepEqual(await pose(id),p,'reference positions also work before the sofa is installed');
   await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  }
  for(const [id,label,category,direction]of entries){
   const before=await read();await frame.getByRole('button',{name:category,exact:true}).click();
   await frame.getByRole('button',{name:label+' 놓기',exact:true}).click();
   await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();
   const p=await pose(id);report.placements.push({id,...p});console.log('DEFAULT',id,JSON.stringify(p));
   assert.equal(p.direction,direction,id+' starts on the picture side without direction clicks');
   assert(await frame.locator('#placement-done').isEnabled(),id+' has a valid collision-free starting place');
   assert.deepEqual(await read(),before,'selection stays a draft');
   if(id==='item-shelf-plant')assert.deepEqual(p,{direction:'right',x:9.62,y:4.34,elevation:2.77},'vines stay on their shelf away from desk accessories');
   if(id==='item-desk-frame'){
    assert.equal(p.x,9.73);assert.equal(p.y,3.6);assert.equal(p.elevation,1.4);
    await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),before);
    await frame.getByRole('button',{name:label+' 놓기',exact:true}).click();await frame.locator('[data-furniture="'+id+'"][data-render-state="ready"]').waitFor();
    assert.deepEqual(await pose(id),p,'cancel and select again use the same reference position');
   }
   await frame.locator('#placement-done').click();assert.equal((await read()).diary,saved.diary);
  }
  const installed=await read();
  assert.equal(Object.keys(installed.rooms[0].furniture).length,entries.length-1);
  assert.equal(installed.rooms[0].furniture.chair.attachedTo,'desk');
  assert.equal(installed.rooms[0].furniture['blanket-floor'].mode,'sofa');
  await frame.locator('#overview').click();await page.screenshot({path:path.join(output,'reference-room-desktop.png')});
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await open();
  assert.deepEqual(await read(),installed,'every installed reference placement survives reopening');
  await page.setViewportSize({width:390,height:844});await frame.locator('#overview').click();
  await page.screenshot({path:path.join(output,'reference-room-mobile.png')});
  // A deliberately occupied starting position stays on the same wall nearby.
  const fallback=await frame.evaluate(async()=>{
   const {findInitialPlacement}=await import('./default-placement.js?v=20261007-room1');
   return findInitialPlacement('desk-lamp',[{id:'pencil-cup',direction:'right',x:9.05,y:5.55,elevation:1.4}]);
  });
  assert.equal(fallback.direction,'right');assert.equal(fallback.elevation,1.4);assert(fallback.x>=8.5&&fallback.y>=4.5,'occupied defaults stay near the original furniture');
  await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();
  const custom=structuredClone(saved);custom.rooms[0].furniture.desk={direction:'center',x:3.5,y:0};
  await page.evaluate(({key,custom})=>localStorage.setItem(key,JSON.stringify(custom)),{key,custom});await open();
  await frame.getByRole('button',{name:'책상 배치',exact:true}).click();
  assert.deepEqual(await pose('desk'),{direction:'center',x:3.5,y:0,elevation:0},'editing an installed item keeps its chosen position');
  await frame.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),custom);
  assert.deepEqual(report.errors,[]);report.status='passed';
  console.log('PASS: 25 items selected into reference positions, collision fallback, sofa accessories, desk chair, cancel, save, reopen, mobile and saved-position preservation');
 }catch(error){report.status='failed';report.failure=error.stack;if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});throw error;}
 finally{fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
