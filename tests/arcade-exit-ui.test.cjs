const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.join(__dirname, '..');
let world = fs.readFileSync(path.join(root, 'world.html'), 'utf8')
  .replace(/<script\b[^>]*\bsrc=[^>]*>\s*<\/script>/g, '')
  .replace('import { screw3d as screwGame } from "./screw3d.js";', 'const screwGame = {};');
const boot = world.indexOf('j1(()=>H());gm(');
assert.ok(boot > 0, 'The test must use the real application module');
world = world.slice(0, boot) + `
window.arcadeTest = {
  open: Al, finish: S2,
  get current() { return R; },
  remember() {
    this.saved = R.game;
    this.destroyed = 0;
    const destroy = R.game.destroy;
    R.game.destroy = (...args) => { this.destroyed++; return destroy?.apply(this.saved, args); };
  }
};
g.tab = 'friends'; H();
` + world.slice(world.indexOf('</script>', boot));

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  let checks = 0;
  try {
    for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
      const context = await browser.newContext({ viewport, hasTouch: viewport.width < 600, reducedMotion: 'reduce' });
      await context.route('**/*', route => route.request().url() === 'http://127.0.0.1:8765/world.html'
        ? route.fulfill({ contentType: 'text/html', body: world }) : route.abort());
      const page = await context.newPage();
      const errors = [], prompts = [];
      let accept = false, hold = 0;
      page.on('pageerror', error => errors.push(error.message));
      page.on('dialog', async dialog => {
        prompts.push({ type: dialog.type(), message: dialog.message() });
        if (hold) await new Promise(resolve => setTimeout(resolve, hold));
        await (accept ? dialog.accept() : dialog.dismiss());
      });
      if (process.env.OJJUDA_OFFLINE_TEST === '1') await page.setContent(world);
      else await page.goto('http://127.0.0.1:8765/world.html');
      await page.waitForFunction(() => window.arcadeTest);
      const closeButton = () => page.locator('#gov .ghead [data-g="close"]');
      async function open(id, start = false) {
        await page.evaluate(id => arcadeTest.open(id), id);
        await page.waitForSelector('#gov');
        if (start) {
          await page.locator('#gov [data-g="start"]').click();
          await page.waitForFunction(() => arcadeTest.current?.running);
          await page.evaluate(() => arcadeTest.remember());
        }
      }
      for (const id of ['mole', 'runner', 'stacker', 'breakout']) {
        let count = prompts.length;
        await open(id);
        await closeButton().click();
        assert.equal(await page.locator('#gov').count(), 0, `${id}: start screen closes immediately`);
        assert.equal(prompts.length, count, `${id}: no prompt before playing`);
        checks++;

        await open(id, true);
        accept = false; hold = 200;
        await closeButton().click();
        assert.equal(prompts.length, count + 1, `${id}: active close asks once`);
        assert.equal(prompts.at(-1).type, 'confirm');
        assert.match(prompts.at(-1).message, /게임을 나갈까요/);
        await page.waitForFunction(() => arcadeTest.current?.running);
        assert.deepEqual(await page.evaluate(() => ({
          same: arcadeTest.current.game === arcadeTest.saved,
          running: arcadeTest.current.running,
          destroyed: arcadeTest.destroyed,
          gaming: document.body.classList.contains('gaming')
        })), { same: true, running: true, destroyed: 0, gaming: true }, `${id}: cancel preserves the same game`);
        checks++;

        hold = 0; accept = true;
        await closeButton().click();
        await page.waitForFunction(() => arcadeTest.current === null);
        assert.equal(prompts.length, count + 2, `${id}: exit asks only once more`);
        assert.equal(await page.locator('#gov').count(), 0);
        assert.deepEqual(await page.evaluate(() => [arcadeTest.destroyed, document.body.classList.contains('gaming')]), [1, false]);
        await page.keyboard.press('Escape');
        assert.equal(prompts.length, count + 2, `${id}: closed game has no keyboard listener`);
        checks++;
      }

      let count = prompts.length;
      await open('mole');
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#gov').count(), 0);
      assert.equal(prompts.length, count, 'Escape on start screen needs no confirmation');
      checks++;

      await open('mole', true);
      accept = false;
      await page.keyboard.press('Escape');
      assert.equal(prompts.length, ++count, 'Escape asks during play');
      assert.equal(await page.evaluate(() => arcadeTest.current.game === arcadeTest.saved), true);
      accept = true;
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => arcadeTest.current === null);
      assert.equal(prompts.length, ++count);
      checks++;

      // Existing in-game album Escape handling must retain priority over exit.
      await open('mole', true);
      await page.evaluate(() => {
        const game = arcadeTest.current.game;
        game.state = { albumOpen: true };
        game.onKey = key => {
          if (key !== 'Escape' || !game.state.albumOpen) return false;
          game.state.albumOpen = false; return true;
        };
      });
      await page.keyboard.press('Escape');
      assert.equal(prompts.length, count);
      assert.equal(await page.evaluate(() => arcadeTest.current.running && !arcadeTest.current.game.state.albumOpen), true);
      checks++;

      // Explicit internal replacement still performs cleanup without prompting.
      await open('runner');
      assert.equal(prompts.length, count);
      assert.equal(await page.evaluate(() => arcadeTest.destroyed), 1);
      assert.equal(await page.evaluate(() => arcadeTest.current.id), 'runner');
      await closeButton().click();
      checks++;

      await open('mole', true);
      await page.evaluate(() => arcadeTest.finish(7));
      await page.waitForSelector('#gres');
      await page.locator('#gscreen [data-g="close"]').click();
      assert.equal(await page.locator('#gov').count(), 0);
      assert.equal(prompts.length, count, 'Result screen closes without another question');
      checks++;
      assert.deepEqual(errors, [], 'No application script errors');
      await context.close();
    }
    console.log(`PASS: ${checks} arcade exit checks; four games, mobile/desktop, cancel/resume, confirmed cleanup, Escape, album priority, replacement and results`);
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
