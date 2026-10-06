const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),root=path.resolve(__dirname,'..');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});try{
 const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/fixture')return route.fulfill({contentType:'text/html',body:`<button id="open">제작실</button><script type="module">import{openFurnitureStudio}from'/house-test/studio-host.js?v=20261006-sofaparts1';document.querySelector('#open').onclick=()=>openFurnitureStudio({owner:'chair-back-test',authorized:()=>true});</script>`});const file=path.resolve(root,'.'+u.pathname);return file.startsWith(root+path.sep)&&fs.existsSync(file)?route.fulfill({path:file}):route.abort();});
 await page.goto('https://fixture.test/fixture');await page.locator('#open').click();await page.frameLocator('iframe').locator('#studio-editor').waitFor({state:'visible'});
 const frame=page.frames().find(f=>f.url().includes('/anchor-editor/index.html'));
 const nativeProject=process.env.CHAIR_NATIVE_PROJECT?JSON.parse(fs.readFileSync(process.env.CHAIR_NATIVE_PROJECT)):null;
 const result=await frame.evaluate(async nativeProject=>{
  const app=await import((await(await fetch('./entry.js')).text()).match(/import\('(.\/app\.js[^']*)'\)/)[1]),{straightenChairLegs}=await import('../chair-straight-regions.js?v=20261006-sofaparts1'),{prepareRuntime,renderRuntime}=await import('./runtime.js?v=20261006-sofaparts1');
  const raw=await(await fetch('../assets/chair-v1.runtime.json')).json(),views={};
  for(const[d,v]of Object.entries(raw.views))views[d]={format:'ojjuda-furniture',version:1,name:raw.name,objectType:'furniture',usage:'floor',source:{name:d+'.png',data:v.drawings[0].data},cutout:{polygon:[],strokes:[]},layers:v.layers,mesh:v.mesh,placement:{...v.placement,...(d==='left'?{x:4.5,y:5.5}:{})}};
  const project=nativeProject||{format:'ojjuda-furniture-set',version:1,name:raw.name,objectType:'furniture',usage:'floor',dimensions:raw.dimensions,activeView:'left',views};
  project.views.left.placement.x=4.5;project.views.left.placement.y=5.5;
  project.views.right.placement.x=5.5;project.views.right.placement.y=5.5;
  await app.studioRestore(project);const first=app.studioBundle();await app.studioRestore(first.project);const second=app.studioBundle(),builtin=straightenChairLegs(structuredClone(raw));
  const a=await prepareRuntime(builtin),b=await prepareRuntime(second.runtime),same=[];
  for(const[d,v]of Object.entries(second.runtime.views)){
   if(JSON.stringify(v.mesh)!==JSON.stringify(builtin.views[d].mesh))throw Error(d+' studio/room geometry differs');
   const x=renderRuntime(a,v.placement),y=renderRuntime(b,v.placement);same.push(x.canvas.toDataURL()===y.canvas.toDataURL());
  }
  return {complete:first.project.complete,stable:JSON.stringify(first.runtime)===JSON.stringify(second.runtime),same,sourcePreserved:Object.keys(views).every(d=>second.project.views[d].source.data===project.views[d].source.data),placement:second.runtime.views.left.placement};
 },nativeProject);
 assert(result.complete);assert(result.stable);assert(result.sourcePreserved);assert.deepEqual(result.same,[true,true,true]);assert.equal(result.placement.x,4.5);assert.equal(result.placement.y,5.5);assert.deepEqual(errors,[]);console.log('CHAIR BACK STUDIO PASS',result);
 }finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
