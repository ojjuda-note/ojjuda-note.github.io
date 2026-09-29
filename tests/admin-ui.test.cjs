const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage']
  });
  try {
    const context = await browser.newContext({ viewport: { width: 412, height: 860 }, isMobile: true, hasTouch: true });
    // All data is synthetic and every external request is blocked.
    await context.route('**/*', route => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="modal-root"></div>');

    // Load the actual World entrypoint's dependencies, in their real order.
    // This catches the missing signup-identity.js regression after signup unification.
    const scripts = [...read('world.html').matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/g)]
      .map(match => match[1].split('?')[0])
      .filter(src => /\/(?:signup-identity|admin\/member-identity)\.js$/.test(src));
    for (const src of scripts) await page.addScriptTag({ content: read(src.replace(/^\//, '')) });
    await page.evaluate(async () => {
      window.savedCalls = [];
      window.identityFixture = { registered: true, birth_date: '2000-02-29', gender: 'male', age: 26,
        age_at_signup: 26, phone_masked: '010-****-5678' };
      window.identityOptions = {
        userId: 'synthetic-member', nickname: '검사 회원', getAdminId: () => 'synthetic-admin',
        renderModal: html => { document.getElementById('modal-root').innerHTML = html; },
        client: {
          auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) },
          async rpc(name, values) {
            if (name === 'admin_update_member_identity') {
              savedCalls.push(values);
              identityFixture = { ...identityFixture, registered: true, birth_date: values.p_birth_date,
                gender: values.p_gender, phone_masked: values.p_phone ? `010-****-${values.p_phone.slice(-4)}` : identityFixture.phone_masked };
            }
            return { data: { ...identityFixture }, error: null };
          }
        }
      };
      await OjjudaAdminIdentity.open(identityOptions);
    });
    await page.locator('#admin-member-birth').waitFor();
    assert.equal(await page.locator('#admin-member-birth').inputValue(), '2000-02-29');
    assert.equal(await page.locator('#admin-member-masked').textContent(), '010-****-5678');
    await page.locator('#admin-member-birth').fill('2001-01-01');
    await page.locator('#admin-member-gender').selectOption('female');
    await page.locator('#admin-member-phone').fill('010-3456-7890');
    await page.getByRole('button', { name: '회원정보 저장' }).click();
    await page.waitForFunction(() => document.getElementById('admin-member-message').textContent === '회원정보를 저장했어요.');
    assert.deepEqual(await page.evaluate(() => savedCalls[0]), {
      p_user: 'synthetic-member', p_birth_date: '2001-01-01', p_gender: 'female', p_phone: '01034567890'
    });
    assert.equal(await page.locator('#admin-member-masked').textContent(), '010-****-7890');
    assert.equal(await page.locator('#admin-member-phone').inputValue(), '');
    await page.getByRole('button', { name: '회원정보 저장' }).click();
    await page.waitForFunction(() => savedCalls.length === 2);
    assert.equal(await page.evaluate(() => savedCalls[1].p_phone), null, 'blank phone preserves the saved number');
    await page.evaluate(async () => {
      identityFixture = { registered: false };
      await OjjudaAdminIdentity.open(identityOptions);
    });
    assert.equal(await page.locator('#admin-member-birth').inputValue(), '');
    assert.equal(await page.locator('#admin-member-phone').evaluate(input => input.required), true);
    await page.locator('#admin-member-birth').fill('2000-01-01');
    await page.locator('#admin-member-gender').selectOption('male');
    await page.locator('#admin-member-phone').fill('010-1234-5678');
    await page.getByRole('button', { name: '회원정보 저장' }).click();
    await page.waitForFunction(() => savedCalls.length === 3);
    assert.equal(await page.locator('#admin-member-masked').textContent(), '010-****-5678');

    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="map" style="position:absolute;left:20px;top:80px;width:360px;height:420px"></div>');
    await page.addStyleTag({ content: read('note/map.css') });
    await page.addScriptTag({ content: read('note/map.js') });
    await page.evaluate(() => {
      window.selections = []; window.markerTaps = 0; window.moves = 0;
      window.map = OjjudaMap.create(document.getElementById('map'), {
        center: { lat: 37.5665, lng: 126.978 }, zoom: 12,
        onSelect: point => selections.push(point), onMarker: () => markerTaps++, onMove: () => moves++
      });
    });
    const cdp = await context.newCDPSession(page);
    const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: points.map(([id, x, y]) => ({ id, x, y, radiusX: 1, radiusY: 1, force: 1 }))
    });
    const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const zoom = () => page.evaluate(() => map.getZoom());
    const tap = async (x, y) => { await touch('touchStart', [[1, x, y]]); await touch('touchEnd', []); await frame(); };
    const pinch = async (x, y, from, to) => {
      await touch('touchStart', [[1, x - from / 2, y], [2, x + from / 2, y]]);
      for (let i = 1; i <= 6; i++) {
        const gap = from + (to - from) * i / 6;
        await touch('touchMove', [[1, x - gap / 2, y], [2, x + gap / 2, y]]);
      }
      await touch('touchEnd', []); await frame();
    };
    await frame();
    // Keep the point between the fingers fixed, including away from the map's center.
    await tap(140, 220);
    await page.evaluate(() => map.setMarkers([{ ...selections[0], label: '테스트 카드' }]));
    await frame();
    await pinch(140, 220, 60, 120);
    assert.ok(Math.abs(await zoom() - 13) < 0.01, 'spreading two fingers doubles the map scale');
    const marker = await page.locator('.oj-map-marker').boundingBox();
    assert.ok(Math.abs(marker.x + marker.width / 2 - 140) < 1);
    assert.ok(Math.abs(marker.y + marker.height / 2 - 220) < 1);
    await pinch(140, 220, 120, 60);
    assert.ok(Math.abs(await zoom() - 12) < 0.01, 'bringing two fingers together zooms out');
    assert.equal(await page.evaluate(() => selections.length), 1, 'pinch never selects a new location');
    assert.equal(await page.evaluate(() => markerTaps), 0);
    await tap(140, 220);
    assert.equal(await page.evaluate(() => markerTaps), 1, 'a marker tap fires once after pinching');

    // Start a pinch directly on a card marker, then continue panning with the remaining finger.
    await touch('touchStart', [[1, 140, 220], [2, 200, 220]]);
    await touch('touchMove', [[1, 110, 220], [2, 230, 220]]);
    assert.ok(Math.abs(await zoom() - 13) < 0.01);
    await touch('touchEnd', [[2, 230, 220]]);
    const beforePan = await page.evaluate(() => map.getCenter());
    await touch('touchMove', [[1, 140, 240]]);
    await touch('touchEnd', []); await frame();
    const afterPan = await page.evaluate(() => map.getCenter());
    assert.ok(afterPan.lng < beforePan.lng && afterPan.lat > beforePan.lat);
    assert.equal(await page.evaluate(() => markerTaps), 1, 'a gesture beginning on a marker must not open it');
    assert.equal(await page.evaluate(() => selections.length), 1);

    await page.getByRole('button', { name: '지도 확대', exact: true }).click();
    assert.ok(Math.abs(await zoom() - 14) < 0.01);
    await page.getByRole('button', { name: '지도 축소', exact: true }).click();
    assert.ok(Math.abs(await zoom() - 13) < 0.01);
    await page.mouse.move(200, 300); await page.mouse.wheel(0, -80); await frame();
    assert.ok(Math.abs(await zoom() - 14) < 0.01);
    await page.evaluate(() => map.focusOn({ lat: 37.5665, lng: 126.978 }, 17));
    await pinch(200, 290, 60, 120); assert.equal(await zoom(), 17);
    await page.evaluate(() => map.focusOn({ lat: 37.5665, lng: 126.978 }, 4));
    await pinch(200, 290, 120, 60); assert.equal(await zoom(), 4);
    await touch('touchStart', [[1, 130, 330], [2, 210, 330]]);
    await touch('touchCancel', []);
    await tap(160, 380);
    assert.equal(await page.evaluate(() => selections.length), 2, 'cancelled gestures release their pointers');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('.oj-map-tiles img')].every(img => /^\d+\/\d+\/\d+$/.test(img.dataset.key))), true);
    assert.deepEqual(errors, []);
    console.log('PASS: World admin identity open/save, unregistered members, masked phone, native two-finger zoom, fixed pinch anchor, marker taps, pan continuation, controls, zoom limits and cancellation');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
