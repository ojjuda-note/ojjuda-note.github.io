const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-room.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.roomTest={model:$,state:g,auth:D,actions:sr,render:H,refresh:ut,save:Ti,storageKey:gr,server:()=>mi($),draft:roomPlacementDraft,items:roomPlacementItems,catalog:q};
 D.isAdmin=true;g.houseAdminPreview=true;g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const context=await browser.newContext({viewport:{width:660,height:900},hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message)});
 page.on('console',message=>{if(message.type()==='error')console.log('CONSOLE',message.text().slice(0,200));});
 await page.goto('https://fixture.test/world.html');
 const ready=()=>page.waitForSelector('.room3d-ready',{timeout:30000});await ready();
 const frame=()=>page.frames().find(f=>f.url().includes('/room3d/index.html'));
 const framing=[];
 async function checkFraming(label){
  const size=await page.locator('.room3d-frame').evaluate(el=>({width:el.clientWidth,height:el.clientHeight}));
  await frame().waitForFunction(size=>{
   const view=Ojjuda3D.inspect().framing?.viewport;
   return view&&Math.abs(view.width-size.width)<=1&&Math.abs(view.height-size.height)<=1;
  },size);
  const view=await frame().evaluate(()=>Ojjuda3D.inspect().framing),house=view.house;
  assert.ok(house&&Object.values(house).every(Number.isFinite),label+': actual house geometry has finite screen bounds');
  assert.ok(house.width>=.90&&house.width<=.96,label+': the house fills the stage width');
  assert.ok(house.left>=.01&&house.right<=.99&&house.top>=.025&&house.bottom<=.975,label+': the roof and room base remain inside the frame');
  assert.equal(view.courtyardMeshCount,0,label+': no three-dimensional yard consumes room space');
  assert.ok(view.exteriorMeshCount>0,label+': the house still retains its roof and foundation');
  assert.equal(view.zoom,1,label+': this is the natural fit without manual zoom');
  framing.push({label,width:house.width,height:house.height,roomSize:view.roomSize});
  return house;
 }
 const backdrop=await frame().evaluate(async()=>{
  const style=getComputedStyle(document.body),match=style.backgroundImage.match(/url\(["']?([^"')]+)["']?\)/);
  if(!match)return null;
  const image=new Image();image.src=match[1];await image.decode();
  return {url:image.src,width:image.naturalWidth,height:image.naturalHeight,size:style.backgroundSize,repeat:style.backgroundRepeat};
 });
 assert.ok(backdrop&&backdrop.width>=512&&backdrop.height>=512,'the home backdrop is a decoded full-size illustration');
 assert.equal(backdrop.size,'cover','the drawing fills the corners around the room');
 assert.equal(backdrop.repeat,'no-repeat');
 // Each non-home frame must choose its own background before its engine loads.
 // In particular, public rooms and pet/portrait previews must not fetch this art.
 for(const view of ['avatar','pet','portrait','place']){
  const preview=await context.newPage(),requests=[];
  preview.on('request',request=>requests.push(request.url()));
  await preview.goto('https://fixture.test/room3d/index.html?view='+view);
  await preview.waitForFunction(view=>document.documentElement.dataset.view===view,view);
  assert.ok(!(await preview.evaluate(()=>getComputedStyle(document.body).backgroundImage)).includes(new URL(backdrop.url).pathname),view+': house art is absent');
  assert.ok(!requests.includes(backdrop.url),view+': house art is not fetched');
  await preview.close();
 }
 assert.deepEqual((await page.locator('.bottomnav button > span:first-of-type').allTextContents()),['동네','우리집','메뉴']);
 assert.equal(await page.locator('[data-act="house-mode"]').count(),3);
 assert.ok((await frame().evaluate(()=>Ojjuda3D.inspect())).items.length>0);
 assert.equal(await frame().evaluate(()=>localStorage.getItem('ojjuda3d')),null,'no account-independent demo room is stored');
 await page.screenshot({path:'/tmp/ojjuda-room-3d-home.png',fullPage:true});
 const originalRoom=await page.evaluate(()=>JSON.stringify(roomTest.model.room));
 for(const [width,height] of [[320,740],[390,844],[660,900],[1280,900]]){
  await page.setViewportSize({width,height});await checkFraming('home '+width);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': home has no horizontal overflow');
  if(width===390){
   await page.locator('#stage').scrollIntoViewIfNeeded();
   await page.locator('#stage').screenshot({path:'/tmp/ojjuda-room-backdrop-home-390.png'});
   await page.screenshot({path:'/tmp/ojjuda-room-backdrop-home-full-390.png',fullPage:true});
  }
 }
 assert.equal(await page.evaluate(()=>JSON.stringify(roomTest.model.room)),originalRoom,'framing changes preserve the saved room layout');
 await page.setViewportSize({width:660,height:900});
 await page.locator('[data-mode="room"]').click();await ready();
 assert.equal(await page.locator('.bottomnav [aria-current="page"]').getAttribute('data-tab'),'home');
 await frame().evaluate(()=>window.frameMarker='keep-room');
 await page.locator('[data-act="ptab"][data-v="wall"]').click();
 await page.locator('[data-act="ptab"][data-v="floor"]').click();
 assert.equal(await frame().evaluate(()=>window.frameMarker),'keep-room','switching furniture categories keeps the renderer alive');
 await page.evaluate(()=>{const t=roomTest;t.model.room.items=[{id:'desk-test',type:'desk',gx:2,gy:2,r:0},{id:'wall-test',type:'window',wall:'R',t:4,z:90},{id:'pet-test',type:'cat',gx:6,gy:6,r:0,pet:{name:'콩이',love:73}}];t.model.petBank={};t.state.sel=null;t.render();});await ready();
 const original=await page.evaluate(()=>JSON.stringify(roomTest.model.room.items));
 const item=await frame().evaluate(()=>Ojjuda3D.projectItem('desk-test'));
 const box=await page.locator('iframe.room3d-frame').boundingBox();
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+item.x,y:box.y+item.y,id:1}]});
 for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+item.x+60*i/5,y:box.y+item.y+30*i/5,id:1}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await page.waitForFunction(()=>roomTest.draft());
 assert.equal(await page.evaluate(()=>JSON.stringify(roomTest.model.room.items)),original,'touch release cannot commit');
 assert.notEqual(await page.evaluate(()=>JSON.stringify(roomTest.items())),original);
 await page.locator('[data-act="rot"]').click();
 await page.evaluate(()=>{roomTest.save();window.dispatchEvent(new Event('visibilitychange'));});
 const saved=await page.evaluate(()=>({local:JSON.parse(localStorage.getItem(roomTest.storageKey)).rooms[0].items,server:roomTest.server().profile.room.items}));
 assert.equal(JSON.stringify(saved.local),original);assert.equal(JSON.stringify(saved.server),original);
 await page.screenshot({path:'/tmp/ojjuda-room-3d-edit.png',fullPage:true});
 await page.locator('[data-act="placement-cancel"]').click();
 assert.equal(await page.evaluate(()=>JSON.stringify(roomTest.model.room.items)),original);
 const p2=await frame().evaluate(()=>Ojjuda3D.inspect().items.find(i=>i.id==='desk-test'));
 assert.equal(p2.gx,2);assert.equal(p2.gy,2);
 const afterAccountSwitch=await page.evaluate(()=>{
   const before=JSON.stringify(roomTest.model.room.items),fn=document.querySelector('iframe').contentWindow.Ojjuda3D.hooks.onMove;
   roomTest.auth.user={id:'another-account'};fn({id:'desk-test',gx:5,gy:5});
   const result=JSON.stringify(roomTest.model.room.items)===before&&!roomTest.draft();roomTest.auth.user=null;return result;
 });assert.equal(afterAccountSwitch,true,'callbacks from the previous account cannot edit the new account');
 await page.locator('.room3d-item-select').selectOption('wall-test');
 await page.locator('[data-act="wmv"]').first().click();
 await page.locator('[data-act="wswap"]').click();
 await page.locator('[data-act="placement-confirm"]').click();
 assert.equal(await page.evaluate(()=>roomTest.model.room.items.find(i=>i.id==='wall-test').wall),'L');
 assert.equal((await frame().evaluate(()=>Ojjuda3D.inspect().items.find(i=>i.id==='wall-test'))).wall,'L');
 assert.equal(await page.evaluate(()=>roomTest.model.room.items.find(i=>i.id==='pet-test').pet.love),73);
 await page.locator('[data-act="room-next"]').click();
 await page.waitForFunction(()=>document.querySelector('iframe.room3d-frame').contentWindow.Ojjuda3D.inspect().key.endsWith(roomTest.model.room.id));
 await page.locator('[data-act="house-mode"][data-mode="home"]').click();await ready();
 const readOnly=await page.evaluate(()=>JSON.stringify(roomTest.model.room.items));
 assert.equal((await frame().evaluate(()=>Ojjuda3D.inspect())).editing,false);
 assert.equal(await page.evaluate(()=>JSON.stringify(roomTest.model.room.items)),readOnly);
 // A real legacy furniture shortcut reaches the existing panel, not a demo modal.
 await page.evaluate(()=>{roomTest.model.room.items=[{id:'link-desk',type:'desk',gx:3,gy:3,r:0}];roomTest.render();});await ready();
 const link=await frame().evaluate(()=>Ojjuda3D.projectItem('link-desk')),linkBox=await page.locator('iframe.room3d-frame').boundingBox();
 await page.mouse.click(linkBox.x+link.x,linkBox.y+link.y);
 assert.equal(await page.evaluate(()=>roomTest.state.sec),'diary');
 for(const [width,height] of [[320,740],[390,844],[660,768],[840,900],[844,390],[1280,900]]){
  await page.setViewportSize({width,height});await page.locator('[data-mode="room"]').click();await ready();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${width}: no horizontal overflow`);
  const stage=await page.locator('#stage').boundingBox();if(width===660)assert.ok(stage.width>=550,'large phone uses width');
  const fitted=await checkFraming('decorate '+width);
  await page.locator('.room3d-tools [aria-label="방 확대"]').click();
  assert.ok((await frame().evaluate(()=>Ojjuda3D.inspect().framing.house.width))>fitted.width+.1,'zoom enlarges the house, not the background');
  await page.locator('.room3d-tools [aria-label="원래 크기로"]').click();
  assert.ok(Math.abs((await frame().evaluate(()=>Ojjuda3D.inspect().framing.house.width))-fitted.width)<.001,'fit returns to the same uncropped house');
  if(width===390){
   await page.locator('#stage').screenshot({path:'/tmp/ojjuda-room-backdrop-decorate-390.png'});
   await page.screenshot({path:'/tmp/ojjuda-room-backdrop-decorate-full-390.png',fullPage:true});
  }
 }
 assert.equal(new Set(framing.map(view=>view.roomSize)).size,1,'responsive fitting keeps the actual floor dimensions unchanged');
 // The supplied catalog is used for every existing furniture/pet type, including color variants.
 const types=await page.evaluate(()=>Object.keys(roomTest.catalog));
 for(let start=0;start<types.length;start+=12){
   const batch=types.slice(start,start+12);
   await page.evaluate(batch=>{
     roomTest.model.room.items=batch.map((type,i)=>({id:'catalog-'+type,type,...(roomTest.catalog[type].kind==='wall'?{wall:'R',t:2+i%5,z:90}:{gx:i%4,gy:Math.floor(i/4),r:0})}));roomTest.refresh();
   },batch);
   assert.equal(await page.locator('.room3d-ready').count(),1,`catalog batch ${start} renders`);
   assert.deepEqual((await frame().evaluate(()=>Ojjuda3D.inspect().items.map(it=>it.type))),batch);
 }
 const models=await frame().evaluate(()=>Ojjuda3D.inspect().models);
 assert.equal(Object.values(models).filter(value=>value==='artwork').length,0,'all legacy furniture maps to an actual 3D model');
 // Lost WebGL must expose the working SVG editor and preserve its actions.
 await frame().evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 assert.equal(await page.locator('.room3d-ready').count(),0);
 assert.equal(await page.locator('#room-svg').isVisible(),true);
 assert.deepEqual(errors,[]);
 console.log('PASS: illustrated home backdrop, room-first framing, 3D touch, cancel/confirm, model preservation, links, room switching, phone layouts and WebGL fallback',JSON.stringify(framing));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
