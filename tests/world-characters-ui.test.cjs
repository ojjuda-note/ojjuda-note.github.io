const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-room.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'world-characters.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.roomTest={model:$,state:g,auth:D,actions:sr,render:H,refresh:ut,save:Ti,storageKey:gr,server:()=>mi($),draft:roomPlacementDraft,items:roomPlacementItems,catalog:q,petOpen:Qd,avatarCatalog:{hair:fr,face:mr,top:To,bottom:Ro,shoes:jr,acc:ur}};
 D.isAdmin=true;g.houseAdminPreview=true;g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));


(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const context=await browser.newContext({viewport:{width:660,height:900},hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>{errors.push(error.message);console.log('PAGE ERROR',error.message)});
 await page.goto('https://fixture.test/world.html');await page.waitForSelector('.room3d-ready');
 const room=()=>page.frames().find(f=>f.url().includes('/room3d/index.html')&&!f.url().includes('view='));
 const actor=()=>page.frames().find(f=>f.url().includes('view=avatar'));
 const pet=()=>page.frames().find(f=>f.url().includes('view=pet'));
 await page.waitForSelector('[data-portrait-ready] img');
 const arms=await room().evaluate(()=>Ojjuda3D.inspect().arms);
 for(const arm of arms){assert.equal(arm.shoulder,.44);assert.ok(Math.abs(arm.sleeve+arm.length/2)<.0001,'sleeve reaches the shoulder');}
 await page.screenshot({path:'/tmp/ojjuda-exterior-after.png',fullPage:true});
 await page.locator('[data-mode="avatar"]').click();await page.waitForSelector('#av-preview[data-character-ready]');
 await actor().evaluate(()=>window.rendererMarker='same-avatar');
 await page.locator('[data-act="av-tab"][data-v="hair"]').click();
 await page.locator('[data-act="av"][data-k="hair"][data-v="ponytail"]').click();
 await page.waitForFunction(()=>document.querySelector('#av-preview iframe').contentWindow.Ojjuda3D.inspect().character.avatar.hair==='ponytail');
 assert.equal(await actor().evaluate(()=>window.rendererMarker),'same-avatar','changing a hair choice keeps the renderer alive');
 await page.screenshot({path:'/tmp/ojjuda-avatar-after.png',fullPage:true});
 await page.locator('[data-act="av-tab"][data-v="wear"]').click();
 const before=await page.evaluate(()=>JSON.stringify(roomTest.model.avatar));
 await page.locator('[data-act="av"][data-k="top"][data-v="hanbok"]').click();
 assert.equal(await page.evaluate(()=>JSON.stringify(roomTest.model.avatar)),before,'trying unowned clothes does not change the saved avatar');
 await page.waitForFunction(()=>document.querySelector('#av-preview iframe').contentWindow.Ojjuda3D.inspect().character.avatar.top==='hanbok');
 assert.equal(await actor().evaluate(()=>Ojjuda3D.inspect().character.avatar.top),'hanbok');
 await page.locator('[data-act="try-cancel"]').click();
 await page.waitForFunction(top=>document.querySelector('#av-preview iframe').contentWindow.Ojjuda3D.inspect().character.avatar.top===top,JSON.parse(before).top);
 assert.equal(await actor().evaluate(()=>Ojjuda3D.inspect().character.avatar.top),JSON.parse(before).top);
 await page.locator('[data-mode="home"]').click();await page.waitForSelector('.room3d-ready');
 assert.equal(await room().evaluate(()=>Ojjuda3D.inspect().avatar.hair),'ponytail');
 await room().evaluate(()=>{const original=Ojjuda3D.setActive;window.activeChanges=[];Ojjuda3D.setActive=value=>{activeChanges.push(value);original(value);};});
 await page.evaluate(()=>{const t=roomTest;t.model.room.items.push({id:'pet-test',type:'cat',gx:6,gy:6,r:0,pet:{name:'콩이',love:73,full:40,joy:40,at:Date.now()}});t.refresh();t.petOpen('pet-test');});
 await page.waitForSelector('#petscene[data-character-ready]');
 await pet().evaluate(()=>window.rendererMarker='same-pet');
 await page.waitForTimeout(100);
 const coveredBefore=await room().evaluate(()=>Ojjuda3D.inspect().renderFrame);
 await page.evaluate(()=>{for(let i=0;i<4;i++)roomTest.refresh();});
 assert.equal(await room().evaluate(()=>Ojjuda3D.inspect().renderFrame),coveredBefore,'room snapshots do not draw behind pet care');
 // Viewport notifications can arrive after a modal has already paused the room.
 let activeCount=await room().evaluate(()=>activeChanges.length);
 await page.locator('#stage').evaluate(stage=>{stage.style.transform='translateY(-200vh)';});
 await room().waitForFunction(count=>activeChanges.length>count,activeCount);
 activeCount=await room().evaluate(()=>activeChanges.length);
 await page.locator('#stage').evaluate(stage=>{stage.style.transform='';});
 await room().waitForFunction(count=>activeChanges.length>count,activeCount);
 assert.equal(await room().evaluate(()=>activeChanges.at(-1)),false,'a viewport callback cannot resume a covered room');
 assert.equal(await room().evaluate(()=>Ojjuda3D.inspect().renderFrame),coveredBefore,'viewport changes keep the room paused behind pet care');
 const petBefore=await page.evaluate(()=>({...roomTest.model.room.items.find(x=>x.id==='pet-test').pet}));
 await page.locator('[data-act="pet-pat"]').click();
 assert.equal(await pet().evaluate(()=>window.rendererMarker),'same-pet','pet care keeps the scene instead of rebuilding its iframe');
 assert.equal(await pet().evaluate(()=>Ojjuda3D.inspect().character.action),'pat');
 assert.ok(await page.evaluate(love=>roomTest.model.room.items.find(x=>x.id==='pet-test').pet.love>=love,petBefore.love));
 await page.screenshot({path:'/tmp/ojjuda-pet-after.png',fullPage:true});
 await page.locator('[data-act="pet-tab"][data-v="talk"]').click();await page.waitForSelector('#petscene[data-character-ready]');
 await page.locator('#talk-inp').fill('반가워 콩이');await page.locator('[data-act="pet-talk-send"]').click();
 await page.waitForFunction(()=>document.querySelector('#talk-log').textContent.includes('반가워 콩이'));
 await page.screenshot({path:'/tmp/ojjuda-pet-talk-after.png',fullPage:true});
 await page.locator('#modal-root [data-act="close"]').click();
 await room().waitForFunction(()=>activeChanges.at(-1)===true);
 const resumedBefore=await room().evaluate(()=>Ojjuda3D.inspect().renderFrame);
 await room().evaluate(()=>Ojjuda3D.zoom(.15));
 await room().waitForFunction(before=>Ojjuda3D.inspect().renderFrame>before,resumedBefore);
 await page.evaluate(()=>{roomTest.model.room.items=[];roomTest.refresh();});
 await page.waitForTimeout(350);
 const first=await room().evaluate(()=>Ojjuda3D.inspect().renderFrame);await page.waitForTimeout(750);const last=await room().evaluate(()=>Ojjuda3D.inspect().renderFrame);
 assert.ok(last-first<=1,'a settled room does not redraw on every animation frame');
 for(const width of [320,390,840,1280]){await page.setViewportSize({width,height:900});await page.locator('[data-mode="avatar"]').click();await page.waitForSelector('#av-preview[data-character-ready]');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': no horizontal overflow');}

 const options=await page.evaluate(()=>roomTest.avatarCatalog);
 const coverage=await actor().evaluate(options=>{
   const api=Ojjuda3D,base=api.inspect().character.avatar,duplicates=[];let count=0;
   for(const [field,choices] of Object.entries(options)){
     const images=new Map();
     for(const [value] of choices){api.applyCharacter({kind:'avatar',avatar:{...base,[field]:value}});if(api.inspect().character.avatarModel!=='sculpted-v20')throw new Error(field+':'+value+' lost the authored body');const png=document.querySelector('canvas').toDataURL();if(images.has(png))duplicates.push([field,images.get(png),value]);images.set(png,value);count++;}
   }
   api.applyCharacter({kind:'avatar',avatar:base});return {count,duplicates};
 },options);
 assert.equal(coverage.count,85);assert.deepEqual(coverage.duplicates,[],'every avatar choice has its own visible model');
 await actor().evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await page.waitForSelector('#av-preview[data-character-ready]',{state:'detached'});
 assert.equal(await page.locator('#av-preview[data-character-ready]').count(),0);assert.equal(await page.locator('#av-preview>svg').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: avatar/room parity, correct shoulders, preserved paid previews, pet care/chat, stable renderers, idle rendering and responsive layouts');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
