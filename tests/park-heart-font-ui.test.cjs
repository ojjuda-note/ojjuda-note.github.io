const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const origin = 'https://park-heart.test';
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('note/preview.js');
const boot = source.lastIndexOf('\nif (client) {\n  client.auth.onAuthStateChange');
assert.ok(boot > 0);
const html = read('park/index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const family = locator => locator.evaluate(element =>
  getComputedStyle(element).fontFamily.split(',')[0].replace(/["']/g, '').trim());

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const errors = [], fontReads = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/park/') return route.fulfill({ contentType: 'text/html', body: html });
      if (url.pathname === '/admin-fonts.html') return route.fulfill({ contentType: 'text/html', body:
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><main id="host"></main><script src="/admin/world-admin-loader.js"></script>' });
      const file = path.resolve(root, '.' + url.pathname);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort();
      if (url.pathname === '/park/assets/fonts/single-day.woff2') fontReads.push(url.pathname);
      return route.fulfill({ path: file });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/park/');
    await page.evaluate(() => {
      document.documentElement.classList.add('park-embedded');
      window.confirm = () => true;
      window.OJJUDA_CONFIG = { supabaseUrl: 'https://fixture.invalid', supabaseKey: 'fixture' };
      const until = new Date(Date.now() + 86400000).toISOString();
      window.fixtureClient = {
        auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
        schema() { return this; },
        rpc(name) {
          const data = name === 'ju_shop_state' ? { ok: true, coins: 100, selected: {},
            owned: ['card_fonts', 'card_stickers', 'card_foil'].map(key => ({ key, expires_at: until })) } : [];
          const request = Promise.resolve({ data }); request.abortSignal = () => request; return request;
        }
      };
      window.supabase = { createClient: () => fixtureClient };
    });
    await page.addScriptTag({ url: origin + '/features/wallet/ju-decorations.js' });
    await page.addScriptTag({ url: origin + '/note/composer-tools.js' });
    await page.addScriptTag({ content: source.slice(0, boot) });
    await page.evaluate(async () => {
      session = { user: { id: 'font-member' } }; authKnown = ready = myIdentityReady = true;
      myIdentity = { gender: 'female' }; myGender = 'female'; draftController = null;
      currentPosition = async () => ({ latitude: 37.5, longitude: 127 });
      prepareCardPhotoEdit = async () => {};
      await openComposer('memo');
      OjjudaDecorations.install({ client: fixtureClient, getUserId: () => session.user.id });
      await OjjudaDecorations.refresh();
      OjjudaDecorations.setStyle({ shopFont: 'poster', shopSticker: 'heart', shopEffect: 'foil' });
    });
    const text = page.locator('#compose-text');
    await text.fill('가나다 하트\n1234567890');
    await page.locator('[data-compose-tool="font"]').click();
    await page.locator('#compose-font').selectOption('heart');
    assert.equal(await family(text), 'Single Day', 'the writing field uses the selected heart font');
    const glyphs = await page.evaluate(async () => {
      const loaded = await document.fonts.load('400 72px "Single Day"', '가나다하트1234567890');
      const canvas = document.createElement('canvas'); canvas.width = 160; canvas.height = 120;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      function glyph(char, font) {
        ctx.clearRect(0, 0, 160, 120); ctx.font = '400 72px ' + font; ctx.fillText(char, 8, 90);
        const data = ctx.getImageData(0, 0, 160, 120).data;
        let ink = 0, hash = 2166136261;
        for (let i = 3; i < data.length; i += 4) { ink += data[i] > 0; hash = Math.imul(hash ^ data[i], 16777619); }
        return { ink, hash };
      }
      return { loaded: loaded.length, checks: [...'가나다하트1234567890'].map(char => {
        const ink = glyph(char, '"Single Day"');
        return { char, painted: ink.ink > 10, differsFromFallback: ink.hash !== glyph(char, 'serif').hash };
      }) };
    });
    assert.ok(glyphs.loaded > 0 && fontReads.length > 0, 'the local WOFF2 actually loads without a Google Fonts connection');
    for (const glyph of glyphs.checks) assert.ok(glyph.painted && glyph.differsFromFallback,
      glyph.char + ' is painted by the bundled font, not the system fallback');
    await page.locator('[data-compose-tool="effect"]').click();
    await page.locator('.ju-compose-tools summary').click();
    await page.locator('[data-shop-style="Font"]').selectOption('book');
    assert.equal(await page.locator('#compose-font').inputValue(), 'default');
    assert.equal(await family(text), 'Gowun Batang', 'choosing a purchased font updates the writing field too');
    await page.locator('[data-compose-tool="font"]').click();
    await page.locator('#compose-font').selectOption('heart');
    assert.equal(await family(text), 'Single Day');
    await page.evaluate(() => {
      const style = currentStyle(); closeComposer(false);
      feed.hidden = false; detail.hidden = true;
      list.replaceChildren(cardElement({ id: '00000000-0000-4000-8000-000000000001', kind: 'memo',
        body: '가나다 하트\n1234567890', tags: [], background_key: 'plain', style }));
    });
    assert.equal(await family(page.locator('#feed-list .card-quote')), 'Single Day', 'a saved card keeps the heart font');
    if (process.env.PARK_FONT_PROOF_DIR) {
      fs.mkdirSync(process.env.PARK_FONT_PROOF_DIR, { recursive: true });
      await page.screenshot({ path: path.join(process.env.PARK_FONT_PROOF_DIR, 'heart-card-390.png'), fullPage: true });
    }

    const admin = await context.newPage();
    admin.on('pageerror', error => errors.push(error.message));
    await admin.goto(origin + '/admin-fonts.html');
    await admin.evaluate(async () => {
      await OjjudaAdminAssets.load();
      window.fontCard = { id: '00000000-0000-4000-8000-000000000001', author_id: 'synthetic-member',
        kind: 'memo', body: '가나다 하트 123', tags: [], background_key: 'plain', total_count: 1 };
      window.adminCalls = [];
      const client = {
        schema() { return this; },
        auth: { async getSession() { return { data: { session: { user: { id: 'synthetic-admin' } } } }; },
          onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } },
        async rpc(name, args) {
          adminCalls.push({ name, args });
          if (name === 'is_note_moderator') return { data: true };
          if (name === 'admin_cards') return { data: [fontCard] };
          if (name === 'admin_card_visual') return { data: { background_key: 'plain',
            style: { font: 'heart', size: 'normal', shopFont: 'poster', shopSticker: 'heart', shopEffect: 'foil' },
            style_until: new Date(Date.now() + 86400000).toISOString(), photo_key: null, photo_until: null } };
          if (name === 'admin_edit_card_visual') return { data: true };
          if (['admin_risk_cards', 'admin_risk_passed_ids'].includes(name)) return { data: [] };
          throw new Error('Unexpected admin RPC: ' + name);
        }
      };
      await OjjudaNoteAdmin.mount(document.getElementById('host'), { client, initialTab: 'cards' });
    });
    await admin.getByRole('button', { name: '본문·태그 수정', exact: true }).click();
    await admin.locator('.na-edit-font-heart').waitFor();
    await admin.waitForFunction(() => [...document.fonts].some(face => face.family.replace(/["']/g, '') === 'Single Day'));
    await admin.evaluate(() => document.fonts.load('400 32px "Single Day"', '가나다하트123'));
    assert.equal(await family(admin.locator('.na-edit-quote')), 'Single Day', 'the real administrator loader includes the heart preview font');
    if (process.env.PARK_FONT_PROOF_DIR) await admin.screenshot({
      path: path.join(process.env.PARK_FONT_PROOF_DIR, 'heart-admin-390.png'), fullPage: true });
    await admin.evaluate(() => OjjudaNoteAdmin.refresh());
    await admin.locator('.na-more-actions summary').click();
    await admin.getByRole('button', { name: '꾸미기·사진 지정', exact: true }).click();
    assert.equal(await admin.getByLabel('글꼴', { exact: true }).inputValue(), 'heart', 'administrator editing recognizes an existing heart card');
    await admin.getByLabel('처리 사유', { exact: false }).fill('하트 글꼴 표시 확인');
    await admin.getByRole('button', { name: '꾸미기·사진 지정 저장', exact: true }).click();
    await admin.waitForFunction(() => adminCalls.some(call => call.name === 'admin_edit_card_visual'));
    const saved = await admin.evaluate(() => adminCalls.find(call => call.name === 'admin_edit_card_visual').args.p_style);
    assert.equal(saved.font, 'heart'); assert.equal(saved.shopFont, 'none');
    assert.equal(saved.shopSticker, 'heart'); assert.equal(saved.shopEffect, 'foil');
    assert.deepEqual(errors, []);
    await context.close();
    console.log('PASS: local heart font, Hangul and digits, purchased-font switching, saved-card rendering and administrator preview/save.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
