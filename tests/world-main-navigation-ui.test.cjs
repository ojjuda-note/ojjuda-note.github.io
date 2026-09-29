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
window.worldTest={state:g,actions:sr,render:H,model:$,modal:ct,draft:roomPlacementDraft};
gm(()=>{if(!canLeaveRoomPlacement())return;g.tab="friends";g.visiting=null;g.visitData=null;H();window.scrollTo(0,0)});
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
      if (url.pathname === '/world.html') return route.fulfill({contentType:'text/html',body:world});
      const file = path.join(root,url.pathname);
      if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      return route.fulfill({path:file});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(()=>window.worldTest && history.state?.ojjudaWorld==='main');
    const current=()=>page.evaluate(()=>worldTest.state.tab);
    const main=async()=>{
      await page.evaluate(()=>worldTest.actions.tab({tab:'friends'}));
      await page.waitForFunction(()=>history.state?.ojjudaWorld==='main' && worldTest.state.tab==='friends');
    };
    const back=async()=>{
      await page.evaluate(()=>history.back());
      await page.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(page.url(),'https://fixture.test/world.html');
    };
    for(const tab of ['home','deco','shop','my']) {
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
      await page.evaluate(()=>worldTest.actions.tab({tab:'shop'}));
      await main();
    }
    assert.equal(await page.evaluate(()=>history.length),length,'menu visits do not pile up history entries');
    await page.evaluate(()=>{worldTest.actions.tab({tab:'my'});worldTest.modal('<button data-act="close">닫기</button>','테스트')});
    await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>!document.querySelector('#modal-root').innerHTML);
    assert.equal(await current(),'my','back closes the top dialog before leaving its menu');
    await back();
    await page.evaluate(()=>{
      const t=worldTest;t.actions.tab({tab:'deco'});
      t.model.room.items=[{id:'draft-desk',type:'desk',gx:2,gy:2,r:0}];
      t.state.sel='draft-desk';t.render();t.actions.mv({dx:1,dy:0});
    });
    await page.evaluate(()=>history.back());
    await page.waitForFunction(()=>history.state?.ojjudaWorld==='menu');
    assert.equal(await current(),'deco');
    assert.ok(await page.evaluate(()=>worldTest.draft()),'back cannot discard unconfirmed furniture');
    await page.evaluate(()=>worldTest.actions['placement-cancel']());
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
    await swipe(150);assert.equal(await current(),'my');await back();
    await swipe(-30);assert.equal(await current(),'friends');
    await swipe(-150,0,{cancel:true});assert.equal(await current(),'friends');
    await swipe(-80,0,{second:true});assert.equal(await current(),'friends');
    await swipe(4,-150);assert.equal(await current(),'friends');
    assert.ok(await page.evaluate(()=>scrollY>20),'vertical scrolling remains native');
    await page.evaluate(()=>scrollTo(0,0));
    await page.locator('.world-destination[data-id="cafe"]').click();
    assert.equal(await current(),'place','a normal building tap still enters it');await back();
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
    for(const tab of ['home','deco','shop','my']){
      await np.evaluate(tab=>{worldTest.actions.tab({tab});nativeBack({canGoBack:false})},tab);
      await np.waitForFunction(()=>worldTest.state.tab==='friends' && history.state?.ojjudaWorld==='main');
      assert.equal(await np.evaluate(()=>nativeExited),0,'native back from menus never exits the app');
    }
    await native.close();
    console.log('PASS: browser and native menu back, four destinations, history reuse, modal/draft protection, touch/mouse swipe, vertical scroll, cancellation and normal taps.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
