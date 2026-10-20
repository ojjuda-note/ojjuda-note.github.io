const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://back.test';

// Exercise real World navigation, game close handlers and iframe bridges.
// Only auth and the child game's response are fixtures; no live accounts run.
let world = read('world.html')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame={};');
const scripts = ['world-navigation.js', 'world-mines-game.js', 'world-saetbyeol-game.js',
  'world-tour-game.js', 'world-tank-game.js', 'world-spot-game.js', 'ttang-bridge.js',
  'photo-ttang-bridge.js', 'matgo-bridge.js'].map(read).join('\n');
world = world.replace('<script type="module">', () => `<script>${scripts}</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.backFixture={open:Al,render:H,state:g,actions:sr,allowExit:true,exits:0,exitRequests:0,
  billiards:()=>ep('carom4','local'),nativeBack:()=>window.nativeBack({canGoBack:false})};
window.OjjudaMatgoAccess={configure(){},check:async()=>({userId:'fixture'}),visible:()=>true,allowed:()=>true,subscribe:()=>()=>{},refresh:async()=>{}};
window.OjjudaPhotoTtangAccess={configure(){},check:async()=>({userId:'fixture'}),visible:()=>true,allowed:()=>true,subscribe:()=>()=>{},refresh:async()=>{}};
D.online=false;D.isAdmin=false;S={};g.tab='arcade';
gm(()=>sr.tab({tab:'arcade'}));H();
` + world.slice(world.indexOf('</script>', boot));

const child = `<!doctype html><p>Game transport fixture</p><script>
const parentFixture=parent.backFixture;
const source=location.pathname.includes('mines')?'ojjuda-mines':'ojjuda-saetbyeol';
window.OjjudaPhotoTtang={canLeave:()=>parentFixture.allowExit,menu(){}};
addEventListener('message',event=>{
  const type=event.data?.type||'';
  if(type.endsWith('-exit-request')){
    parentFixture.exitRequests++;
    if(parentFixture.allowExit)parent.postMessage({source,type:'ojjuda-game-exit'},location.origin);
  }
  if(type==='ojjuda:matgo:request-close'){
    parentFixture.exitRequests++;
    if(parentFixture.allowExit)parent.postMessage({type:'ojjuda:matgo:close'},location.origin);
  }
});
if(/mines|saetbyeol/.test(location.pathname))parent.postMessage({source,type:'ojjuda-game-ready'},location.origin);
if(location.pathname.includes('matgo'))parent.postMessage({type:'ojjuda:matgo:online-ready'},location.origin);
window.childReady=true;
</script>`;

(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    for (const native of [false, true]) {
      const context = await browser.newContext({viewport:{width:390,height:844}});
      if (native) await context.addInitScript(() => {
        window.Capacitor={isNativePlatform:()=>true,Plugins:{App:{
          addListener:async(type,fn)=>{if(type==='backButton')window.nativeBack=fn;},
          exitApp:()=>{window.backFixture.exits++;}
        }}};
      });
      await context.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        if (url.pathname === '/world.html') return route.fulfill({contentType:'text/html',body:world});
        if (url.pathname.startsWith('/games/')) return route.fulfill({contentType:'text/html',body:child});
        if (url.pathname === '/outside.html') return route.fulfill({contentType:'text/html',body:'<h1>Previous page</h1>'});
        return route.abort();
      });
      const page = await context.newPage(), errors = [];
      let accept = true;
      page.on('pageerror', error => { errors.push(error.message); console.error('World Back fixture:', error.message); });
      page.on('dialog', dialog => accept ? dialog.accept() : dialog.dismiss());
      await page.goto(origin + '/outside.html');
      await page.goto(origin + '/world.html');
      await page.waitForFunction(() => window.backFixture && history.state?.ojjudaWorld === 'main');
      const back = async () => {
        if (native) await page.evaluate(() => backFixture.nativeBack());
        else await page.goBack();
      };
      const main = async () => {
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'main' && !document.querySelector('#gov,#matgo-overlay,#ttang-overlay,#photo-ttang-overlay,dialog[open],[data-bl="close"]'));
        assert.equal(new URL(page.url()).pathname, '/world.html', 'closing a game stays inside World');
        assert.equal(await page.locator('.arcade-home').isVisible(), true, 'the Arcade main screen returns');
        assert.equal(await page.evaluate(() => backFixture.exits), 0, 'game Back never exits the native app');
      };
      const games = [
        ['stacker','#gov'],['mines','.tour-game-dialog'],['saetbyeol','.tour-game-dialog'],
        ['tour','.tour-game-dialog'],['tank','.tank-game-dialog'],['spot','.spot-game-dialog'],
        ['ttang','#ttang-overlay'],['photo_ttang','#photo-ttang-overlay'],['matgo','#matgo-overlay'],['billiards','[data-bl="close"]']
      ];
      for (const [game, selector] of games) {
        await page.evaluate(async game => {
          if (game === 'matgo') await openMatgo();
          else if (game === 'photo_ttang') await OjjudaPhotoTtangBridge.open({owner:'fixture'});
          else if (game === 'billiards') backFixture.billiards();
          else backFixture.open(game);
        }, game);
        await page.locator(selector).first().waitFor();
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
        for (const frame of page.frames().slice(1)) await frame.waitForFunction(() => window.childReady);
        await back();
        await main();
      }

      // A browser confirmation must retain both the running game and its return entry.
      await page.evaluate(() => backFixture.open('stacker'));
      await page.locator('#gov [data-g="start"]').click();
      accept = false;
      await back();
      await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
      assert.equal(await page.locator('#gov').count(), 1, 'cancel preserves the game');
      accept = true;
      await back();
      await main();

      // Matgo closes through the online game's own confirmation, even after its loading bar disappears.
      await page.evaluate(async () => { backFixture.allowExit=false; await openMatgo(); });
      await page.waitForFunction(() => document.querySelector('#matgo-overlay') && !document.getElementById('matgo-loading-bar') && history.state?.ojjudaWorld === 'menu');
      const requests = await page.evaluate(() => backFixture.exitRequests);
      await back();
      await page.waitForFunction(count => backFixture.exitRequests > count, requests);
      assert.equal(await page.locator('#matgo-overlay').count(), 1, 'denied iframe exit remains open');
      assert.equal(await page.evaluate(() => backFixture.exits), 0);
      await page.evaluate(() => { backFixture.allowExit=true; });
      await back();
      await main();

      // Closing from the game's own button must not leave stale history entries.
      const historySize = await page.evaluate(() => history.length);
      for (let i=0;i<3;i++) {
        await page.evaluate(() => backFixture.open('stacker'));
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
        await page.locator('#gov .ghead [data-g="close"]').click();
        await main();
      }
      assert.equal(await page.evaluate(() => history.length), historySize, 'reopening does not grow duplicate return entries');
      await page.locator('.bottomnav [data-tab="my"]').click();
      await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
      await back();
      await main();
      assert.deepEqual(errors, [], 'no navigation or game bridge errors');
      if (!native) {
        await page.goBack();
        await page.waitForURL(origin + '/outside.html');
      } else {
        await page.evaluate(() => backFixture.nativeBack());
        assert.equal(await page.evaluate(() => backFixture.exits), 1, 'only Back from the main screen may exit');
      }
      await context.close();
      console.log(`PASS: ${native?'native':'browser'} Back returns ten game types to Arcade, retains cancelled exits, respects Matgo confirmation and consumes stale history.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
