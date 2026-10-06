const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const world = read('world.html');
const begin = world.indexOf('function worldProfileAvatar(');
const end = world.indexOf('function Zg()', begin);
const menu = world.slice(begin, end);
const packages = [[1000,10,0],[3000,30,0],[5000,50,5],[10000,100,10],[30000,300,35],[50000,500,50]];

async function fixture(context, source, rpc) {
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'fixture.test' && /^\/ju-coins\/(coin|10|30|50|100|300|500)\.svg$/.test(url.pathname)) {
      return route.fulfill({ path: path.join(root, url.pathname), contentType: 'image/svg+xml' });
    }
    return route.abort();
  });
  await page.exposeFunction('chargeRpc', rpc);
  if (source === 'world') {
    await page.setContent('<base href="https://fixture.test/"><meta name="viewport" content="width=device-width,initial-scale=1"><main class="main" id="world-my"></main>');
    for (const match of world.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) await page.addStyleTag({ content: match[1] });
    await page.evaluate(() => {
      window.$ = { coins: 70, settings: { accent: 'pink', theme: 'light', defaultVis: 'all', notify: {} }, me: { nick: '검사 회원', bio: '', mood: '😊', moodText: '' }, album: [] };
      window.D = { online: true, user: { id: 'synthetic-user', email: 'test@example.invalid' } };
      Object.assign(window, { g: {}, yi: ['😊'], Jn: [['all','전체 공개']], ce: { ready: true, list: [] }, Go: 'test', w: String, ie: () => '<svg></svg>', Xd: () => '/note/', Is: () => false, Os: () => '' });
    });
    await page.addScriptTag({ content: menu });
    await page.evaluate(() => { document.querySelector('#world-my').innerHTML = Yg(); });
  } else {
    await page.setContent('<base href="https://fixture.test/">' + read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<link\b[^>]*>/gi, ''));
    for (const file of ['note/style.css','note/features.css','note/world-navigation.css','note/account.css']) await page.addStyleTag({ content: read(file) });
    await page.addScriptTag({ content: read('note/navigation.js') });
    await page.locator('[data-note-my]:visible').first().click();
  }
  await page.addStyleTag({ content: read('my-menu.css') + read('ju-charge.css') + read('ju-coins.css') });
  if (process.env.JU_CHARGE_FONT) {
    const font = fs.readFileSync(process.env.JU_CHARGE_FONT).toString('base64');
    await page.addStyleTag({ content: `@font-face{font-family:ChargeQA;src:url(data:font/otf;base64,${font})}:root{--font-b:ChargeQA,sans-serif;--font-d:ChargeQA,sans-serif}body,.ju-charge-dialog{font-family:ChargeQA,sans-serif}` });
    await page.evaluate(() => document.fonts.ready);
  }
  await page.addScriptTag({ content: read('ju-charge.js') });
  await page.evaluate(source => {
    window.chargeUser = 'synthetic-user';
    window.chargeBalance = 70;
    window.OjjudaCharge.install({
      source, getUserId: () => chargeUser,
      client: { rpc: (...args) => chargeRpc(...args), auth: { onAuthStateChange(handler) { window.chargeAuth = handler; return { data: { subscription: { unsubscribe() {} } } }; } } },
      onBalance: (coins, user) => { if (user === chargeUser) chargeBalance = coins; }
    });
  }, source);
  return { page, errors };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
      const context = await browser.newContext({ viewport });
      let used = 0, coins = 70, enabled = true, fail = false, writes = 0;
      const rpc = async (name, args) => {
        if (fail) return { error: { message: 'offline' } };
        if (name === 'beta_charge_status') return { data: { ok: true, enabled, coins, used, limit: 5, left: Math.max(5-used,0) } };
        assert.equal(name, 'beta_charge');
        assert.deepEqual(Object.keys(args), ['pack'], 'the client never submits a price, credit amount or user ID');
        ++writes;
        await new Promise(resolve => setTimeout(resolve, 60));
        if (used >= 5) return { data: { ok: false, reason: 'limit' } };
        const item = packages.find(([won]) => args.pack === 'p'+won);
        assert.ok(item);
        used++; coins += item[1] + item[2];
        return { data: { ok: true, coins, added: item[1] + item[2], base: item[1], bonus: item[2], left: 5-used, limit: 5 } };
      };
      const fixtures = [];
      for (const source of ['world','note']) {
        const current = await fixture(context, source, rpc); fixtures.push(current);
        const { page } = current;
        const entry = page.locator('.ju-charge-entry');
        assert.equal(await entry.count(), 1);
        assert.equal(await entry.evaluate(node => node.parentElement.nextElementSibling.querySelector('.my-menu-title').textContent), '도움말');
        assert.equal(await entry.evaluate(node => getComputedStyle(node).borderTopWidth), '0px');
        if (process.env.JU_CHARGE_QA_DIR) {
          fs.mkdirSync(process.env.JU_CHARGE_QA_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.JU_CHARGE_QA_DIR, `${source}-menu-${viewport.width}.png`), fullPage: true });
        }
        await entry.click();
        const dialog = page.getByRole('dialog', { name: 'ZU 충전', exact: true });
        await page.waitForFunction(() => !document.querySelector('.ju-charge-checkout').disabled);
        assert.equal(await dialog.locator('[data-ju-pack]').count(), 6);
        assert.equal(await dialog.evaluate(node => getComputedStyle(node).backgroundColor), await page.evaluate(() => { const probe = document.createElement('div'); probe.style.backgroundColor = 'var(--surface)'; document.body.append(probe); const color = getComputedStyle(probe).backgroundColor; probe.remove(); return color; }));
        for (const [won, count, bonus] of packages) {
          const pack = dialog.locator(`[data-ju-pack="p${won}"]`);
          assert.match(await pack.textContent(), new RegExp(count+'\\s*ZU'));
          await pack.click();
          assert.equal(await pack.getAttribute('aria-pressed'), 'true');
          assert.equal(await dialog.locator('[data-ju-total]').textContent(), `총 ${count + bonus} ZU`);
          if (bonus) assert.equal(await pack.locator('.ju-charge-bonus').textContent(), `+${bonus} ZU 보너스`);
          assert.equal(await dialog.locator('[aria-pressed="true"]').count(), 1);
        }
        assert.equal(await dialog.locator('[data-ju-price]').textContent(), '0원 (베타 무료)');
        await dialog.locator('.ju-charge-checkout').evaluate(button => { button.click(); button.click(); });
        await page.waitForFunction(() => document.querySelector('[data-ju-result]').textContent.includes('550 ZU'));
        await page.waitForFunction(() => !document.querySelector('.ju-charge-checkout').disabled);
        assert.equal(writes, source === 'world' ? 1 : 2, 'rapid double activation sends one credit request');
        assert.equal(await dialog.locator('[data-ju-remaining]').textContent(), `오늘 5회 중 ${5-used}회 남았어요`);
        assert.equal(await page.evaluate(() => chargeBalance), coins);
        assert.equal(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1), true, 'charge contents fit the viewport');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
        if (process.env.JU_CHARGE_QA_DIR) {
          fs.mkdirSync(process.env.JU_CHARGE_QA_DIR, { recursive: true });
          await page.screenshot({ path: path.join(process.env.JU_CHARGE_QA_DIR, `${source}-${viewport.width}.png`) });
        }
        await page.keyboard.press('Escape');
        assert.equal(await dialog.isVisible(), false);
        assert.equal(await entry.evaluate(node => node === document.activeElement), true, 'closing returns focus to the menu');
      }
      const { page } = fixtures[0];
      await page.locator('.ju-charge-entry').click();
      await page.waitForFunction(() => !document.querySelector('.ju-charge-checkout').disabled);
      assert.equal(await page.locator('[data-ju-remaining]').textContent(), '오늘 5회 중 3회 남았어요', 'World sees the allowance spent in Note');
      for (let i = 0; i < 3; i++) {
        await page.locator('.ju-charge-checkout').click();
        await page.waitForFunction(left => document.querySelector('[data-ju-remaining]').textContent.includes(`${left}회 남았어요`), 2-i);
      }
      assert.equal(await page.locator('.ju-charge-checkout').isDisabled(), true);
      assert.equal(writes, 5);
      await page.evaluate(() => { chargeUser = null; chargeAuth('SIGNED_OUT'); });
      await page.waitForFunction(() => document.querySelector('[data-ju-balance]').textContent === '로그인 후 확인');
      assert.equal(await page.locator('.ju-charge-checkout').isDisabled(), true);
      assert.equal(await page.locator('[data-ju-login]').isVisible(), true);
      enabled = false;
      await page.evaluate(() => { chargeUser = 'synthetic-user'; chargeAuth('SIGNED_IN'); });
      await page.waitForFunction(() => document.querySelector('.ju-charge-checkout').textContent === '결제 준비 중');
      assert.equal(await page.locator('.ju-charge-checkout').isDisabled(), true, 'closed beta never falls back to unverified payment');
      fail = true;
      await page.locator('.ju-charge-refresh').click();
      await page.waitForFunction(() => document.querySelector('[data-ju-balance]').textContent === '확인할 수 없어요');
      assert.equal(await page.locator('.ju-charge-checkout').isDisabled(), true);
      for (const current of fixtures) assert.deepEqual(current.errors, []);
      await context.close();
    }
    console.log('PASS: Note/World menus, six packages, mobile/desktop layouts, shared allowance, duplicate-click protection, balance updates, sign-out, errors and closed beta');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
