const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');

let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g,
    s => s.includes('/shared/games/world-game-assets.js') || s.includes('/shared/games/game-entry.js') ? s : '')
  .replace('import { screw3d as screwGame } from "./games/screw/screw3d.js";', 'const screwGame={};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'World bootstrap can be intercepted for fixture');
world = world.slice(0, boot) + `
window.runnerTest = {
  open: Al, close: El, get current() { return R },
  freeze() { cancelAnimationFrame(R.raf) },
  step(n = 1) { for(let i=0; i<n && R.running; i++) R.game.update(1/60); R.game.draw(R.ctx); }
};
g.tab='friends'; H();
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2
    });
    const errors = [], oldArtRequests = [];
    await context.route('**/*', route => {
      const u = new URL(route.request().url());
      if (u.hostname !== 'fixture.test') return route.abort();
      if (u.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: world });
      const file = path.join(root, u.pathname);
      if (file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile())
        return route.fulfill({ path: file });
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    page.on('request', req => {
      if (req.url().includes('runner-v2-background') || req.url().includes('runner-v2-sprites'))
        oldArtRequests.push(req.url());
    });
    await page.goto('https://fixture.test/world.html');
    await page.waitForFunction(() => window.runnerTest);
    // Exercise sub-5px final platform insets against real Canvas, not a no-op mock.
    const runnerSource = fs.readFileSync(path.join(root, 'games/runner/runner-game.js'), 'utf8');
    const roundedSource = runnerSource.slice(runnerSource.indexOf('function rounded('), runnerSource.indexOf('  function gradient('));
    await page.evaluate(roundedSource => {
      const rounded = (0, eval)('(' + roundedSource + ')');
      const c = document.createElement('canvas').getContext('2d');
      for (const segmentWidth of [.01, 1, 3.142518, 4.99, 5, 5.01, 48])
        rounded(c, 3, 5, segmentWidth - 5, 38, 9, '#fff');
    }, roundedSource);
    await page.evaluate(() => OjjudaGameAssets.load('runner'));
    assert.equal(await page.evaluate(() => OjjudaGameAssets.ready('runner')), true);
    assert.equal(typeof (await page.evaluate(() => OjjudaRunnerGame.ready)), 'boolean');
    const obstacleTypes = await page.evaluate(() => OjjudaRunnerGame.obstacleTypes);
    assert.equal(obstacleTypes.length, 11, 'obstacle roster contains eleven distinct hazards');
    assert.equal(new Set(obstacleTypes.map(x => x.kind)).size, 11);
    assert.ok(obstacleTypes.filter(x => x.lane === 'air').length >= 3);
    assert.equal(obstacleTypes.filter(x => x.lane === 'high').length, 1,
      'the fast shark has a separate double-jump altitude');
    const mascotIcon = await page.evaluate(async () =>
      (await fetch('/assets/design/games/runner.svg')).text());
    assert.ok(mascotIcon.includes('해마 캐릭터') && !mascotIcon.includes('쭈꾸미'),
      'arcade artwork uses the original seahorse mascot');
    assert.deepEqual(oldArtRequests, [], 'original vector art needs no raster sprite downloads');
    const open = async () => {
      await page.evaluate(() => runnerTest.open('runner'));
      await page.locator('#gov').waitFor();
      assert.equal(await page.locator('#gov').getAttribute('data-game'), 'runner');
      assert.equal(await page.locator('.runner-card').count(), 1);
    };
    const start = async () => {
      await page.locator('#gov [data-g="start"]').click();
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
        runnerTest.freeze(); resolve();
      })));
    };
    for (const [width, height] of [[320, 568], [390, 844], [844, 390], [1280, 900]]) {
      await page.setViewportSize({ width, height });
      await open(); await start();
      if (process.env.RUNNER_ACTIVE_PROOF && width === 390) {
        await page.evaluate(() => runnerTest.step(142));
        await page.screenshot({ path: process.env.RUNNER_ACTIVE_PROOF });
      }
      if (process.env.RUNNER_LANDSCAPE_PROOF && width === 844) {
        await page.evaluate(() => runnerTest.step(85));
        await page.screenshot({ path: process.env.RUNNER_LANDSCAPE_PROOF });
      }
      const box = await page.locator('#gov .gbox').boundingBox();
      const visible = await page.locator('#gcv').boundingBox();
      const pixels = await page.locator('#gcv').evaluate(c => ({ width: c.width, height: c.height }));
      assert.ok(box.x >= -.5 && box.y >= -.5 && box.x + box.width <= width + .5 &&
        box.y + box.height <= height + .5, 'game and controls fit every viewport');
      const phoneTurned = height > width && width <= 540;
      const ratio = phoneTurned ? visible.height / visible.width : visible.width / visible.height;
      assert.ok(Math.abs(ratio - pixels.width / pixels.height) < .005,
        'rotated portrait mode keeps original canvas proportions');
      assert.ok(Math.abs(ratio - 16 / 9) < .008,
        'character proportions stay consistent with the landscape reference');
      const directTap = await page.evaluate(turned => {
        const cv = document.querySelector('#gcv'), b = cv.getBoundingClientRect();
        cv.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true, cancelable: true, pointerId: 23,
          clientX: b.left + b.width * (turned ? .3 : .8),
          clientY: b.top + b.height * (turned ? .8 : .3)
        }));
        return runnerTest.current.game.state.sliding;
      }, phoneTurned);
      assert.equal(directTap, true,
        'right-side stage tap slides immediately even in rotated phone mode');
      assert.ok(await page.evaluate(() => runnerTest.current.game.state.speed >= 450),
        'action begins at high speed without a slow introduction');
      assert.ok(await page.locator('.jju-controls [data-g="key:ArrowUp"]').isVisible());
      assert.ok(await page.locator('.jju-controls [data-g="key:ArrowDown"]').isVisible());
      for (const key of ['ArrowUp', 'ArrowDown']) {
        const b = await page.locator('.jju-controls [data-g="key:' + key + '"]').boundingBox();
        assert.ok(b.x >= visible.x && b.y >= visible.y &&
          b.x + b.width <= visible.x + visible.width + 1 &&
          b.y + b.height <= visible.y + visible.height + 1,
        'large round ' + key + ' control overlays the game stage');
        assert.ok(Math.abs(b.width - b.height) < 2, key + ' control is circular');
      }
      await page.locator('.jju-controls [data-g="key:ArrowDown"]').click();
      assert.equal(await page.evaluate(() => runnerTest.current.game.state.sliding), true);
      await page.locator('.jju-controls [data-g="key:ArrowUp"]').click();
      assert.equal(await page.evaluate(() => runnerTest.current.game.state.jumps), 1);
      await page.locator('.jju-controls [data-g="key:ArrowUp"]').click();
      assert.equal(await page.evaluate(() => runnerTest.current.game.state.jumps), 2);
      await page.locator('.jju-controls [data-g="key:ArrowUp"]').click();
      assert.equal(await page.evaluate(() => runnerTest.current.game.state.jumps), 2);
      const before = await page.evaluate(() => runnerTest.current.game.state.distance);
      await page.locator('.jju-controls [data-g="key:p"]').click();
      await page.evaluate(() => runnerTest.step(90));
      assert.equal(await page.evaluate(() => runnerTest.current.game.state.distance), before);
      await page.locator('.jju-controls [data-g="key:p"]').click();
      if (process.env.RUNNER_PROOF && width === 390)
        await page.screenshot({ path: process.env.RUNNER_PROOF });
      await page.evaluate(() => runnerTest.close());
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await open(); await start();
    const sounds = page.locator('#gov [data-g="sound"]');
    if (await sounds.count()) {
      const initial = await sounds.innerHTML();
      await sounds.click();
      assert.notEqual(await sounds.innerHTML(), initial);
      await sounds.click();
      assert.equal(await sounds.innerHTML(), initial);
    }
    const scored = await page.evaluate(() => {
      const scores = [], ends = [], old = Math.random;
      Math.random = () => .4;
      const game = OjjudaRunnerGame.create({ setScore: v => scores.push(v), end: v => ends.push(v) });
      try {
        for (let i = 0; i < 1800 && !game.state.ended; i++) game.update(1 / 60);
        const before = scores.length;
        game.update(1); game.onDown(0); game.update(1);
        return { hearts: game.state.hearts, ended: game.state.ended,
          callbacks: ends.length, stopped: scores.length === before, score: game.state.score };
      } finally { game.destroy(); Math.random = old; }
    });
    assert.equal(scored.hearts, 0, 'three impacts consume three hearts');
    assert.equal(scored.ended, true, 'collision eventually ends a run');
    assert.equal(scored.callbacks, 1, 'end callback fires once');
    assert.equal(scored.stopped, true, 'game over stops scoring');
    assert.ok(scored.score > 0);

    // Browser-render the actual generated vortex, multilayer bridge course,
    // and one-second squid ink. A safe fixture only disables damage for travel.
    const safeRunnerSource = fs.readFileSync(path.join(root, 'games/runner/runner-game.js'), 'utf8')
      .replace('function hit() {', 'function hit() { return;');
    const vortex = await page.evaluate(source => {
      window.__originalRunner = OjjudaRunnerGame;
      new Function(source)();
      window.__hardRunner = OjjudaRunnerGame.create({ setScore: () => {}, end: () => {} });
      for (let i = 0; i < 6500 && !__hardRunner.state.vortexRemaining; i++)
        __hardRunner.update(1 / 60);
      __hardRunner.draw(document.querySelector('#gcv').getContext('2d'));
      return __hardRunner.state;
    }, safeRunnerSource);
    assert.ok(vortex.vortexRemaining > 0, '1300px/s displays the center-screen vortex');
    if (process.env.RUNNER_VORTEX_PROOF)
      await page.screenshot({ path: process.env.RUNNER_VORTEX_PROOF });
    const hard = await page.evaluate(() => {
      for (let i = 0; i < 400 && (__hardRunner.state.chapter < 2 ||
           !__hardRunner.state.gaps.some(g => g.x < 350 && g.x + g.w > 700)); i++)
        __hardRunner.update(1 / 60);
      __hardRunner.draw(document.querySelector('#gcv').getContext('2d'));
      return __hardRunner.state;
    });
    assert.equal(hard.chapter, 2, 'vortex launches a distinct hard-mode chapter');
    assert.ok(hard.platformFloors.includes(2) && hard.platformFloors.includes(3),
      'two and three-floor courses are visible in a browser');
    assert.ok(hard.gaps.length > 0, 'hard-mode floor contains a real gap');
    if (process.env.RUNNER_HARD_PROOF)
      await page.screenshot({ path: process.env.RUNNER_HARD_PROOF });
    const ink = await page.evaluate(() => {
      for (let i = 0; i < 900 && __hardRunner.state.inkRemaining < .6; i++)
        __hardRunner.update(1 / 60);
      __hardRunner.draw(document.querySelector('#gcv').getContext('2d'));
      return __hardRunner.state;
    });
    assert.ok(ink.inkRemaining > .6 && ink.inkRemaining <= 1,
      'one-second squid-ink overlay renders above the stage');
    if (process.env.RUNNER_INK_PROOF)
      await page.screenshot({ path: process.env.RUNNER_INK_PROOF });
    await page.evaluate(() => {
      __hardRunner.destroy(); OjjudaRunnerGame = __originalRunner;
      delete window.__hardRunner; delete window.__originalRunner;
    });
    await page.evaluate(() => runnerTest.close());
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: responsive runner, 1300 vortex, 2F/3F gaps, squid ink, jumps, pause, music, three-heart result');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
