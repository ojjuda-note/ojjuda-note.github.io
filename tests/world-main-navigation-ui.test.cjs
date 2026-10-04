const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const helper = fs.readFileSync(path.join(root, 'world-navigation.js'), 'utf8');
world = world.replace('<script type="module">', `<script>${helper}</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.worldTest={state:g,auth:D,actions:sr,render:H,model:$,modal:ct};
gm(()=>{g.tab="friends";g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
g.tab="friends";H();` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context = await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/note/') return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Note destination</title><main>오쭈다 노트</main>'});
      if (url.pathname === '/world.html') return route.fulfill({contentType:'text/html',body:world});
      const file = path.join(root,url.pathname);
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({path:file});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(()=>window.worldTest && history.state?.ojjudaWorld==='main');
    await page.evaluate(()=>{const model=worldTest.model;Object.assign(model,{coins:321,avatar:{hair:'bob'},room:{items:[{type:'cat'}]},rooms:[{items:[{type:'sofa'}]}],friends:[{id:'f1',room:{items:[]}}],petBank:{cat:[{}]},themeBackup:{room:{items:[]}},diary:[{id:'saved-note',title:'내 기록',body:'보존',vis:'all',at:Date.now()}]});localStorage.setItem('ojjuda-world-v1',JSON.stringify(model));localStorage.setItem('ojjuda-pet-talk','old');localStorage.setItem('ojjuda-pet-mem','old');});
    await page.reload();await page.waitForFunction(()=>window.worldTest && history.state?.ojjudaWorld==='main');
    assert.deepEqual(await page.evaluate(()=>{const m=worldTest.model;return [m.coins,m.diary[0].id,m.room.items,m.avatar,m.friends,m.petBank||null,m.themeBackup||null,localStorage.getItem('ojjuda-pet-talk'),localStorage.getItem('ojjuda-pet-mem')]}),[321,'saved-note',[],{},[],null,null,null,null],'reload clears retired assets while preserving balance and writing');
    const current=()=>page.evaluate(()=>worldTest.state.tab);
    const noteAndBack=async()=>{
      await page.waitForFunction(()=>worldTest.state.tab==='place' && worldTest.state.place?.id==='park');
      await page.evaluate(()=>history.back());
      await page.waitForFunction(()=>window.worldTest && worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
    };
    const main=async()=>{
      await page.evaluate(()=>worldTest.actions.tab({tab:'friends'}));
      await page.waitForFunction(()=>history.state?.ojjudaWorld==='main' && worldTest.state.tab==='friends');
    };
    const back=async()=>{
      await page.evaluate(()=>history.back());
      await page.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(page.url(),'https://fixture.test/world.html');
    };
    assert.equal(await page.locator('[data-tab="shop"]').count(),0,'store entries are removed');
    await page.evaluate(()=>worldTest.actions.tab({tab:'shop'}));
    assert.equal(await current(),'friends','old store action returns to the main screen');
    await page.evaluate(()=>{worldTest.state.tab='shop';worldTest.render();});
    assert.equal(await current(),'friends','restored store state cannot reopen the store');
    assert.notEqual(await page.locator('.wd-home').getAttribute('aria-disabled'),'true');
    assert.equal(await page.locator('.wd-home').getAttribute('aria-label'),'우리집 들어가기');
    await page.locator('.wd-home').click();
    assert.equal(await current(),'home');
    assert.equal(await page.locator('[data-house-entry]').count(),1,'signed-out members get the house entry panel');
    assert.equal(await page.locator('iframe').count(),0,'signed-out navigation does not open an ownerless room');
    await main();
    for(const tab of ['home','deco']){
      await page.evaluate(tab=>worldTest.actions.tab({tab}),tab);
      assert.equal(await page.locator('[data-house-entry]').count(),1);
      assert.equal(await page.locator('#stage,#av-preview,.room3d-frame').count(),0);
      await main();
    }
    await main();
    for(const tab of ['home','life','my']) {
      await page.locator(`.bottomnav [data-tab="${tab}"]`).click();
      assert.equal(await current(),tab);
      await back();
    }
    for(const place of ['cafe','arcade','library','park']) {
      await page.locator(`.world-destination[data-id="${place}"]`).click();
      await page.waitForFunction(()=>worldTest.state.tab==='place');
      await back();
    }
    const length=await page.evaluate(()=>history.length);
    for(let i=0;i<3;i++){
      await page.evaluate(()=>worldTest.actions.tab({tab:'my'}));
      await main();
    }
    assert.equal(await page.evaluate(()=>history.length),length,'menu visits do not pile up history entries');
    await page.evaluate(()=>{worldTest.actions.tab({tab:'my'});worldTest.modal('<button data-act="close">닫기</button>','테스트')});
    await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>!document.querySelector('#modal-root').innerHTML);
    assert.equal(await current(),'my','back closes the top dialog before leaving its menu');
    await back();
    assert.deepEqual(await page.evaluate(()=>Object.keys(worldTest.actions).filter(key=>/^(pet-|npc-|adm-item|adm-price|adm-sync|set-buy|try-|placement-|add-item$|mv$)/.test(key))),[],'retired controls cannot be invoked');
    await page.evaluate(()=>{const t=worldTest;t.auth.isAdmin=true;t.actions.tab({tab:'deco'});});
    await back();

    const cdp=await context.newCDPSession(page);
    await page.evaluate(()=>{const dialog=document.createElement('div');dialog.role='dialog';dialog.hidden=true;document.body.append(dialog)});
    const touch=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([x,y,id=1])=>({x,y,id}))});
    const swipe=async(dx,dy=0,{cancel=false,second=false,hold=false}={})=>{
      await page.evaluate(()=>scrollTo(0,0));
      const box=await page.locator('.world-scene').boundingBox();
      const x=box.x+box.width*(dx<0?.75:.25),y=box.y+100;
      await touch('touchStart',[[x,y]]);
      for(let i=1;i<=6;i++)await touch('touchMove',[[x+dx*i/6,y+dy*i/6]]);
      if(hold){
        assert.ok(await page.locator('.main').evaluate(el=>getComputedStyle(el).transform!=='none'));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'drag does not create a sideways scrollbar');
      }
      if(second)await touch('touchStart',[[x+dx,y+dy],[x,y+60,2]]);
      await touch(cancel?'touchCancel':'touchEnd',[]);
    };
    await swipe(-150,0,{hold:true});assert.equal(await current(),'home');await back();
    await swipe(150);await noteAndBack();
    await swipe(-30);assert.equal(await current(),'friends');
    await swipe(-150,0,{cancel:true});assert.equal(await current(),'friends');
    await swipe(-80,0,{second:true});assert.equal(await current(),'friends');
    // The full main scene must extend below the viewport to test scrolling;
    // installed fallback fonts differ between local Chromium and CI.
    await page.setViewportSize({width:390,height:650});
    await swipe(4,-150);assert.equal(await current(),'friends');
    await page.waitForFunction(()=>scrollY>20);
    await page.setViewportSize({width:390,height:844});
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.world-destination[data-id="cafe"]').click();
    assert.equal(await current(),'place','a normal building tap still enters it');await back();
    const navigate=async tab=>{
      await page.evaluate(tab=>worldTest.actions.tab({tab}),tab);
      if(tab==='friends')await page.waitForFunction(()=>history.state?.ojjudaWorld==='main');
      await page.evaluate(()=>scrollTo(0,0));
    };
    const touchDrag=async(selector,dx,dy=0)=>{
      const target=page.locator(selector).first();
      // Native scrollIntoViewIfNeeded can leave the palette behind the fixed
      // bottom navigation, so center the surface before sending real touches.
      await target.evaluate(el=>el.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
      const box=await target.boundingBox();
      const x=box.x+box.width*(dx<0?.8:.2),y=dy?box.y+box.height*.8:Math.max(5,box.y)+20;
      assert.ok(await target.evaluate((el,{x,y})=>el.contains(document.elementFromPoint(x,y)),{x,y}),'the gesture starts on its intended surface');
      await touch('touchStart',[[x,y]]);
      for(let i=1;i<=6;i++)await touch('touchMove',[[x+dx*i/6,y+dy*i/6]]);
      await touch('touchEnd',[]);
    };
    const tabs=['friends','home','life','my'];
    for(let i=0;i<tabs.length;i++){
      for(const dx of [-150,150]){
        await navigate(tabs[i]);
        // Start in ordinary page content, away from the bottom navigation.
        const box=await page.locator('.main').boundingBox();
        const x=box.x+box.width*(dx<0?.8:.2),y=box.y+20;
        await touch('touchStart',[[x,y]]);
        for(let j=1;j<=6;j++)await touch('touchMove',[[x+dx*j/6,y]]);
        if(i===tabs.length-1 && dx<0){
          const shift=await page.locator('.main').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).m41);
          assert.ok(shift<0 && shift>=-32,'the last menu gives a small resisted left drag');
        }
        await touch('touchEnd',[]);
        if(i===0 && dx>0)await noteAndBack();
        else if(i===tabs.length-1 && dx<0)assert.equal(await current(),tabs[i],'left swipe stops at the last World menu');
        else assert.equal(await current(),tabs[(i+(dx<0?1:-1)+tabs.length)%tabs.length],`${tabs[i]} content supports ${dx<0?'left':'right'} swipe`);
      }
    }
    await navigate('friends');
    await page.locator('.world-destination[data-id="cafe"]').click();
    await touchDrag('.visit-banner',-150);
    assert.equal(await current(),'home','place headers use the active neighborhood tab');
    await main();
    // Desktop uses the same gesture through actual mouse events.
    await page.setViewportSize({width:1280,height:900});
    let box=await page.locator('.world-scene').boundingBox();
    await page.mouse.move(box.x+box.width*.7,box.y+100);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.7-180,box.y+100,{steps:8});await page.mouse.up();
    assert.equal(await current(),'home');await back();
    assert.deepEqual(errors,[]);
    await context.close();

    const native=await browser.newContext({viewport:{width:390,height:844}});
    await native.addInitScript(()=>{
      window.nativeExited=0;
      window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{
        addListener:async(name,cb)=>{window.nativeBack=cb;return{remove(){}}},
        exitApp:()=>window.nativeExited++}}};
    });
    await native.route('**/*',route=>route.request().url()==='https://fixture.test/world.html'
      ?route.fulfill({contentType:'text/html',body:world}):route.abort());
    const np=await native.newPage();await np.goto('https://fixture.test/world.html');
    await np.waitForFunction(()=>window.nativeBack && window.worldTest);
    for(const tab of ['home','deco','life','my']){
      await np.evaluate(tab=>{worldTest.actions.tab({tab});nativeBack({canGoBack:false})},tab);
      await np.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(await np.evaluate(()=>nativeExited),0,'native back from menus never exits the app');
    }
    await native.close();
    console.log('PASS: browser/native menu back, four destinations, modal protection and retired-state cleanup, swipes across all tabs and into Park, touch/mouse input, vertical scrolling, cancellation and normal taps.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
