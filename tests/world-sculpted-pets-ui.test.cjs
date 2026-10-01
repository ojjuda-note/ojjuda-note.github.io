const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');

// Keep World’s real state, catalog, placement adapter and pet-care actions. Only
// account boot/network scripts are replaced; no production account is contacted.
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
  .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${fs.readFileSync(path.join(root,'world-room.js'),'utf8')+'\n'+fs.readFileSync(path.join(root,'world-characters.js'),'utf8')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0,'World fixture boot seam exists');
world=world.slice(0,boot)+`
  window.roomTest={model:$,state:g,render:H,refresh:ut,save:Ti,storageKey:gr,catalog:q,petOpen:Qd};
  g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));

const moduleFixture=`<!doctype html><html><body style="margin:0"><script type="module">
  import * as THREE from '/room3d/vendor/three.module.js';
  import * as pets from '/room3d/sculpted-pets.js';
  import {compactModel} from '/room3d/compact.js';
  window.petTest={THREE,pets,compactModel};
</script></body></html>`;

async function fixtureContext(browser,{failModels=false,stallModels=false}={}){
  const context=await browser.newContext({viewport:{width:660,height:900},hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{
    const url=new URL(route.request().url());
    if(url.hostname!=='fixture.test')return route.abort();
    if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});
    if(url.pathname==='/pet-module-test.html')return route.fulfill({contentType:'text/html',body:moduleFixture});
    if(url.pathname.endsWith('.glb')){
      if(failModels)return route.abort('failed');
      if(stallModels)return; // The loader’s deadline must release World without this response.
    }
    const file=path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
    return route.fulfill({path:file});
  });
  return context;
}

async function checkModels(browser){
  const context=await fixtureContext(browser),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('https://fixture.test/pet-module-test.html');
    await page.waitForFunction(()=>window.petTest);
    const result=await page.evaluate(async()=>{
      const {THREE,pets,compactModel}=petTest;
      const check=(condition,message)=>{if(!condition)throw new Error(message);};
      const status=await pets.preloadSculptedPets();
      check(status.dog==='ready'&&status.cat==='ready','both authored assets decode');
      const collect=model=>{
        const skins=[],geometries=new Set(),materials=new Set(),bones=new Set();
        model.traverse(object=>{
          if(object.isSkinnedMesh){skins.push(object);for(const bone of object.skeleton.bones)bones.add(bone);}
          if(object.geometry)geometries.add(object.geometry);
          for(const material of(Array.isArray(object.material)?object.material:[object.material]))if(material)materials.add(material);
        });
        return {skins,geometries,materials,bones};
      };
      const fingerprints=model=>{
        const values=[];
        model.traverse(object=>{if(object.geometry?.attributes.color)values.push(...object.geometry.attributes.color.array);if(object.material?.color)values.push(...object.material.color.toArray());});
        return values;
      };
      const dispose=model=>{model.traverse(object=>{object.geometry?.dispose();for(const material of(Array.isArray(object.material)?object.material:[object.material]))material?.dispose();});model.removeFromParent();};
      const summary=[];
      for(const key of ['dog','dg_corgi','cat','ct_mackerel','ct_cheese','ct_tuxedo','ct_calico','ct_blackcat']){
        const model=pets.buildSculptedPet(key,'#9aa0b5');
        check(!!model,key+': supported World key builds a model');
        const resources=collect(model),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());
        check(resources.skins.length>0&&resources.bones.size>=13,key+': authored skin and complete rig survive loading');
        check([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),key+': finite bounds');
        check(Math.abs(bounds.min.y)<.035&&size.y>.7&&size.y<1.2,key+': model stands on the room floor at pet scale');
        for(const skin of resources.skins){
          check(skin.geometry.getAttribute('skinIndex')&&skin.geometry.getAttribute('skinWeight'),key+': skin attributes remain');
          check(skin.skeleton.bones.every(bone=>model.getObjectById(bone.id)===bone),key+': bones belong to this instance');
        }
        const compact=compactModel(model),after=collect(compact);
        check(after.skins.length===resources.skins.length,key+': static compaction retains all skinned meshes');
        check([...after.bones].every(bone=>compact.getObjectById(bone.id)===bone),key+': compaction retains the rig hierarchy');
        summary.push({key,skins:after.skins.length,bones:after.bones.size,height:size.y});dispose(compact);
      }
      for(const key of ['dg_poodle','ct_siamese','bunny','fox','unknown'])check(pets.buildSculptedPet(key,'#ffffff')===null,key+': unsupported breed keeps its original factory');

      const catPrints=new Set();
      for(const key of ['ct_cheese','ct_tuxedo','ct_calico','ct_blackcat']){
        const model=pets.buildSculptedPet(key);
        const fur=collect(model).skins.find(mesh=>mesh.material.name==='Silver tabby fur');
        const colors=fur.geometry.getAttribute('color'),positions=fur.geometry.getAttribute('position');
        let brightPaws=0,darkBody=0,warmPatches=0,brightBody=0;
        for(let i=0;i<colors.count;i++){
          const r=colors.getX(i),g=colors.getY(i),b=colors.getZ(i),y=positions.getY(i);
          if(y<.075&&r>.65&&g>.65&&b>.65)brightPaws++;
          if(y>.2&&r<.08&&g<.08&&b<.08)darkBody++;
          if(y>.2&&r>g*1.7&&g>b*1.5&&r>.2)warmPatches++;
          if(y>.2&&r>.7&&g>.7&&b>.7)brightBody++;
        }
        if(key==='ct_blackcat')check(brightPaws===0&&darkBody>100,'black cat has no inherited white socks or tabby stripes');
        if(key==='ct_tuxedo')check(brightPaws>100&&darkBody>100,'tuxedo retains both white socks and dark coat');
        if(key==='ct_calico')check(brightPaws>100&&darkBody>100&&warmPatches>100&&brightBody>100,'calico has light paws and three distinct coat colors');
        catPrints.add(JSON.stringify(Array.from(colors.array)));dispose(model);
      }
      check(catPrints.size===4,'four cat coats remain visually distinct');
      const painted=pets.buildSculptedPet('ct_calico'),original=fingerprints(painted);
      const otherPaint=pets.buildSculptedPet('ct_blackcat','#7f6888');dispose(otherPaint);
      check(fingerprints(painted).every((value,i)=>value===original[i]),'painting and disposing another coat does not mutate calico');dispose(painted);

      const a=pets.buildSculptedPet('dog','#c47948'),b=pets.buildSculptedPet('dog','#748aa8');
      const ra=collect(a),rb=collect(b);
      for(const name of ['geometries','materials','bones'])check([...ra[name]].every(value=>!rb[name].has(value)),name+': independent pet instances');
      const colorsA=fingerprints(a),colorsB=fingerprints(b);
      check(colorsA.length===colorsB.length&&colorsA.some((value,i)=>Math.abs(value-colorsB[i])>.02),'selected coat colors alter actual surface colors');
      const headA=a.userData.head,headB=b.userData.head;
      check(headA?.isBone&&headB?.isBone,'head motion targets rig bones');
      const before=headB.quaternion.clone();headA.rotation.x+=.23;
      check(headB.quaternion.equals(before),'posing one pet cannot move another pet');

      const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
      renderer.setSize(420,280);document.body.append(renderer.domElement);
      const scene=new THREE.Scene();scene.background=new THREE.Color('#eee6f5');
      scene.add(new THREE.HemisphereLight('#fff5e9','#a2a3be',2.5));
      const light=new THREE.DirectionalLight('#fff4e6',2);light.position.set(-2,4,4);scene.add(light);
      const camera=new THREE.PerspectiveCamera(36,1.5,.01,30);camera.position.set(2.2,1.8,4.2);camera.lookAt(0,.48,0);
      a.position.x=-.72;b.position.x=.72;scene.add(a,b);renderer.render(scene,camera);
      const geometriesBefore=renderer.info.memory.geometries;
      let otherDisposed=0;for(const geometry of rb.geometries)geometry.addEventListener('dispose',()=>otherDisposed++);
      dispose(a);renderer.render(scene,camera);
      check(otherDisposed===0,'disposing a room/portrait clone does not dispose another pet');
      check(renderer.info.memory.geometries<geometriesBefore,'disposed clone releases uploaded geometry');
      const c=pets.buildSculptedPet('dog','#c47948');check(!!c,'portrait disposal leaves template usable');
      check(fingerprints(c).every((value,i)=>value===colorsA[i]),'new clone keeps intact source surface colors');
      c.position.x=-.72;scene.add(c);renderer.render(scene,camera);
      check(renderer.info.render.triangles>20000,'both authored models render as detailed mesh geometry');
      const gl=renderer.getContext(),pixels=new Uint8Array(420*280*4);gl.readPixels(0,0,420,280,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let changed=0;for(let i=0;i<pixels.length;i+=4)if(Math.abs(pixels[i]-pixels[0])+Math.abs(pixels[i+1]-pixels[1])+Math.abs(pixels[i+2]-pixels[2])>35)changed++;
      check(changed>1000,'render contains visible pets rather than an empty canvas');
      dispose(b);dispose(c);renderer.dispose();
      pets.disposeSculptedPets();
      check(pets.buildSculptedPet('dog','#ffffff')===null,'cache disposal invalidates unloaded templates');
      const reloaded=await pets.preloadSculptedPets();check(reloaded.dog==='ready'&&reloaded.cat==='ready','a fresh scene reloads after full cache disposal');
      const fresh=pets.buildSculptedPet('cat','#9aa0b5');check(collect(fresh).skins.length>0,'fresh scene gets a healthy rig');dispose(fresh);pets.disposeSculptedPets();
      return {summary,changed};
    });
    assert.deepEqual(errors,[]);return result;
  }finally{await context.close();}
}

async function checkWorld(browser,failModels){
  const context=await fixtureContext(browser,{failModels}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto('https://fixture.test/world.html');await page.waitForSelector('.room3d-ready',{timeout:30000});
    const room=()=>page.frames().find(frame=>frame.url().includes('/room3d/index.html')&&!frame.url().includes('view='));
    const status=await room().evaluate(()=>Ojjuda3D.inspect().sculptedPets);
    assert.equal(status.dog,failModels?'failed':'ready');assert.equal(status.cat,failModels?'failed':'ready');
    const types=['dog','dg_corgi','cat','ct_mackerel','ct_cheese','ct_tuxedo','ct_calico','ct_blackcat','dg_poodle','ct_siamese','bunny'];
    await page.evaluate(types=>{
      roomTest.model.room.items=types.map((type,i)=>({id:'sculpted-'+type,type,gx:1+i%4*2,gy:1+Math.floor(i/4)*3,r:0,color:i%2?'#748aa8':'#c47948',pet:{name:type,love:73,full:40,joy:40,at:Date.now()}}));roomTest.refresh();
    },types);
    await room().waitForFunction(count=>Ojjuda3D.inspect().items.length===count,types.length);
    assert.deepEqual(await room().evaluate(()=>Ojjuda3D.inspect().items.map(item=>item.type)),types,'new art retains every saved pet type');
    const petArt=await room().evaluate(()=>Ojjuda3D.inspect().petArt);
    assert.deepEqual(petArt,Object.fromEntries(types.map((type,i)=>['sculpted-'+type,!failModels&&i<8?type:'legacy'])),'only the eight approved pets use sculpted art; all other breeds and load failures retain legacy models');
    // Fox is retained in the engine catalog but not currently listed by World’s
    // saved-item catalog. Exercise its real factory through an explicit frame
    // snapshot, then restore the adapter’s snapshot before checking account state.
    const foxArt=await room().evaluate(()=>{
      const current=Ojjuda3D.inspect();
      Ojjuda3D.applyRoom({key:current.key,editing:false,selected:null,nick:'fixture',avatar:current.avatar,pos:{x:4.5,z:4.5},surface:{wall:'#FFF2DD',floor:'wood'},items:[{id:'fox-regression',type:'fox',gx:1,gy:1,r:0,color:'#c47948',definition:{key:'fox',name:'여우',pet:true,kind:'floor',w:1,d:1,color:'#c47948',svg:''}}]});
      return Ojjuda3D.inspect().petArt['fox-regression'];
    });
    assert.equal(foxArt,'legacy','fox cannot indirectly inherit the sculpted cat factory');
    await page.evaluate(()=>roomTest.refresh());
    await room().waitForFunction(count=>Ojjuda3D.inspect().items.length===count,types.length);
    const savedBefore=await page.evaluate(()=>JSON.stringify(roomTest.model.room.items));
    for(const type of ['dog','cat','ct_cheese','ct_tuxedo','ct_calico','ct_blackcat']){
      await page.evaluate(type=>roomTest.petOpen('sculpted-'+type),type);
      await page.waitForSelector('#petscene[data-character-ready]',{timeout:30000});
      const pet=page.frames().find(frame=>frame.url().includes('view=pet'));
      assert.equal(await pet.evaluate(()=>Ojjuda3D.inspect().character.pet),type);
      assert.equal((await pet.evaluate(()=>Ojjuda3D.inspect().sculptedPets))[type==='dog'?'dog':'cat'],failModels?'failed':'ready');
      await page.locator('[data-act="pet-pat"]').click();
      assert.equal(await pet.evaluate(()=>Ojjuda3D.inspect().character.action),'pat','existing pet care remains interactive');
      if(!failModels){await page.setViewportSize({width:450,height:900});await page.screenshot({path:'/tmp/ojjuda-sculpted-'+type+'-care.png',fullPage:true});}
      await page.locator('#modal-root [data-act="close"]').click();
      await page.waitForSelector('#petscene',{state:'detached'});
    }
    const before=JSON.parse(savedBefore),after=await page.evaluate(()=>roomTest.model.room.items);
    assert.deepEqual(after.map(({pet,...item})=>item),before.map(({pet,...item})=>item),'previewing and petting preserve room placement and colors');
    assert.ok(after.find(item=>item.type==='dog').pet.love>=73&&after.find(item=>item.type==='cat').pet.love>=73,'pet care still updates existing pet stats');
    assert.equal(await page.locator('.room3d-ready').count(),1,'room keeps working after care previews are disposed');
    const image=await room().evaluate(()=>Ojjuda3D.itemPortrait({key:'dog',type:'dog',pet:true,kind:'floor',w:1,d:1,color:'#c47948',svg:''},'#c47948'));
    assert.ok(image?.startsWith('data:image/png;base64,'),'subsequent pet portrait renders after care disposal');
    const portraits=await room().evaluate(()=>Object.fromEntries(['fox','cat'].map(type=>[type,Ojjuda3D.itemPortrait({key:type,type,pet:true,kind:'floor',w:1,d:1,color:'#c47948',svg:''},'#c47948')])));
    assert.ok(portraits.fox?.startsWith('data:image/png;base64,'),'the existing fox factory still produces a real portrait');
    assert.notEqual(portraits.fox,portraits.cat,'fox keeps its own silhouette instead of inheriting the sculpted cat factory');
    if(!failModels)fs.writeFileSync('/tmp/ojjuda-fox-portrait.png',Buffer.from(portraits.fox.split(',')[1],'base64'));
    assert.deepEqual(errors,[]);return {fallback:failModels,status,petArt,foxArt};
  }finally{await context.close();}
}

async function checkDeadline(browser){
  const context=await fixtureContext(browser,{stallModels:true}),page=await context.newPage();
  try{
    await page.goto('https://fixture.test/pet-module-test.html');await page.waitForFunction(()=>window.petTest);
    const result=await page.evaluate(async()=>{const start=performance.now(),status=await petTest.pets.preloadSculptedPets({timeoutMs:180});return {status,elapsed:performance.now()-start,model:petTest.pets.buildSculptedPet('dog','#ffffff')};});
    assert.ok(result.elapsed<2500,'a stalled asset cannot hold loading indefinitely');
    assert.equal(result.status.dog,'timeout');assert.equal(result.status.cat,'timeout');assert.equal(result.model,null);
    return result;
  }finally{await context.close();}
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try{
    const models=await checkModels(browser),world=await checkWorld(browser,false),fallback=await checkWorld(browser,true),deadline=await checkDeadline(browser);
    console.log('PASS: authored pet rigs, coat choices, independent clones, skin-safe compaction, resource disposal, existing World care, missing/stalled asset fallback',JSON.stringify({models,world,fallback,deadline}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
