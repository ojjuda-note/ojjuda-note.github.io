const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright');
const root=path.join(__dirname,'..'),key='jjuda-spot-six-v1';
(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox']});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{window.JjudaWallet={getState:()=>({ready:true,userId:null,coins:0}),subscribe:fn=>fn({ready:true,userId:null,coins:0}),refresh:async()=>{}};});
    await page.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!=='https://fixture.test'||/\/(wallet|supabase)\.js$/.test(url.pathname))return route.fulfill({body:'',contentType:'text/javascript'});
      const file=path.join(root,decodeURIComponent(url.pathname));
      return fs.existsSync(file)?route.fulfill({path:file,contentType:/\.js$/.test(file)?'text/javascript':undefined}):route.fulfill({status:404,body:''});
    });
    const current=()=>page.locator('#stage-picker').inputValue();
    const enabled=()=>page.locator('#stage-picker option:enabled').evaluateAll(options=>options.map(option=>Number(option.value)));
    const ready=()=>page.waitForFunction(()=>!document.getElementById('start').disabled);
    const url='https://fixture.test/games/spot-difference/index.html';
    await page.goto(url);await ready();
    assert.deepEqual(await enabled(),[0]);
    assert.equal(await page.locator('#stage-picker option').count(),152);
    await page.locator('#start').click();
    await page.locator('#wallet-menu summary').first().click();
    assert.equal(await page.locator('#stage-picker').isVisible(),true);
    assert.match(await page.locator('#stage-picker option[value="149"]').textContent(),/🔒/);
    await page.locator('#stage-picker').evaluate(select=>{select.value='149';select.dispatchEvent(new Event('change'));});
    assert.equal(await current(),'0','a synthetic late-level selection is rejected too');
    await page.locator('#original').evaluate(image=>{
      const surface=image.parentElement,rect=surface.getBoundingClientRect(),p=JJUDA_PUZZLES[0];
      for(const spot of p.spots){const init={bubbles:true,clientX:rect.x+rect.width*spot.x/100,clientY:rect.y+rect.height*spot.y/100};surface.dispatchEvent(new PointerEvent('pointerdown',init));surface.dispatchEvent(new MouseEvent('click',init));}
    });
    await page.locator('#celebration[open]').waitFor();
    assert.deepEqual(await enabled(),[0,1]);
    await page.locator('#celebration-next').click();
    assert.equal(await current(),'1');
    assert.deepEqual(await enabled(),[0,1]);
    await page.reload();await ready();assert.equal(await current(),'1');
    assert.deepEqual(await enabled(),[0,1]);
    await page.evaluate(key=>{const save=JSON.parse(localStorage.getItem(key));save.current=149;localStorage.setItem(key,JSON.stringify(save));},key);
    await page.reload();await ready();
    assert.equal(await current(),'1','a legacy high selection returns to the first unfinished picture');
    assert.deepEqual(await enabled(),[0,1]);assert.deepEqual(errors,[]);
    await context.close();
    console.log('PASS: 390×844 mobile select locks 151 unplayed pictures, refuses forced selection, opens one after a real clear, and preserves progress on reload.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
