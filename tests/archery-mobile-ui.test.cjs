const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const proof = process.env.ARCHERY_MOBILE_PROOF_DIR;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})
  });
  try {
    for (const viewport of [
      {width: 320, height: 640},
      {width: 360, height: 780},
      {width: 390, height: 844},
      {width: 768, height: 900},
      {width: 1280, height: 800}
    ]) {
      const page = await browser.newPage({viewport, isMobile: viewport.width < 800, hasTouch: true, reducedMotion: 'reduce'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => {
        const url = new URL(route.request().url());
        if (url.hostname !== 'fixture.test') return route.abort();
        const file = path.resolve(root, '.' + decodeURIComponent(url.pathname));
        if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
        return route.fulfill({path: file});
      });
      await page.goto('https://fixture.test/games/forest-archer/index.html');
      await page.locator('#gameCanvas').waitFor({state: 'visible'});
      await page.locator('#stageName').waitFor({state: 'visible'});

      const boxes = await page.evaluate(() => {
        const box = selector => {
          const rect = document.querySelector(selector)?.getBoundingClientRect();
          return rect && {x: rect.x, width: rect.width, right: rect.right, height: rect.height};
        };
        return {
          pageWidth: document.documentElement.scrollWidth,
          headingCount: document.querySelectorAll('.page-heading').length,
          layout: box('.game-layout'),
          field: box('#field'),
          canvas: box('#gameCanvas'),
          ranking: box('.monthly-game-link')
        };
      });
      assert.equal(boxes.headingCount, 0, 'a decorative heading cannot steal mobile playfield width');
      assert.ok(boxes.pageWidth <= viewport.width + 1, `${viewport.width}px: no horizontal page overflow`);
      for (const key of ['layout', 'field', 'canvas']) {
        const rect = boxes[key];
        assert.ok(rect && rect.width >= viewport.width * .90 && rect.x <= viewport.width * .06
          && rect.right <= viewport.width + 1, `${viewport.width}px: ${key} uses the full play width: ${JSON.stringify(rect)}`);
      }
      assert.ok(boxes.field.height >= 230, `${viewport.width}px: the aiming field is usable`);
      assert.ok(boxes.ranking && boxes.ranking.x >= 0 && boxes.ranking.right <= viewport.width,
        `${viewport.width}px: monthly ranking stays inside the stage heading`);
      assert.equal(await page.locator('.monthly-game-link').getAttribute('href'),
        '/features/arcade/monthly-ranking.html?game=archery');
      assert.ok(await page.locator('.monthly-game-link').isVisible());
      await page.locator('#menuBtn').click();
      assert.equal(await page.locator('#modalTitle').innerText(), '게임 메뉴');
      await page.locator('#modalClose').click();
      assert.equal(await page.locator('#modalBackdrop').isVisible(), false, 'menu closes without hiding the game');
      assert.deepEqual(errors, [], `${viewport.width}px: no game runtime errors`);

      if (proof) {
        fs.mkdirSync(proof, {recursive: true});
        await page.screenshot({path: path.join(proof, `archery-${viewport.width}.png`)});
      }
      await page.close();
    }
    console.log('PASS: archery range, ranking shortcut and menu fit 320/360/390/768/1280px screens');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
