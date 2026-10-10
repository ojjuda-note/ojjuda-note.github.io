const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..');
let world=fs.readFileSync(path.join(root,'world.html'),'utf8')
 .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,'')
 .replace('import { screw3d as screwGame } from "./screw3d.js";','const screwGame={};');
const boot=world.indexOf('j1(()=>H());gm(');assert.ok(boot>0);
world=world.slice(0,boot)+`window.billiardTest={open:(kind,mode='local',options={})=>ep(kind,mode,options),render:bo,close:mn,state:()=>k,angle:()=>Math.atan2(k.aim.dy,k.aim.dx)*180/Math.PI};D.isAdmin=false;g.tab='home';H();`+world.slice(world.indexOf('</script>',boot));
const distance=(a,b)=>((b-a+540)%360)-180;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
  await context.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname!=='fixture.test')return route.abort();if(u.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:world});const f=path.join(root,u.pathname);if(!f.startsWith(root+path.sep)||!fs.existsSync(f)||!fs.statSync(f).isFile())return route.abort();return route.fulfill({path:f});});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('https://fixture.test/world.html');await page.waitForFunction(()=>window.billiardTest);
  await page.addScriptTag({path:path.join(root,'mobile-viewport.js')});
  const angle=()=>page.evaluate(()=>billiardTest.angle());
  const fixedUI=()=>page.evaluate(()=>Object.fromEntries(['.ghead','.bl-hud','.bl-can','.bl-power','.bl-msg','.bl-ctrl'].map(selector=>{
   const rect=document.querySelector(selector).getBoundingClientRect();
   return [selector,{x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
  })));
  for(const kind of ['carom4','carom3','pool8']){
   await page.evaluate(kind=>billiardTest.open(kind),kind);
   assert.equal(await page.locator('.bl-zoom').isVisible(),false,kind+': hidden toolbar');
   const fixedBefore=await fixedUI(),canvasBefore=await page.locator('#bl-cv').boundingBox();
   const outsidePinch=await context.newCDPSession(page);
   const header=fixedBefore['.ghead'],cy=header.y+header.height/2;
   const outsideFingers=spread=>[{id:1,x:header.x+header.width*(.4-spread),y:cy},{id:2,x:header.x+header.width*(.4+spread),y:cy}];
   await outsidePinch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:outsideFingers(.08)});
   await outsidePinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:outsideFingers(.25)});
   await outsidePinch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.evaluate(()=>visualViewport.scale),1,kind+': outside pinch never zooms the page');
   assert.deepEqual(await fixedUI(),fixedBefore,kind+': outside pinch keeps controls fixed');
   assert.deepEqual(await page.locator('#bl-cv').boundingBox(),canvasBefore,kind+': outside pinch does not zoom the table');
   const nativeGuards=await page.evaluate(()=>{
    const targets=['.ghead','.bl-hud','.bl-power','.bl-aim','.bl-ctrl','.bl-can','#bl-spinpick svg'];
    return targets.every(selector=>{
     const el=document.querySelector(selector);
     if(getComputedStyle(el).touchAction!=='none')return false;
     for(const type of ['gesturestart','gesturechange','dblclick']){
      const event=new Event(type,{bubbles:true,cancelable:true});el.dispatchEvent(event);if(!event.defaultPrevented)return false;
     }
     const zoom=new WheelEvent('wheel',{ctrlKey:true,bubbles:true,cancelable:true});el.dispatchEvent(zoom);
     const scroll=new WheelEvent('wheel',{deltaY:30,bubbles:true,cancelable:true});el.dispatchEvent(scroll);
     return zoom.defaultPrevented&&!scroll.defaultPrevented;
    });
   });
   assert.ok(nativeGuards,kind+': native touch, trackpad, Safari and double-tap zoom stay scoped to the dialog');
   assert.deepEqual(await page.evaluate(()=>{
    const table=document.querySelector('#bl-cv'),header=document.querySelector('.ghead');
    const blocked=targets=>['touchstart','touchmove'].map(type=>{
     const touches=targets.map((target,identifier)=>new Touch({identifier,target,clientX:80+identifier*60,clientY:120}));
     const event=new TouchEvent(type,{touches,targetTouches:touches,changedTouches:touches,bubbles:true,cancelable:true});
     targets[0].dispatchEvent(event);return event.defaultPrevented;
    });
    return {table:blocked([table,table]),controls:blocked([header,header]),mixed:blocked([table,header])};
   }),{table:[false,false],controls:[true,true],mixed:[true,true]},kind+': the page guard leaves table touch input alone');
   await outsidePinch.detach();

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
   // Real two-finger touch events must zoom without aiming or placing a ball.
   const pinch=await context.newCDPSession(page);
   const center={x:bounds.x+bounds.width*.5,y:bounds.y+bounds.height*.45};
   const fingers=spread=>[{id:1,x:center.x-bounds.width*spread,y:center.y},{id:2,x:center.x+bounds.width*spread,y:center.y}];
   await pinch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(.1)});
   await page.waitForTimeout(550);
   assert.equal(await page.evaluate(()=>billiardTest.state().peek?.active||false),false,'two fingers never trigger hold preview');
   const baseWidth=(await page.locator('#bl-cv').boundingBox()).width;
   const controlsBeforePinch=await fixedUI();
   await pinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(.18)});
   const ratio=(await page.locator('#bl-cv').boundingBox()).width/baseWidth;
   assert.ok(Math.abs(ratio-1.8)<.03,kind+': spreading fingers enlarges table');
   assert.equal(await page.evaluate(()=>visualViewport.scale),1,kind+': table pinch never zooms the page');
   assert.deepEqual(await fixedUI(),controlsBeforePinch,kind+': table pinch keeps score and shot controls fixed');
   assert.equal(await angle(),initial.angle,'pinch leaves aim unchanged');
   if(kind==='carom4')await page.screenshot({path:'/tmp/billiards-pinch-zoom.png'});
   await pinch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[fingers(.18)[0]]});
   await pinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...fingers(.18)[0],y:center.y+35}]});
   assert.equal(await angle(),initial.angle,'remaining finger does not aim after pinch');
   await pinch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.ok(Math.abs((await snapshot()).zoom-1.8)<.03,'pinch zoom remains after release');
   await pinch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(.18)});
   await pinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(.08)});
   await pinch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.deepEqual(await snapshot(),initial,kind+': bringing fingers together restores full view without game changes');
   // On a phone, fingers usually land one after the other and move repeatedly.
   const staggeredBefore=await snapshot(),staggeredControls=await fixedUI();
   await pinch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[fingers(.1)[0]]});
   await page.waitForTimeout(60);
   await pinch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:fingers(.1)});
   for(const spread of [.12,.14,.16,.18,.2]){
    await pinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(spread)});
    assert.ok(Math.abs((await snapshot()).zoom-spread/.1)<.03,kind+': continuous two-finger spreading changes table zoom');
   }
   assert.deepEqual(await fixedUI(),staggeredControls,kind+': controls stay fixed throughout continuous pinch');
   assert.equal(await page.evaluate(()=>visualViewport.scale),1,kind+': continuous pinch never magnifies the page');
   assert.equal(await angle(),staggeredBefore.angle,kind+': adding the second finger restores the original aim');
   for(const spread of [.18,.15,.12,.1,.08])await pinch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:fingers(spread)});
   await pinch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.deepEqual(await snapshot(),staggeredBefore,kind+': closing fingers returns to full table without game changes');
   await pinch.detach();
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
    assert.deepEqual(await snapshot(),touchBefore,'touch cancellation restores view without game changes');
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:point.x,y:point.y}]});
    await page.waitForFunction(()=>billiardTest.state().peek?.active);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:point.x,y:point.y},{id:2,x:point.x-45,y:point.y}]});
    assert.equal(await page.evaluate(()=>billiardTest.state().peek?.active||false),false,'a second finger cancels hold zoom before starting pinch');
    await touch.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.deepEqual(await snapshot(),touchBefore,'cancelled pinch after preview leaves no state changes');await touch.detach();
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
   console.log('PASS',kind,'two-finger pinch, long press/release, drag, zoom menu, 150/200%, pan, reset, escape, toolbar, mouse, touch, keyboard, long press, turn and spin guards');
  }
  // Pool ownership stays with this player during the opponent's turn.
  await page.evaluate(()=>billiardTest.open('pool8','ai'));
  assert.equal(await page.locator('.bl-chips').count(),0,'pool removes the duplicated player row');
  assert.equal(await page.locator('.bl-grp.mine').count(),0,'open table has no assigned target');
  await page.evaluate(()=>{const s=billiardTest.state();s.st.groups={p1:'solid',p2:'stripe'};billiardTest.render();});
  const target=()=>page.locator('.bl-grp.mine').getAttribute('data-pool-group');
  assert.equal(await target(),'solid');
  const ring=await page.locator('.bl-grp.mine').evaluate(el=>getComputedStyle(el).boxShadow);
  assert.ok(ring.includes('234, 196, 95'),'my group has a gold border');
  await page.evaluate(()=>{billiardTest.state().st.turn='p2';billiardTest.render();});
  assert.equal(await target(),'solid','opponent turn never moves my border');
  await page.evaluate(()=>{const s=billiardTest.state();s.mode='online';s.me='p2';s.names={p1:'친구',p2:'나'};billiardTest.render();});
  assert.equal(await target(),'stripe','online second player sees their own group');
  await page.screenshot({path:'/tmp/billiards-fullscreen-my-balls.png'});
  await page.evaluate(()=>{const s=billiardTest.state();s.st.balls.filter(b=>b.id>=9).forEach(b=>b.on=false);billiardTest.render();});
  assert.equal(await target(),'eight','clearing my group points to the 8 ball');
  await page.evaluate(()=>{const s=billiardTest.state();s.mode='local';s.st.turn='p1';billiardTest.render();});
  assert.equal(await target(),'solid','shared phone follows the player at the table');
  await page.evaluate(()=>billiardTest.open('pool8','ai'));
  assert.equal(await page.locator('.bl-grp.mine').count(),0,'new game resets group indication');
  for(const kind of ['pool8','carom4']){
   await page.evaluate(kind=>billiardTest.open(kind,'ai'),kind);
   for(const [width,height] of [[320,568],[390,844],[412,915],[568,320],[844,390],[1280,900]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(80);
    const screen=await page.locator('.bl-box').boundingBox();
    assert.deepEqual(screen,{x:0,y:0,width,height},kind+': game fills viewport '+width+'x'+height);
    for(const selector of ['.ghead','.bl-hud','.bl-can','.bl-power','.bl-msg','.bl-aim','.bl-ctrl']){
     const box=await page.locator(selector).boundingBox();
     assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width+.5&&box.y+box.height<=height+.5,kind+' '+selector+' fits '+width+'x'+height);
    }
    assert.equal(await page.locator('.bl-box').evaluate(el=>el.scrollHeight>el.clientHeight),false,'full game fits without page scrolling');
    assert.equal(await page.locator('.bl-chips').count(),kind==='pool8'?0:1,'carom keeps its score row');
    if(kind==='pool8'){
     assert.equal(await page.locator('.bl-tray').evaluate(el=>el.scrollWidth>el.clientWidth),false,'ball lists fit');
     if(width===320||width===568)await page.screenshot({path:'/tmp/billiards-fullscreen-'+width+'.png'});
    }
   }
  }
  console.log('PASS full-screen portrait/landscape layout, pool row removed, assigned player gold border, 8-ball target, new game reset');
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
  await page.evaluate(()=>billiardTest.close());
  assert.equal(await page.evaluate(()=>{
   const event=new WheelEvent('wheel',{ctrlKey:true,bubbles:true,cancelable:true});document.body.dispatchEvent(event);return event.defaultPrevented;
  }),false,'normal page zoom is available again after leaving billiards');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
