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
const markup = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/games/certified-restaurants/vendor/leaflet.css"><link rel="stylesheet" href="/games/certified-restaurants/restaurant-location-picker.css"><link rel="stylesheet" href="/games/certified-restaurants/restaurant-ratings.css"><link rel="stylesheet" href="/games/certified-restaurants/recommended-restaurants.css"><style>body{margin:0;overflow:auto;font:16px system-ui}#world-content{min-height:1800px;padding:12px}#world-entry{min-height:44px}</style></head><body><main id="world-content"><button id="world-entry">회원 추천맛집 열기</button><p>아지트 배경 화면</p></main><script src="/games/certified-restaurants/vendor/leaflet.js"></script><script src="/games/certified-restaurants/restaurant-location-picker.js"></script><script src="/games/certified-restaurants/restaurant-ratings.js"></script><script src="/games/certified-restaurants/recommended-restaurants.js"></script><script>rrFixture.loginRequests=0;window.rrUI=OjjudaRecommendedRestaurants.create({client:rrFixture.client,getUser:rrFixture.getUser,notify:rrFixture.notify,onLogin:()=>rrFixture.loginRequests++});document.getElementById('world-entry').onclick=()=>rrUI.open();</script></body></html>`;
const mapTile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><path fill="#edf0e4" d="M0 0h256v256H0z"/><path stroke="#fff" stroke-width="10" d="M0 125h256M128 0v256"/><path stroke="#c9d8bc" stroke-width="2" d="M0 80h256M0 190h256M50 0v256M210 0v256"/></svg>';

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
  const escaped = [], errors = [], tiles = [], reverseLookups = [];
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname)) { tiles.push(url.href); return route.fulfill({ contentType: 'image/svg+xml', body: mapTile }); }
    if (url.origin === 'https://photon.komoot.io' && url.pathname === '/reverse') {
      const latitude = Number(url.searchParams.get('lat')), longitude = Number(url.searchParams.get('lon'));
      assert.ok(Number.isFinite(latitude) && Number.isFinite(longitude));
      assert.equal(url.searchParams.get('radius'), '0.1'); assert.equal(url.searchParams.get('limit'), '1'); assert.equal(url.searchParams.get('lang'), 'default');
      const returnedPoint = [longitude + .00001, latitude - .00001];
      reverseLookups.push({ latitude, longitude, returnedPoint });
      return route.fulfill({ contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify({
        type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: returnedPoint },
          properties: { countrycode: 'KR', city: '서울특별시', district: '명동', locality: '태평로1가', street: '세종대로', housenumber: '110', name: '서울도서관', type: 'house' } }]
      }) });
    }
    if (url.origin !== origin) { escaped.push(url.href); return route.abort(); }
    if (url.pathname === '/fixture') return route.fulfill({ contentType: 'text/html', body: markup });
    if (!['/games/certified-restaurants/recommended-restaurants.js', '/games/certified-restaurants/recommended-restaurants.css', '/games/certified-restaurants/restaurant-ratings.js', '/games/certified-restaurants/restaurant-ratings.css', '/games/certified-restaurants/restaurant-location-picker.js', '/games/certified-restaurants/restaurant-location-picker.css', '/games/certified-restaurants/vendor/leaflet.js', '/games/certified-restaurants/vendor/leaflet.css'].includes(url.pathname)) return route.abort();
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
    page, rr, context, tiles, reverseLookups,
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

test('four saved photos and editor previews become visible without forcing image decode', { timeout: 60000 }, async t => {
  const item = recommendation();
  item.photos = Array.from({ length: 4 }, (_, index) => item.owner_id + '/' + item.id + '/30000000-0000-4000-8000-' + String(index + 1).padStart(12, '0') + '.jpg');
  const f = await fixture(t, { rows: [item] }), { page, rr } = f;
  const picturesReady = async (selector, count) => {
    await page.locator(selector).first().scrollIntoViewIfNeeded();
    // Observe native image loading; decode() would force a hidden lazy image to load and mask this regression.
    await page.waitForFunction(({ selector, count }) => {
      const frames = [...document.querySelectorAll(selector)];
      return frames.length === count && frames.every(frame => {
        const image = frame.querySelector('img'), status = frame.querySelector('.rr-picture-status');
        if (!image || !image.complete || image.naturalWidth <= 0 || image.hidden || !status?.hidden) return false;
        const bounds = image.getBoundingClientRect();
        return getComputedStyle(image).display !== 'none' && bounds.width > 0 && bounds.height > 0;
      });
    }, { selector, count }, { timeout: 10000 });
  };
  await page.locator('#world-entry').click(); await rr('card').waitFor();
  await picturesReady('.rr-card-picture', 1);
  await rr('card').click(); await rr('detail').waitFor();
  await picturesReady('.rr-gallery-hero .rr-picture', 1);
  await picturesReady('.rr-thumbnails .rr-picture', 4);
  const displayed = new Set();
  for (let index = 1; index <= 4; index++) {
    assert.equal(await page.locator('.rr-gallery-counter').textContent(), index + ' / 4');
    await picturesReady('.rr-gallery-hero .rr-picture', 1);
    displayed.add(await rr('gallery-image').locator('img').getAttribute('src'));
    if (index < 4) await rr('gallery-next').click();
  }
  assert.equal(displayed.size, 4, 'every saved photo naturally displays through the carousel');
  await rr('edit').click(); await rr('editor').waitFor(); await f.photos(4);
  await picturesReady('.rr-edit-photo .rr-picture', 4);
  await f.choose(1); await f.photos(5);
  await picturesReady('.rr-edit-photo .rr-picture', 5);
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

test('the inline Leaflet picker saves a tapped point, restores it on edit and preserves drafts on Cancel and Back', { timeout: 90000 }, async t => {
  const f = await fixture(t), { page, rr } = f;
  const picker = name => page.locator('[data-rlp="' + name + '"]');
  const openMap = async () => {
    await rr('location-open').click(); await picker('dialog').waitFor();
    await picker('map').locator('.leaflet-tile-loaded').first().waitFor();
  };
  await page.locator('#world-entry').click(); await rr('list').waitFor(); await rr('compose').first().click(); await rr('editor').waitFor();
  await f.fields(); await f.choose(1); await f.photos(1);
  await openMap();
  assert.equal(await picker('confirm').isEnabled(), false, 'opening the map alone does not invent a restaurant location');
  assert.equal(f.context.pages().length, 1, 'the composer map button opens an embedded picker without a new tab');
  for (const width of [370, 320]) {
    await page.setViewportSize({ width, height: 740 });
    assert.deepEqual(await picker('dialog').evaluate(dialog => {
      const rect = dialog.getBoundingClientRect(), map = dialog.querySelector('[data-rlp="map"]').getBoundingClientRect(), confirm = dialog.querySelector('[data-rlp="confirm"]').getBoundingClientRect();
      return { horizontal: dialog.scrollWidth <= dialog.clientWidth + 1, page: document.documentElement.scrollWidth <= innerWidth + 1, contained: rect.left >= -1 && rect.right <= innerWidth + 1 && rect.top >= -1 && rect.bottom <= innerHeight + 1, map: map.width >= 200 && map.height >= 180 && map.left >= rect.left && map.right <= rect.right + 1, confirm: confirm.height >= 40 && confirm.top >= 0 && confirm.bottom <= innerHeight + 1 };
    }), { horizontal: true, page: true, contained: true, map: true, confirm: true }, 'the map and confirmation button fit a ' + width + 'px phone');
  }
  await picker('region').selectOption('서울');
  await page.locator('[data-rlp="center"]:enabled').waitFor();
  assert.equal(await rr('field-region').inputValue(), '대전', 'map navigation does not change the unconfirmed editor region');
  const mapBox = await picker('map').boundingBox();
  await picker('map').click({ position: { x: mapBox.width * .62, y: mapBox.height * .45 } });
  await picker('map').locator('.rlp-marker').waitFor();
  await page.locator('[data-rlp="confirm"]:enabled').waitFor();
  assert.equal(await picker('confirm').isEnabled(), true);
  assert.equal(f.reverseLookups.length, 1, 'a selected pin makes one locally fulfilled address lookup');
  assert.match(await picker('selection').textContent(), /서울특별시 세종대로 110/);
  assert.equal(await rr('field-address').inputValue(), '대전 중구 중교로 45-5', 'address lookup changes only the picker draft until confirmation');
  await picker('confirm').click(); await picker('dialog').waitFor({ state: 'detached' });
  assert.match(await rr('location-status').textContent(), /선택 완료/);
  assert.equal(await rr('field-name').inputValue(), '직접 추천한 식당');
  assert.equal(await rr('field-region').inputValue(), '서울');
  assert.equal(await rr('field-address').inputValue(), '서울특별시 세종대로 110', 'confirmation fills the returned Korean address without inventing a district');
  assert.equal(await rr('photo-remove').count(), 1, 'choosing a pin keeps the pending photo');
  await f.fits(); await rr('submit').click();
  await page.waitForFunction(() => rrFixture.rows.length === 1 && !document.querySelector('[data-rr="editor"]'));
  const first = await page.evaluate(() => ({ row: rrFixture.rows[0], call: rrFixture.calls.find(call => call.name === 'save_restaurant_recommendation_with_location') }));
  const point = { latitude: first.row.latitude, longitude: first.row.longitude };
  assert.ok(Number.isFinite(point.latitude) && point.latitude > 33 && point.latitude < 39 && Number.isFinite(point.longitude) && point.longitude > 124 && point.longitude < 132, 'a real map tap produces a plausible Korean coordinate pair');
  assert.deepEqual(point, { latitude: f.reverseLookups[0].latitude, longitude: f.reverseLookups[0].longitude }, 'reverse geocoding preserves the exact tapped coordinates');
  assert.notDeepEqual([point.longitude, point.latitude], f.reverseLookups[0].returnedPoint, 'the nearby address feature does not replace the selected point');
  assert.equal(first.row.region, '서울'); assert.equal(first.row.address, '서울특별시 세종대로 110');
  assert.deepEqual(first.call.parameters.p_location, point, 'the selected coordinates travel in the same post save as its fields and photos');
  assert.equal(first.row.photos.length, 1);
  assert.ok((await page.locator('.rr-detail-content .rr-map-link').getAttribute('href')).endsWith(',' + point.latitude + ',' + point.longitude), 'the published detail links to the exact saved point');
  await rr('edit').click(); await rr('editor').waitFor(); await f.photos(1);
  await rr('field-name').fill('지도 취소 뒤에도 남는 이름');
  await openMap(); await picker('map').locator('.rlp-marker').waitFor();
  await page.locator('[data-rlp="confirm"]:enabled').waitFor();
  assert.equal(await picker('confirm').isEnabled(), true, 'the saved pin is restored without another tap');
  assert.equal(await picker('map').locator('.rlp-marker').evaluate(pin => {
    const rect = pin.getBoundingClientRect(), map = pin.closest('[data-rlp="map"]').getBoundingClientRect();
    return Math.abs(rect.left + rect.width / 2 - map.left - map.width / 2) < 48 && Math.abs(rect.top + rect.height / 2 - map.top - map.height / 2) < 48;
  }), true, 'reediting centers the map on the saved pin');
  const changedBox = await picker('map').boundingBox();
  await picker('map').click({ position: { x: changedBox.width * .30, y: changedBox.height * .65 } });
  await picker('cancel').click(); await picker('dialog').waitFor({ state: 'detached' });
  assert.equal(await rr('field-name').inputValue(), '지도 취소 뒤에도 남는 이름');
  assert.equal(await rr('photo-remove').count(), 1); assert.match(await rr('location-status').textContent(), /선택 완료/);
  await rr('field-menu').fill('사진과 함께 수정한 메뉴'); await f.choose(1); await f.photos(2); await rr('submit').click();
  await page.waitForFunction(previous => rrFixture.rows[0].updated_at !== previous && !document.querySelector('[data-rr="editor"]'), first.row.updated_at);
  const edited = await page.evaluate(() => rrFixture.rows[0]);
  assert.deepEqual({ latitude: edited.latitude, longitude: edited.longitude }, point, 'Cancel rejects the unconfirmed second tap while later text and photo edits preserve the saved point');
  assert.equal(edited.name, '지도 취소 뒤에도 남는 이름'); assert.equal(edited.menu, '사진과 함께 수정한 메뉴'); assert.equal(edited.photos.length, 2);
  await rr('edit').click(); await rr('editor').waitFor(); await rr('field-reason').fill('뒤로가기를 눌러도 남아야 하는 추천 초안');
  await openMap(); await page.evaluate(() => rrUI.back()); await picker('dialog').waitFor({ state: 'detached' });
  assert.equal(await rr('editor').isVisible(), true); assert.equal(await rr('confirm-dialog').count(), 0, 'Back closes only the picker before asking about the outer draft');
  assert.equal(await rr('field-reason').inputValue(), '뒤로가기를 눌러도 남아야 하는 추천 초안');
  await openMap(); await page.evaluate(() => rrFixture.setUser({ id: rrFixture.secondMember }));
  await picker('dialog').waitFor({ state: 'detached' }); await rr('dialog').waitFor({ state: 'detached' });
  assert.deepEqual(await page.evaluate(() => ({ latitude: rrFixture.rows[0].latitude, longitude: rrFixture.rows[0].longitude })), point);
  assert.equal(await page.evaluate(() => rrFixture.calls.filter(call => call.name === 'save_restaurant_recommendation_with_location').length), 2, 'cancel, Back and account changes never create unintended post saves');
  assert.ok(f.tiles.length > 0, 'the real Leaflet layer rendered only locally fulfilled tile responses');
});

test('real asset loader executes the recommendation factory once across both entrance orders', async t => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  t.after(() => browser.close());
  for (const order of [['restaurants', 'recommendations'], ['recommendations', 'restaurants'], ['concurrent']]) {
    const context = await browser.newContext(), errors = [], requests = [];
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname === '/loader-fixture') return route.fulfill({ contentType: 'text/html', body: '<!doctype html><html><head></head><body><script src="/shared/games/world-game-assets.js"></script></body></html>' });
      if (!url.pathname.startsWith('/games/certified-restaurants/') && url.pathname !== '/shared/games/world-game-assets.js') return route.abort();
      if (url.pathname.endsWith('/recommended-restaurants.js')) {
        requests.push(url.href);
        return route.fulfill({ contentType: 'application/javascript', body: 'window.recommendationExecutions=(window.recommendationExecutions||0)+1;\n' + fs.readFileSync(path.join(root, url.pathname.slice(1)), 'utf8') });
      }
      return route.fulfill({ path: path.join(root, url.pathname.slice(1)) });
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin + '/loader-fixture');
    await page.evaluate(async order => {
      if (order[0] === 'concurrent') await Promise.all(['restaurants', 'recommendations'].map(id => OjjudaGameAssets.load(id)));
      else for (const id of order) await OjjudaGameAssets.load(id);
    }, order);
    assert.equal(requests.length, 1, `one request for ${order.join(' then ')}`);
    assert.equal(new URL(requests[0]).searchParams.get('v'), '20261110-navigation-return1');
    assert.deepEqual(await page.evaluate(() => [recommendationExecutions, typeof OjjudaRecommendedRestaurants.create, OjjudaGameAssets.ready('restaurants'), OjjudaGameAssets.ready('recommendations')]), [1, 'function', true, true]);
    assert.deepEqual(errors, []);
    await context.close();
  }
});
