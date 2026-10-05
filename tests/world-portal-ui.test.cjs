const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://ojjuda.test';
const cardId = '00000000-0000-4000-8000-000000000010';

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/world.html') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>World destination fixture</title>' });
      const file = path.resolve(root, '.' + url.pathname + (url.pathname.endsWith('/') ? 'index.html' : ''));
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({ status: 404, body: 'Missing test file' });
      return route.fulfill({ path: file });
    });
    await context.addInitScript(() => {
      const user = { id: '00000000-0000-4000-8000-000000000001', email: 'fixture@example.invalid', user_metadata: { nickname: '테스터' } };
      const fixture = window.portalFixture = { user: new URL(location.href).searchParams.get('signed') === '1' ? user : null, signups: [], logins: [] };
      const client = {
        auth: {
          onAuthStateChange() {},
          async getSession() { return { data: { session: fixture.user ? { user: fixture.user } : null } }; },
          async getUser() { return { data: { user: fixture.user } }; },
          async signInWithPassword(args) { fixture.logins.push(args); fixture.user = user; return { data: { session: { user } } }; },
          async signUp(args) { fixture.signups.push(args); return { data: { session: null } }; },
          async signOut() { fixture.user = null; return { error: null }; }
        },
        from() { return { select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; } }; },
        async rpc(name) { assertRpc(name); return { data: true }; }
      };
      function assertRpc(name) { if (name !== 'ensure_member_for_note') throw Error('Unexpected fixture RPC: ' + name); }
      window.supabase = { createClient: () => client };
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(origin + '/');
      await page.locator('#account-actions:not([hidden])').waitFor();
      assert.equal(await page.locator('[data-destination]').count(), 1, 'one World entrance');
      assert.equal(await page.locator('[data-destination="world"]').count(), 1);
      assert.equal(await page.locator('[data-destination="note"]').count(), 0);
      assert.equal(await page.locator('.world-feature').count(), 5, 'all actual bottom menus');
      assert.ok(await page.locator('.world-welcome-visual img').evaluate(img => img.complete && img.naturalWidth > 0), 'existing room image loads');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'landing fits ' + width);
      await page.goto(origin + '/sitemap.html');
      assert.equal(await page.locator('[data-map-group]').count(), 8);
      assert.equal(await page.locator('[data-map-item]:visible').count(), 49);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'directory fits ' + width);
    }
    await page.locator('#map-search').fill('계산기');
    assert.equal(await page.locator('[data-map-item]:visible').count(), 1);
    assert.equal(await page.locator('#map-life').isVisible(), true);
    assert.match(await page.locator('#map-results').textContent(), /1개/);
    await page.locator('#map-search').fill('없는기능검사');
    assert.equal(await page.locator('[data-map-group]:visible').count(), 0);
    assert.equal(await page.locator('#map-empty').isVisible(), true);
    await page.locator('#map-search-clear').click();
    assert.equal(await page.locator('[data-map-item]:visible').count(), 49);
    await page.locator('#map-search').fill('사진');
    assert.ok(await page.locator('[data-map-item]:visible').count() > 1);
    await page.locator('#map-search').press('Escape');
    assert.equal(await page.locator('[data-map-item]:visible').count(), 49);
    await page.locator('#map-life a[href="/guide.html#life-calculator"]').click();
    assert.equal(await page.locator('#life-tools').getAttribute('open'), '');
    assert.equal(await page.locator('#life-calculator').isVisible(), true, 'feature link opens the actual guide topic');
    await page.goto(origin + '/sitemap.html');
    await page.locator('#map-board a[href="/guide.html#community-board-games"]').click();
    assert.equal(await page.locator('#community-board-games').isVisible(), true);

    await page.goto(origin + '/');
    await page.locator('[data-destination="world"]').click();
    await page.locator('#auth-dialog[open]').waitFor();
    await page.locator('#email').fill('fixture@example.invalid');
    await page.locator('#password').fill('fixture-password');
    await page.locator('#auth-submit').click();
    await page.waitForURL(origin + '/world.html');
    await page.goto(origin + '/');
    await page.locator('#account-actions:not([hidden])').waitFor();
    await page.locator('[data-open-auth="signup"]').click();
    for (const [id, value] of Object.entries({ nickname: '테스터', email: 'fixture@example.invalid', password: 'fixture-password', 'password-confirm': 'fixture-password', 'signup-birth': '000101', 'signup-code': '3', 'signup-phone': '01012345678' })) await page.locator('#' + id).fill(value);
    await page.locator('#age-check').check();
    await page.locator('#policy-check').check();
    await page.locator('#auth-submit').click();
    await page.waitForFunction(() => portalFixture.signups.length === 1);
    const confirmation = await page.evaluate(() => portalFixture.signups[0].options.emailRedirectTo);
    assert.equal(new URL(confirmation).searchParams.get('next'), 'world', 'header signup resumes World');

    await page.goto(origin + '/?next=world&signed=1');
    await page.waitForURL(origin + '/world.html');
    await page.goto(origin + '/?next=note&card=' + cardId + '&signed=1');
    await page.waitForURL(url => url.pathname === '/world.html' && url.searchParams.get('place') === 'park' && url.searchParams.get('card') === cardId);
    assert.deepEqual(errors, [], 'no controller or directory runtime failures');
    console.log('PASS: unified World entrance, header signup return, existing sessions and old Park/card links; 49 searchable features, real guide targets, room asset and four responsive widths. No live accounts or messages.');
    await context.close();
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
