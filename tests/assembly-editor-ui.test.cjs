const {chromium}=require('playwright'),fs=require('fs'),path=require('path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.resolve(process.env.QA_OUTPUT_DIR||path.join(root,'..','sofa-system-review'));
const parent=`<button id="open">제작실</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'assembly-review',authorized:()=>true});</script>`;
(async()=>{fs.mkdirSync(out,{recursive:true});const browser=await chromium.launch({headless:true,args:['--no-sandbox']});try{
 const context=await browser.newContext({viewport:{width:1440,height:1100},deviceScaleFactor:1.5}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='fixture.test')return r.abort();if(u.pathname==='/fixture')return r.fulfill({contentType:'text/html',body:parent});const f=path.resolve(root,'.'+u.pathname);return f.startsWith(root+path.sep)&&fs.existsSync(f)&&fs.statSync(f).isFile()?r.fulfill({path:f}):r.abort();});
 await page.goto('https://fixture.test/fixture');await page.locator('#open').click();const frame=page.frameLocator('iframe[title="관리자 가구 제작실"]');await frame.locator('#studio-editor').waitFor({state:'visible'});
 await frame.locator('#assembly-open').click();await frame.locator('#assembly-example').click();await frame.locator('#assembly-apply').waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('iframe').contentDocument.querySelector('#assembly-apply').disabled===false);
 await frame.locator('#assembly-guides').uncheck();await frame.locator('#assembly-dialog').screenshot({path:path.join(out,'sofa-system-editor.png')});
 await frame.locator('#assembly-width').fill('3.4');await frame.locator('#assembly-width').dispatchEvent('change');await frame.locator('#assembly-height').fill('2');await frame.locator('#assembly-height').dispatchEvent('change');assert.equal(await frame.locator('#assembly-near-height').inputValue(),'1.04','whole-height resize includes the attached support');
 await frame.locator('#assembly-width').fill('3.5');await frame.locator('#assembly-width').dispatchEvent('change');await frame.locator('#assembly-height').fill('1.8');await frame.locator('#assembly-height').dispatchEvent('change');
 await frame.locator('#assembly-file').setInputFiles(path.join(root,'house-test/assets/sofa-original-layers-v1/body.png'));await frame.locator('#assembly-dialog:not([aria-busy])').waitFor();assert(await frame.locator('#assembly-apply').isDisabled(),'a replacement body requires its own four measured points');
 const coords=await frame.locator('#assembly-source').evaluate(c=>{const r=c.getBoundingClientRect(),k=Math.min((c.width-40)/970,(c.height-40)/858),x=(c.width-970*k)/2,y=(c.height-858*k)/2;return [[10,250],[620,0],[949,559],[506,857]].map(([px,py])=>({x:(x+px*k)*r.width/c.width,y:(y+py*k)*r.height/c.height}));});
 for(const position of coords)await frame.locator('#assembly-source').click({position});assert.equal(await frame.locator('#assembly-apply').isDisabled(),false,'the measured body rejoins the supports');
 await frame.locator('#assembly-near-height').fill('0.85');await frame.locator('#assembly-near-height').dispatchEvent('input');await frame.locator('#assembly-body-near').fill('1.5');await frame.locator('#assembly-body-near').dispatchEvent('input');
 await frame.locator('#assembly-apply').click();await frame.locator('#assembly-dialog').waitFor({state:'hidden'});assert.equal(await frame.locator('body').getAttribute('data-assembly'),'true');assert.equal(await frame.locator('#status-left').textContent(),'밑면 맞춤 완료');assert(await frame.locator('#studio-apply').isDisabled(),'unprovided directions are not invented');
 const editor=page.frames().find(f=>f.url().includes('/anchor-editor/index.html'));
 await editor.evaluate(async()=>{const source=await(await fetch('./entry.js')).text(),url=source.match(/import\('(.\/app\.js[^']*)'\)/)[1];await(await import(url)).studioFlush();});
 const before=await editor.evaluate(async()=>{const {loadDraft}=await import('./draft-store.js?v=20261006-assembly1');const d=await loadDraft();return {version:d.project.version,assembly:d.project.views.left.pictureAssembly,views:Object.keys(d.project.views)};});
 assert.equal(before.version,2);assert.equal(before.assembly.sides.near.height,.85);assert.equal(before.assembly.body.nearHeight,1.5);
 await page.getByRole('button',{name:'제작실 닫기',exact:true}).click();await page.locator('iframe').waitFor({state:'detached'});await page.locator('#open').click();await frame.locator('#studio-editor').waitFor({state:'visible'});await frame.locator('#draft-resume').click();await frame.locator('body[data-assembly="true"]').waitFor();await frame.locator('#assembly-open').click();assert.equal(await frame.locator('#assembly-near-height').inputValue(),'0.85');assert.equal(await frame.locator('#assembly-body-near').inputValue(),'1.5');
 await frame.locator('#assembly-near-height').fill('0.75');await frame.locator('#assembly-near-height').dispatchEvent('input');await frame.locator('#assembly-cancel').click();await frame.locator('#assembly-open').click();assert.equal(await frame.locator('#assembly-near-height').inputValue(),'0.85','cancel keeps the saved adjustment');
 await page.setViewportSize({width:390,height:844});await frame.locator('#assembly-dialog').screenshot({path:path.join(out,'sofa-system-mobile.png')});assert(await page.frames().find(f=>f.url().includes('/anchor-editor/index.html')).evaluate(()=>{const d=document.querySelector('#assembly-dialog');return d.scrollWidth<=d.clientWidth+1;}),'mobile editor has no horizontal overflow');
 await frame.locator('#assembly-cancel').click();await page.setViewportSize({width:1440,height:1100});
 // Independently authored synthetic pictures exercise all three directions;
 // the user's single approved side view is never mirrored into missing views.
 const editorAgain=page.frames().find(f=>f.url().includes('/anchor-editor/index.html'));
 await editorAgain.evaluate(async()=>{
  const url=(await(await fetch('./entry.js')).text()).match(/import\('(.\/app\.js[^']*)'\)/)[1],app=await import(url),dims={width:3.5,depth:1.5,height:1.8};
  const png=(w,h,paint)=>{const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'));return {data:c.toDataURL(),width:w,height:h,name:'workflow-test.png'};};
  const side=png(400,500,c=>{c.fillStyle='#b28dd4';c.fillRect(0,0,400,400);c.fillStyle='#c99457';c.fillRect(0,400,400,45);c.fillRect(20,445,65,55);c.fillRect(315,445,65,55);});
  const project={format:'ojjuda-furniture-set',version:2,name:'겹치기 확인 가구',objectType:'furniture',usage:'floor',dimensionStatus:'suggested',dimensions:dims,activeView:'left',views:{}};
  for(const direction of ['left','center','right']){
   const anchors=(direction==='left'?[[0,220],[520,0],[1000,480],[500,800]]:direction==='right'?[[1000,220],[480,0],[0,480],[500,800]]:[[0,0],[1000,0],[1000,800],[0,800]]).map(([x,y])=>({x,y}));
   const body=png(1000,800,c=>{c.fillStyle='#d1b0e8';c.beginPath();anchors.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill();});
   const panel={source:side,supportY:400,footY:500,feetX:[52,348],height:.98,supportHeight:.18,length:direction==='center'?.14:1,supportX:.98};
   const assembly={version:1,direction,dimensions:dims,sides:{near:panel,far:structuredClone(panel)},body:{source:body,anchors,nearHeight:1.45,farHeight:1.34,nearInset:direction==='center'?.08:.1,farInset:direction==='center'?.92:.28}};
   project.views[direction]={format:'ojjuda-furniture',version:2,name:project.name,objectType:'furniture',usage:'floor',dimensionStatus:'suggested',source:body,cutout:{polygon:[],strokes:[]},layers:[{id:'source',name:'그림',source:[],target:[],binding:null}],placement:{...dims,direction,x:direction==='right'?8.5:direction==='center'?3.25:0,y:3},pictureAssembly:assembly};
  }
  await app.studioRestore(project);const bundle=app.studioBundle();if(bundle.runtime.version!==2)throw new Error('Assembly runtime version missing');
 });
 await frame.locator('#studio-apply').click();const home=page.frameLocator('iframe[title="우리집"]');await home.locator('[data-furniture^="made-"][data-render-state="ready"]').waitFor();
 const id=await home.locator('[data-furniture^="made-"]').getAttribute('data-furniture');
 await home.locator('button[data-direction="right"]:not(.furniture)').click();await home.locator('[data-furniture^="made-"][data-direction="right"][data-render-state="ready"]').waitFor();
 assert(await home.locator('#placement-done').isDisabled(),'the existing desk still blocks an overlapping installation');
 await home.locator('#bookshelf-gap').evaluate(el=>{el.value='2';el.dispatchEvent(new Event('input',{bubbles:true}));});await home.locator('#placement-done').click();
 await page.getByRole('button',{name:'우리집 닫기',exact:true}).click();await frame.locator('#studio-refresh').click();await frame.locator(`#studio-saved-items option[value="${id}"]`).waitFor({state:'attached'});await frame.locator('#studio-saved-items').selectOption(id);await frame.locator('#studio-open-saved').click();await frame.locator('#assembly-open').click();assert.equal(await frame.locator('#assembly-near-height').inputValue(),'0.98');await frame.locator('#assembly-cancel').click();
 await frame.locator('#studio-home').click();await home.locator(`[data-furniture="${id}"][data-direction="right"][data-render-state="ready"]`).waitFor();
 assert.deepEqual(errors,[]);console.log('Assembly UI PASS: example, height, draft restore, cancel, mobile, three-view runtime, room apply, rotate, save and reopen.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
