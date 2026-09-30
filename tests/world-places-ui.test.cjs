const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-room.js','world-characters.js','world-places.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.placeTest={model:$,state:g,enter:xf,sync:Sr,step:Ff,catalog:q,definition:worldItemDefinition,places:Pt,house:H,
   freeze(){clearInterval(g.placeT);g.placeT=null;},snapshot:()=>worldPlace3D&&worldPlace3D.sync()};
 g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const context=await browser.newContext({viewport:{width:660,height:900},hasTouch:true,reducedMotion:'reduce'});
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://fixture.test/world.html');await page.waitForSelector('.room3d-ready');
 await page.locator('[data-mode="room"]').click();await page.waitForSelector('.room3d-ready');
 await page.locator('[data-item-preview]').first().scrollIntoViewIfNeeded();
 await page.waitForSelector('[data-item-preview][data-portrait-ready] img');
 assert.match(await page.locator('[data-item-preview][data-portrait-ready] img').first().getAttribute('src'),/^data:image\/png/,'furniture cards use rendered 3D models');
 const variants=await page.evaluate(()=>Object.keys(placeTest.catalog).filter(k=>/^(pot_|mat_|curtain_)/.test(k)).map(placeTest.definition));
 const room=page.frames().find(f=>f.url().includes('/room3d/index.html')&&!f.url().includes('view='));
 const fingerprints=await room.evaluate(defs=>defs.map(d=>({key:d.key,image:Ojjuda3D.itemPortrait(d)})),variants);
 assert.ok(fingerprints.every(x=>x.image),'variant previews render');
 for(const prefix of ['pot_','mat_','curtain_']){const group=fingerprints.filter(x=>x.key.startsWith(prefix));assert.equal(new Set(group.map(x=>x.image)).size,group.length,prefix+' choices retain distinct visible models/patterns');}
 const frame=()=>page.frames().find(f=>f.url().includes('view=place'));
 async function enter(id){await page.evaluate(id=>{placeTest.enter(id,1);placeTest.freeze();},id);await page.waitForSelector('.place3d-ready');await frame().waitForFunction(id=>Ojjuda3D.inspect().place?.id===id&&Ojjuda3D.inspect().renderFrame>0,id);}
 async function changePeople(change){const before=await frame().evaluate(()=>Ojjuda3D.inspect().renderFrame);await page.evaluate(change);await frame().waitForFunction(before=>Ojjuda3D.inspect().renderFrame>before,before);}
 async function tap(kind,id){await page.locator('.place3d-frame').scrollIntoViewIfNeeded();const point=await frame().evaluate(({kind,id})=>Ojjuda3D.projectPlaceTarget(kind,id),{kind,id});assert.ok(point,'projected '+kind);const box=await page.locator('.place3d-frame').boundingBox();await page.mouse.click(box.x+point.x,box.y+point.y);}
 const statistics=[];
 for(const id of ['cafe','library','park','arcade']){
   await enter(id);const state=await frame().evaluate(()=>Ojjuda3D.inspect());
   assert.equal(state.place.props.length,await page.evaluate(id=>placeTest.places[id].props.length,id));assert.ok(state.place.people.includes('me'));assert.ok(state.place.people.includes('staff'));
   assert.equal(await page.locator('#place-svg').isVisible(),false);assert.ok(await page.locator('#pmsg').count());
   if(id==='library')assert.ok(await page.locator('#quizcard').isVisible());
   await frame().evaluate(()=>window.rendererMarker='retained');
   await page.evaluate(()=>{for(let i=0;i<20;i++)placeTest.sync();});
   assert.equal(await frame().evaluate(()=>window.rendererMarker),'retained');
   await page.screenshot({path:'/tmp/ojjuda-place-'+id+'-verified.png',fullPage:true});
   statistics.push({id,calls:state.place.calls,geometries:state.geometries});
 }
 // Random visitors can stand in front of a table. First verify that such a
 // foreground person still opens their profile, then keep a known clear layout
 // for the game tests so the projected table point actually hits the table.
 await changePeople(()=>{const p=placeTest.state.place;p.npcs=[{...p.npcs[0],avatar:{...placeTest.model.avatar},gx:9,gy:4,seat:0,target:null}];p.bubbles=[];placeTest.sync();});
 await tap('item','p3_12');await page.waitForSelector('#modal-root .npcp');
 await page.locator('#modal-root [data-act="close"]').click();
 await changePeople(()=>{placeTest.state.place.npcs[0].gx=8;placeTest.state.place.npcs[0].gy=8;placeTest.sync();});
 // Realtime assigns a channel after initial mount. New taps must remain usable,
 // while callbacks captured for the previous channel cannot act on this one.
 await page.evaluate(()=>{const old=document.querySelector('.place3d-frame').contentWindow.Ojjuda3D.hooks.onPlaceTap;placeTest.state.place.ch=2;placeTest.sync();old({x:0,z:0});});
 assert.equal(await page.evaluate(()=>placeTest.state.place.me.target),null,'old channel callbacks are ignored');
 await tap('item','p3_0');await page.waitForSelector('#gov');
 assert.match(await page.locator('#gov').getAttribute('aria-label'),/두더지/);
 await page.locator('[data-g="close"]').click();assert.equal(await page.locator('#gov').count(),0);
 for(const [id,label] of [['p3_8','당구'],['p3_9','체스'],['p3_12','장기']]){await tap('item',id);await page.waitForSelector('#bd-menu');assert.ok((await page.locator('#bd-menu').textContent()).includes(label));await page.locator('#modal-root [data-act="close"]').click();}
 // Use an isolated existing actor to verify the real profile action, not a mock.
 await page.evaluate(()=>{const p=placeTest.state.place;p.npcs=[{...p.npcs[0],gx:8,gy:8,seat:0,target:null}];p.bubbles=[];placeTest.sync();});
 const person=await page.evaluate(()=>placeTest.state.place.npcs[0].id);
 await tap('person',person);await page.waitForSelector('#modal-root .npcp');await page.locator('#modal-root [data-act="close"]').click();
 await page.evaluate(()=>{const p=placeTest.state.place;p.npcs=[];p.staff=null;placeTest.sync();});
 await tap('floor',{x:5.5,z:8.5});
 assert.deepEqual(await page.evaluate(()=>({gx:placeTest.state.place.me.target?.gx,gy:placeTest.state.place.me.target?.gy})),{gx:5,gy:8});
 await page.evaluate(()=>{const p=placeTest.state.place;for(let i=0;i<4;i++)placeTest.step(p,p.me);placeTest.sync();});
 assert.equal(await page.evaluate(()=>placeTest.state.place.me.gy),8);
 await page.locator('#pmsg').fill('입체 공간에서 안녕하세요');await page.locator('[data-act="pl-send"]').click();
 await page.waitForFunction(()=>document.querySelector('#plog').textContent.includes('입체 공간에서 안녕하세요'));
 await page.evaluate(()=>window.stalePlaceTap=document.querySelector('.place3d-frame').contentWindow.Ojjuda3D.hooks.onPlaceTap);
 await enter('cafe');await page.evaluate(()=>{placeTest.state.place.npcs=[];placeTest.state.place.staff=null;placeTest.state.place.bubbles=[];placeTest.sync();window.stalePlaceTap({x:0,z:0});});
 assert.equal(await page.evaluate(()=>placeTest.state.place.me.target),null,'a detached place cannot move the new avatar');
 await tap('item','p0_15');
 const target=await page.evaluate(()=>placeTest.state.place.me.target);assert.ok(target?.lift>0,'chair taps preserve the existing sitting target');
 await page.evaluate(()=>{const p=placeTest.state.place;p.me.gx=p.me.target.gx;p.me.gy=p.me.target.gy;placeTest.step(p,p.me);placeTest.sync();});
 assert.ok(await page.evaluate(()=>placeTest.state.place.me.seat>0));
 await page.locator('#pstage').scrollIntoViewIfNeeded();await page.waitForTimeout(350);
 const before=await frame().evaluate(()=>Ojjuda3D.inspect().renderFrame);await page.waitForTimeout(600);const after=await frame().evaluate(()=>Ojjuda3D.inspect().renderFrame);
 assert.ok(after-before<=1,'a settled public scene stops drawing');
 for(const [width,height] of [[320,740],[390,844],[844,390],[1280,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(100);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': no overflow');await page.locator('[aria-label="공간 확대"]').click();await page.locator('[aria-label="공간 맞춤"]').click();}
 await frame().evaluate(()=>document.querySelector('canvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})));
 await page.waitForSelector('.place3d-ready',{state:'detached'});assert.equal(await page.locator('#place-svg').isVisible(),true);
 assert.deepEqual(errors,[]);console.log('PASS: four real places, 3D furniture cards, cabinet/board/pool games, profiles, walking, chairs, chat, stale-frame isolation, idle rendering, responsive layout and fallback',JSON.stringify(statistics));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
