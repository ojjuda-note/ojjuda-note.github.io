/* Layout integration: use the shipped World, bridges and styles. Only the
   child game's transport is a fixture; no account, ranking or purchase runs. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const origin = 'https://fullscreen.test';
const safe = {top:24, bottom:48, left:8, right:8};
let activeCheck = 'fixture boot';
const insets = source => source.replace(/env\(safe-area-inset-(top|bottom|left|right)(?:,[^)]*)?\)/g, (_, side) => `${safe[side]}px`);
const viewports = [{width:390,height:844},{width:1280,height:900},{width:844,height:390},{width:344,height:882},{width:673,height:841}];

let world = read('world.html').replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '');
const scripts = ['shared/viewport/mobile-viewport.js','shared/games/game-entry.js','shared/games/game-results.js','shared/games/multiplayer-entry.js','shared/games/game-session.js',
  'games/ojjuda-tour/world-tour-game.js','games/bang/world-bang-game.js','games/mines/world-mines-game.js','games/spot-difference/world-spot-game.js','games/sacheonseong/world-sacheonseong-game.js'];
world = world.replace('<script type="module">', () => scripts.map(file => `<script src="/${file}"></script>`).join('')+'<script type="module">');
// Game-specific sheets normally load on demand. Keep their production cascade,
// including the older viewport sheet, instead of copying fullscreen CSS here.
world = world.replace('</head>', ['shared/games/world-tour-game.css','games/spot-difference/world-spot-game.css','games/sacheonseong/world-sacheonseong-game.css']
  .map(file => `<link rel="stylesheet" href="/${file}">`).join('')+'</head>');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'fixture replaces only live application boot');
assert.match(world, /href="[^"\n]*world-game-screen\.css/, 'World ships the new game screen stylesheet');
world = world.slice(0, boot) + `
window.fullscreenFixture={open:Al,close:El,board:vn,closeBoard:dt,current:()=>R,boardState:()=>E,
  finish:()=>S2(7),finishBoard(){E.over={result:'draw',reason:'stalemate'};Je();},
  ordinary(){ct('<h2>일반 설정</h2><button class="btn" data-act="close">닫기</button>','일반 설정');},
  billiards(){ep('carom4','local');}};
D.online=false;D.isAdmin=false;g.tab='arcade';H();
` + world.slice(world.indexOf('</script>', boot));

// Real shared/games/multiplayer-entry.js in both windows switches the parent toolbar from
// the actual visible entry. The fixture maintains a round ID and moves so a
// remount or unexpected frame navigation is observable after folding.
const child = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;min-height:100%;font:16px sans-serif}button{min-height:44px;padding:8px 12px}main{padding:12px}button[hidden],section[hidden]{display:none!important}</style>
<script src="/shared/games/multiplayer-entry.js"></script></head><body><main>
<section class="game-entry" id="entry"><h1>게임 입구</h1><button id="play">시작하기</button></section>
<section id="playing" hidden><h1>진행 중</h1><button id="move">한 수</button><button id="finish">결과 보기</button></section>
<section id="result" hidden><h1>게임 결과</h1><button id="replay">다시 하기</button></section>
<button id="home">게임 목록</button></main><script>
const source=location.pathname.includes('ojjuda-tour')?'ojjuda-tour':location.pathname.includes('bang')?'ojjuda-bang':location.pathname.includes('mines')?'ojjuda-mines':'ojjuda-saetbyeol';
window.round={id:crypto.randomUUID(),moves:0};
const entry=document.getElementById('entry'),playing=document.getElementById('playing'),result=document.getElementById('result');
function play(){entry.hidden=true;result.hidden=true;playing.hidden=false;}
document.getElementById('play').onclick=play;
document.getElementById('move').onclick=()=>round.moves++;
document.getElementById('finish').onclick=()=>{playing.hidden=true;result.hidden=false;};
document.getElementById('replay').onclick=play;
document.getElementById('home').onclick=()=>parent.postMessage({source,type:location.pathname.includes('sacheonseong')?'ojjuda:sacheonseong-home':location.pathname.includes('spot-difference')?'ojjuda:spot-home':'ojjuda-game-exit'},location.origin);
addEventListener('message',event=>{if(event.source!==parent||event.origin!==location.origin)return;
 if(event.data?.type?.endsWith('-init'))window.initialized=true;
 if(event.data?.type?.endsWith('-exit-request'))parent.postMessage({source,type:'ojjuda-game-exit'},location.origin);
});
parent.postMessage({source,type:'ojjuda-game-ready'},location.origin);window.childReady=true;
</script></body></html>`;

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}
async function bounds(page) {
  return page.evaluate(() => ({width:innerWidth, top:auditViewport.top, height:auditViewport.height}));
}
async function checkpoint(page, label) {
  const {width,height,top}=await bounds(page);
  activeCheck=`${label} · ${width}×${height} · top ${top}`;
  console.log('CHECK: '+activeCheck);
}
async function fullscreen(page, selector, label) {
  await settle(page);
  const expected=await bounds(page), actual=await page.locator(selector).boundingBox();
  assert.ok(actual && Math.abs(actual.x)<1 && Math.abs(actual.y-expected.top)<1 &&
    Math.abs(actual.width-expected.width)<1 && Math.abs(actual.height-expected.height)<1,
    `${label} fills the visible viewport: ${JSON.stringify({actual,expected})}`);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1), true, label+' has no horizontal page overflow');
}
async function safeControl(page, selector) {
  const control=page.locator(selector).first();
  await control.scrollIntoViewIfNeeded();await settle(page);
  const expected=await bounds(page), actual=await control.boundingBox();
  assert.ok(actual && actual.width>0 && actual.height>0 && actual.x>=safe.left-1 &&
    actual.x+actual.width<=expected.width-safe.right+1 && actual.y>=expected.top+safe.top-1 &&
    actual.y+actual.height<=expected.top+expected.height-safe.bottom+1,
    `${selector} stays inside safe insets: ${JSON.stringify({actual,expected})}`);
  const hit=await control.evaluate(node=>{const rect=node.getBoundingClientRect(),hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);return {reachable:node===hit||node.contains(hit),cover:hit?`${hit.tagName.toLowerCase()}#${hit.id}.${String(hit.className?.baseVal??hit.className).replace(/\s+/g,'.')}`:'none'};});
  assert.equal(hit.reachable,true,`${selector} remains clickable during ${activeCheck}; hit ${hit.cover}`);
}
async function frameFits(page, selector) {
  await settle(page);
  const expected=await bounds(page), frame=page.locator(`${selector} > iframe`), actual=await frame.boundingBox();
  assert.ok(actual && actual.width>100 && actual.height>100 && actual.x>=safe.left-1 &&
    actual.x+actual.width<=expected.width-safe.right+1 && actual.y>=expected.top+safe.top-1 &&
    actual.y+actual.height<=expected.top+expected.height-safe.bottom+1,
    `frame remains visible below controls and above system bars: ${JSON.stringify({actual,expected})}`);
  const lastBottom=await page.locator(selector).evaluate(host=>Math.max(0,...[...host.children].filter(node=>node.tagName!=='IFRAME'&&node.getClientRects().length).map(node=>node.getBoundingClientRect().bottom)));
  assert.ok(actual.y>=lastBottom-1, 'frame does not overlap its visible parent toolbar');
  const game=await frame.elementHandle();
  return game.contentFrame();
}
async function boardContentFits(page) {
  const expected=await bounds(page), actual=await page.locator('.world-board-screen > .modal').boundingBox();
  assert.ok(actual&&Math.abs(actual.x-safe.left)<1&&Math.abs(actual.y-expected.top-safe.top)<1&&
    Math.abs(actual.width-(expected.width-safe.left-safe.right))<1&&
    Math.abs(actual.height-(expected.height-safe.top-safe.bottom))<1,
    `board content fills the safe viewport: ${JSON.stringify({actual,expected})}`);
}
async function resize(page, size, shortened=false) {
  await page.setViewportSize(size);
  await page.evaluate(({height,top})=>{Object.assign(auditViewport,{height,top});visualViewport.dispatchEvent(new Event('resize'));},{height:shortened?size.height-110:size.height,top:shortened?18:0});
  await settle(page);
}

(async()=>{
  const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage']});
  try {
    const context=await browser.newContext({viewport:viewports[0],hasTouch:true,reducedMotion:'reduce'});
    await context.addInitScript(()=>{
      const viewport=new EventTarget();window.auditViewport={height:innerHeight,top:0};
      Object.defineProperties(viewport,{height:{get:()=>auditViewport.height},offsetTop:{get:()=>auditViewport.top},scale:{get:()=>1}});
      Object.defineProperty(window,'visualViewport',{value:viewport});
    });
    await context.route('**/*',route=>{
      const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
      if(url.pathname==='/world.html')return route.fulfill({contentType:'text/html',body:insets(world)});
      if(/^\/games\/(?:ojjuda-tour|bang|mines|sacheonseong|spot-difference)\/index\.html$/.test(url.pathname))return route.fulfill({contentType:'text/html',body:child});
      const file=path.resolve(root,'.'+url.pathname);
      if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.abort();
      if(file.endsWith('.css'))return route.fulfill({contentType:'text/css',body:insets(fs.readFileSync(file,'utf8'))});
      return route.fulfill({path:file});
    });
    const page=await context.newPage(), errors=[];
    page.setDefaultTimeout(6000);
    page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
    await page.goto(origin+'/world.html');await page.waitForFunction(()=>window.fullscreenFixture);

    // The fixed logical board remains centered in a fullscreen host; entry and
    // result content can scroll without hiding the persistent close control.
    for(const size of viewports){
      await resize(page,size);await checkpoint(page,'stacker entry');await page.evaluate(()=>fullscreenFixture.open('stacker'));
      await fullscreen(page,'#gov','inline entry');await fullscreen(page,'#gov > .gbox','inline box');
      await safeControl(page,'#gov .ghead [data-g=close]');await safeControl(page,'#gov [data-g=start]');
      await page.locator('#gov [data-g=start]').click();await page.evaluate(()=>cancelAnimationFrame(fullscreenFixture.current().raf));
      await checkpoint(page,'stacker play');
      await fullscreen(page,'#gov > .gbox','inline play');
      const canvas=await page.locator('#gcv').boundingBox();
      assert.ok(Math.abs(canvas.width/canvas.height-2/3)<.003,'fixed logical canvas is not stretched');
      await safeControl(page,'#gcv');
      await page.evaluate(()=>fullscreenFixture.finish());await page.locator('#gscreen .game-result-card').waitFor();
      await checkpoint(page,'stacker result');
      await fullscreen(page,'#gov > .gbox','inline result');
      await safeControl(page,'#gov .ghead [data-g=close]');
      await safeControl(page,'#gscreen [data-g=start]');
      // Scrolling a long result must not move an overlay over the toolbar.
      await safeControl(page,'#gov .ghead [data-g=close]');
      await page.locator('#gov .ghead [data-g=close]').click();
      assert.equal(await page.locator('#gov').count(),0,'inline close removes the fullscreen host');
      console.log(`PASS: stacker entry/play/result and header close · ${size.width}×${size.height}`);
    }

    for(const kind of ['chess','janggi']){
      await resize(page,viewports[0]);await checkpoint(page,kind+' entry');await page.evaluate(kind=>fullscreenFixture.board(kind),kind);
      await page.locator('.ge-board-entry').waitFor();await settle(page);
      await fullscreen(page,'.world-board-screen','board entry');
      await safeControl(page,'.world-board-screen .mp-entry-back');
      const entranceColor=await page.locator('.game-entry.mp-entry').evaluate(card=>{
        const style=getComputedStyle(card),title=getComputedStyle(card.querySelector('.ge-title'));
        const toolbar=card.closest('.mp-board-host').querySelector('.mp-entry-bar');
        return {ink:style.color,title:title.color,backdrop:getComputedStyle(card.closest('.mp-board-host')).backgroundColor,
          toolbar:getComputedStyle(toolbar).color,accent:style.getPropertyValue('--entry-accent').trim()};
      });
      assert.equal(entranceColor.ink,'rgb(34, 58, 48)',kind+' uses the shared game entry ink');
      assert.equal(entranceColor.title,'rgb(34, 58, 48)',kind+' title matches the Ojjuda palette');
      assert.equal(entranceColor.backdrop,'rgb(246, 247, 240)',kind+' board entry uses the warm backdrop');
      assert.equal(entranceColor.toolbar,'rgb(102, 116, 103)',kind+' game toolbar uses the common muted ink');
      assert.notEqual(entranceColor.accent,'#7560b5',kind+' no longer inherits the purple multiplayer accent');
      const start=page.locator('[data-entry-panel=computer] [data-act=bd-start]');await start.scrollIntoViewIfNeeded();await start.click();
      await page.locator('#bd-root .bd-svg').waitFor();
      const sameBoard=await page.evaluate(()=>{window.savedBoard=fullscreenFixture.boardState();return JSON.stringify(savedBoard.s);});
      for(const size of viewports){
        await resize(page,size);await checkpoint(page,kind+' play');
        await fullscreen(page,'.world-board-screen','board game');await boardContentFits(page);
        await safeControl(page,'#bd-root [data-act=close]');await safeControl(page,'#bd-root .bd-svg');
        const ratio=await page.locator('#bd-root .bd-svg').evaluate(svg=>{const rect=svg.getBoundingClientRect(),view=svg.viewBox.baseVal;return [rect.width/rect.height,view.width/view.height];});
        assert.ok(Math.abs(ratio[0]-ratio[1])<.003,'chess/janggi keep their original board proportions');
        assert.equal(await page.evaluate(()=>fullscreenFixture.boardState()===savedBoard),true,'folding keeps the same board session');
        assert.equal(await page.evaluate(()=>JSON.stringify(fullscreenFixture.boardState().s)),sameBoard,'folding preserves the position');
      }
      if(kind==='chess'){
        await page.locator('[data-act=bd-sq][data-i="52"]').click();
        assert.equal(await page.evaluate(()=>fullscreenFixture.boardState().sel),52,'the drawn square remains clickable');
        await resize(page,{width:344,height:882});
        assert.equal(await page.evaluate(()=>fullscreenFixture.boardState().sel),52,'folding preserves a selected piece');
        await page.locator('[data-act=bd-sq][data-i="52"]').click();
        assert.equal(await page.evaluate(()=>fullscreenFixture.boardState().sel),-1,'input still maps to the same piece after folding');
      }
      await page.evaluate(()=>fullscreenFixture.finishBoard());await page.locator('#bd-root.bd-result-root').waitFor();
      await checkpoint(page,kind+' result');
      await fullscreen(page,'.world-board-screen','board result');await boardContentFits(page);await safeControl(page,'#bd-root [data-act=close]');
      await page.locator('#bd-root [data-act=close]').click();
      assert.equal(await page.locator('.world-board-screen').count(),0,'board result closes normally');
      console.log('PASS: '+kind+' entry/play/result, fold preservation and close');
    }

    for(const [api,selector,multiplayer] of [
      ['OjjudaTourGame','.tour-game-dialog',true],['OjjudaBangGame','.bang-game-dialog',true],
      ['OjjudaMinesGame','.mines-game-dialog',false],['OjjudaSpotGame','.spot-game-dialog',false]
    ]){
      await resize(page,viewports[0]);await checkpoint(page,api+' entry');await page.evaluate(api=>window[api].open({owner:'layout-fixture'}),api);
      await page.locator(selector).waitFor();const game=await frameFits(page,selector);await game.waitForFunction(()=>window.childReady);
      if(multiplayer)await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.mpActive==='true',selector);
      await fullscreen(page,selector,api+' entry');
      await safeControl(page,`${selector} ${multiplayer?'.mp-entry-back':':is(.tour-game-header,.spot-game-header) button'}`);
      await game.locator('#play').click();await game.locator('#move').click();
      if(multiplayer)await page.waitForFunction(selector=>document.querySelector(selector)?.dataset.mpActive==='false',selector);
      const round=await game.evaluate(()=>({...window.round}));
      for(const size of viewports){
        await resize(page,size);await checkpoint(page,api+' play');await fullscreen(page,selector,api+' play');
        await frameFits(page,selector);await safeControl(page,`${selector} > :is(.tour-game-header,.spot-game-header) button`);
        assert.deepEqual(await game.evaluate(()=>({...window.round})),round,'folding does not reload the game or lose moves');
      }
      await game.locator('#finish').click();await checkpoint(page,api+' result');await fullscreen(page,selector,api+' result');await frameFits(page,selector);
      assert.equal(await game.locator('#result').isVisible(),true,'result remains in the original frame');
      await resize(page,viewports[0],true);await checkpoint(page,api+' shortened visual viewport');await fullscreen(page,selector,api+' shortened visual viewport');await frameFits(page,selector);
      if(api==='OjjudaSpotGame'){
        // The viewport sheet may be cached or loaded after a lazy game sheet.
        await page.addStyleTag({content:insets(read('shared/viewport/mobile-viewport.css'))});
        for(const open of [true,false]){
          await checkpoint(page,`spot zoom ${open?'open':'closed'} with viewport CSS loaded last`);
          await game.evaluate(open=>parent.postMessage({type:'ojjuda:spot-zoom',open},location.origin),open);
          await page.waitForFunction(open=>document.querySelector('.spot-game-dialog').classList.contains('spot-game-zooming')===open,open);
          await fullscreen(page,selector,'spot zoom with viewport CSS loaded last');await frameFits(page,selector);
        }
      }
      await safeControl(page,`${selector} > :is(.tour-game-header,.spot-game-header) button`);
      await page.locator(`${selector} > :is(.tour-game-header,.spot-game-header) button`).click();
      await page.locator(selector).waitFor({state:'detached'});
      assert.equal(await page.evaluate(()=>document.body.classList.contains('gaming')),false,'iframe close restores the surrounding page');
      console.log('PASS: '+api+' entry/play/result, safe viewport and close');
    }

    // Sacheonseong creates its iframe only after Start and then uses the child
    // toolbar. Both sides of that transition must retain the full viewport.
    await resize(page,viewports[1]);await checkpoint(page,'sacheonseong entry');await page.evaluate(()=>OjjudaSacheonseongGame.open({owner:'layout-fixture'}));
    await fullscreen(page,'.sacheonseong-game-dialog','sacheonseong entry');await safeControl(page,'.sacheonseong-back');
    await page.locator('.sacheonseong-game-dialog .ge-primary').click();
    const sacheon=await frameFits(page,'.sacheonseong-game-dialog');await sacheon.waitForFunction(()=>window.childReady);
    for(const size of [viewports[0],viewports[2],viewports[4]]){
      await resize(page,size);await checkpoint(page,'sacheonseong play');await fullscreen(page,'.sacheonseong-game-dialog','sacheonseong play');await frameFits(page,'.sacheonseong-game-dialog');
      assert.equal(await page.locator('.sacheonseong-back').isVisible(),false,'child toolbar replaces the parent toolbar');
    }
    await sacheon.locator('#home').click();await page.locator('.sacheonseong-game-dialog').waitFor({state:'detached'});

    // Scope protection: an unrelated settings dialog stays a dialog.
    await resize(page,viewports[1]);await checkpoint(page,'ordinary dialog scope protection');await page.evaluate(()=>fullscreenFixture.ordinary());
    const ordinary=await page.locator('#modal-root .modal').boundingBox();
    assert.ok(ordinary.width<viewports[1].width-100&&ordinary.height<viewports[1].height-100,'ordinary dialogs retain their existing dimensions');
    await page.locator('#modal-root [data-act=close]').click();
    assert.deepEqual(errors,[],'fullscreen lifecycle has no page errors');
    await context.close();
    console.log('PASS: real inline/board/iframe hosts fill phone, desktop, landscape and foldable viewports through entry/play/results; safe insets, shortened viewport, frame/round preservation, input and Back remain intact.');
  } finally {await browser.close();}
})().catch(error=>{console.error('FAIL: '+activeCheck);console.error(error);process.exitCode=1;});
