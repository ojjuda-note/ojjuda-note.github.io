const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.billiardTest={open:kind=>ep(kind,'local',{}),close:mn,state:()=>k,angle:()=>Math.atan2(k.aim.dy,k.aim.dx)*180/Math.PI};D.isAdmin=false;g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));
const distance=(a,b)=>((b-a+540)%360)-180;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.billiardTest);
  const angle=()=>page.evaluate(()=>billiardTest.angle());
  for(const kind of ['carom4','carom3','pool8']){
   await page.evaluate(kind=>billiardTest.open(kind),kind);
   assert.equal(await page.locator('.bl-zoom').isVisible(),false,kind+': hidden toolbar');

   const view=page.locator('.bl-aim-heading .bl-view-toggle');
   assert.equal(await view.isVisible(),true,kind+': controls open next to aim reference');
   assert.equal(await page.locator('.ghead .bl-view-menu').count(),0,'no zoom button in header');
   const original=await page.locator('#bl-cv').boundingBox();
   for(const factor of [1.5,2]){
    await view.click();assert.equal(await page.locator('.bl-zoom').isVisible(),true);
    await page.locator('[data-bl="zoom-'+factor+'"]').click();
    assert.equal(await page.locator('.bl-zoom').isVisible(),false);
    const zoomed=await page.locator('#bl-cv').boundingBox();assert.ok(Math.abs(zoomed.width/original.width-factor)<.02,kind+': true '+factor+'x zoom');
    assert.equal(await page.evaluate(()=>billiardTest.state().zoom),factor);
   }
   await view.click();await page.locator('[data-bl="pan"]').click();
   const before=await page.locator('.bl-can').evaluate(el=>{el.scrollTop=100;el.scrollLeft=20;return{top:el.scrollTop,left:el.scrollLeft};});
   const area=await page.locator('.bl-can').boundingBox(),aim=await angle();
   await page.mouse.move(area.x+area.width/2,area.y+area.height/2);await page.mouse.down();await page.mouse.move(area.x+area.width/2-25,area.y+area.height/2-30);await page.mouse.up();
   const after=await page.locator('.bl-can').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));assert.ok(after.top>before.top||after.left>before.left,'drag pans table');assert.equal(await angle(),aim,'pan never aims or shoots');
   await view.click();await page.locator('[data-bl="zoom-1"]').click();assert.equal(await page.evaluate(()=>billiardTest.state().panMode),false);
   await view.click();assert.equal(await page.locator('[data-bl="pan"]').isDisabled(),true);await page.keyboard.press('Escape');assert.equal(await page.locator('.bl-zoom').isVisible(),false);assert.equal(await page.locator('#bl-cv').isVisible(),true,'escape first closes zoom menu');

   const table=page.locator('.bl-can');await table.scrollIntoViewIfNeeded();
   const bounds=await table.boundingBox(),point={x:bounds.x+bounds.width*.6,y:bounds.y+bounds.height*.6};
   const snapshot=()=>page.evaluate(()=>{const s=billiardTest.state(),v=s.ov.querySelector('.bl-can');return{angle:billiardTest.angle(),balls:s.st.balls,zoom:s.zoom,left:v.scrollLeft,top:v.scrollTop,moves:s.moveCount,power:s.power,placing:s.placing};});
   const initial=await snapshot();
   await page.mouse.move(point.x,point.y);await page.mouse.down();
   await page.waitForFunction(()=>billiardTest.state().peek?.active);
   assert.equal(await page.evaluate(()=>billiardTest.state().zoom),2,kind+': long press magnifies');
   assert.equal(await angle(),initial.angle,'inspection preserves aim');
   if(kind==='carom4')await page.screenshot({path:'/tmp/billiards-long-press.png'});
   await page.mouse.move(point.x-20,point.y-25);await page.mouse.up();
   assert.deepEqual(await snapshot(),initial,kind+': release restores view without shooting, aiming or moving a ball');
   // A normal aiming drag cancels the hold timer.
   await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+25,point.y+15);
   await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>billiardTest.state().zoom),1);await page.mouse.up();
   assert.notEqual(await angle(),initial.angle,'ordinary dragging still aims');
   if(kind==='carom4'){
    const touch=await context.newCDPSession(page);
    const touchBefore=await snapshot();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:point.x,y:point.y}]});
    await page.waitForFunction(()=>billiardTest.state().peek?.active);
    assert.equal(await page.evaluate(()=>billiardTest.state().zoom),2,'phone touch holds zoom');
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.deepEqual(await snapshot(),touchBefore,'touch cancellation restores view without game changes');await touch.detach();
    // Keep a manual 150% view and its scroll position after inspection.
    await view.click();await page.locator('[data-bl="zoom-1.5"]').click();
    const zoomBefore=await snapshot();await page.mouse.move(point.x,point.y);await page.mouse.down();
    await page.waitForFunction(()=>billiardTest.state().peek?.active);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.mouse.up();
    assert.deepEqual(await snapshot(),zoomBefore,'blur restores the selected zoom and scroll position');
    await view.click();await page.locator('[data-bl="zoom-1"]').click();
    await page.evaluate(()=>{billiardTest.state().placing=true;});const placingBefore=await snapshot();
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForFunction(()=>billiardTest.state().peek?.active);await page.mouse.up();
    assert.deepEqual(await snapshot(),placingBefore,'holding does not accidentally place the cue ball');await page.evaluate(()=>{billiardTest.state().placing=false;});
   }
   const left=page.locator('[data-bl="left"]'),right=page.locator('[data-bl="right"]');
   assert.equal(await left.isVisible(),true);
   let start=await angle();await right.click();assert.ok(Math.abs(distance(start,await angle())-.05)<1e-8,kind+': one pointer tap is 0.05 degrees');
   start=await angle();await left.tap();assert.ok(Math.abs(distance(start,await angle())+.05)<1e-8,kind+': touch is 0.05 degrees');
   start=await angle();await page.keyboard.press('ArrowRight');assert.ok(Math.abs(distance(start,await angle())-.05)<1e-8,kind+': keyboard is 0.05 degrees');
   await left.focus();start=await angle();await page.keyboard.press('Enter');assert.ok(Math.abs(distance(start,await angle())+.05)<1e-8,kind+': accessible button activation');
   const box=await right.boundingBox();start=await angle();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(560);await page.mouse.up();
   assert.ok(distance(start,await angle())>=.15,kind+': held press repeats');const stopped=await angle();await page.waitForTimeout(150);assert.equal(await angle(),stopped,kind+': release stops repeat');
   await page.evaluate(()=>billiardTest.state().busy=true);start=await angle();await left.click();assert.equal(await angle(),start,kind+': animation blocks changes');await page.evaluate(()=>billiardTest.state().busy=false);
   await page.locator('[data-bl="spin"]').click();start=await angle();await page.keyboard.press('ArrowRight');assert.equal(await angle(),start,kind+': spin picker blocks aim');await page.locator('[data-bl="spin-done"]').click();
   await page.screenshot({path:'/tmp/ojjuda-billiards-'+kind+'-mobile.png',fullPage:true});
   console.log('PASS',kind,'long press/release, drag, zoom menu, 150/200%, pan, reset, escape, toolbar, mouse, touch, keyboard, long press, turn and spin guards');
  }
  await page.evaluate(()=>billiardTest.open('carom4'));
  for(const [width,height] of [[320,640],[390,844],[1280,900]]){
   await page.setViewportSize({width,height});
   const view=page.locator('.bl-view-toggle');await view.scrollIntoViewIfNeeded();await view.click();
   const panel=await page.locator('.bl-zoom').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=width&&panel.y>=0&&panel.y+panel.height<=height,'zoom options stay on screen');
   const label=await page.locator('.bl-aim-heading>span').boundingBox(),opener=await view.boundingBox();assert.ok(Math.abs((label.y+label.height/2)-(opener.y+opener.height/2))<2,'opener stays beside aim label');
   if(width===320)await page.screenshot({path:'/tmp/ojjuda-billiards-zoom-open-mobile.png'});
   await view.click();const button=page.locator('[data-bl="right"]');await button.scrollIntoViewIfNeeded();const box=await button.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width);assert.ok(box.y>=0&&box.y+box.height<=height);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  const right=page.locator('[data-bl="right"]'),box=await right.boundingBox();await page.mouse.move(box.x+10,box.y+10);await page.mouse.down();await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const stopped=await angle();await page.waitForTimeout(450);assert.equal(await angle(),stopped,'blur cancels held press');await page.mouse.up();
  await page.mouse.down();await page.evaluate(()=>billiardTest.close());await page.mouse.up();await page.evaluate(()=>billiardTest.open('carom4'));const reopened=await angle();await page.waitForTimeout(450);assert.equal(await angle(),reopened,'reopening has no stale timer');
  const tableBox=await page.locator('.bl-can').boundingBox();await page.mouse.move(tableBox.x+40,tableBox.y+60);await page.mouse.down();await page.evaluate(()=>billiardTest.close());await page.mouse.up();await page.evaluate(()=>billiardTest.open('carom4'));await page.waitForTimeout(550);assert.equal(await page.evaluate(()=>billiardTest.state().zoom),1,'no delayed zoom after close and reopen');
  assert.deepEqual(errors,[]);console.log('PASS responsive 320/390/1280 widths, blur/close cleanup, zero browser errors');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
