const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const parent=`<button id="open">Open</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'history-performance-fixture',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext(),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:parent});const file=path.join(root,u.pathname);if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.abort();return route.fulfill({path:file});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('https://fixture.test/fixture');await page.locator('#open').click();
  const frame=page.frames().find(f=>f.url().includes('/anchor-editor/'));
  await frame.locator('#studio-side-table').click();await frame.waitForFunction(()=>!document.querySelector('#studio-apply').disabled);
  const result=await frame.evaluate(async()=>{
   const entry=await(await fetch(new URL('./entry.js',location.href))).text(),appURL=entry.match(/import\('(.\/app\.js[^']*)'\)/)[1],app=await import(appURL);
   const before=app.studioBundle().project;
   const stringify=JSON.stringify;let imageCharsSerialized=0;
   JSON.stringify=function(value,...args){if(value?.format==='ojjuda-furniture')imageCharsSerialized+=value.source?.data?.length||0;return stringify.call(this,value,...args);};
   const input=document.querySelector('#pos-y'),initial=Number(input.value),start=performance.now();
   for(let i=0;i<40;i++){input.value=String(i%2===0?0:1);input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
   const editMs=performance.now()-start;
   JSON.stringify=stringify;
   for(let i=0;i<40;i++)document.querySelector('#undo').click();
   const after=app.studioBundle().project;
   const same=stringify(before)===stringify(after);
   await app.studioFlush();
   // Draft module identity follows entry.js, independently of the app cache.
   const draftURL=entry.match(/from '(.\/draft-store\.js[^']*)'/)[1];
   const saved=await(await import(draftURL)).loadDraft();
   return {editMs,imageCharsSerialized,sourceBytes:before.views[before.activeView].source.data.length,same,initial,restored:Number(input.value),undoDisabled:document.querySelector('#undo').disabled,draftMatches:Object.keys(before.views).every(d=>saved.project.views[d].source.data===before.views[d].source.data&&JSON.stringify(saved.project.views[d].placement)===JSON.stringify(before.views[d].placement))};
  });
  console.log(JSON.stringify(result));assert(result.same,'40 undos must restore the complete native project');assert(result.draftMatches);assert(result.undoDisabled);assert.equal(result.restored,result.initial);assert.deepEqual(errors,[]);
  if(!process.env.STUDIO_PERF_BASELINE)assert.equal(result.imageCharsSerialized,0,'history must not serialize full image strings');
  console.log('STUDIO HISTORY PERFORMANCE PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
