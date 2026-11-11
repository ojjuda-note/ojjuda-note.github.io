const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const welcome = require('../features/home/agit-welcome.js');
const library = require('../admin/asset-library.js');

const root = path.resolve(__dirname, '..');
const themeKeys = fs.readdirSync(path.join(root, 'features/home/theme-illustrations'))
  .filter(name => name.endsWith('.webp')).map(name => name.slice(0, -5));
const sampleThemes = { order: themeKeys, catalog: Object.fromEntries(themeKeys.map(key => [key,
  { name: key, copy: key + ' 회원 테마', period: '언제나' }])) };
const files = library.catalog(sampleThemes, welcome);
assert.equal(new Set(files.map(item => item.id)).size, files.length, 'gallery item IDs must be unique');
assert.equal(files.filter(item => item.category === 'themes').length, themeKeys.length * 2);
assert.equal(files.filter(item => item.category === 'popups').length, welcome.previewCatalog().length);
for (const item of files.filter(item => item.src)) {
  const source = path.join(root, item.src.split('?')[0]);
  assert.ok(fs.existsSync(source), 'missing public asset: ' + item.src);
}

const pageHtml = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>:root{--surface:#fff;--surface-2:#f4f6f5;--line:#dce5de;--ink:#26382d;--ink-2:#68796e;--accent:#245a48;--accent-ink:#245a48;--accent-soft:#e7eee4;--font-b:'Noto Sans KR',sans-serif}body{margin:0;padding:18px;background:#f7f8f4;font-family:'Noto Sans KR',sans-serif}</style>
<link rel="stylesheet" href="/admin/asset-library.css"><link rel="stylesheet" href="/features/home/agit-welcome.css">
<script src="/app/world/world-themes.js"></script><script src="/features/home/agit-welcome.js"></script><script src="/admin/asset-library.js"></script>
</head><body class="world-redesign"><div id="app"><div class="shell"></div></div><main id="library"></main>
<script>window.testController=window.OjjudaAdminAssetLibrary.mount({container:document.getElementById('library'),getAdminId:()=> 'synthetic-admin',isCurrent:()=>true});</script></body></html>`;

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'fixture.test') return route.abort();
      if (url.pathname === '/index.html') return route.fulfill({ contentType: 'text/html', body: pageHtml });
      const file = path.join(root, decodeURIComponent(url.pathname));
      return file.startsWith(root + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()
        ? route.fulfill({ path: file }) : route.abort();
    });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://fixture.test/index.html');
    await page.getByRole('heading', { name: '회원 눈에 보이는 오쭈다' }).waitFor();
    const actualTheme = await page.evaluate(() => OjjudaThemes.resolve(new Date()));
    assert.ok(await page.getByText('오늘 자동 테마').count(), 'today theme is marked');
    assert.equal(await page.locator(`.asset-lib-today-art img`).getAttribute('src'),
      '/features/home/theme-illustrations/' + actualTheme + '.webp?v=20261110-themes3');

    await page.locator('[data-library-filter="themes"]').click();
    assert.equal(await page.locator('[data-library-results] .asset-lib-card').count(), themeKeys.length * 2);
    await page.locator('[data-library-results] .asset-lib-picture').first().click();
    await page.locator('dialog.asset-lib-image-dialog[open]').waitFor();
    assert.ok(await page.locator('.asset-lib-preview-art img').getAttribute('src'));
    await page.locator('[data-library-close]').click();

    await page.locator('[data-library-filter="popups"]').click();
    assert.equal(await page.locator('[data-library-results] .asset-lib-card').count(), welcome.previewCatalog().length);
    await page.locator('[data-library-search]').fill('순위가 바뀌었어요');
    assert.equal(await page.locator('[data-library-results] .asset-lib-card').count(), 1);
    const storageBefore = await page.evaluate(() => localStorage.getItem('ojjuda.agit-welcome.v1:shown-day'));
    await page.locator('.asset-lib-view').click();
    await page.locator('dialog.agit-welcome-dialog[open]').waitFor();
    assert.match(await page.locator('#agit-welcome-title').textContent(), /순위가 바뀌었어요/);
    await page.locator('.agit-welcome-next').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('ojjuda.agit-welcome.v1:shown-day')), storageBefore,
      'administrator popup previews do not consume the daily greeting');

    await page.locator('[data-library-search]').fill('');
    await page.locator('[data-library-results] [data-library-open="popup-join-benefits"]').click();
    await page.locator('dialog.agit-join-dialog[open]').waitFor();
    assert.match(await page.locator('.agit-join-benefits').textContent(), /5천원 상품권/);
    await page.locator('.agit-welcome-next').click();

    await page.evaluate(() => OjjudaAgitWelcome.enter({member:false,isCurrent:()=>true}));
    await page.locator('dialog.agit-join-dialog[open]').waitFor({timeout:5000});
    await page.locator('.agit-welcome-next').click();
    await page.evaluate(() => OjjudaAgitWelcome.enter({member:false,isCurrent:()=>true}));
    assert.equal(await page.locator('dialog.agit-join-dialog[open]').count(), 0,
      'guest benefit prompt does not repeat on internal re-renders');
    await page.reload();
    await page.evaluate(() => OjjudaAgitWelcome.enter({member:false,isCurrent:()=>true}));
    await page.locator('dialog.agit-join-dialog[open]').waitFor({timeout:5000});
    assert.equal(await page.evaluate(() => localStorage.getItem('ojjuda.agit-welcome.v1:shown-day')), storageBefore,
      'guest benefit prompt does not write a once-per-day marker');
    assert.deepEqual(errors, [], 'browser errors: ' + errors.join('; '));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
