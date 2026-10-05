const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
world=world.replace('<script type="module">',`<script>${['world-places.js','world-park-notes.js'].map(file=>fs.readFileSync(path.join(root,file),'utf8')).join('\n')}</script><script type="module">`);
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`
 window.placeTest={model:$,state:g,enter:xf,sync:Sr,tick:pg,places:Pt,house:H,
   freeze(){clearInterval(g.placeT);g.placeT=null;},snapshot:()=>worldPlaceArt&&worldPlaceArt.sync()};
 D.isAdmin=true;g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));

(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
 const context=await browser.newContext({viewport:{width:660,height:900},hasTouch:true,reducedMotion:'reduce'});
 let rejectPlaceImage=false;
 await context.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='fixture.test')return route.abort();if(rejectPlaceImage&&url.pathname.startsWith('/assets/world-places/'))return route.abort();if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const file=path.join(root,url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();return route.fulfill({path:file});});
 const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.placeTest);
 async function enter(id){
   await page.evaluate(id=>{placeTest.enter(id,1);placeTest.freeze();},id);
   if(id==='park')await page.waitForSelector('[data-park-app]');
   else await page.waitForSelector('.place-art-ready');
 }
 for(const id of ['cafe','library','arcade']){
   await enter(id);
   const picture=page.locator('#pstage .place-art-image');
   assert.match(await picture.getAttribute('src'),new RegExp('/'+id+'-20261001\\.webp$'));
   assert.deepEqual(await picture.evaluate(img=>[img.naturalWidth,img.naturalHeight]),[1536,1024]);
   assert.equal(await page.locator('#pstage iframe, #pstage svg, #pstage canvas, #pstage [data-npc], #pstage [data-item]').count(),0,'old actors and furniture are removed');
   assert.equal(await page.locator('#pmsg').count(),id==='park'?0:1,'only park has no chat');
   assert.equal(await page.evaluate(()=>{const random=Math.random;Math.random=()=>0;try{for(let i=0;i<100;i++)placeTest.tick();return placeTest.state.place.npcs.length}finally{Math.random=random}}),0,'offline ticks never regenerate background characters');
   if(id==='library')assert.ok(await page.locator('#quizcard').isVisible());
   await picture.evaluate(img=>img.dataset.retained='yes');
   await page.evaluate(()=>{placeTest.state.place.ch=2;for(let i=0;i<20;i++)placeTest.sync();});
   assert.equal(await picture.getAttribute('data-retained'),'yes','presence updates preserve the illustration');
   await page.screenshot({path:'/tmp/ojjuda-place-'+id+'-verified.png',fullPage:true});
 }
 await page.locator('[data-act="game-open"][data-v="mole"]').click();await page.waitForSelector('#gov');
 assert.match(await page.locator('#gov').getAttribute('aria-label'),/두더지/);
 await page.locator('[data-g="close"]').click();
 for(const [action,id,label] of [['bl-open','carom4','당구'],['bd-open','chess','체스'],['bd-open','janggi','장기']]){
   await page.locator('[data-act="'+action+'"][data-v="'+id+'"]').click();await page.waitForSelector('#bd-menu');
   assert.ok((await page.locator('#bd-menu').textContent()).includes(label));await page.locator('#modal-root [data-act="close"]').click();
 }
 await page.locator('#pmsg').fill('새 공간에서 안녕하세요');await page.locator('[data-act="pl-send"]').click();
 await page.waitForFunction(()=>document.querySelector('#plog').textContent.includes('새 공간에서 안녕하세요'));
 for(const [width,height] of [[320,740],[1280,900]]){
   await page.setViewportSize({width,height});
   await page.locator('#pstage').scrollIntoViewIfNeeded();
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+': no overflow');
   const bounds=await page.locator('.place-art-viewport').boundingBox();
   assert.ok(Math.abs(bounds.width/bounds.height-1.5)<.02,'the whole picture retains its aspect ratio');
   await page.locator('[aria-label="공간 확대"]').click();
   const picture=page.locator('.place-art-image');
   assert.match(await picture.getAttribute('style'),/scale\(1.25\)/);
   const view=await page.locator('.place-art-viewport').boundingBox();
   await page.mouse.move(view.x+view.width/2,view.y+view.height/2);await page.mouse.down();
   await page.mouse.move(view.x+view.width/2+25,view.y+view.height/2+15);await page.mouse.up();
   assert.match(await picture.getAttribute('style'),/translate\(25px,\s*15px\)/,'the enlarged illustration can be panned');
   await page.locator('[aria-label="공간 맞춤"]').click();
   assert.match(await picture.getAttribute('style'),/translate\(0px,\s*0px\) scale\(1\)/);
   if(width===320)await page.screenshot({path:'/tmp/ojjuda-place-mobile-verified.png',fullPage:true});
 }
 await enter('cafe');
 rejectPlaceImage=true;
 // A previously decoded image may bypass routing in newer Chromium versions.
 // Use a new URL to exercise an actual failed request before retrying.
 await page.evaluate(()=>{document.querySelector('.place-art-image').src+='?test=load-failure';});
 await page.waitForSelector('.place-art-retry:not([hidden])');
 assert.equal(await page.locator('#pstage iframe, #pstage svg').count(),0,'image failures do not restore the old scene');
 rejectPlaceImage=false;await page.locator('.place-art-retry').click();await page.waitForSelector('.place-art-ready');
 await page.locator('[data-act="pl-leave"]').click();assert.equal(await page.locator('#pstage').count(),0);
 await enter('park');
 assert.equal(await page.locator('#pstage,#pmsg,.place-art-viewport').count(),0,'Park is the integrated card page without a scene or chat');
 assert.equal(await page.locator('main.main > [data-park-app]').count(),1,'Park content fills the World page');
 assert.deepEqual(errors,[]);console.log('PASS: three illustrated places and the integrated Park card page, no actor/prop overlays, game buttons, chat, quiz, responsive fit, zoom/pan, retry and navigation');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
