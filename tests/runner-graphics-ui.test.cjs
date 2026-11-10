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
    await page.evaluate(() => OjjudaGameAssets.load('runner'));
    assert.equal(await page.evaluate(() => OjjudaGameAssets.ready('runner')), true);
    assert.equal(typeof (await page.evaluate(() => OjjudaRunnerGame.ready)), 'boolean');
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
      const box = await page.locator('#gov .gbox').boundingBox();
      const visible = await page.locator('#gcv').boundingBox();
      const pixels = await page.locator('#gcv').evaluate(c => ({ width: c.width, height: c.height }));
      assert.ok(box.x >= -.5 && box.y >= -.5 && box.x + box.width <= width + .5 &&
        box.y + box.height <= height + .5, 'game and controls fit every viewport');
      assert.ok(Math.abs(visible.width / visible.height - pixels.width / pixels.height) < .005,
        'canvas matches CSS ratio without distorted shapes');
      assert.ok(await page.locator('.jju-controls [data-g="key:ArrowUp"]').isVisible());
      assert.ok(await page.locator('.jju-controls [data-g="key:ArrowDown"]').isVisible());
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
    await page.evaluate(() => runnerTest.close());
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: responsive ocean runner, jump, double jump, slide, pause, music, three-heart result, no old sprite dependencies');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
