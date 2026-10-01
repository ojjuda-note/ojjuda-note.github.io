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
 g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));



(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const context=await browser.newContext({viewport:{width:450,height:900},hasTouch:true});
 try{
  await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});
  await page.goto('https://fixture.test/world.html');await page.waitForSelector('.room3d-ready');
  const room=()=>page.frames().find(f=>f.url().includes('/room3d/index.html')&&!f.url().includes('view='));
  const actor=()=>page.frames().find(f=>f.url().includes('view=avatar'));
  const original=await page.evaluate(()=>JSON.stringify(roomTest.model.avatar));
  await page.locator('[data-mode="avatar"]').click();await page.waitForSelector('#av-preview[data-character-ready]');
  await actor().evaluate(()=>window.rendererMarker='same-avatar');
  await page.locator('[data-act="av-style"][data-v="sculpted-v20"]').click();
  await actor().waitForFunction(()=>Ojjuda3D.inspect().character.avatarModel==='sculpted-v20');
  assert.equal(await actor().evaluate(()=>window.rendererMarker),'same-avatar');
  await page.locator('#av-preview').scrollIntoViewIfNeeded();
  assert.equal(await actor().evaluate(()=>Ojjuda3D.inspect().avatarAsset),'ready');
  const frameBefore=await actor().evaluate(()=>{const n=Ojjuda3D.inspect().renderFrame;Ojjuda3D.rotateCharacter(.25);return n;});
  await actor().waitForFunction(n=>Ojjuda3D.inspect().renderFrame>n,frameBefore);
  await page.locator('#av-preview').screenshot({path:'/tmp/ojjuda-sculpted-avatar.png'});
  await page.locator('[data-act="av"][data-k="topColor"]').first().click();
  const chosen=await page.evaluate(()=>roomTest.model.avatar.topColor);
  await actor().waitForFunction(color=>Ojjuda3D.inspect().character.avatar.topColor===color,chosen);
  assert.equal(await actor().evaluate(()=>Ojjuda3D.inspect().character.avatarModel),'sculpted-v20');
  await page.locator('[data-mode="home"]').click();await page.waitForSelector('.room3d-ready');
  assert.equal(await room().evaluate(()=>Ojjuda3D.inspect().avatarModel),'sculpted-v20');
  await page.evaluate(()=>roomTest.save());
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem(roomTest.storageKey)).avatar.renderStyle),'sculpted-v20');
  assert.equal(await page.evaluate(()=>roomTest.server().profile.avatar.renderStyle),'sculpted-v20');
  const rig=await room().evaluate(async()=>{
   const THREE=await import('/room3d/vendor/three.module.js'),art=await import('/room3d/sculpted-avatar.js?v=20261001-actors1');
   const config={renderStyle:'sculpted-v20',skin:'#f2c2a3',hairColor:'#39303d',topColor:'#a7d2ed',bottomColor:'#354c59'};
   const a=art.buildSculptedAvatar(config),b=art.buildSculptedAvatar({...config,topColor:'#d787b7'}),box=new THREE.Box3().setFromObject(a);
   const skins=[];a.traverse(o=>{if(o.isSkinnedMesh)skins.push(o);});
   const other=[];b.traverse(o=>{if(o.isSkinnedMesh)other.push(o);});
   const isolated=skins.every((m,i)=>m.geometry!==other[i].geometry&&m.material!==other[i].material&&m.skeleton.bones[0]!==other[i].skeleton.bones[0]);
   a.userData.setPose('sit',{lift:.7});
   const sit={knee:a.getObjectByName('Knee_L').rotation.x,hip:a.getObjectByName('Hips').position.y,y:a.position.y};
   a.userData.setPose('lie',{lift:.6});const lie={angle:a.rotation.x,eyes:a.getObjectByName('Head').children.some(o=>o.visible&&o.children.length===2)};
   a.userData.setPose('stand');a.userData.walk(.18);const walk=a.getObjectByName('Leg_L').rotation.x;
   const reset=a.userData.walk(0),stand=a.getObjectByName('Leg_L').rotation.x;
   for(const g of [a,b]){const materials=new Set();g.traverse(o=>{o.geometry?.dispose();for(const m of(Array.isArray(o.material)?o.material:[o.material]))if(m)materials.add(m);});for(const m of materials)m.dispose();}
   return {skins:skins.length,bones:skins[0].skeleton.bones.length,isolated,size:box.getSize(new THREE.Vector3()).toArray(),sit,lie,walk,reset,stand};
  });
  assert.equal(rig.skins,11);assert.equal(rig.bones,13);assert.ok(rig.isolated);assert.ok(rig.size.every(Number.isFinite)&&rig.size[1]>1.5&&rig.size[1]<1.9);assert.equal(rig.sit.knee,Math.PI/2);assert.ok(Math.abs(rig.sit.hip-.1)<.001);assert.equal(rig.sit.y,.7);assert.equal(rig.lie.angle,-Math.PI/2);assert.notEqual(rig.walk,0);assert.equal(rig.stand,0);assert.equal(rig.reset,true);
  const portrait=await room().evaluate(()=>Ojjuda3D.portrait({...Ojjuda3D.inspect().avatar,renderStyle:'sculpted-v20'}));assert.ok(portrait.startsWith('data:image/png;base64,'));fs.writeFileSync('/tmp/ojjuda-sculpted-avatar-portrait.png',Buffer.from(portrait.split(',')[1],'base64'));
  await page.locator('[data-mode="avatar"]').click();await page.waitForSelector('#av-preview[data-character-ready]');
  await page.locator('[data-act="av-style"][data-v="wardrobe"]').click();
  await actor().waitForFunction(()=>Ojjuda3D.inspect().character.avatarModel==='wardrobe');
  const restored=await page.evaluate(()=>{const {renderStyle,topColor,...rest}=roomTest.model.avatar;return rest;});
  const {topColor,...old}=JSON.parse(original);assert.deepEqual(restored,old,'original hairstyle, clothes, accessories and face are retained');
  await page.locator('[data-act="av-style"][data-v="sculpted-v20"]').click();
  await actor().waitForFunction(()=>Ojjuda3D.inspect().character.avatarModel==='sculpted-v20');
  await page.evaluate(()=>{roomTest.state.tryOn={kind:'av',k:'top',key:'top:hanbok',v:'hanbok'};roomTest.actions['av-tab']({v:'wear'});roomTest.state.tryOn={kind:'av',k:'top',key:'top:hanbok',v:'hanbok'};roomTest.render();});
  await page.waitForSelector('#av-preview[data-character-ready]');
  assert.equal(await actor().evaluate(()=>Ojjuda3D.inspect().character.avatarModel),'wardrobe','a shop try-on shows the requested garment');
  assert.equal(await page.evaluate(()=>roomTest.model.avatar.renderStyle),'sculpted-v20','trying an unowned garment does not save it');
  await page.locator('[data-act="try-cancel"]').click();
  await actor().waitForFunction(()=>Ojjuda3D.inspect().character.avatarModel==='sculpted-v20');
  await page.evaluate(()=>roomTest.actions.av({k:'hair',v:'ponytail'}));
  await actor().waitForFunction(()=>Ojjuda3D.inspect().character.avatarModel==='wardrobe');
  assert.equal(await page.evaluate(()=>roomTest.model.avatar.renderStyle),'wardrobe','equipping another style exits the authored outfit');
  assert.deepEqual(errors,[]);console.log('PASS: authored avatar in World, native mesh/rig, colors, style save projection, wardrobe preservation, poses, cloning and portrait',JSON.stringify({rig}));
 }finally{await context.close();await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
