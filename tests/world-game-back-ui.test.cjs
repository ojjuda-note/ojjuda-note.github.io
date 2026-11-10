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
  .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";', 'const screwGame={};');
const scripts = ['features/home/agit-hub.js', 'shared/games/game-session.js', 'app/world/world-navigation.js', 'games/mines/world-mines-game.js', 'games/saetbyeol/world-saetbyeol-game.js',
  'games/ojjuda-tour/world-tour-game.js', 'games/certified-restaurants/world-restaurant-guide.js', 'games/certified-restaurants/recommended-restaurants.js', 'games/tank/world-tank-game.js', 'games/spot-difference/world-spot-game.js', 'games/ttang/ttang-bridge.js',
  'games/photo-ttang/photo-ttang-bridge.js', 'games/matgo/matgo-bridge.js', 'games/festival-schedule/world-festival-schedule.js', 'games/forest-archer/world-archery-game.js',
  'games/sacheonseong/world-sacheonseong-game.js', 'games/bang/world-bang-game.js', 'games/poker/world-poker-game.js', 'games/roulette/world-roulette-game.js', 'games/screw/screw-loader.js'].map(read).join('\n');
world = world.replace('<script type="module">', () => `<script>${scripts}</script><script type="module">`);
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0);
world = world.slice(0, boot) + `
window.backFixture={initVersion:j1,open:Al,link:openWorldGameLink,render:H,state:g,actions:sr,allowExit:true,exits:0,exitRequests:0,
  billiards:()=>ep('carom4','local'),nativeBack:()=>window.nativeBack({canGoBack:false})};
window.OjjudaMatgoAccess={configure(){},check:async()=>({userId:'fixture',age:25}),getClient:()=>S,visible:()=>true,allowed:()=>true,subscribe:()=>()=>{},refresh:async()=>{}};
window.OjjudaPhotoTtangAccess={configure(){},check:async()=>({userId:'fixture'}),visible:()=>true,allowed:()=>true,subscribe:()=>()=>{},refresh:async()=>{}};
D.online=false;D.isAdmin=false;const settled=async()=>({data:{ok:true,room:null},error:null});S={functions:{invoke:settled},rpc:settled};g.tab=new URL(location.href).searchParams.has('game')?'arcade':'hub';
gm(()=>sr.tab({tab:'hub'}));H();
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
  const browser = await chromium.launch({ headless:true, executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined, args:['--no-sandbox','--disable-dev-shm-usage'] });
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
        assert.equal(await page.locator('#agit-hub-view').isVisible(), true, 'the Hub main screen returns');
        assert.equal(await page.evaluate(() => backFixture.exits), 0, 'game Back never exits the native app');
      };
      const arcade = async () => {
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu' && !!document.querySelector('.arcade-home') && !document.querySelector('#gov,#matgo-overlay,#ttang-overlay,#photo-ttang-overlay,dialog[open],[data-bl="close"]'));
        assert.equal(await page.locator('.arcade-home').isVisible(), true, 'the Arcade returns after a game closes');
        assert.equal(await page.evaluate(() => backFixture.exits), 0, 'game Back never exits the native app');
      };
      const games = [
        ['restaurants','.restaurant-guide-dialog'],['festival','.festival-schedule-dialog'],['archery','.archery-game-dialog'],
        ['sacheonseong','.sacheonseong-game-dialog'],['bang','.bang-game-dialog'],['poker','.poker-game-dialog'],['roulette','.roulette-game-dialog'],
        ['janggi','#bd-menu'],['chess','#bd-menu'],['carom4','#bd-menu'],['carom3','#bd-menu'],['pool8','#bd-menu'],
        ['screw','#gov'],['mole','#gov'],['runner','#gov'],['breakout','#gov'],['stacker','#gov'],['mines','.tour-game-dialog'],['saetbyeol','.tour-game-dialog'],
        ['tour','.tour-game-dialog'],['tank','.tank-game-dialog'],['spot','.spot-game-dialog'],
        ['ttang','#ttang-overlay'],['photo_ttang','#photo-ttang-overlay'],['matgo','#matgo-overlay'],['billiards','[data-bl="close"]']
      ];
      for (const [game, selector] of games) {
        await page.evaluate(async game => {
          backFixture.actions.tab({tab:['festival','restaurants'].includes(game)?'hub':'arcade'});
          if (game === 'matgo') await openMatgo();
          else if (game === 'photo_ttang') await OjjudaPhotoTtangBridge.open({owner:'fixture'});
          else if (game === 'billiards') backFixture.billiards();
          else if (game === 'poker') await OjjudaPokerGame.open({owner:'fixture',authorized:()=>true});
          else if (game === 'roulette') await OjjudaRouletteBridge.open({owner:'fixture',client:OjjudaMatgoAccess.getClient(),authorized:()=>true});
          else if (['janggi','chess','carom4','carom3','pool8'].includes(game)) await backFixture.link(game);
          else backFixture.open(game);
        }, game);
        await page.locator(selector).first().waitFor();
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
        for (const frame of page.frames().slice(1)) await frame.waitForFunction(() => window.childReady);
        await back();
        if(game==='billiards')await page.getByRole('button',{name:'오락실로 나가기',exact:true}).click();
        if(['festival','restaurants'].includes(game))await main();else await arcade();
      }

      // Both public directories have a visible return and support the same browser/native Back.
      for(const game of ['festival','restaurants']){
        await page.evaluate(()=>backFixture.actions.tab({tab:'hub'}));
        await page.evaluate(game=>backFixture.open(game),game);
        await page.getByRole('button',{name:'아지트로 돌아가기',exact:true}).click();
        await main();
        await page.evaluate(game=>backFixture.open(game),game);
        await page.locator('.agit-home-link').click();
        await main();
      }
      for(const action of ['back','button']){
        await page.evaluate(()=>backFixture.open('recommendations'));
        await page.locator('.recommended-restaurants-dialog').waitFor();
        await page.waitForFunction(()=>history.state?.ojjudaWorld==='menu');
        if(action==='back')await back();
        else await page.locator('[data-rr=close]').click();
        await main();
      }

      // The embedded minefield also has an in-game Back button. Its own handler must
      // not remove the round before the player picks an option in the parent dialog.
      await page.evaluate(()=>backFixture.actions.tab({tab:'arcade'}));
      await page.evaluate(()=>backFixture.open('mines'));
      const mines=page.frameLocator('.mines-game-dialog iframe');
      await mines.locator('body').evaluate(body=>{
        body.innerHTML='<main id="minesEntry" hidden></main><button id="face2">목록</button>';
        body.querySelector('button').onclick=()=>body.dataset.prematureExit='true';
      });
      for(const choice of ['게임 계속하기','오락실로 나가기']){
        await mines.locator('#face2').click();
        const question=page.getByRole('dialog',{name:'오락실로 갈까요?',exact:true});
        assert.equal(await mines.locator('body').getAttribute('data-premature-exit'),null);
        await question.getByRole('button',{name:choice,exact:true}).click();
        if(choice==='게임 계속하기')assert.ok(await mines.locator('#face2').isVisible());
      }
      await arcade();

      // A shared game URL returns to Arcade and loses its game-only query after exit.
      await page.goto(origin+'/world.html?game=stacker&challenge=1&score=100&keep=yes');
      await page.waitForFunction(()=>window.backFixture&&history.state?.ojjudaWorld==='menu');
      await page.evaluate(()=>backFixture.open('stacker'));
      assert.equal(new URL(page.url()).searchParams.get('game'),'stacker');
      await back();
      await arcade();
      const returned=new URL(page.url());
      assert.equal(returned.searchParams.get('tab'),'arcade');
      assert.equal(returned.searchParams.get('keep'),'yes');
      for(const key of ['game','challenge','score'])assert.equal(returned.searchParams.has(key),false);
      await page.locator('.bottomnav [data-tab="hub"]').click();
      await main();

      async function chooseExit(selector){
        const original=await page.locator(selector).elementHandle();
        await back();
        const prompt=page.getByRole('dialog',{name:'오락실로 갈까요?',exact:true});
        await prompt.getByRole('button',{name:'게임 계속하기',exact:true}).click();
        assert.equal(await original.evaluate(node=>node.isConnected),true,'continuing retains the same game');
        await back();
        await prompt.getByRole('button',{name:'오락실로 나가기',exact:true}).click();
        await arcade();
      }
      await page.evaluate(()=>backFixture.actions.tab({tab:'arcade'}));
      await page.evaluate(() => backFixture.open('stacker'));
      await page.locator('#gov [data-g="start"]').click();
      await chooseExit('#gov');
      await page.locator('.bottomnav [data-tab="my"]').click();
      await page.evaluate(()=>backFixture.actions.tab({tab:'arcade'}));
      await page.evaluate(()=>backFixture.open('stacker'));
      await page.locator('#gov [data-g="start"]').click();
      await chooseExit('#gov');
      await page.evaluate(async()=>{backFixture.allowExit=false;await openMatgo();});
      await page.waitForFunction(()=>document.querySelector('#matgo-overlay')&&!document.getElementById('matgo-loading-bar')&&history.state?.ojjudaWorld==='menu');
      await page.frames()[1].evaluate(()=>{document.body.innerHTML='<section class="board"><div class="zone">게임 중</div></section>';});
      await chooseExit('#matgo-overlay');
      assert.equal(await page.evaluate(()=>backFixture.exits),0,'leaving a game never exits the app');

      // Closing from the game's own button must not leave stale history entries.
      const historySize = await page.evaluate(() => history.length);
      for (let i=0;i<3;i++) {
        await page.evaluate(() => backFixture.open('stacker'));
        await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
        await page.locator('#gov .ghead [data-g="close"]').click();
        await page.getByRole('dialog',{name:'오락실로 갈까요?',exact:true}).getByRole('button',{name:'오락실로 나가기',exact:true}).click();
        await arcade();
      }
      assert.equal(await page.evaluate(() => history.length), historySize, 'reopening does not grow duplicate return entries');
      await page.locator('.bottomnav [data-tab="my"]').click();
      await page.waitForFunction(() => history.state?.ojjudaWorld === 'menu');
      await back();
      assert.equal(await page.locator('.my-hub').isVisible(),true,'settings Back stays in settings');
      await page.locator('.bottomnav [data-tab="hub"]').click();
      await main();
      assert.deepEqual(errors, [], 'no navigation or game bridge errors');
      if (!native) {
        await page.goBack();
        await page.waitForURL(origin + '/outside.html');
      } else {
        await page.evaluate(() => backFixture.nativeBack());
        assert.equal(await page.evaluate(() => backFixture.exits), 1, 'only Back from the main screen may exit');
      }
      const retired=await context.newPage();
      await retired.goto(origin+'/world.html?game=byeolcheonji',{waitUntil:'commit'});
      await retired.locator('#agit-hub-view').waitFor();
      assert.equal(new URL(retired.url()).pathname,'/world.html','retired vacancy links stay in the Hub');
      assert.equal(await retired.locator('[data-v=byeolcheonji]').count(),0,'retired vacancy alert has no game card');
      await context.close();
      console.log(`PASS: ${native?'native':'browser'} Back returns game families to Arcade and public directories to Hub, keeps the current round on Continue, confirms exit from active games and consumes stale history.`);
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
