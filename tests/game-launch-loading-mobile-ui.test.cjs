const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname,'..');
const origin = 'https://game-loading-mobile.test';
const fixture = `<!doctype html><html lang="ko"><head>
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" href="/shared/games/game-entry.css">
<style>body{font:16px sans-serif;margin:0;padding:24px}button{min-height:44px}#game{padding:25px;background:#fcecf4}</style>
</head><body><button id="launch">나사 풀기 시작</button><button id="warm">다시 시작</button>
<section id="game" hidden>게임 준비 완료</section>
<script src="/shared/games/game-launch-loading.js"></script>
<script>
document.getElementById('launch').onclick=()=>{
 const started=performance.now(),loading=OjjudaGameLaunch.show('screw');
 setTimeout(()=>{
  document.getElementById('game').hidden=false;
  document.body.dataset.coldMs=String(Math.round(performance.now()-started));
  loading.finish();
 },550);
};
document.getElementById('warm').onclick=()=>{
 const started=performance.now(),loading=OjjudaGameLaunch.show('screw');
 loading.finish();document.body.dataset.warmMs=String(Math.round(performance.now()-started));
};
</script></body></html>`;

(async()=>{
  const browser=await chromium.launch({headless:true,
    executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,
    args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context=await browser.newContext({viewport:{width:390,height:844},
      isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());
      if(url.origin!==origin)return route.abort();
      if(url.pathname==='/fixture.html')return route.fulfill({contentType:'text/html',body:fixture});
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.abort();
      return route.fulfill({path:file,contentType:file.endsWith('.css')?'text/css':'text/javascript'});
    });
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/fixture.html');
    for(const width of [390,344]){
      await page.setViewportSize({width,height:666});
      await page.locator('#launch').click();
      await page.locator('.ojjuda-game-launch-loading.is-visible').waitFor({timeout:2000});
      const box=await page.locator('.ogl-card').boundingBox();
      assert.ok(box&&box.x>=0&&box.y>=0&&box.x+box.width<=width+1&&box.y+box.height<=667,
        'loading card fits '+width+'px mobile screen');
      assert.equal(await page.locator('.ogl-cancel').isVisible(),true);
      await page.locator('.ojjuda-game-launch-loading').waitFor({state:'detached',timeout:2000});
    }
    await page.locator('#game').waitFor({state:'visible'});
    await page.locator('#warm').click();
    await page.locator('.ojjuda-game-launch-loading').waitFor({state:'detached',timeout:1000});
    const results=await page.evaluate(()=>({cold:Number(document.body.dataset.coldMs),
      warm:Number(document.body.dataset.warmMs),locked:document.body.classList.contains('ojjuda-game-launch-open')}));
    assert.ok(results.cold>=500,'delayed game content waits for readiness');
    assert.ok(results.warm<100,'warm start has no forced minimum delay');
    assert.equal(results.locked,false,'exit restores scrolling');
    assert.deepEqual(errors,[]);
    console.log('PASS: 344px/390px mobile loader, ready/close transitions and warm start '+JSON.stringify(results));
    await context.close();
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
