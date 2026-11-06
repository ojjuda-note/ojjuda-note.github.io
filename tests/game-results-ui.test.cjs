const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'shared/games/game-results.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'shared/games/game-results.css'), 'utf8');
test('result effects and all stage/share controls fit mobile and desktop without blocking interaction', async t => {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true, args: ['--no-sandbox'] });
  t.after(() => browser.close());
  const page = await browser.newPage(); const errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const [width, height] of [[320, 568], [390, 844], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    await page.goto('about:blank');
    await page.setContent('<style>body{margin:0;background:#eaf0e8;font-family:Arial,sans-serif}' + css + '</style><button id="open">게임</button>');
    await page.addScriptTag({ content: script });
    for (const outcome of ['success', 'failure', 'record', 'gold-loss']) {
      await page.evaluate(outcome => {
        window.actionCalls = 0; window.shareCalls = 0;
        navigator.share = async () => { window.shareCalls++; };
        OjjudaGameResults.show({ game: 'spot', outcome, key: outcome + Math.random(), metric: outcome === 'record' ? '9레벨 · 59분 42초' : '8레벨 · 10 / 10',
          encouragement: outcome === 'failure' ? '조금만 더, 다시 도전해요!' : '', actions: [
            { label: '이전', onClick: () => { window.actionCalls++; return false; } },
            { label: '지금', onClick: () => { window.actionCalls++; return false; } },
            { label: '다음', disabled: outcome === 'failure', onClick: () => { window.actionCalls++; return false; } }
          ] });
      }, outcome);
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector('dialog'), card = dialog.querySelector('.game-result-card');
        const r = card.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight,
          scrolls: dialog.scrollHeight > dialog.clientHeight + 1,
          blocked: [...card.querySelectorAll('button:not(:disabled)')].some(button => {
            const r = button.getBoundingClientRect(); const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return !button.contains(target);
          }), buttons: [...card.querySelectorAll('button')].map(button => button.getBoundingClientRect().height),
          particles: card.querySelector('.game-result-effects').childElementCount };
      });
      assert.ok(layout.x >= 0 && layout.y >= 0 && layout.right <= layout.width && layout.bottom <= layout.height, JSON.stringify({ width, height, outcome, layout }));
      assert.equal(layout.scrolls, false); assert.equal(layout.blocked, false); assert.ok(layout.buttons.every(height => height >= 44)); assert.ok(layout.particles > 0);
      await page.getByRole('button', { name: '지금', exact: true }).click(); await page.getByRole('button', { name: '공유하기', exact: true }).click();
      assert.deepEqual(await page.evaluate(() => [window.actionCalls, window.shareCalls]), [1, 1]);
      if (width === 390 && outcome === 'success' && process.env.GAME_RESULTS_SCREENSHOT) await page.screenshot({ path: process.env.GAME_RESULTS_SCREENSHOT });
      await page.evaluate(() => OjjudaGameResults.close());
    }
  }
  assert.deepEqual(errors, []);
});
