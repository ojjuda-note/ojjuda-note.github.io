const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
const proof=process.env.DESK_FRAME_PROOF_DIR||path.resolve(root,'../desk-frame-proof');
const projectPath=path.join(root,'house-test/assets/desk-frame-v1.furniture-set.json');
const original=JSON.parse(fs.readFileSync(projectPath));
const runtime=JSON.parse(fs.readFileSync(path.join(root,'house-test/assets/desk-frame-v1.runtime.json')));
const id='item-desk-frame',owner='desk-frame-test',key='ojjuda-house-playtest-v1:'+owner;
const version=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/furniture-catalog\.js\?v=([^"']+)/)[1];
const modelVersion=fs.readFileSync(path.join(root,'house-test/app.js'),'utf8').match(/model\.js\?v=([^"']+)/)[1];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  fs.mkdirSync(proof,{recursive:true});const context=await browser.newContext({viewport:{width:1280,height:960}}),errors=[],missing=[],requests=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();requests.push(u.pathname);
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="home">우리집</button><button id="studio">제작실</button><script type="module">import{openHouseTest}from'/house-test/host.js?v=${version}';import{openFurnitureStudio}from'/house-test/studio-host.js?v=${version}';document.querySelector('#home').onclick=()=>openHouseTest({owner:'${owner}',authorized:()=>true});document.querySelector('#studio').onclick=()=>openFurnitureStudio({owner:'${owner}',authorized:()=>true});</script>`});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){missing.push(u.pathname);return route.abort();}return route.fulfill({path:file});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());await page.clock.setFixedTime(new Date('2026-10-07T12:00:00+09:00'));await page.goto('https://fixture.test/fixture');
  // Open the actual approved editable file, save it through the editor UI, and reopen that download.
  await page.locator('#studio').click();const editor=await(await page.locator('iframe[title="관리자 가구 제작실"]').elementHandle()).contentFrame();
  await editor.locator('#studio-editor').waitFor({state:'visible'});await editor.locator('#project-file').setInputFiles(projectPath);
  await editor.waitForFunction(()=>!document.querySelector('#studio-apply').disabled);
  const downloadPromise=page.waitForEvent('download');await editor.locator('#save-project').click();const download=await downloadPromise;
  const reopenedPath=path.join(proof,'desk-frame-reopened.furniture-set.json');await download.saveAs(reopenedPath);
  const savedProject=JSON.parse(fs.readFileSync(reopenedPath));assert(savedProject.complete);assert.deepEqual(savedProject.dimensions,original.dimensions);
  for(const d of ['left','center','right'])for(const field of ['source','mesh','placement'])assert.deepEqual(savedProject.views[d][field],original.views[d][field],d+' '+field+' survives editor saving');
  await editor.locator('#project-file').setInputFiles(reopenedPath);await editor.waitForFunction(()=>document.querySelector('#save-status').textContent==='불러옴'&&!document.querySelector('#studio-apply').disabled);
  const editorChecks=await editor.evaluate(async version=>{
   const app=await import('./app.js?v='+version),rt=await import('./runtime.js?v='+version),bundle=app.studioBundle();
   const expected=await rt.prepareRuntime(await(await fetch('../assets/desk-frame-v1.runtime.json')).json()),actual=await rt.prepareRuntime(bundle.runtime);
   const views={};for(const d of ['left','center','right']){
    const p=expected.runtime.views[d].placement,a=rt.renderRuntime(expected,p).canvas,b=rt.renderRuntime(actual,p).canvas;
    const aa=a.getContext('2d').getImageData(0,0,a.width,a.height).data,bb=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
    views[d]=a.width===b.width&&a.height===b.height&&aa.every((v,i)=>v===bb[i]);
   }return {complete:bundle.project.complete,shapePolicy:bundle.runtime.shapePolicy,views};
  },version);
  assert(editorChecks.complete);assert.equal(editorChecks.shapePolicy,1);assert(Object.values(editorChecks.views).every(Boolean),'editor round trip retains rendered pixels');
  await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();await page.locator('iframe').waitFor({state:'detached'});
  const saved={version:13,rooms:[{x:0,y:0,decor:true,curtains:true,shelf:null,furniture:{desk:{direction:'right',x:9,y:3.5},'desk-lamp':{direction:'right',x:9.05,y:5.55,elevation:1.4}}}],diary:'액자 추가 전 기록 보존'};
  await page.evaluate(({key,saved})=>localStorage.setItem(key,JSON.stringify(saved)),{key,saved});const read=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
  const runtimeRequests=()=>requests.filter(p=>p.endsWith('/desk-frame-v1.runtime.json')).length,beforeHouse=runtimeRequests();
  await page.locator('#home').click();const f=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();await f.locator('#app').waitFor({state:'visible'});await f.locator('[data-tab="room"]').click();
  const node=()=>f.locator('[data-furniture="'+id+'"][data-render-state="ready"]');
  const ready=async()=>{await node().waitFor();await node().locator('canvas').waitFor({state:'attached'});};
  const pose=()=>node().evaluate(el=>({direction:el.dataset.direction,x:Number(el.dataset.x),y:Number(el.dataset.y),elevation:Number(el.dataset.elevation)}));
  const lampInFront=()=>f.evaluate(()=>{const frame=document.querySelector('[data-furniture="item-desk-frame"]'),lamp=document.querySelector('[data-furniture="desk-lamp"]');return Number(lamp.style.zIndex)>Number(frame.style.zIndex)||(lamp.style.zIndex===frame.style.zIndex&&!!(frame.compareDocumentPosition(lamp)&Node.DOCUMENT_POSITION_FOLLOWING));});
  assert.equal(runtimeRequests(),beforeHouse);assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'탁상 액자 놓기',exact:true}).click();await ready();
  for(const d of ['left','center','right']){
   await f.locator('#panel button[data-direction="'+d+'"]').click();await ready();const p=runtime.views[d].placement;
   assert.deepEqual(await pose(),{direction:d,x:p.x,y:p.y,elevation:1.4});assert(await f.locator('#placement-done').isEnabled());assert.deepEqual(await read(),saved);
   assert(await node().locator('canvas').evaluate(c=>c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=>i%4===3&&v>0)));
  }
  assert(await lampInFront(),'the nearer lamp occludes the frame even when the frame is added last');
  const behavior=await f.evaluate(async({version,modelVersion,owner,id})=>{
   const suffix='?v='+version,m=await import('/house-test/model.js?v='+modelVersion),{FURNITURE}=await import('/house-test/furniture-catalog.js'+suffix),{listMadeItems}=await import('/house-test/custom-store.js'+suffix);
   const p=FURNITURE[id].preferredViews.right,desk={id:'desk',direction:'right',x:9,y:3.5},lamp={id:'desk-lamp',direction:'right',x:9.05,y:5.55,elevation:1.4};
   return {slots:(await listMadeItems(owner)).length,deskAndLampAllowed:m.canPlaceFurniture(id,p,[desk,lamp]),duplicateBlocked:!m.canPlaceFurniture(id,p,[{id,...p}]),sameHeightLampBlocked:!m.canPlaceFurniture(id,p,[desk,{...lamp,x:p.x,y:p.y}])};
  },{version,modelVersion,owner,id});assert.equal(behavior.slots,0);for(const [name,value]of Object.entries(behavior))if(name!=='slots')assert(value,name);
  await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),saved);
  await f.getByRole('button',{name:'탁상 액자 놓기',exact:true}).click();await ready();await f.locator('#panel button[data-direction="right"]').click();await ready();await f.locator('#placement-done').click();
  const installed=structuredClone(saved),p=runtime.views.right.placement;installed.rooms[0].furniture[id]={direction:'right',x:p.x,y:p.y,elevation:p.elevation};assert.deepEqual(await read(),installed);
  await f.locator('#overview').click();await page.screenshot({path:path.join(proof,'desk-frame-house.png')});
  await Promise.all([f.waitForNavigation({waitUntil:'domcontentloaded'}),f.evaluate(()=>location.reload())]);await f.locator('#app').waitFor({state:'visible'});await ready();assert.deepEqual(await read(),installed);assert(await lampInFront(),'reopening retains natural lamp occlusion');
  await f.locator('[data-tab="room"]').click();await f.getByRole('button',{name:'소품',exact:true}).click();await f.getByRole('button',{name:'탁상 액자 배치',exact:true}).click();await f.locator('#panel button[data-direction="left"]').click();await ready();await f.getByRole('button',{name:'취소',exact:true}).click();assert.deepEqual(await read(),installed);
  await f.getByRole('button',{name:'탁상 액자 배치',exact:true}).click();await f.locator('#placement-recall').click();assert.deepEqual(await read(),saved);
  assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);fs.writeFileSync(path.join(proof,'verification.json'),JSON.stringify({editorChecks,behavior,saveCancelReopenRecall:true,approvedRightPose:installed.rooms[0].furniture[id],errors,missing},null,2));
  console.log('DESK FRAME PASS: native editor save/reopen, identical pixels, three catalog views, desk/lamp collision, no auto-placement or private slots, save/cancel/reopen/recall');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
