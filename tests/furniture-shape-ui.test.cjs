const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),version='20261005-blanketdata1';
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1050}}),errors=[];
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();
   if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<!doctype html><button id="open">제작실</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js?v=${version}';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'shape-fixture',authorized:()=>true});</script>`});
   if(u.pathname==='/_font.ttf'&&process.env.STUDIO_SHAPE_FONT)return route.fulfill({path:process.env.STUDIO_SHAPE_FONT});
   const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();return route.fulfill({path:file});
  });
  if(process.env.STUDIO_SHAPE_FONT)await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='@font-face{font-family:Proof;src:url(/_font.ttf)}body,button{font-family:Proof,sans-serif!important}';document.head.append(s);}));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('https://fixture.test/fixture');await page.locator('#open').click();
  const frame=await(await page.locator('iframe[title="관리자 가구 제작실"]').elementHandle()).contentFrame();
  await frame.locator('#studio-editor').waitFor({state:'visible'});
  const restore=async id=>frame.evaluate(async({id,version})=>{
   const r=await(await fetch('../assets/'+id+'.runtime.json')).json();
   const project={format:'ojjuda-furniture-set',version:1,name:r.name,objectType:'furniture',usage:'surface',dimensionStatus:'suggested',dimensions:r.dimensions,activeView:'left',views:{}};
   for(const [d,v]of Object.entries(r.views))project.views[d]={format:'ojjuda-furniture',version:1,name:r.name,objectType:'furniture',usage:'surface',dimensionStatus:'suggested',source:{name:d+'.png',data:v.drawings[0].data},cutout:{polygon:[],strokes:[]},layers:v.layers.length?v.layers:[{id:'source',name:'그림',source:[],target:[],binding:null}],placement:v.placement,mesh:v.mesh};
   await(await import('./app.js?v='+version)).studioRestore(project);
   const {prepareRuntime}=await import('./runtime.js?v='+version);
   await prepareRuntime(r); // Legacy saved records remain readable.
   let guarded=true;try{await prepareRuntime({...r,shapePolicy:1});}catch{guarded=false;}
   return {guarded,statuses:['left','center','right'].map(d=>document.querySelector('#status-'+d).textContent)};
  },{id,version});
  const bad=await restore('open-book-v1');assert.equal(bad.guarded,false);assert(bad.statuses.every(s=>s.includes('변형 과다')));
  assert(await frame.locator('#studio-apply').isDisabled());assert(await frame.locator('#export-set').isDisabled());assert(await frame.locator('#save-project').isEnabled());
  assert.equal(await frame.evaluate(async version=>{try{(await import('./app.js?v='+version)).studioBundle();return false;}catch{return true;}},version),true,'calling the export API directly cannot bypass the gate');
  if(process.env.STUDIO_SHAPE_PROOF){await frame.evaluate(()=>document.fonts.ready);await frame.locator('.set-overview').screenshot({path:process.env.STUDIO_SHAPE_PROOF});}
  const download=page.waitForEvent('download');await frame.locator('#save-project').click();const saved=await download;assert(saved.suggestedFilename().endsWith('.json'),'blocked drafts remain downloadable');
  const good=await restore('pencil-cup-v1');assert.equal(good.guarded,true);assert(await frame.locator('#studio-apply').isEnabled());
  await frame.locator('#studio-apply').click();await page.locator('iframe[title="우리집"]').waitFor();
  const home=await(await page.locator('iframe[title="우리집"]').elementHandle()).contentFrame();await home.locator('[data-furniture^="made-"][data-render-state="ready"]').waitFor();
  await home.locator('#exit').click();await page.locator('iframe[title="우리집"]').waitFor({state:'detached'});
  if(await frame.locator('body').getAttribute('data-mode')==='simple')await frame.locator('#mode-toggle').click();
  const group=frame.locator('details').filter({has:frame.locator('#depth')});if(await group.getAttribute('open')===null)await group.locator('summary').click();
  await frame.locator('#depth').fill('0.1');await frame.locator('#depth').dispatchEvent('change');
  assert(await frame.locator('#studio-apply').isDisabled(),'dimension edits invalidate readiness');
  await page.setViewportSize({width:390,height:844});assert(await frame.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert.deepEqual(errors,[]);console.log('Furniture shape UI PASS: bad book blocked, original comparison, draft save, valid item applied, edits rechecked, legacy readable, mobile fits');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
