/* Real browser checks for the directory; all requests, including map tiles, stay in this fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'games/certified-restaurants');
const dataset = JSON.parse(fs.readFileSync(path.join(directory, 'restaurants.json'), 'utf8'));
const proof = process.env.RESTAURANT_PROOF_DIR || '/tmp/restaurant-guide-proof';
const origin = 'https://fixture.test';
const entry = origin + '/games/certified-restaurants/index.html?embedded=1';
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf1e6"/><path d="M-10 70h280M95-10v280M-10 180h280M190-10v280" fill="none" stroke="#fffdf8" stroke-width="13"/><path d="M-10 70h280M95-10v280M-10 180h280M190-10v280" fill="none" stroke="#e0e5d7" stroke-width="1"/><path d="M0 0h74v45H0zm112 86h60v76h-60zm94 116h50v54h-50z" fill="#dbe6ce"/></svg>';
const hasCoordinates = item => typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng);
const ids = items => items.map(item => item.id).sort();
const visibleIds = page => page.locator('#cards [data-restaurant-id]').evaluateAll(cards => cards.map(card => card.dataset.restaurantId).sort());
const waitForCount = (page, count) => page.waitForFunction(expected => document.querySelectorAll('#cards [data-restaurant-id]').length === expected, count);

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  const network = { tiles: 0, escaped: [], data: 0 };
  const records = options.dataset || dataset;
  await context.addInitScript(({ denyLocation, blockStorage }) => {
    window.fixtureLocationRequests = 0;
    if (denyLocation) Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { window.fixtureLocationRequests++; queueMicrotask(() => failure({ code: 1, message: 'Fixture denied' })); } } });
    if (blockStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('Fixture disabled', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Fixture full', 'QuotaExceededError'); };
    }
  }, { denyLocation: !!options.denyLocation, blockStorage: !!options.blockStorage });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'tile.openstreetmap.org') { network.tiles++; return route.fulfill({ status: options.tileFailure ? 503 : 200, contentType: 'image/svg+xml', body: options.tileFailure ? '' : tile }); }
    if (url.origin !== origin) { network.escaped.push(url.href); return route.abort(); }
    if (url.pathname.endsWith('/restaurants.json')) {
      network.data++;
      return route.fulfill({ status: options.failOnce && network.data === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(records) });
    }
    const filename = path.resolve(root, '.' + decodeURIComponent(url.pathname));
    if (!filename.startsWith(directory + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return route.abort();
    return route.fulfill({ path: filename });
  });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(entry);
  return { context, page, errors, network };
}

(async () => {
  assert.ok(Array.isArray(dataset.restaurants) && dataset.restaurants.length, 'the published data contains restaurants');
  fs.mkdirSync(proof, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    const regular = await fixture(browser, { denyLocation: true });
    const { page } = regular;
    await waitForCount(page, dataset.restaurants.length);
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'every real dataset record appears once');
    assert.equal(await page.locator('#back-link').isVisible(), false, 'the embedded page leaves navigation to the arcade shell');
    assert.deepEqual(await page.locator('#categories [data-category]').evaluateAll(nodes => nodes.map(node => node.dataset.category)), ['', '한식', '중식', '일식', '양식', '분식', '디저트', '기타']);
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 0, 'location is never requested on entry');
    if (dataset.collections?.length) assert.deepEqual(await page.locator('.collection-title').evaluateAll(links => links.map(link => link.href)), dataset.collections.map(collection => new URL(collection.url).href), 'the collection shortcut uses the source-provided map URL');

    // Match multiple real data fields together, then prove an incompatible query clears the result.
    const combined = dataset.restaurants.find(item => item.guides.some(guide => guide.provider === 'michelin') && item.guides.some(guide => guide.provider === 'blue-ribbon'));
    assert.ok(combined, 'the real data contains a cross-guide selection to exercise intersection semantics');
    await page.locator('[data-category="' + combined.category + '"]').click();
    await page.locator('#region').selectOption(combined.region);
    await page.locator('[data-guide="both"]').click();
    const intersection = dataset.restaurants.filter(item => item.category === combined.category && item.region === combined.region && item.guides.some(guide => guide.provider === 'michelin') && item.guides.some(guide => guide.provider === 'blue-ribbon'));
    await waitForCount(page, intersection.length);
    assert.deepEqual(await visibleIds(page), ids(intersection), 'cuisine, region and both-guide filters intersect');
    await page.locator('#search').fill(combined.name + ' ' + combined.district);
    await page.locator('#search').press('Enter');
    const queryMatches = intersection.filter(item => (item.name + ' ' + item.category + ' ' + item.region + ' ' + item.district + ' ' + item.address + ' ' + item.menu.join(' ')).includes(combined.name) && (item.name + ' ' + item.district + ' ' + item.address).includes(combined.district));
    await waitForCount(page, queryMatches.length);
    assert.deepEqual(await visibleIds(page), ids(queryMatches), 'name and district search preserve all selected filters');
    await page.locator('#search').fill('존재하지않는식당검색fixture');
    await page.locator('#search').press('Enter');
    await page.locator('.empty-state').waitFor();
    assert.equal(await page.locator('.restaurant-pin').count(), 0, 'empty searches leave no unrelated pins');
    await page.locator('#reset').click();
    await waitForCount(page, dataset.restaurants.length);

    // Real official-source destinations, publication years, and save persistence.
    const selected = page.locator('[data-restaurant-id="' + combined.id + '"]');
    await selected.locator('.save-button').click();
    assert.equal(await selected.locator('.save-button').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await waitForCount(page, dataset.restaurants.length);
    await page.locator('#saved-only').click();
    await waitForCount(page, 1);
    assert.deepEqual(await visibleIds(page), [combined.id], 'saved restaurant survives reload');
    await page.locator('.card-main').click();
    assert.equal(await page.locator('#detail-title').textContent(), combined.name);
    assert.deepEqual(await page.locator('.source-link').evaluateAll(links => links.map(link => link.href)), combined.guides.map(guide => new URL(guide.sourceUrl).href), 'source links point to the exact recorded sources');
    assert.ok((await page.locator('#detail a').evaluateAll(links => links.map(link => ({ protocol: new URL(link.href).protocol, rel: link.rel, target: link.target })))).every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer') && link.target === '_blank'), 'all detail destinations use safe external links');
    assert.match(await page.locator('.source-list').textContent(), /출처 확인일/);
    for (const guide of combined.guides) if (guide.year) assert.match(await page.locator('.source-list').textContent(), new RegExp(guide.year + (guide.provider === 'blue-ribbon' ? '년판' : guide.provider === 'post-office' ? '년 발행' : '년 선정')));
    assert.ok(await page.locator('.detail-links a').first().getAttribute('href').then(href => decodeURIComponent(href).includes(combined.address)), 'map search includes the actual branch address');
    if (hasCoordinates(combined)) assert.ok((await page.locator('.route-link').getAttribute('href')).endsWith(',' + combined.lat + ',' + combined.lng), 'directions use the sourced destination coordinates');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail').evaluate(dialog => dialog.open), false, 'Escape closes the native detail dialog');
    await page.locator('#reset').click();

    // Geography is explicit opt-in, and denial keeps the list usable.
    await page.locator('#nearby').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('허용되지'));
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 1);
    assert.equal(await page.locator('#nearby').isDisabled(), false);
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'location denial does not hide otherwise valid results');
    await page.locator('#reset').click();

    // Responsive layout and actual map/list presentation at narrow phone widths.
    for (const width of [320, 360, 390, 700, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal page overflow at ' + width);
      if (width <= 700) {
        await page.locator('#show-list').click();
        assert.equal(await page.locator('#results').isVisible(), true);
        assert.equal(await page.locator('#map-panel').isVisible(), false);
        await page.locator('#show-map').click();
        assert.equal(await page.locator('#map-panel').isVisible(), true);
        assert.equal(await page.locator('#results').isVisible(), false);
      } else {
        assert.equal(await page.locator('#results').isVisible(), true);
        assert.equal(await page.locator('#map-panel').isVisible(), true);
      }
    }
    const postalRows = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
    if (postalRows.length && dataset.collections?.some(collection => collection.provider === 'post-office')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#show-map').click();
      await page.locator('[data-guide="post-office"]').click();
      await waitForCount(page, postalRows.length);
      if (!postalRows.some(hasCoordinates)) assert.equal(await page.locator('#workspace').getAttribute('data-view'), 'list', 'mobile users see useful address results instead of an empty map');
      assert.equal(await page.locator('#collections').isVisible(), true);
      assert.equal(await page.locator('#collections').evaluate(section => section.classList.contains('is-featured')), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'the official-map banner fits a phone viewport');
      await page.locator('#reset').click();
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.screenshot({ path: path.join(proof, 'restaurants-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('#show-list').click();
    await page.screenshot({ path: path.join(proof, 'restaurants-mobile.png'), fullPage: false });
    assert.deepEqual(regular.errors, [], 'normal browsing produces no uncaught errors');
    assert.deepEqual(regular.network.escaped, [], 'the browser did not request any unmocked external destination');
    await regular.context.close();

    // Deliberately hostile and missing-coordinate records prove no HTML/link execution or guessed map pin.
    const special = structuredClone(dataset.restaurants[0]);
    special.id = 'fixture-no-coordinates'; special.name = '<img src=x onerror="window.injected=true"> 지점'; special.address = '<svg onload="window.injected=true"> 안전주소'; special.lat = null; special.lng = null; special.menu = ['<script>window.injected=true</script>'];
    special.guides = [
      { provider: 'post-office', label: '집배원 추천 <img src=x onerror="window.injected=true">', year: 2011, sourceUrl: 'https://www.koreapost.go.kr/fixture-source', sourceName: '<img src=x onerror="window.injected=true"> 공식 출처', verifiedAt: '2026-11-03' },
      { provider: 'michelin', label: '3스타', year: 2026, sourceUrl: 'javascript:window.injected=true', sourceName: 'unsafe', verifiedAt: '2026-11-03' }
    ];
    const rejected = structuredClone(special); rejected.id = 'fixture-unsafe-only'; rejected.guides = [{ provider: 'blue-ribbon', label: '3리본', year: 2026, sourceUrl: 'http://unsafe.example.com' }];
    const hostile = await fixture(browser, { dataset: { updatedAt: '2026-11-03', restaurants: [...dataset.restaurants, special, rejected] } });
    await waitForCount(hostile.page, dataset.restaurants.length + 1);
    assert.equal(await hostile.page.locator('[data-restaurant-id="fixture-unsafe-only"]').count(), 0, 'records without an accepted source are not represented as verified');
    assert.equal(await hostile.page.locator('.restaurant-pin').count(), dataset.restaurants.filter(hasCoordinates).length, 'null coordinates never create an invented map pin');
    const hostileCard = hostile.page.locator('[data-restaurant-id="fixture-no-coordinates"]');
    assert.equal(await hostileCard.locator('img,script').count(), 0, 'card fields stay plain text');
    assert.match(await hostileCard.textContent(), /네이버·카카오맵에서 위치 확인/);
    await hostile.page.locator('[data-guide="post-office"]').click();
    const expectedPost = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
    await waitForCount(hostile.page, expectedPost.length + 1);
    assert.deepEqual(await visibleIds(hostile.page), ids([...expectedPost, special]), 'post office is an independent recommendation filter');
    await hostileCard.locator('.card-main').click();
    assert.equal(await hostile.page.locator('#detail-title').textContent(), special.name);
    assert.match(await hostile.page.locator('.source-list').textContent(), /2011년 발행/);
    assert.doesNotMatch(await hostile.page.locator('.source-list').textContent(), /2011년 선정/);
    assert.equal(await hostile.page.locator('#detail .source-link').count(), 1, 'javascript URLs are omitted even when another guide is valid');
    assert.equal(await hostile.page.locator('#detail img,#detail script').count(), 0, 'detail and source labels remain inert text');
    assert.equal(await hostile.page.evaluate(() => window.injected), undefined);
    assert.equal(await hostile.page.locator('#detail a[href^="javascript:"]').count(), 0);
    assert.match(await hostile.page.locator('.route-link').textContent(), /주소로/);
    assert.deepEqual(hostile.errors, []);
    assert.deepEqual(hostile.network.escaped, []);
    await hostile.context.close();

    const retry = await fixture(browser, { failOnce: true, viewport: { width: 390, height: 844 } });
    await retry.page.locator('.data-error').waitFor();
    assert.equal(await retry.page.locator('#results').isVisible(), true, 'a loading failure makes its recovery button visible on mobile');
    await retry.page.locator('.data-error button').click();
    await waitForCount(retry.page, dataset.restaurants.length);
    assert.equal(retry.network.data, 2, 'recovery makes a new data request');
    assert.deepEqual(await visibleIds(retry.page), ids(dataset.restaurants));
    assert.deepEqual(retry.errors, []);
    await retry.context.close();

    const mapFailure = await fixture(browser, { tileFailure: true });
    await waitForCount(mapFailure.page, dataset.restaurants.length);
    await mapFailure.page.locator('#map-message').waitFor();
    assert.match(await mapFailure.page.locator('#map-message').textContent(), /연결되지/);
    await mapFailure.page.locator('.card-main').first().click();
    assert.equal(await mapFailure.page.locator('#detail').evaluate(dialog => dialog.open), true, 'tile failures do not block restaurant information');
    assert.deepEqual(mapFailure.errors, []);
    await mapFailure.context.close();

    const temporarySave = await fixture(browser, { blockStorage: true });
    await waitForCount(temporarySave.page, dataset.restaurants.length);
    await temporarySave.page.locator('.save-button').first().click();
    assert.match(await temporarySave.page.locator('#status').textContent(), /화면을 보는 동안/);
    await temporarySave.page.locator('#saved-only').click();
    await waitForCount(temporarySave.page, 1);
    assert.deepEqual(temporarySave.errors, []);
    await temporarySave.context.close();

    console.log('PASS: real dataset filters and search intersections, retained favorites, exact source and route links, opt-in denied location, 320–1280px layouts, post-office publication labels, null-coordinate exclusion, inert malicious text and URLs, data retry, map-tile failure and temporary saving; OSM tiles were intercepted locally.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
