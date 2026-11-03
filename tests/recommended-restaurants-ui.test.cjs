/* Chromium CI checks: real image decoding, a narrow viewport, scrolling and native dialogs. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { installRecommendedRestaurantsFixture, recommendation } = require('./helpers/recommended-restaurants-fixture.cjs');

const root = path.resolve(__dirname, '..');
const origin = 'https://fixture.test';
const proof = process.env.RECOMMENDED_RESTAURANTS_PROOF_DIR;
const markup = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/restaurant-ratings.css"><link rel="stylesheet" href="/recommended-restaurants.css"><style>body{margin:0;overflow:auto;font:16px system-ui}#world-content{min-height:1800px;padding:12px}#world-entry{min-height:44px}</style></head><body><main id="world-content"><button id="world-entry">회원 추천맛집 열기</button><p>아지트 배경 화면</p></main><script src="/restaurant-ratings.js"></script><script src="/recommended-restaurants.js"></script><script>rrFixture.loginRequests=0;window.rrUI=OjjudaRecommendedRestaurants.create({client:rrFixture.client,getUser:rrFixture.getUser,notify:rrFixture.notify,onLogin:()=>rrFixture.loginRequests++});document.getElementById('world-entry').onclick=()=>rrUI.open();</script></body></html>`;

async function fixture(t, options = {}) {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  const context = await browser.newContext({ viewport: { width: 370, height: 740 }, hasTouch: true, reducedMotion: 'reduce' });
  await context.addInitScript({ content: '(' + installRecommendedRestaurantsFixture.toString() + ')(window,' + JSON.stringify(options) + ');' });
  await context.addInitScript(() => {
    window.rrObjectURLs = new Set();
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
    URL.createObjectURL = blob => { const url = create(blob); rrObjectURLs.add(url); return url; };
    URL.revokeObjectURL = url => { rrObjectURLs.delete(url); return revoke(url); };
  });
  const escaped = [], errors = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { escaped.push(url.href); return route.abort(); }
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: markup });
    if (!['/recommended-restaurants.js', '/recommended-restaurants.css', '/restaurant-ratings.js', '/restaurant-ratings.css'].includes(url.pathname)) return route.abort();
    return route.fulfill({ path: path.join(root, url.pathname.slice(1)) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/fixture');
  const png = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 2400; canvas.height = 1200;
    const ctx = canvas.getContext('2d');
    for (const [index, color] of ['#ea503f', '#41a45f', '#3a68cc'].entries()) { ctx.fillStyle = color; ctx.fillRect(index * 800, 0, 800, 1200); }
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
    for (const key of rrFixture.files.keys()) rrFixture.files.set(key, jpeg);
    return Array.from(new Uint8Array(await (await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))).arrayBuffer()));
  }));
  t.after(async () => {
    await context.close(); await browser.close();
    assert.deepEqual(errors, [], 'no uncaught browser errors');
    assert.deepEqual(escaped, [], 'the fixture never reaches a real API or public photo service');
  });
  const rr = name => page.locator('[data-rr="' + name + '"]');
  let sequence = 0;
  return {
    page, rr, context,
    async choose(count) {
      await rr('photo-input').setInputFiles(Array.from({ length: count }, () => ({ name: '사용자원본사진-' + (++sequence) + '.png', mimeType: 'image/png', buffer: png })));
    },
    async photos(count) { await page.waitForFunction(expected => { const buttons = [...document.querySelectorAll('[data-rr="photo-remove"]')]; return buttons.length === expected && buttons.every(button => !button.disabled); }, count); },
    async fields(values = {}) {
      for (const [name, value] of Object.entries({ name: '직접 추천한 식당', category: '한식', region: '대전', address: '대전 중구 중교로 45-5', menu: '손칼국수', reason: '직접 방문해서 먹은 국물과 면이 맛있었어요.', ...values })) {
        if (name === 'category' || name === 'region') await rr('field-' + name).selectOption(value);
        else await rr('field-' + name).fill(value);
      }
    },
    async fits() {
      assert.deepEqual(await rr('dialog').evaluate(dialog => {
        const rect = dialog.getBoundingClientRect(), body = dialog.querySelector('.rr-body');
        return { horizontal: dialog.scrollWidth <= dialog.clientWidth, bodyHorizontal: body.scrollWidth <= body.clientWidth, left: rect.left >= -1, right: rect.right <= innerWidth + 1, top: rect.top >= -1, bottom: rect.bottom <= innerHeight + 1, page: document.documentElement.scrollWidth <= innerWidth };
      }), { horizontal: true, bodyHorizontal: true, left: true, right: true, top: true, bottom: true, page: true });
    }
  };
}

test('370px member composer decodes real images, enforces one to twelve photos and stays scrollable and closable', { timeout: 90000 }, async t => {
  const f = await fixture(t), { page, rr } = f;
  await page.locator('#world-entry').click(); await rr('list').waitFor(); await rr('compose').first().click(); await rr('editor').waitFor();
  const maliciousName = '<img src=x onerror="window.memberRestaurantInjected=1">';
  const maliciousReason = '<script>window.memberRestaurantInjected=1</script> 실제 후기';
  await f.fields({ name: maliciousName, reason: maliciousReason });
  assert.match(await page.locator('.rr-photo-help').textContent(), /1~12장/);
  assert.equal(await rr('submit').isEnabled(), false, 'zero photos cannot be submitted');
  await f.choose(1); await f.photos(1); assert.equal(await rr('submit').isEnabled(), true);
  await rr('photo-remove').click(); await f.photos(0);
  assert.equal(await rr('submit').isEnabled(), false, 'removing the only photo disables submission');
  await f.choose(1); await f.photos(1); assert.equal(await rr('submit').isEnabled(), true);
  await f.fits(); await rr('submit').scrollIntoViewIfNeeded();
  assert.ok(await rr('editor').evaluate(body => body.scrollTop > 0), 'the editor scrolls to the submit control');
  assert.equal(await page.evaluate(() => scrollY), 0, 'the World behind the modal does not scroll');
  const close = await rr('close').boundingBox(), submit = await rr('submit').boundingBox();
  assert.ok(close.y >= 0 && close.y + close.height <= 740, 'close stays within the viewport');
  assert.ok(submit.y >= 0 && submit.y + submit.height <= 741, 'the submit action is reachable by scrolling');
  if (proof) { fs.mkdirSync(proof, { recursive: true }); await page.screenshot({ path: path.join(proof, 'member-composer-370.png') }); }
  await rr('submit').click(); await page.waitForFunction(() => rrFixture.rows.length === 1 && !document.querySelector('[data-rr="editor"]'));
  assert.equal(await page.locator('.rr-detail-name').textContent(), maliciousName);
  assert.equal(await page.locator('.rr-reason').textContent(), maliciousReason);
  assert.equal(await rr('dialog').locator('[onerror],script').count(), 0);
  assert.equal(await page.evaluate(() => window.memberRestaurantInjected), undefined);
  const saved = await page.evaluate(async () => {
    const row = rrFixture.rows[0], sizes = [];
    for (const path of row.photos) {
      const blob = rrFixture.files.get(path), image = await createImageBitmap(blob);
      sizes.push({ width: image.width, height: image.height, mime: blob.type, bytes: blob.size }); image.close();
    }
    return { row, sizes, uploads: rrFixture.calls.filter(call => call.type === 'upload') };
  });
  assert.equal(saved.row.photos.length, 1); assert.equal(saved.uploads.length, 1);
  assert.ok(saved.row.photos.every(photo => !photo.includes('사용자원본사진') && photo.endsWith('.jpg')));
  for (const size of saved.sizes) { assert.equal(size.width, 1600); assert.equal(size.height, 800); assert.equal(size.mime, 'image/jpeg'); assert.ok(size.bytes > 0 && size.bytes <= 4 * 1024 * 1024); }
  assert.equal(await page.locator('.rr-gallery-counter').textContent(), '1 / 1');
  assert.equal(await rr('gallery-next').isEnabled(), false);
  await f.fits();
  await page.keyboard.press('Escape'); await rr('list').waitFor();
  await rr('card').click(); await rr('edit').waitFor(); await rr('edit').click(); await rr('editor').waitFor(); await f.photos(1);
  await f.choose(12); await f.photos(12);
  assert.match(await rr('form-status').textContent(), /최대 12장/);
  await page.setViewportSize({ width: 370, height: 540 }); await f.fits(); await rr('submit').scrollIntoViewIfNeeded();
  assert.ok(await rr('editor').evaluate(body => body.scrollTop > 0));
  assert.equal(await rr('submit').isVisible(), true); assert.equal(await rr('close').isVisible(), true);
  if (proof) await page.screenshot({ path: path.join(proof, 'member-twelve-photos-short-viewport.png') });
  await rr('close').click(); await rr('confirm-dialog').waitFor(); await page.keyboard.press('Escape');
  await rr('confirm-dialog').waitFor({ state: 'detached' });
  assert.equal(await rr('editor').isVisible(), true); assert.equal(await rr('photo-remove').count(), 12, 'native cancel preserves the draft');
  await rr('close').click(); await rr('confirm-accept').click(); await rr('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => rrObjectURLs.size), 0);
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).overflow), 'auto');
  assert.equal(await page.evaluate(() => document.body.classList.contains('gaming')), false);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'world-entry');
  assert.equal(await page.evaluate(() => rrFixture.calls.filter(call => call.type === 'upload').length), 1, 'discarded new edit photos never upload');
});

test('native account change clears private image URLs and the guest prompt never fetches member records', { timeout: 60000 }, async t => {
  const item = recommendation(), f = await fixture(t, { rows: [item] }), { page, rr } = f;
  await page.locator('#world-entry').click(); await rr('card').waitFor(); await rr('card').click(); await rr('edit').waitFor();
  await page.waitForFunction(() => rrObjectURLs.size > 0);
  await page.evaluate(() => rrFixture.setUser({ id: rrFixture.secondMember }));
  await rr('dialog').waitFor({ state: 'detached' });
  await page.waitForFunction(() => rrObjectURLs.size === 0);
  await page.locator('#world-entry').click(); await rr('card').waitFor(); await rr('card').click(); await page.locator('.rr-detail-name').waitFor();
  assert.equal(await rr('edit').count(), 0); assert.equal(await rr('delete').count(), 0);
  await page.evaluate(() => rrFixture.setUser(null)); await rr('dialog').waitFor({ state: 'detached' });
  const reads = await page.evaluate(() => rrFixture.calls.filter(call => call.type === 'rpc').length);
  await page.locator('#world-entry').click(); await rr('login').waitFor(); await f.fits();
  assert.equal(await rr('card').count(), 0); assert.equal(await rr('compose').count(), 0);
  assert.equal(await page.evaluate(() => rrFixture.calls.filter(call => call.type === 'rpc').length), reads);
  await rr('login').click(); await rr('dialog').waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => rrFixture.loginRequests), 1);
});

test('member ratings use nine half-point choices, update one vote, survive reentry and fit a narrow phone', { timeout: 60000 }, async t => {
  const item = recommendation(), other = '10000000-0000-4000-8000-000000000002';
  const f = await fixture(t, { rows: [item], ratings: [{ kind: 'recommended', id: item.id, user_id: other, score: 3.5 }] });
  const { page, rr } = f;
  await page.locator('#world-entry').click(); await rr('card').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-rr="card"] .orr-average')?.textContent === '3.5');
  assert.equal(await rr('card').locator('.orr-count').textContent(), '· 1명', 'the list shows the aggregate from existing member votes');
  await rr('card').click();
  const editor = rr('dialog').locator('.orr-editor');
  await editor.waitFor();
  await page.waitForFunction(() => document.querySelector('.orr-editor .orr-fieldset')?.disabled === false);
  assert.deepEqual(await editor.locator('[data-orr="choice"]').evaluateAll(inputs => inputs.map(input => Number(input.value))), [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]);
  assert.equal(await editor.locator('[data-orr="choice"]:checked').count(), 0, 'another member vote is not mistaken for my own');
  assert.equal(await editor.locator('[data-orr="save"]').isEnabled(), false);
  await editor.getByText('1.5점', { exact: true }).click();
  assert.equal(await editor.locator('[data-orr="choice"][value="1.5"]').isChecked(), true);
  await editor.locator('[data-orr="save"]').click();
  await page.waitForFunction(() => document.querySelector('.orr-editor .orr-status')?.textContent.includes('1.5점으로 저장했어요'));
  assert.equal(await editor.locator('.orr-average').textContent(), '2.5');
  assert.equal(await editor.locator('.orr-count').textContent(), '· 2명');
  assert.equal(await editor.locator('.orr-selected').textContent(), '1.5점 · 내 별점');
  assert.equal(await editor.locator('[data-orr="save"]').isEnabled(), false, 'a saved score is not submitted again without a change');
  await editor.getByText('4.5점', { exact: true }).click();
  assert.equal(await editor.locator('[data-orr="save"]').textContent(), '별점 수정');
  await editor.locator('[data-orr="save"]').click();
  await page.waitForFunction(() => document.querySelector('.orr-editor .orr-status')?.textContent.includes('4.5점으로 저장했어요'));
  assert.equal(await editor.locator('.orr-average').textContent(), '4.0');
  assert.equal(await editor.locator('.orr-count').textContent(), '· 2명', 'editing replaces my vote without increasing the participant count');
  const saved = await page.evaluate(() => ({
    votes: [...rrFixture.ratings.values()].map(({ user_id, score }) => ({ user_id, score })),
    saves: rrFixture.calls.filter(call => call.name === 'set_restaurant_rating').map(call => ({ kind: call.parameters.p_kind, id: call.parameters.p_id, score: call.parameters.p_score, owner: call.owner }))
  }));
  assert.deepEqual(saved.votes, [{ user_id: other, score: 3.5 }, { user_id: item.owner_id, score: 4.5 }]);
  assert.deepEqual(saved.saves, [1.5, 4.5].map(score => ({ kind: 'recommended', id: item.id, score, owner: item.owner_id })));
  await page.keyboard.press('Escape'); await rr('list').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-rr="card"] .orr-average')?.textContent === '4.0');
  assert.equal(await rr('card').locator('.orr-count').textContent(), '· 2명');
  await rr('card').click();
  await page.waitForFunction(() => document.querySelector('.orr-editor [data-orr="choice"][value="4.5"]')?.checked === true);
  assert.equal(await editor.locator('.orr-selected').textContent(), '4.5점 · 내 별점', 'reopening restores the saved personal score');
  for (const width of [370, 320]) {
    await page.setViewportSize({ width, height: 740 }); await f.fits();
    await editor.locator('.orr-choices').scrollIntoViewIfNeeded();
    assert.equal(await editor.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return element.scrollWidth <= element.clientWidth + 1 && rect.left >= -1 && rect.right <= innerWidth + 1 && [...element.querySelectorAll('.orr-choice')].every(choice => {
        const box = choice.getBoundingClientRect(); return box.width > 0 && box.height >= 44 && box.left >= rect.left - 1 && box.right <= rect.right + 1;
      });
    }), true, 'all nine touch choices fit within the ' + width + 'px rating editor');
  }
  await page.keyboard.press('Escape'); await rr('list').waitFor();
  await rr('close').click(); await rr('dialog').waitFor({ state: 'detached' });
  await page.locator('#world-entry').click(); await rr('card').waitFor(); await rr('card').click();
  await page.waitForFunction(() => document.querySelector('.orr-editor [data-orr="choice"][value="4.5"]')?.checked === true);
  assert.equal(await editor.locator('.orr-count').textContent(), '· 2명', 'closing the whole menu also preserves the vote');
});
