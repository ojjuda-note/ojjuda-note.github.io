const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fixture=`<!doctype html><button id="open">Open</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'brush-performance-fixture',authorized:()=>true});</script>`;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox'],executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 try{
  const context=await browser.newContext({viewport:{width:1280,height:1000}}),errors=[];
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:fixture});const file=path.join(root,u.pathname);if(!file.startsWith(root+'/')||!fs.existsSync(file))return route.abort();return route.fulfill({path:file});});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto('https://fixture.test/fixture');await page.locator('#open').click();
  const frame=page.frames().find(f=>f.url().includes('/anchor-editor/'));
  await frame.locator('#studio-side-table').click();await frame.waitForFunction(()=>!document.querySelector('#studio-apply').disabled);
  await frame.evaluate(async()=>{
   const entry=await(await fetch('./entry.js')).text();window.editor=await import(entry.match(/import\('(.\/app\.js[^']*)'\)/)[1]);
   window.before=editor.studioBundle();window.active=before.project.activeView;
   window.originalCreate=document.createElement;window.created=[];
   document.createElement=function(tag,...args){const node=originalCreate.call(this,tag,...args);if(tag==='canvas')created.push(node);return node;};
   document.querySelector('[data-tool="erase"]').click();
  });
  const box=await frame.locator('#source-canvas').boundingBox();
  const start={x:box.x+box.width*.4,y:box.y+box.height*.55};
  const measures=[];
  for(const finish of ['frame','pointerup','pointercancel','escape']){
   await frame.evaluate(tool=>document.querySelector(`[data-tool="${tool}"]`).click(),finish==='pointerup'?'restore':'erase');
   await page.mouse.move(start.x,start.y);await page.mouse.down();
   measures.push(await frame.evaluate(async finish=>{
    const canvas=document.querySelector('#source-canvas'),r=canvas.getBoundingClientRect();created.length=0;
    const source=before.project.views[active].source;
    const allocations=()=>created.filter(c=>c.width===source.width&&c.height===source.height).length;
    for(let i=1;i<=80;i++)canvas.dispatchEvent(new PointerEvent('pointermove',{pointerId:1,clientX:r.x+r.width*.4+i,clientY:r.y+r.height*.55,buttons:1,bubbles:true}));
    const duringBurst=allocations();
    if(finish==='frame')await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(finish==='escape')window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    else canvas.dispatchEvent(new PointerEvent(finish==='pointercancel'?'pointercancel':'pointerup',{pointerId:1,bubbles:true}));
    return {finish,duringBurst,afterFinish:allocations()};
   },finish));
   await page.mouse.up();
  }
  const check=await frame.evaluate(async()=>{
   document.createElement=originalCreate;
   const bundle=editor.studioBundle(),view=bundle.project.views[active];
   const source=new Image();source.src=view.source.data;await source.decode();
   // Compare the coalesced result with a full replay of every saved brush point.
   const appSource=await(await fetch('./app.js')).text(),cutoutURL=appSource.match(/from '(.\/cutout\.js[^']*)'/)[1];
   const {createCutout}=await import(cutoutURL);
   const expected=createCutout(source,view.cutout.polygon,view.cutout.strokes).toDataURL('image/png');
   const pixelsMatch=bundle.runtime.views[active].drawings[0].data===expected;
   const pointCounts=view.cutout.strokes.map(s=>s.points.length);
   await editor.studioFlush();
   const entry=await(await fetch('./entry.js')).text(),draft=await(await import(entry.match(/from '(.\/draft-store\.js[^']*)'/)[1])).loadDraft();
   const savedStrokes=JSON.stringify(draft.project.views[active].cutout)===JSON.stringify(view.cutout);
   for(let i=0;i<4;i++)document.querySelector('#undo').click();
   const restored=editor.studioBundle();
   return {pixelsMatch,pointCounts,savedStrokes,sourcePreserved:view.source.data===before.project.views[active].source.data,undoMatches:JSON.stringify(restored)===JSON.stringify(before)};
  });
  console.log(JSON.stringify({measures,...check}));
  assert(check.pixelsMatch);assert(check.savedStrokes);assert(check.sourcePreserved);assert(check.undoMatches);assert.deepEqual(check.pointCounts,[81,81,81,81]);assert.deepEqual(errors,[]);
  if(!process.env.STUDIO_PERF_BASELINE)for(const m of measures){assert.equal(m.duringBurst,0,'brush events must not allocate full image canvases before the frame');assert(m.afterFinish<=3,'each burst must rebuild the cutout at most once');}
  console.log('STUDIO BRUSH PERFORMANCE PASS');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
