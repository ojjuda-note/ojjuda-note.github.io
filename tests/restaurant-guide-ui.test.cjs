/* Real browser checks for the directory; restaurant data and OSM tile images are fulfilled locally. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'games/certified-restaurants');
const dataset = JSON.parse(fs.readFileSync(path.join(directory, 'restaurants.json'), 'utf8'));
const tileImage = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#edf1e7"/><path d="M0 96h256M144 0v256" stroke="#fff" stroke-width="12"/></svg>';
const proof = process.env.RESTAURANT_PROOF_DIR || '/tmp/restaurant-guide-proof';
const origin = 'https://fixture.test';
const entry = origin + '/games/certified-restaurants/index.html?embedded=1';
const viewKey = 'ojjuda-certified-restaurants-view-v1';
const hasCoordinates = item => typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng);
const ids = items => items.map(item => item.id).sort();
const visibleIds = page => page.locator('#cards [data-restaurant-id]').evaluateAll(cards => cards.map(card => card.dataset.restaurantId).sort());
const mapNames = page => page.locator('.restaurant-pin').evaluateAll(pins => pins.map(pin => pin.title).sort());
const names = rows => rows.map(item => item.name).sort();
const waitForTotal = (page, count) => page.waitForFunction(expected => Number(document.querySelector('#result-count').dataset.total) === expected, count);
async function waitForCount(page, count) { await waitForTotal(page, count); while (await page.locator('#cards [data-restaurant-id]').count() < count) await page.locator('#load-more').click(); }
async function openFilters(page) { if (await page.locator('#filter-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#filter-toggle').click(); }
async function resetFilters(page) { await page.locator('#reset').click(); }

async function assertMapListLayout(page, width) {
  await page.setViewportSize({ width, height: 900 });
  // Viewport changes can reach the page before its responsive flex layout has painted.
  // Keep the geometry assertions below, but measure only after the map has a canvas.
  await page.waitForFunction(expected => innerWidth === expected && document.querySelector('#map').getBoundingClientRect().height > 0, width);
  assert.equal(await page.locator('#map-panel').isVisible(), true, 'the map remains visible at ' + width);
  assert.equal(await page.locator('#results').isVisible(), true, 'map mode also exposes the restaurant list at ' + width);
  await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
  const layout = await page.evaluate(() => {
    const rect = selector => { const value = document.querySelector(selector).getBoundingClientRect(); return { left: value.left, right: value.right, top: value.top, bottom: value.bottom, width: value.width, height: value.height }; };
    return {
      map: rect('#map-panel'), mapCanvas: rect('#map'), list: rect('#results'),
      pager: { ...rect('#map-pagination'), visible: document.querySelector('#map-pagination').getClientRects().length > 0 },
      pagerControls: ['#map-prev', '#map-page-status', '#map-next'].map(selector => ({ selector, ...rect(selector) })),
      controls: ['#search-form', '#region', '#nearby', '#reset', '#saved-only', '#recommendations-link', '#category', '#filter-toggle', '#result-count', '.view-switch'].map(selector => ({ selector, ...rect(selector) })),
      category: rect('#category'), region: rect('#region'), nearby: rect('#nearby'),
      categoryOptions: [...document.querySelector('#category').options].map(option => option.value),
      scrollWidth: document.documentElement.scrollWidth, viewport: innerWidth, viewportHeight: innerHeight, scrollY,
      filtersFolded: document.querySelector('#filter-options').hidden
    };
  });
  assert.ok(layout.scrollWidth <= width + 1, 'no horizontal page overflow at ' + width);
  layout.controls.forEach(control => assert.ok(control.width > 0 && control.left >= -1 && control.right <= width + 1, control.selector + ' fits within the ' + width + 'px viewport'));
  assert.deepEqual(layout.categoryOptions, ['', '한식', '중식', '일식', '양식', '분식', '디저트', '기타']);
  assert.ok(Math.abs(layout.category.top - layout.region.top) <= 2 && layout.category.left >= layout.region.right - 1, 'category selection stays beside the region at ' + width);
  assert.ok(layout.nearby.left >= layout.mapCanvas.left && layout.nearby.left <= layout.mapCanvas.left + 24 && layout.nearby.top >= layout.mapCanvas.top && layout.nearby.top <= layout.mapCanvas.top + 24, 'my location stays at the map top-left at ' + width);
  if (layout.pager.visible) {
    assert.ok(layout.pager.height > 0 && layout.pager.left >= layout.map.left - 1 && layout.pager.right <= layout.map.right + 1 && layout.pager.bottom <= layout.map.bottom + 1, 'the visible pager stays inside the map panel at ' + width);
    assert.ok(Math.abs(layout.mapCanvas.bottom - layout.pager.top) <= 1, 'the pager follows the map canvas without covering it or leaving a gap at ' + width);
    layout.pagerControls.forEach(control => assert.ok(control.width > 0 && control.height > 0 && control.left >= layout.pager.left - 1 && control.right <= layout.pager.right + 1 && control.top >= layout.pager.top - 1 && control.bottom <= layout.pager.bottom + 1, control.selector + ' fits inside the visible pager at ' + width));
  } else {
    assert.ok(Math.abs(layout.mapCanvas.bottom - layout.map.bottom) <= 2, 'a hidden pager leaves no empty footer below the map at ' + width);
  }
  if (width <= 760) {
    assert.ok(layout.map.bottom <= layout.list.top + 1, 'the phone list follows the map without overlap');
    assert.ok(Math.abs(layout.map.left - layout.list.left) <= 1 && Math.abs(layout.map.width - layout.list.width) <= 1, 'phone map and list share the same content edges');
    const mapHeightWithoutPager = layout.map.height - (layout.pager.visible ? layout.pager.height : 0);
    assert.ok(mapHeightWithoutPager >= 220 && mapHeightWithoutPager <= 261, 'the phone map keeps its original height after subtracting the visible pager: ' + JSON.stringify({ width, panel: layout.map.height, canvas: layout.mapCanvas.height, pager: layout.pager.height, pagerVisible: layout.pager.visible }));
    assert.ok(layout.mapCanvas.height >= 218 && layout.mapCanvas.height <= 261 && Math.abs(mapHeightWithoutPager - layout.mapCanvas.height) <= 2, 'the actual phone map canvas retains approximately 220–260px, allowing for its panel border');
    assert.ok(layout.map.height <= (layout.pager.visible ? 311 : 261), 'the phone map and its optional pager leave room for the restaurant list');
  } else {
    if (layout.filtersFolded) assert.ok(layout.map.bottom + layout.scrollY <= layout.viewportHeight + 1, 'the complete desktop map fits in the first viewport with optional filters folded');
    assert.ok(layout.map.right <= layout.list.left + 1, 'the desktop map sits to the left of the list');
    assert.ok(Math.abs(layout.map.top - layout.list.top) <= 1, 'desktop panels start on the same row');
    assert.ok(Math.abs(layout.map.height - layout.list.height) <= 1, 'desktop panels share one bounded viewport');
    if (width >= 1100) {
      const mapShare = layout.map.width / (layout.map.width + layout.list.width);
      assert.ok(mapShare >= .57 && mapShare <= .64, 'the desktop map receives approximately 60% of the content width');
    }
  }
}

async function fixture(browser, options = {}) {
  const context = await browser.newContext({ viewport: options.viewport || { width: 1280, height: 1000 }, reducedMotion: 'reduce' });
  const network = { tiles: 0, tileUrls: [], escaped: [], data: 0 };
  let tileFailures = options.tileFailures || 'none', failedTileUrl = null;
  const records = options.dataset || dataset;
  await context.addInitScript(({ permission, position, locationChoice, blockStorage, firstVisit, savedView, viewKey }) => {
    window.fixtureLocationRequests = 0;
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state: permission }) } });
    Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure) { window.fixtureLocationRequests++; queueMicrotask(() => position ? success({ coords: { latitude: position.lat, longitude: position.lng } }) : failure({ code: 1, message: 'Fixture denied' })); } } });
    if (locationChoice) localStorage.setItem('ojjuda-certified-restaurants-location-v1', locationChoice);
    // Data regressions keep their explicit list preference; do not overwrite a later user choice on reload.
    if (!firstVisit && localStorage.getItem(viewKey) === null) localStorage.setItem(viewKey, savedView);
    if (blockStorage) {
      Storage.prototype.getItem = () => { throw new DOMException('Fixture disabled', 'SecurityError'); };
      Storage.prototype.setItem = () => { throw new DOMException('Fixture full', 'QuotaExceededError'); };
    }
  }, { permission: options.permission || 'denied', position: options.position || null, locationChoice: options.locationChoice || '', blockStorage: !!options.blockStorage, firstVisit: !!options.firstVisit, savedView: options.savedView || 'list', viewKey });
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === 'https://tile.openstreetmap.org' && /^\/\d+\/\d+\/\d+\.png$/.test(url.pathname) && !url.search) {
      network.tiles++; network.tileUrls.push(url.href);
      if (tileFailures === 'mixed' && !failedTileUrl) failedTileUrl = url.href;
      const fail = tileFailures === 'all' || tileFailures === 'mixed' && url.href === failedTileUrl;
      return route.fulfill({ status: fail ? 503 : 200, contentType: fail ? 'text/plain' : 'image/svg+xml', body: fail ? 'Fixture tile unavailable' : tileImage });
    }
    if (url.origin !== origin) { network.escaped.push(url.href); return route.abort(); }
    if (options.noMap && url.pathname.endsWith('/vendor/leaflet.js')) return route.fulfill({ contentType: 'application/javascript', body: '' });
    if (['/official-ulsan-tourism.json', '/official-seoul-blue-ribbon.json', '/official-seoul-visitseoul-northeast.json', '/official-seoul-visitseoul-southwest.json', '/official-seoul-visitseoul-southeast.json', '/official-incheon-itour-slot06.json', '/official-incheon-itour-slot07.json', '/official-gyeonggi-oldshops-slot08.json', '/official-seongnam-hipstores-slot09.json', '/official-goyang-paju-slot10.json', '/official-bucheon-gimpo-slot11.json', '/official-gyeonggi-slot12.json', '/official-gyeonggi-slot13.json'].some(file => url.pathname.endsWith(file))) {
      // Keep synthetic scenarios scoped to their supplied base catalog.
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ restaurants: [], enrichments: [] }) });
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
  return { context, page, errors, network, recoverTiles() { tileFailures = 'none'; } };
}

(async () => {
  assert.ok(Array.isArray(dataset.restaurants) && dataset.restaurants.length, 'the published data contains restaurants');
  fs.mkdirSync(proof, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}) });
  try {
    // First entry matches the festival layout; only deliberate view choices survive later visits.
    const layoutBase = structuredClone(dataset.restaurants[0]);
    const layoutRows = [
      { ...layoutBase, id: 'layout-seoul', name: '서울 지도 식당', region: '서울', district: '중구', lat: 37.5665, lng: 126.978 },
      { ...layoutBase, id: 'layout-busan', name: '부산 지도 식당', region: '부산', district: '중구', lat: 35.1796, lng: 129.0756 },
      { ...layoutBase, id: 'layout-unlocated', name: '제주 주소 식당', region: '제주', district: '제주시', lat: null, lng: null }
    ];
    // A member may type 부페 even when the registered restaurant spells its name 뷔페.
    const spellingRows = [{ ...structuredClone(layoutBase), id: 'spelling-restaurant', name: '효자한식뷔페', region: '대전', district: '동구', address: '대전광역시 동구 대전로813번길 49, 1층', lat: 36.33107, lng: 127.42966 }];
    const spelling = await fixture(browser, { dataset: { restaurants: spellingRows } });
    await waitForTotal(spelling.page, 1);
    await spelling.page.locator('#search').fill('효자한식부페');
    await spelling.page.locator('#search').press('Enter');
    assert.deepEqual(await visibleIds(spelling.page), ['spelling-restaurant'], 'a common buffet spelling does not hide the same restaurant');
    await spelling.context.close();

    const firstMap = await fixture(browser, { firstVisit: true, dataset: { restaurants: layoutRows } });
    await waitForTotal(firstMap.page, layoutRows.length);
    await firstMap.page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded'));
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'map', 'an unconfigured first visit opens the map with its list');
    assert.equal(await firstMap.page.evaluate(key => localStorage.getItem(key), viewKey), null, 'the automatic default is not saved as a user preference');
    assert.equal(await firstMap.page.locator('.restaurant-pin').count(), 2, 'the initial map contains only known locations');
    assert.deepEqual(await visibleIds(firstMap.page), ids(layoutRows), 'initial map mode also includes the restaurant without coordinates in its list');
    assert.ok(firstMap.network.tiles > 0, 'the first map requests street map tiles');
    assert.equal(await firstMap.page.locator('.leaflet-tile-pane > .leaflet-layer').count(), 1, 'the map uses one street tile layer');
    const osmAttribution = firstMap.page.locator('.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]');
    assert.equal(await osmAttribution.isVisible(), true, 'OpenStreetMap attribution remains visible');
    assert.match(await osmAttribution.textContent(), /OpenStreetMap/);
    assert.equal(await firstMap.page.locator('.leaflet-tile').first().getAttribute('referrerpolicy'), 'strict-origin-when-cross-origin');
    assert.equal(await firstMap.page.locator('#filter-options').isVisible(), false);
    for (const selector of ['#region', '#category', '#nearby', '#reset', '#saved-only', '#recommendations-link']) assert.equal(await firstMap.page.locator(selector).isVisible(), true, selector + ' is available without opening the guide filter');
    assert.equal(await firstMap.page.locator('#recommendations-link').evaluate(link => link.previousElementSibling?.id === 'search-form' && !link.closest('header')), true, 'recommendations follow the search form');
    assert.equal(await firstMap.page.locator('#recommendations-link').getAttribute('href'), '/world.html?game=restaurants&restaurantView=recommendations');
    assert.equal(await firstMap.page.locator('#recommendations-link').getAttribute('target'), '_top', 'the standalone action preserves the canonical nested destination');
    for (const width of [1280, 768, 370, 320]) await assertMapListLayout(firstMap.page, width);
    await firstMap.page.locator('#region').selectOption('서울');
    await waitForTotal(firstMap.page, 1);
    assert.equal(await firstMap.page.evaluate(key => localStorage.getItem(key), viewKey), null, 'filtering does not persist a view choice');
    await resetFilters(firstMap.page); await waitForTotal(firstMap.page, layoutRows.length);
    await firstMap.page.locator('#show-list').click();
    assert.equal(await firstMap.page.evaluate(key => localStorage.getItem(key), viewKey), 'list');
    await firstMap.page.waitForLoadState('networkidle');
    const beforeListReload = firstMap.network.tiles;
    await firstMap.page.reload(); await waitForTotal(firstMap.page, layoutRows.length);
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'list', 'an explicitly chosen list view survives reload');
    assert.equal(await firstMap.page.locator('#map-panel').isVisible(), false);
    assert.equal(await firstMap.page.locator('#results').isVisible(), true);
    assert.equal(firstMap.network.tiles, beforeListReload, 'restoring list view leaves the map unloaded');
    await firstMap.page.locator('#show-map').click();
    assert.equal(await firstMap.page.evaluate(key => localStorage.getItem(key), viewKey), 'map');
    await firstMap.page.reload(); await waitForTotal(firstMap.page, layoutRows.length);
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'map', 'an explicitly chosen map view survives reload');
    await assertMapListLayout(firstMap.page, 370);
    await firstMap.page.locator('#region').selectOption('제주'); await waitForTotal(firstMap.page, 1);
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'list', 'unlocated phone results fall back to their useful address list');
    assert.equal(await firstMap.page.evaluate(key => localStorage.getItem(key), viewKey), 'map', 'automatic no-coordinate fallback does not overwrite the chosen map view');
    assert.deepEqual(await visibleIds(firstMap.page), ['layout-unlocated']);
    await firstMap.page.reload(); await waitForTotal(firstMap.page, layoutRows.length);
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'map', 'the next visit restores the explicit preference after automatic fallback');
    await firstMap.page.evaluate(key => localStorage.setItem(key, 'calendar'), viewKey);
    await firstMap.page.reload(); await waitForTotal(firstMap.page, layoutRows.length);
    assert.equal(await firstMap.page.locator('#workspace').getAttribute('data-view'), 'map', 'unsupported saved views safely fall back to the map');
    assert.deepEqual(firstMap.errors, []); assert.deepEqual(firstMap.network.escaped, []); await firstMap.context.close();

    const regular = await fixture(browser, { denyLocation: true });
    const { page } = regular;
    await waitForTotal(page, dataset.restaurants.length);
    assert.equal(await page.locator('#cards [data-restaurant-id]').count(), Math.min(50, dataset.restaurants.length), 'first render is a bounded batch');
    assert.equal(await page.locator('.result-shown').textContent(), '현재 ' + Math.min(50, dataset.restaurants.length) + '곳 표시');
    await waitForCount(page, dataset.restaurants.length);
    assert.equal(await page.locator('.result-shown').textContent(), '현재 ' + dataset.restaurants.length + '곳 표시', 'toolbar count follows visible pagination');
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'every real dataset record appears once');
    assert.equal(await page.locator('#back-link').isVisible(), false, 'the embedded page leaves navigation to the arcade shell');
    assert.equal(await page.locator('#categories').count(), 0);
    assert.deepEqual(await page.locator('#category').evaluate(select => [...select.options].map(option => option.value)), ['', '한식', '중식', '일식', '양식', '분식', '디저트', '기타']);
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 0, 'a known denied permission is not requested again on entry');
    assert.equal(await page.locator('#nearby').isVisible(), false, 'my location is hidden with the unused map in list view');
    assert.equal(await page.locator('#nearby').evaluate(button => !!button.closest('#map-panel')), true);
    assert.equal(await page.locator('#nearby-label').textContent(), '내 위치');
    assert.equal(await page.locator('#filter-options #nearby').count(), 0);
    assert.equal(await page.locator('#workspace').getAttribute('data-view'), 'list', 'an explicitly saved list preference is honored');
    assert.equal(await page.locator('#results').isVisible(), true);
    assert.equal(await page.locator('#map-panel').isVisible(), false);
    assert.equal(await page.locator('#filter-options').isVisible(), false);
    assert.equal(await page.locator('#filter-toggle').getAttribute('aria-expanded'), 'false');
    assert.equal(await page.locator('#region').isVisible(), true, 'region selection stays outside the folded guide filters');
    assert.equal(await page.locator('#saved-only').isVisible(), true, 'saved restaurants are directly available from the header');
    assert.equal(regular.network.tiles, 0, 'list entry does not request unused map tiles');
    assert.equal(await page.locator('#map.leaflet-container').count(), 0, 'entry does not initialize an unused map');
    if (dataset.collections?.length) assert.deepEqual(await page.locator('.collection-title').evaluateAll(links => links.map(link => link.href)), dataset.collections.map(collection => new URL(collection.url).href), 'the collection shortcut uses the source-provided map URL');
    await page.locator('#show-map').click();
    await page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded'));
    assert.ok(regular.network.tiles > 0);
    assert.equal(await page.locator('.restaurant-pin').count(), Math.min(50, dataset.restaurants.filter(hasCoordinates).length));
    assert.equal(await page.locator('.result-shown').isVisible(), false, 'list-only counts do not compete with map coverage');
    const missingActual = dataset.restaurants.filter(item => !hasCoordinates(item)).length;
    assert.equal(await page.locator('.map-caption').count(), 0, 'the map has no obstructing summary caption');
    if (missingActual) assert.ok((await page.locator('#result-coverage').textContent()).includes('위치 확인 중 ' + missingActual + '곳'));
    await page.locator('#show-list').click();
    assert.equal(await page.locator('.leaflet-tile-pane > .leaflet-layer').count(), 0, 'list view detaches unused map tiles');
    await page.locator('#show-map').click();
    await page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded'));
    assert.equal(await page.locator('.leaflet-tile-pane > .leaflet-layer').count(), 1, 'view changes keep a single tile layer');
    assert.equal(await page.locator('#map.leaflet-container').count(), 1);
    await page.locator('#show-list').click();
    assert.equal(await page.locator('.result-shown').isVisible(), true);

    // Match multiple real data fields together, then prove an incompatible query clears the result.
    const combined = dataset.restaurants.find(item => item.guides.some(guide => guide.provider === 'michelin') && item.guides.some(guide => guide.provider === 'blue-ribbon'));
    assert.ok(combined, 'the real data contains a cross-guide selection to exercise intersection semantics');
    const compactCard = page.locator('[data-restaurant-id="' + combined.id + '"]');
    assert.equal(await compactCard.locator('.card-address,.coord-note').count(), 0, 'details are not repeated on every compact card');
    assert.doesNotMatch(await compactCard.locator('.guide-badges').textContent(), /20\d{2}/, 'edition dates are shown in the detail');
    await page.locator('#category').selectOption(combined.category);
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
    assert.ok((await page.locator('#detail a:not(.rating-login-link)').evaluateAll(links => links.map(link => ({ protocol: new URL(link.href).protocol, rel: link.rel, target: link.target })))).every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer') && link.target === '_blank'), 'source and map destinations use safe external links');
    assert.deepEqual(await page.locator('.rating-login-link').evaluate(link => ({ origin: link.origin, path: link.pathname, query: link.search, target: link.target })), { origin, path: '/', query: '?auth=login&next=world', target: '_top' }, 'ratings use the existing same-origin member entry');
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

    // An explicit retry of location permission keeps browsing usable after denial.
    await page.locator('#sort-order').selectOption('distance');
    await page.waitForFunction(() => document.querySelector('#location-status').textContent.includes('허용되지'));
    assert.equal(await page.evaluate(() => window.fixtureLocationRequests), 1);
    assert.equal(await page.locator('#nearby').isDisabled(), false);
    await waitForCount(page, dataset.restaurants.length);
    assert.deepEqual(await visibleIds(page), ids(dataset.restaurants), 'location denial does not hide otherwise valid results');
    await page.locator('#choose-region').click();
    assert.equal(await page.locator('#region').evaluate(node => node === document.activeElement), true, 'denial offers a direct path to region selection');
    await resetFilters(page);

    // Responsive layout and actual map/list presentation at narrow phone widths.
    for (const width of [320, 370, 390, 700, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForFunction(() => document.documentElement.scrollWidth <= innerWidth + 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'no horizontal page overflow at ' + width);
      await page.locator('#show-list').click();
      assert.equal(await page.locator('#results').isVisible(), true);
      assert.equal(await page.locator('#map-panel').isVisible(), false);
      if (width <= 760) {
        assert.equal(await page.locator('#category').evaluate(select => { const rect = select.getBoundingClientRect(); return select.options.length === 8 && rect.left >= 0 && rect.right <= innerWidth + 1; }), true, 'all cuisines remain selectable without a horizontal chip row');
      }
      await page.locator('#show-map').click();
      await assertMapListLayout(page, width);
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
        assert.equal(await page.locator('.restaurant-pin').count(), Math.min(50, locatedPostal.length), 'the map shows only one page of located postal recommendations');
      }
      assert.equal(await page.locator('#collections').evaluate(section => !!section.closest('.data-note details')), true);
      assert.equal(await page.locator('#collections').isVisible(), false, 'official source links stay inside folded data details');
      await page.locator('.data-note summary').click();
      assert.equal(await page.locator('#collections').isVisible(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'expanded official source links fit a phone viewport');
      await page.locator('.data-note summary').click();
      await page.locator('#show-list').click();
      await waitForCount(page, postalRows.length);
      assert.deepEqual(await visibleIds(page), ids(postalRows), 'every postal recommendation remains accessible through visible list pagination');
      await resetFilters(page);
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.locator('#show-map').click();
    if (await page.locator('#filter-toggle').getAttribute('aria-expanded') === 'true') await page.locator('#filter-toggle').click();
    await page.screenshot({ path: path.join(proof, 'restaurants-desktop.png'), fullPage: false });
    await page.setViewportSize({ width: 370, height: 844 });
    await page.locator('#show-map').click();
    await page.screenshot({ path: path.join(proof, 'restaurants-mobile.png'), fullPage: false });
    assert.deepEqual(regular.errors, [], 'normal browsing produces no uncaught errors');
    assert.deepEqual(regular.network.escaped, [], 'the browser did not request any unmocked external destination');
    await regular.context.close();

    // Municipal designations remain usable as a separate guide on narrow phones.
    const localGuide = {
      provider: 'local-guide', label: '대전광역시 3대 30년 전통음식업소 및 지역대표음식 전문업소 지정',
      year: 2025, yearType: 'source', sourceAsOf: '2025-05', verifiedAt: '2026-11-03',
      sourceName: '대전광역시 식품안전과 · 지역대표음식 전문업소 및 전통음식업소 공식 안내 자료',
      sourceUrl: origin + '/sources/daejeon-designations-2025.pdf',
      selectionCriteria: '<img src=x onerror="window.localGuideInjected=1"> 맛·지역성 검토 <script>window.localGuideInjected=2</script> & 지자체 지정'
    };
    const localRows = [
      { id: 'municipal-only', name: '가 지자체 지정 식당', category: '한식', region: '대전', district: '중구', address: '대전광역시 중구 테스트로 1', lat: null, lng: null, menu: ['국밥'], guides: [localGuide] },
      { id: 'municipal-and-ribbon', name: '나 중복 선정 식당', category: '한식', region: '충북', district: '청주시', address: '충청북도 청주시 테스트로 2', lat: null, lng: null, menu: ['국수'], guides: [
        { ...localGuide, label: '청주시 향토음식점 지정', year: null, yearType: 'selection', sourceAsOf: '2025-12-31', sourceName: '청주시 향토음식점 공식 안내', sourceUrl: origin + '/sources/cheongju-designations', selectionCriteria: '향토성과 음식 맛 등을 심사하여 지자체가 지정한 음식점' },
        { provider: 'blue-ribbon', label: '1리본', year: 2026, yearType: 'edition', sourceName: '블루리본 서베이 공식 가이드', sourceUrl: origin + '/sources/blue-ribbon-2026', verifiedAt: '2026-11-03' }
      ] },
      { id: 'michelin-only', name: '다 미쉐린 선정 식당', category: '한식', region: '대전', district: '유성구', address: '대전광역시 유성구 테스트로 3', lat: null, lng: null, menu: ['정식'], guides: [
        { provider: 'michelin', label: '빕 구르망', year: 2026, yearType: 'edition', sourceName: '미쉐린 공식 가이드', sourceUrl: origin + '/sources/michelin-2026', verifiedAt: '2026-11-03' }
      ] }
    ];
    for (const width of [320, 370]) {
      const municipal = await fixture(browser, { viewport: { width, height: 740 }, dataset: { restaurants: localRows } });
      const municipalPage = municipal.page;
      await waitForCount(municipalPage, 3); await openFilters(municipalPage);
      assert.equal(await municipalPage.locator('[data-guide="local-guide"]').textContent(), '지자체 지정');
      assert.equal(await municipalPage.locator('#guide-recommended').isVisible(), false, 'the guest directory keeps the member-only recommendation filter hidden');
      const filterLayout = await municipalPage.locator('#guides').evaluate(container => {
        const bounds = container.getBoundingClientRect();
        return [...container.querySelectorAll('button:not(#guide-recommended)')].map(button => { const rect = button.getBoundingClientRect(); return { guide: button.dataset.guide, text: button.textContent, width: rect.width, height: rect.height, fits: rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && button.scrollWidth <= button.clientWidth + 1 }; });
      });
      assert.deepEqual(filterLayout.map(button => button.guide), ['', 'michelin', 'blue-ribbon', 'post-office', 'local-guide', 'both'], 'all public guide filters remain present');
      assert.ok(filterLayout.every(button => button.width > 0 && button.height >= 32 && button.fits), 'every public guide filter stays exposed and unclipped at ' + width + ': ' + JSON.stringify(filterLayout));
      await municipalPage.locator('[data-guide="local-guide"]').click(); await waitForCount(municipalPage, 2);
      assert.deepEqual(await visibleIds(municipalPage), ['municipal-and-ribbon', 'municipal-only']);
      assert.equal(await municipalPage.locator('[data-guide="local-guide"]').getAttribute('aria-pressed'), 'true');
      await municipalPage.locator('#region').selectOption('대전'); await waitForCount(municipalPage, 1);
      assert.deepEqual(await visibleIds(municipalPage), ['municipal-only'], 'region and municipal guide intersect on a phone');
      assert.equal(await municipalPage.locator('#filter-summary').textContent(), '대전 · 지자체 지정');
      await municipalPage.locator('[data-guide="blue-ribbon"]').click(); await waitForCount(municipalPage, 0);
      assert.deepEqual(await visibleIds(municipalPage), [], 'municipal designations are excluded from blue ribbon unless both sources exist');
      await municipalPage.locator('#region').selectOption('충북'); await waitForCount(municipalPage, 1);
      assert.deepEqual(await visibleIds(municipalPage), ['municipal-and-ribbon']);
      assert.equal(await municipalPage.locator('[data-restaurant-id="municipal-and-ribbon"] .guide-badge').count(), 2, 'the shared restaurant keeps both distinct guide badges');
      await municipalPage.locator('[data-guide=""]').click();
      await municipalPage.locator('#region').selectOption(''); await waitForCount(municipalPage, 3);
      assert.deepEqual(await visibleIds(municipalPage), ids(localRows), 'all guides restores every fixture without duplicating a joint selection');
      const cardBadgeLayout = await municipalPage.locator('#cards .guide-badge').evaluateAll(badges => badges.map(badge => {
        const rect = badge.getBoundingClientRect(), owner = badge.closest('.guide-badges').getBoundingClientRect();
        return { text: badge.textContent, width: rect.width, fits: rect.left >= owner.left - 1 && rect.right <= owner.right + 1 && badge.scrollWidth <= badge.clientWidth + 1 };
      }));
      assert.ok(cardBadgeLayout.every(badge => badge.width > 0 && badge.fits), 'long municipal program names wrap inside their card at ' + width + ': ' + JSON.stringify(cardBadgeLayout));
      assert.equal(await municipalPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'expanded guide filters and long badges do not widen the phone page');
      await municipalPage.locator('[data-restaurant-id="municipal-only"] .card-main').click();
      assert.equal(await municipalPage.locator('.source-heading .is-local-guide').textContent(), '지자체 지정 ' + localGuide.label);
      assert.equal(await municipalPage.locator('.source-year').textContent(), '2025년 자료');
      assert.doesNotMatch(await municipalPage.locator('.source-list').textContent(), /2025년 선정/);
      assert.equal(await municipalPage.locator('.source-verified').textContent(), '자료 기준 2025.05 · 출처 확인일 2026.11.03');
      assert.equal(await municipalPage.locator('.source-link').textContent(), localGuide.sourceName + ' ↗');
      assert.equal(await municipalPage.locator('.source-link').getAttribute('href'), localGuide.sourceUrl);
      assert.equal(await municipalPage.locator('.source-criteria').textContent(), localGuide.selectionCriteria);
      assert.equal(await municipalPage.locator('.source-criteria > *,#detail img,#detail script').count(), 0, 'criteria stay inert text in the real browser');
      assert.equal(await municipalPage.evaluate(() => window.localGuideInjected), undefined);
      await municipalPage.locator('.source-link').scrollIntoViewIfNeeded();
      const sourceLayout = await municipalPage.evaluate(() => {
        const dialog = document.querySelector('#detail').getBoundingClientRect();
        const containers = [...document.querySelectorAll('#detail,.detail-shell,.detail-body,.source-item,.source-heading,.source-criteria,.source-verified')].map(node => {
          const rect = node.getBoundingClientRect();
          return { className: node.className, left: rect.left, right: rect.right, width: rect.width, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
        });
        const textBoxes = [...document.querySelectorAll('#detail .guide-badge,#detail .source-link')].flatMap(node => [...node.getClientRects()].map(rect => ({ left: rect.left, right: rect.right, width: rect.width })));
        return { dialog: { left: dialog.left, right: dialog.right }, containers, textBoxes, viewport: innerWidth };
      });
      assert.ok(sourceLayout.dialog.left >= 0 && sourceLayout.dialog.right <= width + 1, 'the source dialog fits the ' + width + 'px viewport');
      assert.ok(sourceLayout.containers.every(node => node.width > 0 && node.left >= sourceLayout.dialog.left - 1 && node.right <= sourceLayout.dialog.right + 1 && node.scrollWidth <= node.clientWidth + 1), 'source criteria and dates require no horizontal scrolling at ' + width + ': ' + JSON.stringify(sourceLayout));
      assert.ok(sourceLayout.textBoxes.length >= 2 && sourceLayout.textBoxes.every(rect => rect.width > 0 && rect.left >= sourceLayout.dialog.left - 1 && rect.right <= sourceLayout.dialog.right + 1), 'long program and agency names remain within the dialog at ' + width);
      await municipalPage.screenshot({ path: path.join(proof, 'restaurants-municipal-' + width + '.png'), fullPage: false });
      await municipalPage.locator('#close-detail').click();
      assert.equal(await municipalPage.locator('#detail').evaluate(dialog => dialog.open), false, 'the detail remains dismissible after reading a long official source');
      assert.deepEqual(municipal.errors, []); assert.deepEqual(municipal.network.escaped, []); await municipal.context.close();
    }

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
    assert.equal(await hostile.page.locator('.restaurant-pin').count(), Math.min(50, dataset.restaurants.filter(hasCoordinates).length), 'null coordinates never create an invented map pin');
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

    const mapFailure = await fixture(browser, { tileFailures: 'all' });
    await waitForCount(mapFailure.page, dataset.restaurants.length);
    await mapFailure.page.locator('#show-map').click();
    await mapFailure.page.locator('#retry-map').waitFor();
    await mapFailure.page.locator('#show-list').click();
    await mapFailure.page.locator('.card-main').first().click();
    assert.equal(await mapFailure.page.locator('#detail').evaluate(dialog => dialog.open), true, 'tile failures do not block restaurant information');
    await mapFailure.page.locator('#close-detail').click();
    await mapFailure.page.locator('#show-map').click();
    await mapFailure.page.waitForLoadState('networkidle');
    await mapFailure.page.locator('#retry-map').waitFor();
    const failedTileRequests = mapFailure.network.tiles;
    mapFailure.recoverTiles();
    await mapFailure.page.locator('#retry-map').click();
    await mapFailure.page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded') && document.querySelector('#map-message').hidden);
    assert.ok(mapFailure.network.tiles > failedTileRequests, 'manual retry requests the failed tiles again');
    assert.ok(mapFailure.network.tileUrls.every(url => /^https:\/\/tile\.openstreetmap\.org\/\d+\/\d+\/\d+\.png$/.test(url)), 'retry uses the same keyless, cacheable tile URLs');
    assert.equal(await mapFailure.page.locator('#map-message').isVisible(), false);
    assert.equal(await mapFailure.page.locator('.map-caption').count(), 0, 'retry does not restore an obstructing map caption');
    assert.deepEqual(mapFailure.errors, []); assert.deepEqual(mapFailure.network.escaped, []);
    await mapFailure.context.close();

    const partialTiles = await fixture(browser, { tileFailures: 'mixed', dataset: { restaurants: layoutRows } });
    await waitForTotal(partialTiles.page, layoutRows.length); await partialTiles.page.locator('#show-map').click();
    await partialTiles.page.locator('#retry-map').waitFor();
    assert.ok(await partialTiles.page.locator('.leaflet-tile-loaded').count() > 0, 'the fixture mixes successful and failed tiles');
    assert.equal(await partialTiles.page.locator('#map-message').isVisible(), true, 'successful neighboring tiles do not hide a remaining tile error');
    assert.equal(await partialTiles.page.locator('.restaurant-pin').count(), 2, 'partial tile errors preserve known restaurant pins');
    await partialTiles.page.waitForLoadState('networkidle');
    partialTiles.recoverTiles(); await partialTiles.page.locator('#retry-map').click();
    await partialTiles.page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded') && document.querySelector('#map-message').hidden);
    assert.deepEqual(partialTiles.errors, []); assert.deepEqual(partialTiles.network.escaped, []); await partialTiles.context.close();

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
    assert.deepEqual(await granted.page.evaluate(key => ({ keys: Object.keys(localStorage).sort(), location: localStorage.getItem('ojjuda-certified-restaurants-location-v1'), view: localStorage.getItem(key) }), viewKey), { keys: ['ojjuda-certified-restaurants-location-v1', viewKey].sort(), location: 'enabled', view: 'list' }, 'location and view persistence contain preferences only, never coordinates');
    await openFilters(granted.page); await granted.page.locator('#region').selectOption('제주');
    await waitForCount(granted.page, 1); assert.match(await granted.page.locator('#location-status').textContent(), /거리 정보가 없어 맛집 목록/);
    await resetFilters(granted.page); await waitForCount(granted.page, 3);
    assert.equal(await granted.page.locator('#nearby').getAttribute('aria-pressed'), 'true', 'filter reset keeps location mode');
    assert.deepEqual(granted.errors, []); await granted.context.close();

    const firstVisit = await fixture(browser, { dataset: nearbyData, permission: 'prompt' });
    await waitForCount(firstVisit.page, 3);
    await firstVisit.page.waitForFunction(() => window.fixtureLocationRequests === 1 && !document.querySelector('#nearby').disabled);
    assert.equal(await firstVisit.page.evaluate(() => localStorage.getItem('ojjuda-certified-restaurants-location-v1')), 'denied');
    await firstVisit.page.reload(); await waitForCount(firstVisit.page, 3);
    assert.equal(await firstVisit.page.evaluate(() => window.fixtureLocationRequests), 0, 'reentry does not repeat a declined automatic prompt');
    assert.equal(await firstVisit.page.locator('#region').isVisible(), true, 'region remains directly selectable without routine location instructions');
    await firstVisit.page.locator('#sort-order').selectOption('distance');
    await firstVisit.page.waitForFunction(() => window.fixtureLocationRequests === 1 && !document.querySelector('#nearby').disabled);
    assert.deepEqual(firstVisit.errors, []); await firstVisit.context.close();

    const coverageRows = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(near), id: 'coverage-' + index, name: '등록확인' + index, region: '대전', category: index < 6 ? '한식' : '양식', lat: index % 6 < 2 ? 36.35 + index / 1000 : null, lng: index % 6 < 2 ? 127.38 : null, guides: [{ provider: 'blue-ribbon', sourceUrl: 'https://fixture.test/selection', label: '선정 이력' }] }));
    const coverage = await fixture(browser, { dataset: { restaurants: coverageRows }, viewport: { width: 370, height: 844 } });
    await waitForTotal(coverage.page, 12);
    assert.match(await coverage.page.locator('#result-count').textContent(), /^등록 12곳/);
    assert.equal(await coverage.page.locator('#result-coverage').textContent(), '지도 가능 4곳 · 위치 확인 중 8곳');
    for (const width of [320, 370]) {
      await coverage.page.setViewportSize({ width, height: 844 });
      assert.equal(await coverage.page.locator('#result-coverage').evaluate(node => { const rect = node.getBoundingClientRect(); return node.classList.contains('sr-only') && rect.width <= 1 && rect.height <= 1; }), true, 'coverage does not take a visual row at ' + width);
    }
    await coverage.page.locator('#show-map').click();
    await coverage.page.waitForFunction(() => document.querySelectorAll('.restaurant-pin').length === 4);
    assert.equal(await coverage.page.locator('#result-coverage').textContent(), '지도 표시 4곳 · 위치 확인 중 8곳');
    await coverage.page.locator('#category').selectOption('한식'); await waitForTotal(coverage.page, 6);
    assert.equal(await coverage.page.locator('.restaurant-pin').count(), 2);
    assert.equal(await coverage.page.locator('#result-coverage').textContent(), '지도 표시 2곳 · 위치 확인 중 4곳');
    await coverage.page.locator('#show-list').click();
    assert.equal(await coverage.page.locator('#result-coverage').textContent(), '지도 가능 2곳 · 위치 확인 중 4곳');
    assert.deepEqual(coverage.errors, []); assert.deepEqual(coverage.network.escaped, []); await coverage.context.close();
    const unavailableMap = await fixture(browser, { dataset: { restaurants: coverageRows }, noMap: true });
    await waitForTotal(unavailableMap.page, 12); await unavailableMap.page.locator('#show-map').click();
    assert.equal(await unavailableMap.page.locator('#result-coverage').textContent(), '지도 표시 0 / 4곳 · 위치 확인 중 8곳');
    assert.equal(await unavailableMap.page.locator('.restaurant-pin').count(), 0); assert.equal(await unavailableMap.page.locator('#map-message').isVisible(), true);
    assert.deepEqual(unavailableMap.errors, []); assert.deepEqual(unavailableMap.network.escaped, []); await unavailableMap.context.close();

    const many = Array.from({ length: 800 }, (_, index) => ({ ...structuredClone(near), id: 'many-' + index, name: '성능확인' + String(index).padStart(4, '0'), lat: 37.5665 + index / 10000, lng: 126.978 }));
    const performance = await fixture(browser, { dataset: { restaurants: many }, permission: 'granted', position: { lat: 37.5665, lng: 126.978 } });
    await waitForTotal(performance.page, many.length);
    await performance.page.waitForFunction(() => document.querySelector('#nearby').getAttribute('aria-pressed') === 'true');
    assert.equal(await performance.page.locator('.restaurant-card').count(), 50);
    assert.equal(await performance.page.locator('.result-shown').textContent(), '현재 50곳 표시');
    assert.equal(await performance.page.locator('#result-coverage').textContent(), '지도 가능 800곳');
    assert.equal(performance.network.tiles, 0, 'nearby entry does not force map loading');
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
    assert.equal(await performance.page.locator('.restaurant-card').count(), 700, 'successive batches expose cards beyond the current map page');
    await performance.page.locator('#show-map').click();
    await performance.page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded'));
    assert.equal(await performance.page.locator('.restaurant-pin').count(), 50);
    assert.equal(await performance.page.locator('#result-coverage').textContent(), '지도 표시 50 / 800곳');
    assert.deepEqual(await mapNames(performance.page), names(many.slice(0, 50)), 'nearby maps the nearest 50 first');
    assert.equal(await performance.page.locator('#map-pagination').isVisible(), true);
    assert.equal(await performance.page.locator('#map-prev').isDisabled(), true);
    await performance.page.locator('#map-next').click();
    assert.deepEqual(await mapNames(performance.page), names(many.slice(50, 100)), 'the next button replaces the first group with the next 50');
    assert.equal(await performance.page.locator('.restaurant-card').count(), 700, 'map pages do not change the accumulated list cards');
    await performance.page.locator('#map-prev').click();
    assert.deepEqual(await mapNames(performance.page), names(many.slice(0, 50)), 'previous returns to the first group');
    await performance.page.locator('#show-list').click(); await performance.page.locator('[data-restaurant-id="many-650"] .card-main').click();
    assert.equal(await performance.page.locator('#detail-title').textContent(), many[650].name);
    await performance.page.locator('#close-detail').click(); await performance.page.locator('#show-map').click();
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').getAttribute('title'), many[650].name, 'a list selection is marked when its map page opens');
    assert.deepEqual(await mapNames(performance.page), names(many.slice(650, 700)), 'list selection opens a complete group of 50');
    // The map's visible companion list supports real pointer selection within and across pages.
    assert.equal(await performance.page.locator('#results').isVisible(), true);
    await performance.page.locator('[data-restaurant-id="many-699"] .card-main').click();
    assert.equal(await performance.page.locator('#workspace').getAttribute('data-view'), 'map');
    assert.equal(await performance.page.locator('#detail-title').textContent(), many[699].name);
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').getAttribute('title'), many[699].name);
    assert.deepEqual(await mapNames(performance.page), names(many.slice(650, 700)), 'selecting a neighbor preserves the whole page');
    assert.equal(await performance.page.locator('.restaurant-pin.is-selected').count(), 1);
    assert.equal(await performance.page.locator('.restaurant-pin').count(), 50, 'selection stays within a group of 50');
    await performance.page.locator('#close-detail').click();
    await performance.page.waitForFunction(name => {
      const pin = document.querySelector('.restaurant-pin.is-selected');
      if (!pin || pin.title !== name) return false;
      const marker = pin.getBoundingClientRect(), map = document.querySelector('#map').getBoundingClientRect();
      const x = marker.left + marker.width / 2, y = marker.top + marker.height / 2;
      return x >= map.left && x <= map.right && y >= map.top && y <= map.bottom;
    }, many[699].name);
    await performance.page.locator('[data-restaurant-id="many-99"] .card-main').click();
    assert.deepEqual(await mapNames(performance.page), names(many.slice(50, 100)), 'another-page selection replaces all pins without a 51st marker');
    await performance.page.locator('#close-detail').click();
    assert.equal(await performance.page.locator('.leaflet-tile-pane > .leaflet-layer').count(), 1, 'selection keeps one street tile layer');
    assert.deepEqual(performance.network.escaped, []); assert.deepEqual(performance.errors, []); await performance.context.close();

    const mixedRows = [...many.slice(0, 305), ...Array.from({ length: 7 }, (_, index) => ({ ...structuredClone(unknown), id: 'unlocated-' + index, name: '지도미확인' + index }))];
    const mixedMap = await fixture(browser, { dataset: { restaurants: mixedRows } });
    await waitForTotal(mixedMap.page, mixedRows.length);
    assert.equal(await mixedMap.page.locator('#result-coverage').textContent(), '지도 가능 305곳 · 위치 확인 중 7곳');
    await mixedMap.page.locator('#show-map').click();
    await mixedMap.page.waitForFunction(() => !!document.querySelector('.leaflet-tile-loaded'));
    assert.equal(await mixedMap.page.locator('.restaurant-pin').count(), 50);
    assert.equal(await mixedMap.page.locator('#result-coverage').textContent(), '지도 표시 50 / 305곳 · 위치 확인 중 7곳');
    assert.equal(await mixedMap.page.locator('.map-caption').count(), 0, 'pagination coverage does not add a caption over the map');
    await mixedMap.page.setViewportSize({ width: 320, height: 844 });
    assert.equal(await mixedMap.page.locator('#result-coverage').evaluate(node => { const rect = node.getBoundingClientRect(); return node.classList.contains('sr-only') && rect.width <= 1 && rect.height <= 1; }), true, 'coverage remains accessible without a visible phone summary');
    assert.equal(await mixedMap.page.locator('#result-coverage').evaluate(node => !node.closest('#map-panel')), true, 'coverage never overlays the map');
    assert.equal(await mixedMap.page.locator('#map-pagination').evaluate(node => { const rect = node.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1; }), true, 'the map pager fits a 320px phone viewport');
    for (let group = 1; group <= 6; group++) await mixedMap.page.locator('#map-next').click();
    assert.deepEqual(await mapNames(mixedMap.page), names(many.slice(300, 305)), 'the final group contains only five remaining located restaurants');
    assert.equal(await mixedMap.page.locator('#map-next').isDisabled(), true);
    await mixedMap.page.locator('#map-prev').click();
    assert.deepEqual(await mapNames(mixedMap.page), names(many.slice(250, 300)), 'previous works on a phone after the final partial page');
    assert.deepEqual(mixedMap.network.escaped, []); assert.deepEqual(mixedMap.errors, []); await mixedMap.context.close();

    console.log('PASS: first-visit map with a visible list, explicit view persistence, festival-style desktop split and 320–1280px phone layout, location-first entry and declined reentry preference, truthful distance ordering, 50-row progressive append, non-cumulative 50-pin map pages with whole-page selection and map focus, partial-page navigation and phone pager layout, keyless OSM tiles and attribution, mixed tile failures and manual recovery, real data filters, saved state, exact sources, edition/selection/publication/source/listing labels and safe rendering; all tile requests fulfilled locally and no real location permission requested.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
