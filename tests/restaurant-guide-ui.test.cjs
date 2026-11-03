/* Real browser checks for the directory; local restaurant data and regional geography stay in this fixture. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'games/certified-restaurants');
const dataset = JSON.parse(fs.readFileSync(path.join(directory, 'restaurants.json'), 'utf8'));
const geography = JSON.parse(fs.readFileSync(path.join(directory, 'korea-provinces.json'), 'utf8'));
const proof = process.env.RESTAURANT_PROOF_DIR || '/tmp/restaurant-guide-proof';
const origin = 'https://fixture.test';
const entry = origin + '/games/certified-restaurants/index.html?embedded=1';
const hasCoordinates = item => typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng);
const ids = items => items.map(item => item.id).sort();
const visibleIds = page => page.locator('#cards [data-restaurant-id]').evaluateAll(cards => cards.map(card => card.dataset.restaurantId).sort());
const waitForTotal = (page, count) => page.waitForFunction(expected => Number(document.querySelector('#result-count').dataset.total) === expected, count);
async function waitForCount(page, count) { await waitForTotal(page, count); while (await page.locator('#cards [data-restaurant-id]').count() < count) await page.locator('#load-more').click(); }
async function openFilters(page) { if (await page.locator('#filter-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#filter-toggle').click(); }
async function resetFilters(page) { await openFilters(page); await page.locator('#reset').click(); }

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  const network = { geography: 0, escaped: [], data: 0 };
  const records = options.dataset || dataset;
  await context.addInitScript(({ permission, position, locationChoice, blockStorage }) => {
    window.fixtureLocationRequests = 0;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: permission }) } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { window.fixtureLocationRequests++; queueMicrotask(() => position ? success({ coords: { latitude: position.lat, longitude: position.lng } }) : failure({ code: 1, message: 'Fixture denied' })); } } });
    if (locationChoice) localStorage.setItem('ojjuda-certified-restaurants-location-v1', locationChoice);
    if (blockStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('Fixture disabled', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Fixture full', 'QuotaExceededError'); };
    }
  }, { permission: options.permission || 'denied', position: options.position || null, locationChoice: options.locationChoice || '', blockStorage: !!options.blockStorage });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) { network.escaped.push(url.href); return route.abort(); }
    if (url.pathname.endsWith('/korea-provinces.json')) {
      network.geography++;
      return route.fulfill({ status: options.failGeoOnce && network.geography === 1 ? 503 : 200, contentType: 'application/json', body: JSON.stringify(geography) });
    }
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
    await waitForTotal(page, dataset.restaurants.length);
    assert.equal(await page.locator('#cards [data-restaurant-id]').count(), Math.min(50, dataset.restaurants.length), 'first render is a bounded batch');
    assert.equal(await page.locator('.result-shown').textContent(), '현재 ' + Math.min(50, dataset.restaurants.length) + '곳 표시');
    await waitForCount(page, dataset.restaurants.length);
    assert.equal(await page.locator('.result-shown').textContent(), '현재 ' + dataset.restaurants.length + '곳 표시', 'toolbar count follows visible pagination');
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'every real dataset record appears once');
    assert.equal(await page.locator('#back-link').isVisible(), false, 'the embedded page leaves navigation to the arcade shell');
    assert.deepEqual(await page.locator('#categories [data-category]').evaluateAll(nodes => nodes.map(node => node.dataset.category)), ['', '한식', '중식', '일식', '양식', '분식', '디저트', '기타']);
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 0, 'a known denied permission is not requested again on entry');
    assert.equal(await page.locator('#nearby').isVisible(), true, 'nearby is a primary control');
    assert.equal(await page.locator('#filter-options #nearby').count(), 0);
    assert.equal(await page.locator('#workspace').getAttribute('data-view'), 'list', 'every screen starts with the complete list');
    assert.equal(await page.locator('#results').isVisible(), true);
    assert.equal(await page.locator('#map-panel').isVisible(), false);
    assert.equal(await page.locator('#filter-options').isVisible(), false);
    assert.equal(await page.locator('#filter-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(regular.network.geography, 0, 'entry does not fetch unrequested geography');
    assert.equal(await page.locator('#map.leaflet-container').count(), 0, 'entry does not initialize an unused map');
    if (dataset.collections?.length) assert.deepEqual(await page.locator('.collection-title').evaluateAll(links => links.map(link => link.href)), dataset.collections.map(collection => new URL(collection.url).href), 'the collection shortcut uses the source-provided map URL');
    await page.locator('#show-map').click();
    await page.waitForFunction(() => !!document.querySelector('.leaflet-overlay-pane canvas,.leaflet-overlay-pane svg path'));
    assert.equal(regular.network.geography, 1);
    assert.equal(await page.locator('.restaurant-pin').count(), Math.min(300, dataset.restaurants.filter(hasCoordinates).length));
    assert.equal(await page.locator('.result-shown').isVisible(), false, 'list-only counts do not compete with map coverage');
    const missingActual = dataset.restaurants.filter(item => !hasCoordinates(item)).length;
    if (missingActual) assert.ok((await page.locator('#map-caption-text').textContent()).includes('위치 미확인 ' + missingActual + '곳은 목록에서 확인'));
    await page.locator('#show-list').click(); await page.locator('#show-map').click();
    assert.equal(regular.network.geography, 1, 'view changes reuse the existing local map');
    assert.equal(await page.locator('#map.leaflet-container').count(), 1);
    await page.locator('#show-list').click();
    assert.equal(await page.locator('.result-shown').isVisible(), true);

    // Match multiple real data fields together, then prove an incompatible query clears the result.
    const combined = dataset.restaurants.find(item => item.guides.some(guide => guide.provider === 'michelin') && item.guides.some(guide => guide.provider === 'blue-ribbon'));
    assert.ok(combined, 'the real data contains a cross-guide selection to exercise intersection semantics');
    const compactCard = page.locator('[data-restaurant-id="' + combined.id + '"]');
    assert.equal(await compactCard.locator('.card-address,.coord-note').count(), 0, 'details are not repeated on every compact card');
    assert.doesNotMatch(await compactCard.locator('.guide-badges').textContent(), /20\d{2}/, 'edition dates are shown in the detail');
    await page.locator('[data-category="' + combined.category + '"]').click();
    await openFilters(page);
    await page.locator('#region').selectOption(combined.region);
    await page.locator('[data-guide="both"]').click();
    const intersection = dataset.restaurants.filter(item => item.category === combined.category && item.region === combined.region && item.guides.some(guide => guide.provider === 'michelin') && item.guides.some(guide => guide.provider === 'blue-ribbon'));
    await waitForCount(page, intersection.length);
    assert.deepEqual(await visibleIds(page), ids(intersection), 'cuisine, region and both-guide filters intersect');
    await page.locator('#filter-toggle').click();
    assert.equal(await page.locator('#filter-options').isVisible(), false);
    assert.match(await page.locator('#filter-summary').textContent(), new RegExp(combined.region), 'active filters remain readable after folding the panel');
    assert.equal(await page.locator('#filter-summary').isVisible(), true);
    await page.locator('#search').fill(combined.name + ' ' + combined.district);
    await page.locator('#search').press('Enter');
    const queryMatches = intersection.filter(item => (item.name + ' ' + item.category + ' ' + item.region + ' ' + item.district + ' ' + item.address + ' ' + item.menu.join(' ')).includes(combined.name) && (item.name + ' ' + item.district + ' ' + item.address).includes(combined.district));
    await waitForCount(page, queryMatches.length);
    assert.deepEqual(await visibleIds(page), ids(queryMatches), 'name and district search preserve all selected filters');
    await page.locator('#search').fill('존재하지않는식당검색fixture');
    await page.locator('#search').press('Enter');
    await page.locator('.empty-state').waitFor();
    assert.equal(await page.locator('.result-shown').textContent(), '현재 0곳 표시');
    assert.equal(await page.locator('.restaurant-pin:visible').count(), 0, 'empty searches display no unrelated pins');
    await resetFilters(page);
    await waitForCount(page, dataset.restaurants.length);

    // Real official-source destinations, publication years, and save persistence.
    const selected = page.locator('[data-restaurant-id="' + combined.id + '"]');
    await selected.locator('.save-button').click();
    assert.equal(await selected.locator('.save-button').getAttribute('aria-pressed'), 'true');
    await page.reload();
    await waitForCount(page, dataset.restaurants.length);
    await openFilters(page);
    await page.locator('#saved-only').click();
    await waitForCount(page, 1);
    assert.deepEqual(await visibleIds(page), [combined.id], 'saved restaurant survives reload');
    await page.locator('.card-main').click();
    assert.equal(await page.locator('#detail-title').textContent(), combined.name);
    assert.deepEqual(await page.locator('.source-link').evaluateAll(links => links.map(link => link.href)), combined.guides.map(guide => new URL(guide.sourceUrl).href), 'source links point to the exact recorded sources');
    assert.ok((await page.locator('#detail a').evaluateAll(links => links.map(link => ({ protocol: new URL(link.href).protocol, rel: link.rel, target: link.target })))).every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer') && link.target === '_blank'), 'all detail destinations use safe external links');
    assert.match(await page.locator('.source-list').textContent(), /출처 확인일/);
    const actualYears = await page.locator('.source-year').allTextContents();
    combined.guides.forEach((guide, index) => {
      if (!guide.year) return;
      const type = guide.yearType || (guide.provider === 'blue-ribbon' ? 'edition' : guide.provider === 'post-office' ? 'publication' : 'selection');
      assert.equal(actualYears[index], guide.year + { edition: '년판', selection: '년 선정', publication: '년 발행', source: '년 자료', listing: '년 수록' }[type], 'each source uses its recorded year meaning');
    });
    assert.ok(await page.locator('.detail-links a').first().getAttribute('href').then(href => decodeURIComponent(href).includes(combined.address)), 'map search includes the actual branch address');
    if (hasCoordinates(combined)) assert.ok((await page.locator('.route-link').getAttribute('href')).endsWith(',' + combined.lat + ',' + combined.lng), 'directions use the sourced destination coordinates');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#detail').evaluate(dialog => dialog.open), false, 'Escape closes the native detail dialog');
    await resetFilters(page);

    // Geography is explicit opt-in, and denial keeps the list usable.
    await openFilters(page); await page.locator('#nearby').click();
    await page.waitForFunction(() => document.querySelector('#location-status').textContent.includes('허용되지'));
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 1);
    assert.equal(await page.locator('#nearby').isDisabled(), false);
    await waitForCount(page, dataset.restaurants.length);
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'location denial does not hide otherwise valid results');
    await page.locator('#choose-region').click();
    assert.equal(await page.locator('#region').evaluate(node => node === document.activeElement), true, 'denial offers a direct path to region selection');
    await resetFilters(page);

    // Responsive layout and actual map/list presentation at narrow phone widths.
    for (const width of [320, 360, 390, 700, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal page overflow at ' + width);
      await page.locator('#show-list').click();
      assert.equal(await page.locator('#results').isVisible(), true);
      assert.equal(await page.locator('#map-panel').isVisible(), false);
      if (width <= 700) {
        const categoryLayout = await page.locator('#categories').evaluate(container => ({ columns: getComputedStyle(container).gridTemplateColumns.split(' ').length, count: container.querySelectorAll('[data-category]').length, withinViewport: [...container.querySelectorAll('[data-category]')].every(button => { const rect = button.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; }) }));
        assert.equal(categoryLayout.columns, 4, 'phone categories form a four-column grid');
        assert.equal(categoryLayout.count, 8); assert.equal(categoryLayout.withinViewport, true, 'every category is exposed without horizontal scrolling');
      }
      await page.locator('#show-map').click();
      assert.equal(await page.locator('#map-panel').isVisible(), true);
      assert.equal(await page.locator('#results').isVisible(), false, 'map/list are separate modes at every width');
    }
    const postalRows = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
    if (postalRows.length && dataset.collections?.some(collection => collection.provider === 'post-office')) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('#show-map').click();
      await openFilters(page);
      await page.locator('[data-guide="post-office"]').click();
      await waitForTotal(page, postalRows.length);
      const locatedPostal = postalRows.filter(hasCoordinates);
      if (!locatedPostal.length) {
        assert.equal(await page.locator('#workspace').getAttribute('data-view'), 'list', 'mobile users see useful address results instead of an empty map');
      } else {
        assert.equal(await page.locator('#workspace').getAttribute('data-view'), 'map', 'postal results with coordinates preserve the chosen map view');
        assert.equal(await page.locator('#map-panel').isVisible(), true);
        assert.equal(await page.locator('.restaurant-pin').count(), Math.min(300, locatedPostal.length), 'the map shows only located postal recommendations within the pin limit');
      }
      assert.equal(await page.locator('#collections').isVisible(), true);
      assert.equal(await page.locator('#collections').evaluate(section => section.classList.contains('is-featured')), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'the official-map banner fits a phone viewport');
      await page.locator('#show-list').click();
      await waitForCount(page, postalRows.length);
      assert.deepEqual(await visibleIds(page), ids(postalRows), 'every postal recommendation remains accessible through visible list pagination');
      await resetFilters(page);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('#show-list').click();
    if (await page.locator('#filter-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#filter-toggle').click();
    await page.screenshot({ path: path.join(proof, 'restaurants-desktop.png'), fullPage: false });
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
    await hostile.page.locator('#show-map').click();
    assert.equal(await hostile.page.locator('.restaurant-pin').count(), Math.min(300, dataset.restaurants.filter(hasCoordinates).length), 'null coordinates never create an invented map pin');
    await hostile.page.locator('#show-list').click();
    const hostileCard = hostile.page.locator('[data-restaurant-id="fixture-no-coordinates"]');
    assert.equal(await hostileCard.locator('img,script').count(), 0, 'card fields stay plain text');
    assert.equal(await hostileCard.locator('.coord-note').count(), 0, 'repetitive map guidance stays out of the compact cards');
    await openFilters(hostile.page);
    await hostile.page.locator('[data-guide="post-office"]').click();
    const expectedPost = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
    await waitForCount(hostile.page, expectedPost.length + 1);
    assert.deepEqual(await visibleIds(hostile.page), ids([...expectedPost, special]), 'post office is an independent recommendation filter');
    await hostileCard.locator('.card-main').click();
    assert.equal(await hostile.page.locator('#detail-title').textContent(), special.name);
    assert.match(await hostile.page.locator('#detail-content').textContent(), /네이버·카카오맵에서 위치 확인/);
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

    const mapFailure = await fixture(browser, { failGeoOnce: true });
    await waitForCount(mapFailure.page, dataset.restaurants.length);
    await mapFailure.page.locator('#show-map').click();
    await mapFailure.page.locator('#retry-map').waitFor();
    await mapFailure.page.locator('#show-list').click();
    await mapFailure.page.locator('.card-main').first().click();
    assert.equal(await mapFailure.page.locator('#detail').evaluate(dialog => dialog.open), true, 'local geography failures do not block restaurant information');
    await mapFailure.page.locator('#close-detail').click();
    await mapFailure.page.locator('#show-map').click();
    await mapFailure.page.locator('#retry-map').click();
    await mapFailure.page.waitForFunction(() => !!document.querySelector('.leaflet-overlay-pane canvas,.leaflet-overlay-pane svg path'));
    assert.equal(mapFailure.network.geography, 2, 'retry retrieves the local geography again');
    assert.equal(await mapFailure.page.locator('#map-message').isVisible(), false);
    assert.match(await mapFailure.page.locator('#map-caption-text').textContent(), /개요도/);
    assert.deepEqual(mapFailure.errors, []);
    await mapFailure.context.close();

    const temporarySave = await fixture(browser, { blockStorage: true });
    await waitForCount(temporarySave.page, dataset.restaurants.length);
    await temporarySave.page.locator('.save-button').first().click();
    assert.match(await temporarySave.page.locator('#status').textContent(), /화면을 보는 동안/);
    await openFilters(temporarySave.page);
    await temporarySave.page.locator('#saved-only').click();
    await waitForCount(temporarySave.page, 1);
    assert.deepEqual(temporarySave.errors, []);
    await temporarySave.context.close();

    // Cross-provider year types ensure these labels come from recorded semantics.
    const yearRecord = { ...structuredClone(dataset.restaurants[0]), id: 'year-types', name: '연도 유형 확인', guides: [
      { provider: 'michelin', year: 2027, yearType: 'edition' },
      { provider: 'blue-ribbon', year: 2026, yearType: 'selection' },
      { provider: 'michelin', year: 2025, yearType: 'publication' },
      { provider: 'post-office', year: 2024, yearType: 'source' },
      { provider: 'michelin', year: 2023, yearType: 'listing' }
    ].map(guide => ({ ...guide, label: '자료 표기 확인', sourceUrl: 'https://fixture.test/sources/' + guide.yearType, verifiedAt: '2026-11-03' })) };
    const missingYearRecord = { ...structuredClone(yearRecord), id: 'year-types-missing', name: '미확인 연도 유형', guides: yearRecord.guides.map(guide => ({ ...guide, year: null })) };
    const years = await fixture(browser, { dataset: { restaurants: [yearRecord, missingYearRecord] } });
    await waitForCount(years.page, 2);
    await years.page.locator('[data-restaurant-id="year-types"] .card-main').click();
    assert.deepEqual(await years.page.locator('.source-year').allTextContents(), ['2027년판', '2026년 선정', '2025년 발행', '2024년 자료', '2023년 수록']);
    assert.ok((await years.page.locator('.source-verified').allTextContents()).every(text => text === '출처 확인일 2026.11.03'), 'verification dates stay separate');
    await years.page.locator('#close-detail').click(); await years.page.locator('[data-restaurant-id="year-types-missing"] .card-main').click();
    assert.deepEqual(await years.page.locator('.source-year').allTextContents(), ['판본 연도 미확인', '선정 연도 미확인', '발행 연도 미확인', '자료 연도 미확인', '수록 연도 미확인']);
    assert.deepEqual(years.errors, []); await years.context.close();

    const near = { ...structuredClone(dataset.restaurants[0]), id: 'near', name: '하 가까운 식당', region: '서울', lat: 37.5665, lng: 126.978, coordinateSource: { name: '관광공사 공개 위치', url: 'https://korean.visitkorea.or.kr/fixture', method: '동일 상호·주소 확인', checkedAt: '2026-11-03' } };
    const far = { ...structuredClone(near), id: 'far', name: '가 먼 식당', region: '부산', lat: 35.1796, lng: 129.0756, coordinateSource: { name: 'unsafe location', url: 'javascript:window.injected=1' } };
    const unknown = { ...structuredClone(near), id: 'unknown', name: '가가 거리 없는 식당', region: '제주', lat: null, lng: null };
    const nearbyData = { restaurants: [unknown, far, near] };
    const granted = await fixture(browser, { dataset: nearbyData, permission: 'granted', position: { lat: 37.5665, lng: 126.978 } });
    await waitForCount(granted.page, 3);
    await granted.page.waitForFunction(() => document.querySelector('#nearby').getAttribute('aria-pressed') === 'true');
    assert.equal(await granted.page.evaluate(() => window.fixtureLocationRequests), 1, 'existing browser permission locates immediately on entry');
    assert.deepEqual(await granted.page.locator('[data-restaurant-id]').evaluateAll(nodes => nodes.map(node => node.dataset.restaurantId)), ['near', 'far', 'unknown']);
    assert.equal(await granted.page.locator('[data-restaurant-id=unknown] .distance').count(), 0);
    assert.match(await granted.page.locator('[data-restaurant-id=unknown] .distance-unknown').textContent(), /미확인/);
    assert.match(await granted.page.locator('.list-section-title').textContent(), /전국 목록/);
    await granted.page.locator('[data-restaurant-id=near] .card-main').click();
    assert.equal(await granted.page.locator('.coordinate-source-link').getAttribute('href'), near.coordinateSource.url);
    assert.match(await granted.page.locator('.coordinate-source-link').textContent(), /위치 출처: 관광공사 공개 위치/);
    await granted.page.locator('#close-detail').click(); await granted.page.locator('[data-restaurant-id=far] .card-main').click();
    assert.equal(await granted.page.locator('.coordinate-source-link').count(), 0); await granted.page.locator('#close-detail').click();
    assert.deepEqual(await granted.page.evaluate(() => ({ keys: Object.keys(localStorage), value: localStorage.getItem('ojjuda-certified-restaurants-location-v1') })), { keys: ['ojjuda-certified-restaurants-location-v1'], value: 'enabled' }, 'location persistence stores only a preference');
    await openFilters(granted.page); await granted.page.locator('#region').selectOption('제주');
    await waitForCount(granted.page, 1); assert.match(await granted.page.locator('#location-status').textContent(), /거리 정보가 없어 전국 목록/);
    await resetFilters(granted.page); await waitForCount(granted.page, 3);
    assert.equal(await granted.page.locator('#nearby').getAttribute('aria-pressed'), 'true', 'filter reset keeps location mode');
    assert.deepEqual(granted.errors, []); await granted.context.close();

    const firstVisit = await fixture(browser, { dataset: nearbyData, permission: 'prompt' });
    await waitForCount(firstVisit.page, 3);
    await firstVisit.page.waitForFunction(() => window.fixtureLocationRequests === 1 && !document.querySelector('#nearby').disabled);
    assert.equal(await firstVisit.page.evaluate(() => localStorage.getItem('ojjuda-certified-restaurants-location-v1')), 'denied');
    await firstVisit.page.reload(); await waitForCount(firstVisit.page, 3);
    assert.equal(await firstVisit.page.evaluate(() => window.fixtureLocationRequests), 0, 'reentry does not repeat a declined automatic prompt');
    await firstVisit.page.locator('#choose-region').click();
    assert.equal(await firstVisit.page.locator('#region').evaluate(node => node === document.activeElement), true);
    await firstVisit.page.locator('#nearby').click();
    await firstVisit.page.waitForFunction(() => window.fixtureLocationRequests === 1 && !document.querySelector('#nearby').disabled);
    assert.deepEqual(firstVisit.errors, []); await firstVisit.context.close();

    const many = Array.from({ length: 800 }, (_, index) => ({ ...structuredClone(near), id: 'many-' + index, name: '성능확인' + String(index).padStart(4, '0'), lat: 37.5665 + index / 10000, lng: 126.978 }));
    const performance = await fixture(browser, { dataset: { restaurants: many }, permission: 'granted', position: { lat: 37.5665, lng: 126.978 } });
    await waitForTotal(performance.page, many.length);
    await performance.page.waitForFunction(() => document.querySelector('#nearby').getAttribute('aria-pressed') === 'true');
    assert.equal(await performance.page.locator('.restaurant-card').count(), 50);
    assert.equal(await performance.page.locator('.result-shown').textContent(), '현재 50곳 표시');
    assert.equal(performance.network.geography, 0, 'nearby entry does not force map loading');
    await performance.page.evaluate(() => { window.fixtureFirstCard = document.querySelector('.restaurant-card'); });
    await performance.page.locator('#load-more').click();
    assert.equal(await performance.page.locator('.restaurant-card').count(), 100);
    assert.equal(await performance.page.locator('.result-shown').textContent(), '현재 100곳 표시');
    assert.equal(await performance.page.evaluate(() => window.fixtureFirstCard === document.querySelector('.restaurant-card')), true, 'more results append instead of rebuilding previous rows');
    await performance.page.locator('#search').fill('성능확인000'); await performance.page.locator('#search').press('Enter');
    await waitForTotal(performance.page, 10); assert.equal(await performance.page.locator('.restaurant-card').count(), 10);
    assert.equal(await performance.page.locator('.result-shown').textContent(), '현재 10곳 표시');
    assert.equal(await performance.page.locator('#load-more').isVisible(), false);
    await resetFilters(performance.page); assert.equal(await performance.page.locator('.restaurant-card').count(), 50);
    assert.equal(await performance.page.locator('.result-shown').textContent(), '현재 50곳 표시');
    while (await performance.page.locator('.restaurant-card').count() < 700) await performance.page.locator('#load-more').click();
    assert.equal(await performance.page.locator('.restaurant-card').count(), 700, 'successive batches expose cards beyond the map limit');
    await performance.page.locator('#show-map').click();
    await performance.page.waitForFunction(() => !!document.querySelector('.leaflet-overlay-pane canvas,.leaflet-overlay-pane svg path'));
    assert.equal(await performance.page.locator('.restaurant-pin').count(), 300);
    assert.match(await performance.page.locator('#map-caption-text').textContent(), /800곳 중 300곳/);
    assert.deepEqual(await performance.page.locator('.restaurant-pin').evaluateAll(pins => pins.map(pin => pin.title)), many.slice(0, 300).map(item => item.name), 'nearby maps the nearest 300 first');
    await performance.page.locator('#show-list').click(); await performance.page.locator('[data-restaurant-id="many-650"] .card-main').click();
    assert.equal(await performance.page.locator('#detail-title').textContent(), many[650].name);
    await performance.page.locator('#close-detail').click(); await performance.page.locator('#show-map').click();
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').getAttribute('title'), many[650].name, 'list selection outside the cap receives a pin when the map opens');
    assert.equal(await performance.page.locator('.restaurant-pin').count(), 300);
    assert.equal(await performance.page.locator('.restaurant-pin[title="' + many[699].name + '"]').count(), 0);
    // The two views are exclusive; dispatch a retained-card event to cover selection while the map is active.
    await performance.page.locator('[data-restaurant-id="many-699"] .card-main').evaluate(node => node.click());
    assert.equal(await performance.page.locator('#workspace').getAttribute('data-view'), 'map');
    assert.equal(await performance.page.locator('#detail-title').textContent(), many[699].name);
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').getAttribute('title'), many[699].name, 'an unregistered selection creates its pin immediately');
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').count(), 1);
    assert.equal(await performance.page.locator('.restaurant-pin').count(), 300, 'selection replaces a pin while preserving the rendering limit');
    assert.equal(await performance.page.locator('.restaurant-pin[title="' + many[650].name + '"]').count(), 0);
    assert.equal(performance.network.geography, 1, 'selection reuses the local background');
    assert.deepEqual(performance.network.escaped, []); assert.deepEqual(performance.errors, []); await performance.context.close();

    const mixedRows = [...many.slice(0, 305), ...Array.from({ length: 7 }, (_, index) => ({ ...structuredClone(unknown), id: 'unlocated-' + index, name: '지도미확인' + index }))];
    const mixedMap = await fixture(browser, { dataset: { restaurants: mixedRows } });
    await waitForTotal(mixedMap.page, mixedRows.length);
    await mixedMap.page.locator('#show-map').click();
    await mixedMap.page.waitForFunction(() => !!document.querySelector('.leaflet-overlay-pane canvas,.leaflet-overlay-pane svg path'));
    assert.equal(await mixedMap.page.locator('.restaurant-pin').count(), 300);
    assert.equal(await mixedMap.page.locator('#map-caption-text').textContent(), '지역 개요도 · 위치 확인 305곳 중 300곳 표시 · 위치 미확인 7곳은 목록에서 확인');
    await mixedMap.page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await mixedMap.page.locator('.map-caption').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1; }), true, 'the combined map coverage message wraps inside the phone viewport');
    assert.deepEqual(mixedMap.network.escaped, []); assert.deepEqual(mixedMap.errors, []); await mixedMap.context.close();

    console.log('PASS: location-first entry and declined reentry preference, truthful distance ordering, 50-row progressive append, 300-pin cap with out-of-cap selection, real data filters, saved state, exact sources, 320–1280px layout, edition/selection/publication/source/listing labels, safe rendering and recovery; no real location permission or external map requests.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
