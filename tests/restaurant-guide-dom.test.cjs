/* DOM behavior checks for environments without a Chromium executable. Layout is checked separately in the browser suite. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'games/certified-restaurants');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const code = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
const dataset = JSON.parse(fs.readFileSync(path.join(directory, 'restaurants.json'), 'utf8'));
const geography = JSON.parse(fs.readFileSync(path.join(directory, 'korea-provinces.json'), 'utf8'));
const savedKey = 'ojjuda-certified-restaurants-saved-v1';
const locationKey = 'ojjuda-certified-restaurants-location-v1';
const viewKey = 'ojjuda-certified-restaurants-view-v1';
const ids = values => values.map(value => value.id).sort();
const coordinates = item => typeof item.lat === 'number' && typeof item.lng === 'number' && Number.isFinite(item.lat) && Number.isFinite(item.lng);
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check, message) { for (let attempt = 0; attempt < 150; attempt++) { if (check()) return; await pause(); } assert.fail(message); }
async function ready(f, count, expand = true) { await until(() => Number(f.$('#result-count').dataset.total) === count, 'the full result count is ' + count); if (expand) f.all(); }

function fixture(options = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://fixture.test/games/certified-restaurants/index.html?embedded=1', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, document = window.document;
  const calls = { data: 0, geography: 0, geoLayers: 0, location: 0, maps: 0, tiles: 0, fits: [], markers: new Set() };
  window.matchMedia = query => ({ matches: query.includes('max-width') ? !!options.mobile : false, media: query, addEventListener() {}, addListener() {}, removeEventListener() {} });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.fetch = async requested => {
    const url = new URL(requested, window.location.href);
    assert.equal(url.origin, window.location.origin, 'all background requests stay local');
    if (url.pathname.endsWith('/korea-provinces.json')) {
      calls.geography++;
      return { ok: !(options.failGeoOnce && calls.geography === 1), status: options.failGeoOnce && calls.geography === 1 ? 503 : 200, json: async () => structuredClone(geography) };
    }
    assert.ok(url.pathname.endsWith('/restaurants.json'), 'the app only fetches the restaurant dataset or local regional map'); calls.data++;
    return { ok: !(options.failOnce && calls.data === 1), status: options.failOnce && calls.data === 1 ? 503 : 200, json: async () => structuredClone(options.dataset || dataset) };
  };
  if (!options.noPermissionApi) Object.defineProperty(window.navigator, 'permissions', { value: { query: async () => ({ state: options.permission || 'denied' }) } });
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition(success, failure) { calls.location++; queueMicrotask(() => options.position ? success({ coords: { latitude: options.position.lat, longitude: options.position.lng } }) : failure({ code: options.locationError || 1 })); } } });
  if (options.storage) window.localStorage.setItem(savedKey, options.storage);
  if (options.locationChoice) window.localStorage.setItem(locationKey, options.locationChoice);
  // Data-behavior cases explicitly prefer the full list; default-map behavior is exercised below.
  const initialView = Object.hasOwn(options, 'view') ? options.view : 'list';
  if (initialView !== null) window.localStorage.setItem(viewKey, initialView);
  if (options.blockStorage) {
    window.Storage.prototype.getItem = () => { throw new Error('storage disabled'); };
    window.Storage.prototype.setItem = () => { throw new Error('storage disabled'); };
  }
  window.L = {
    map(id) { calls.maps++; const map = { element: document.getElementById(id), zoom: 7, attributionControl: { addAttribution() {}, setPrefix() {} }, setView(point, zoom) { this.zoom = zoom; this.point = point; return this; }, getZoom() { return this.zoom; }, fitBounds(bounds) { calls.fits.push(bounds); return this; }, invalidateSize() { return this; }, removeLayer(layer) { layer.remove(); return this; } }; return map; },
    control: { zoom() { return { addTo() {} }; } },
    divIcon(options) { return options; },
    tileLayer() { calls.tiles++; assert.fail('the directory must not request external map tiles'); },
    geoJSON(data) { calls.geoLayers++; assert.equal(data.type, 'FeatureCollection'); assert.equal(data.features.length, geography.features.length, 'the local overview includes every regional feature'); const node = document.createElement('div'); node.className = 'fixture-region-layer'; return { addTo(map) { map.element.append(node); return this; }, remove() { node.remove(); }, getBounds() { return { isValid: () => true }; }, setStyle() { return this; }, bringToBack() { return this; } }; },
    marker(point, settings) {
      const node = document.createElement('div'); node.className = settings.icon.className; node.innerHTML = settings.icon.html; node.title = settings.title; let click;
      const marker = { point, node, bindTooltip() { return this; }, on(name, handler) { if (name === 'click') click = handler; return this; }, addTo(map) { map.element.append(node); calls.markers.add(marker); node.addEventListener('click', () => click && click()); return this; }, remove() { node.remove(); calls.markers.delete(marker); return this; }, setIcon(icon) { node.className = icon.className; node.innerHTML = icon.html; return this; }, setLatLng(next) { marker.point = next; return this; }, setZIndexOffset() {} };
      return marker;
    }
  };
  if (options.noMap) delete window.L;
  window.eval(code);
  const $ = selector => document.querySelector(selector);
  return { dom, window, document, $, calls, errors, records: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId).sort(), order: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId), all() { let page = 0; while (!$('#load-more').hidden && page++ < 1000) $('#load-more').click(); }, click(selector) { const node = $(selector); assert.ok(node, selector + ' exists'); node.click(); }, filters() { if ($('#filter-options').hidden) $('#filter-toggle').click(); }, change(selector, value) { $(selector).value = value; $(selector).dispatchEvent(new window.Event('change', { bubbles: true })); }, search(value) { $('#search').value = value; $('#search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } };
}

(async () => {
  const initialMap = fixture({ view: null });
  await ready(initialMap, dataset.restaurants.length, false);
  await until(() => initialMap.calls.geoLayers === 1, 'a first visit loads the map and local geography');
  assert.equal(initialMap.$('#workspace').dataset.view, 'map', 'the first visit matches the festival map-and-list view');
  assert.equal(initialMap.$('#show-map').getAttribute('aria-pressed'), 'true');
  assert.equal(initialMap.$('#results').hidden, false, 'the list remains available beside the map');
  assert.equal(initialMap.records().length, 50, 'the first map view also provides a bounded batch of restaurant cards');
  assert.equal(initialMap.document.querySelectorAll('[data-category]').length, 8, 'category controls stay unambiguous when cards are visible beside the map');
  assert.equal(initialMap.$('#load-more').hidden, false, 'map-and-list browsing retains progressive loading');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), null, 'the default view does not create an explicit preference');
  initialMap.click('#show-list');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), 'list', 'explicit list selection is persisted');
  const explicitList = initialMap.window.localStorage.getItem(viewKey);
  initialMap.click('#show-map');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), 'map', 'explicit map selection is persisted');
  const explicitMap = initialMap.window.localStorage.getItem(viewKey);
  initialMap.click('[data-category="한식"]'); initialMap.click('#reset');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), explicitMap, 'search conditions never overwrite the chosen view');
  assert.equal(initialMap.calls.maps, 1, 'view changes reuse the map');
  assert.deepEqual(initialMap.errors, []); initialMap.dom.window.close();
  const restoredList = fixture({ view: explicitList });
  await ready(restoredList, dataset.restaurants.length, false);
  assert.equal(restoredList.$('#workspace').dataset.view, 'list');
  assert.equal(restoredList.calls.maps, 0, 'a saved list choice avoids loading an unused map');
  restoredList.dom.window.close();
  for (const view of [explicitMap, 'unsupported-view']) {
    const restoredView = fixture({ view });
    await ready(restoredView, dataset.restaurants.length, false);
    await until(() => restoredView.calls.geoLayers === 1, 'map preference or invalid-preference fallback loads its map');
    assert.equal(restoredView.$('#workspace').dataset.view, 'map', view === explicitMap ? 'a saved map choice is restored' : 'invalid saved values use the default map');
    assert.deepEqual(restoredView.errors, []); restoredView.dom.window.close();
  }
  const sourceRow = dataset.restaurants.find(coordinates);
  const mobileDefault = fixture({ view: null, mobile: true, dataset: { restaurants: [
    { ...structuredClone(sourceRow), id: 'mobile-located', name: '위치 확인 식당', region: '서울' },
    { ...structuredClone(sourceRow), id: 'mobile-pending', name: '위치 확인 중 식당', region: '제주', lat: null, lng: null }
  ] } });
  await ready(mobileDefault, 2);
  await until(() => mobileDefault.calls.geoLayers === 1, 'mobile first visit loads the map above its list');
  assert.equal(mobileDefault.$('#workspace').dataset.view, 'map');
  mobileDefault.click('#show-map'); mobileDefault.change('#region', '제주');
  assert.equal(mobileDefault.$('#workspace').dataset.view, 'list', 'a mobile filter without locations still leads to its usable list');
  assert.equal(mobileDefault.window.localStorage.getItem(viewKey), 'map', 'the automatic no-location fallback preserves the explicit preference for the next visit');
  mobileDefault.click('#choose-region');
  assert.equal(mobileDefault.document.activeElement.id, 'region', 'the region shortcut focuses the visible joined search control');
  assert.equal(mobileDefault.$('#filter-options').hidden, true, 'region selection does not open unrelated guide filters');
  assert.deepEqual(mobileDefault.errors, []); mobileDefault.dom.window.close();

  const actual = fixture();
  await ready(actual, dataset.restaurants.length, false);
  assert.equal(actual.records().length, Math.min(50, dataset.restaurants.length), 'the first batch keeps the DOM bounded');
  assert.equal(actual.$('.result-shown').textContent, '현재 ' + Math.min(50, dataset.restaurants.length) + '곳 표시', 'the toolbar distinguishes displayed rows from the full result count');
  actual.all();
  assert.deepEqual(actual.records(), ids(dataset.restaurants));
  assert.equal(actual.$('.result-shown').textContent, '현재 ' + dataset.restaurants.length + '곳 표시');
  assert.equal(actual.$('#back-link').hidden, true);
  assert.equal(actual.calls.location, 0, 'a denied permission is not requested repeatedly');
  assert.equal(actual.$('#filter-options').contains(actual.$('#nearby')), false, 'the nearby control is available without opening filters');
  assert.equal(actual.$('#workspace').dataset.view, 'list', 'the explicitly saved list view is restored');
  assert.equal(actual.$('#filter-options').hidden, true, 'secondary filters start collapsed');
  assert.equal(actual.$('#filter-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(actual.calls.maps, 0, 'list browsing does not create a map');
  assert.equal(actual.calls.geography, 0, 'list browsing does not fetch map geometry');
  actual.click('#show-map');
  await until(() => actual.calls.geoLayers === 1, 'map entry loads the local regional overview');
  assert.equal(actual.calls.maps, 1, 'the first map entry creates the map');
  assert.equal(actual.calls.markers.size, Math.min(50, dataset.restaurants.filter(coordinates).length), 'only sourced coordinates receive pins, within one map page');
  assert.equal(actual.$('.result-shown').hidden, true, 'list pagination counts are hidden in map mode');
  const missingActual = dataset.restaurants.filter(item => !coordinates(item)).length;
  assert.equal(actual.$('.map-caption'), null, 'the map has no obstructing summary caption');
  if (missingActual) assert.ok(actual.$('#result-coverage').textContent.includes('위치 확인 중 ' + missingActual + '곳'), 'coordinate gaps remain explained above the map even when the pin limit applies');
  actual.click('#show-list'); actual.click('#show-map');
  assert.equal(actual.calls.maps, 1, 'map switching reuses the existing map');
  assert.equal(actual.calls.geography, 1, 'map switching reuses the local geometry');
  actual.click('#show-list');
  assert.equal(actual.$('.result-shown').hidden, false);
  actual.filters(); assert.equal(actual.$('#filter-options').hidden, false); assert.equal(actual.$('#filter-toggle').getAttribute('aria-expanded'), 'true');
  if (dataset.collections?.length) assert.deepEqual([...actual.document.querySelectorAll('.collection-title')].map(link => link.href), dataset.collections.map(collection => new URL(collection.url).href), 'default browse exposes the exact official collection map');
  const combined = dataset.restaurants.find(item => item.guides.some(g => g.provider === 'michelin') && item.guides.some(g => g.provider === 'blue-ribbon'));
  assert.ok(combined, 'real data includes a joint guide selection');
  const compactCard = actual.$('[data-restaurant-id="' + combined.id + '"]');
  assert.equal(compactCard.querySelector('.card-address,.coord-note'), null, 'repeated detailed fields stay out of the compact list');
  assert.doesNotMatch(compactCard.querySelector('.guide-badges').textContent, /20\d{2}/, 'edition dates are reserved for the detail');
  actual.click('[data-category="' + combined.category + '"]'); actual.change('#region', combined.region); actual.click('[data-guide="both"]');
  const intersection = dataset.restaurants.filter(item => item.category === combined.category && item.region === combined.region && item.guides.some(g => g.provider === 'michelin') && item.guides.some(g => g.provider === 'blue-ribbon'));
  actual.all(); assert.deepEqual(actual.records(), ids(intersection), 'all active filters intersect');
  actual.click('#filter-toggle'); assert.equal(actual.$('#filter-options').hidden, true);
  assert.match(actual.$('#filter-summary').textContent, new RegExp(combined.region), 'active conditions remain visible in the summary');
  assert.equal(actual.$('#filter-summary').hidden, false); actual.filters();
  assert.equal(actual.$('#collections').hidden, true, 'a guide-only view does not advertise an unrelated postal collection');
  actual.search(combined.name + ' ' + combined.district);
  assert.ok(actual.records().includes(combined.id));
  assert.ok(actual.records().every(id => intersection.some(item => item.id === id)), 'search cannot escape the other filters');
  actual.search('존재하지않는fixture식당');
  assert.deepEqual(actual.records(), []); assert.ok(actual.$('.empty-state'));
  assert.equal(actual.$('.result-shown').textContent, '현재 0곳 표시');
  actual.click('#show-map'); assert.equal(actual.calls.markers.size, 0, 'opening the map after a zero-result filter clears old markers');
  actual.click('#reset'); actual.all(); assert.equal(actual.records().length, dataset.restaurants.length); assert.equal(actual.calls.maps, 1, 'filter resets reuse the same map');
  actual.click('#show-list');
  actual.click('[data-restaurant-id="' + combined.id + '"] .save-button');
  const persisted = actual.window.localStorage.getItem(savedKey); assert.ok(JSON.parse(persisted).includes(combined.id), 'saving writes the selected identity');
  actual.click('[data-restaurant-id="' + combined.id + '"] .card-main');
  assert.equal(actual.$('#detail').open, true); assert.equal(actual.$('#detail-title').textContent, combined.name);
  assert.deepEqual([...actual.document.querySelectorAll('.source-link')].map(link => link.href), combined.guides.map(guide => new URL(guide.sourceUrl).href));
  const actualYears = [...actual.document.querySelectorAll('.source-year')].map(node => node.textContent);
  combined.guides.forEach((guide, index) => {
    if (!guide.year) return;
    const type = guide.yearType || (guide.provider === 'blue-ribbon' ? 'edition' : guide.provider === 'post-office' ? 'publication' : 'selection');
    assert.equal(actualYears[index], guide.year + { edition: '년판', selection: '년 선정', publication: '년 발행', source: '년 자료', listing: '년 수록' }[type], 'each real source retains its recorded year meaning');
  });
  assert.ok([...actual.document.querySelectorAll('#detail a:not(.rating-login-link)')].every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer') && link.target === '_blank'));
  assert.equal(actual.$('.rating-login-link').origin, actual.window.location.origin, 'standalone ratings lead to the existing member app');
  assert.equal(actual.$('.rating-login-link').target, '_top');
  assert.equal(actual.$('.rating-login-link').pathname + actual.$('.rating-login-link').search, '/?auth=login&next=world', 'the prompt opens the existing sign-in route without re-entering the guest directory');
  assert.ok(decodeURIComponent(actual.$('.detail-links a').href).includes(combined.address));
  if (coordinates(combined)) assert.ok(actual.$('.route-link').href.endsWith(',' + combined.lat + ',' + combined.lng));
  actual.click('#close-detail'); assert.equal(actual.$('#detail').open, false);
  actual.click('#nearby'); await until(() => !actual.$('#nearby').disabled, 'denied location resolves');
  actual.all(); assert.equal(actual.calls.location, 1); assert.match(actual.$('#location-status').textContent, /허용되지/); assert.equal(actual.records().length, dataset.restaurants.length);
  actual.click('#choose-region'); assert.equal(actual.document.activeElement.id, 'region', 'denial provides a direct region-selection path');
  assert.deepEqual(actual.errors, []); actual.dom.window.close();

  const restored = fixture({ storage: persisted });
  await ready(restored, dataset.restaurants.length);
  restored.filters(); restored.click('#saved-only'); assert.deepEqual(restored.records(), [combined.id], 'a new page reads previously saved identities');
  restored.click('.save-button'); assert.deepEqual(restored.records(), [], 'unsaving immediately updates the saved-only list');
  restored.dom.window.close();

  // Explicit meanings override provider defaults; a source year must never imply selection.
  const yearRecord = { ...structuredClone(dataset.restaurants[0]), id: 'year-types', name: '연도 유형 확인', guides: [
    { provider: 'michelin', year: 2027, yearType: 'edition' },
    { provider: 'blue-ribbon', year: 2026, yearType: 'selection' },
    { provider: 'michelin', year: 2025, yearType: 'publication' },
    { provider: 'post-office', year: 2024, yearType: 'source' },
    { provider: 'michelin', year: 2023, yearType: 'listing' }
  ].map(guide => ({ ...guide, label: '자료 표기 확인', sourceUrl: 'https://fixture.test/sources/' + guide.yearType, verifiedAt: '2026-11-03' })) };
  const missingYearRecord = { ...structuredClone(yearRecord), id: 'year-types-missing', name: '미확인 연도 유형', guides: yearRecord.guides.map(guide => ({ ...guide, year: null })) };
  const years = fixture({ dataset: { restaurants: [yearRecord, missingYearRecord] } });
  await ready(years, 2);
  years.click('[data-restaurant-id="year-types"] .card-main');
  assert.deepEqual([...years.document.querySelectorAll('.source-year')].map(node => node.textContent), ['2027년판', '2026년 선정', '2025년 발행', '2024년 자료', '2023년 수록']);
  assert.ok([...years.document.querySelectorAll('.source-verified')].every(node => node.textContent === '출처 확인일 2026.11.03'), 'verification dates remain separate from guide years');
  years.click('#close-detail'); years.click('[data-restaurant-id="year-types-missing"] .card-main');
  assert.deepEqual([...years.document.querySelectorAll('.source-year')].map(node => node.textContent), ['판본 연도 미확인', '선정 연도 미확인', '발행 연도 미확인', '자료 연도 미확인', '수록 연도 미확인']);
  assert.deepEqual(years.errors, []); years.dom.window.close();

  const malicious = structuredClone(dataset.restaurants[0]); malicious.id = 'fixture-unsafe-text'; malicious.name = '<img src=x onerror="window.injected=1"> 테스트'; malicious.address = '<svg onload="window.injected=1"> 주소'; malicious.menu = ['<script>window.injected=1</script>']; malicious.lat = null; malicious.lng = null;
  malicious.guides = [
    { provider: 'post-office', label: '집배원 추천 <img onerror="window.injected=1">', year: 2011, sourceUrl: 'https://www.koreapost.go.kr/fixture', sourceName: '<img onerror="window.injected=1"> 공식', verifiedAt: '2026-11-03', sourceAsOf: '2011-06' },
    { provider: 'michelin', label: '3스타', year: 2026, sourceUrl: 'javascript:window.injected=1' }
  ];
  const rejected = structuredClone(malicious); rejected.id = 'fixture-no-valid-source'; rejected.guides = [{ provider: 'blue-ribbon', sourceUrl: 'http://insecure.test/' }];
  const hostile = fixture({ dataset: { updatedAt: '2026-11-03', restaurants: [...dataset.restaurants, malicious, rejected] } });
  await ready(hostile, dataset.restaurants.length + 1);
  assert.equal(hostile.$('[data-restaurant-id="fixture-no-valid-source"]'), null, 'unsupported source scheme is rejected');
  hostile.click('#show-map');
  await until(() => hostile.calls.geoLayers === 1, 'hostile fixture local background finishes before teardown');
  assert.equal(hostile.calls.markers.size, Math.min(50, dataset.restaurants.filter(coordinates).length), 'null coordinates do not become 0,0 markers');
  hostile.click('#show-list'); hostile.filters();
  assert.equal(hostile.$('[data-restaurant-id="fixture-unsafe-text"] img'), null);
  hostile.click('[data-guide="post-office"]');
  const postal = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
  hostile.all(); assert.deepEqual(hostile.records(), ids([...postal, malicious]));
  hostile.click('[data-restaurant-id="fixture-unsafe-text"] .card-main');
  assert.equal(hostile.$('#detail-title').textContent, malicious.name);
  assert.match(hostile.$('#detail-content').textContent, /네이버·카카오맵에서 위치 확인/, 'missing-coordinate guidance lives in the detail rather than every card');
  assert.match(hostile.$('.source-list').textContent, /자료 기준 2011.06/); assert.match(hostile.$('.source-list').textContent, /2011년 발행/); assert.doesNotMatch(hostile.$('.source-list').textContent, /2011년 선정/);
  assert.equal(hostile.document.querySelectorAll('#detail .source-link').length, 1);
  assert.equal(hostile.document.querySelectorAll('#detail img,#detail script,#detail svg').length, 1, 'only the static bookmark svg exists; source text adds no markup');
  assert.equal(hostile.$('#detail a[href^="javascript:"]'), null); assert.equal(hostile.window.injected, undefined); assert.match(hostile.$('.route-link').textContent, /주소로/);
  assert.deepEqual(hostile.errors, []); hostile.dom.window.close();

  const collection = { provider: 'post-office', title: '공식 전체지도 <img src=x onerror="window.injected=1">', url: 'https://kko.to/fixture', sourceUrl: 'https://www.koreapost.go.kr/fixture', note: '2026년 6월 자료 <script>window.injected=1</script>' };
  const collectionDataset = { ...structuredClone(dataset), collections: [collection, { ...collection, url: 'javascript:window.injected=1' }] };
  const mobilePostal = fixture({ mobile: true, dataset: collectionDataset });
  await ready(mobilePostal, dataset.restaurants.length);
  assert.equal(mobilePostal.document.querySelectorAll('.collection-title').length, 1, 'unsafe collection URLs are rejected');
  const postalRows = dataset.restaurants.filter(item => item.guides.some(guide => guide.provider === 'post-office'));
  mobilePostal.click('#show-map');
  await until(() => mobilePostal.calls.geoLayers === 1, 'mobile fixture local background finishes before teardown');
  mobilePostal.filters();
  mobilePostal.click('[data-guide="post-office"]');
  mobilePostal.all(); assert.deepEqual(mobilePostal.records(), ids(postalRows));
  if (!postalRows.some(coordinates)) assert.equal(mobilePostal.$('#workspace').dataset.view, 'list', 'a mobile filter with no coordinates opens the useful list automatically');
  assert.equal(mobilePostal.$('#collections').hidden, false);
  assert.equal(mobilePostal.$('#collections').classList.contains('is-featured'), true, 'postal view makes its original full map prominent');
  assert.equal(mobilePostal.$('.collection-title').href, collection.url);
  assert.equal(mobilePostal.$('.collection-title').textContent, collection.title + ' ↗');
  assert.equal(mobilePostal.$('.collection-note'), null, 'the collection stays a compact single-line shortcut');
  assert.equal(mobilePostal.$('#collections img,#collections script'), null, 'collection labels remain plain text');
  assert.ok([...mobilePostal.document.querySelectorAll('#collections a')].every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer')));
  mobilePostal.click('[data-guide="michelin"]'); assert.equal(mobilePostal.$('#collections').hidden, true);
  assert.deepEqual(mobilePostal.errors, []); mobilePostal.dom.window.close();

  const failure = fixture({ failOnce: true });
  await until(() => !!failure.$('.data-error'), 'failed data shows retry');
  assert.equal(failure.$('#workspace').dataset.view, 'list');
  failure.click('.data-error button');
  await ready(failure, dataset.restaurants.length);
  assert.equal(failure.calls.data, 2); assert.deepEqual(failure.errors, []); failure.dom.window.close();

  const mapFailure = fixture({ failGeoOnce: true });
  await ready(mapFailure, dataset.restaurants.length);
  mapFailure.click('#show-map');
  await until(() => mapFailure.$('#map-message').hidden === false && mapFailure.$('#retry-map').hidden === false, 'failed local geometry exposes a retry');
  assert.equal(mapFailure.$('#map-message').hidden, false);
  mapFailure.click('#show-list');
  mapFailure.click('.card-main'); assert.equal(mapFailure.$('#detail').open, true, 'map error leaves details usable');
  mapFailure.click('#close-detail'); mapFailure.click('#show-map'); mapFailure.click('#retry-map');
  await until(() => mapFailure.calls.geoLayers === 1, 'retry loads the local regional geography');
  assert.equal(mapFailure.calls.geography, 2, 'retry makes one new local geometry request');
  assert.equal(mapFailure.$('#map-message').hidden, true, 'the retry clears the regional background error');
  assert.equal(mapFailure.$('.map-caption'), null, 'retry does not restore an obstructing map caption');
  assert.deepEqual(mapFailure.errors, []); mapFailure.dom.window.close();

  const temporary = fixture({ blockStorage: true });
  await ready(temporary, dataset.restaurants.length);
  temporary.click('.save-button'); assert.match(temporary.$('#status').textContent, /화면을 보는 동안/);
  temporary.filters(); temporary.click('#saved-only'); assert.equal(temporary.records().length, 1); assert.deepEqual(temporary.errors, []); temporary.dom.window.close();

  // Permission behavior is tested with mocks only, without granting this environment's real location.
  const near = { ...structuredClone(dataset.restaurants[0]), id: 'near', name: '하 가까운 식당', region: '서울', lat: 37.5665, lng: 126.978, coordinateSource: { name: '관광공사 공개 위치', url: 'https://korean.visitkorea.or.kr/fixture', method: '동일 상호·주소 확인', checkedAt: '2026-11-03' } };
  const far = { ...structuredClone(near), id: 'far', name: '가 먼 식당', region: '부산', lat: 35.1796, lng: 129.0756, coordinateSource: { name: 'unsafe location', url: 'javascript:window.injected=1' } };
  const unknown = { ...structuredClone(near), id: 'unknown', name: '가가 거리 없는 식당', region: '제주', lat: null, lng: null };
  const nearbyData = { updatedAt: '2026-11-03', restaurants: [unknown, far, near] };
  const granted = fixture({ dataset: nearbyData, permission: 'granted', locationChoice: 'denied', position: { lat: 37.5665, lng: 126.978 } });
  await ready(granted, 3);
  await until(() => granted.$('#nearby').getAttribute('aria-pressed') === 'true', 'existing browser permission activates nearby on entry');
  assert.equal(granted.calls.location, 1);
  assert.deepEqual(granted.order(), ['near', 'far', 'unknown'], 'known distances sort before unknown nationwide entries, regardless of name');
  assert.equal(granted.$('[data-restaurant-id="unknown"] .distance'), null);
  assert.match(granted.$('[data-restaurant-id="unknown"] .distance-unknown').textContent, /미확인/);
  assert.match(granted.$('.list-section-title').textContent, /전국 목록/);
  assert.equal(granted.window.localStorage.getItem(locationKey), 'enabled');
  assert.deepEqual(Object.keys(granted.window.localStorage).sort(), [locationKey, viewKey].sort(), 'only the location and view choices are persisted, not coordinates');
  granted.click('[data-restaurant-id="near"] .card-main');
  assert.equal(granted.$('.coordinate-source-link').href, near.coordinateSource.url); assert.match(granted.$('.coordinate-source-link').textContent, /위치 출처: 관광공사 공개 위치/);
  assert.equal(granted.$('.source-list').lastElementChild.className, 'coordinate-source', 'location evidence is one final detail line');
  granted.click('#close-detail'); granted.click('[data-restaurant-id="far"] .card-main');
  assert.equal(granted.$('.coordinate-source-link'), null, 'unsafe coordinate-source URLs are not rendered'); granted.click('#close-detail');
  granted.filters(); granted.change('#region', '제주');
  assert.deepEqual(granted.order(), ['unknown']); assert.match(granted.$('#location-status').textContent, /거리 정보가 없어 맛집 목록/);
  granted.click('#reset'); assert.deepEqual(granted.order(), ['near', 'far', 'unknown'], 'clearing filters preserves the chosen location mode');
  assert.deepEqual(granted.errors, []); granted.dom.window.close();

  const firstVisit = fixture({ dataset: nearbyData, permission: 'prompt' });
  await ready(firstVisit, 3);
  await until(() => firstVisit.calls.location === 1 && !firstVisit.$('#nearby').disabled, 'a first visit makes one browser location request');
  const deniedChoice = firstVisit.window.localStorage.getItem(locationKey);
  assert.equal(deniedChoice, 'denied'); assert.match(firstVisit.$('#location-status').textContent, /맛집 목록/);
  firstVisit.click('#choose-region'); assert.equal(firstVisit.document.activeElement.id, 'region');
  firstVisit.click('#reset'); assert.equal(firstVisit.calls.location, 1, 'filtering does not prompt again');
  firstVisit.dom.window.close();
  const laterVisit = fixture({ dataset: nearbyData, permission: 'prompt', locationChoice: deniedChoice });
  await ready(laterVisit, 3); assert.equal(laterVisit.calls.location, 0, 'a denied preference survives reentry without another automatic prompt');
  laterVisit.click('#nearby'); await until(() => laterVisit.calls.location === 1 && !laterVisit.$('#nearby').disabled, 'an explicit nearby retry remains available');
  laterVisit.dom.window.close();
  const permissionFallback = fixture({ dataset: nearbyData, noPermissionApi: true, locationChoice: 'enabled', position: { lat: 37.5665, lng: 126.978 } });
  await ready(permissionFallback, 3); assert.equal(permissionFallback.calls.location, 1, 'previously enabled nearby works without the Permissions API');
  assert.deepEqual(permissionFallback.order(), ['near', 'far', 'unknown']); permissionFallback.dom.window.close();

  // The display-count contract is independent of future additions to the live data.
  const coverageRows = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(near), id: 'coverage-' + index, name: '등록확인' + index, region: '대전', category: index < 6 ? '한식' : '양식', lat: index % 6 < 2 ? 36.35 + index / 1000 : null, lng: index % 6 < 2 ? 127.38 : null, guides: [{ provider: 'blue-ribbon', sourceUrl: 'https://fixture.test/selection', label: '선정 이력' }] }));
  const coverageData = { restaurants: [...coverageRows, { ...structuredClone(coverageRows[0]), id: 'coverage-other', name: '다른 지역', region: '서울', lat: null, lng: null, guides: [{ provider: 'michelin', sourceUrl: 'https://fixture.test/other-selection', label: '선정 이력' }] }] };
  const coverage = fixture({ dataset: coverageData });
  await ready(coverage, 13, false); coverage.filters(); coverage.change('#region', '대전'); coverage.click('[data-guide="blue-ribbon"]');
  assert.match(coverage.$('#result-count').textContent, /^등록 12곳/);
  assert.equal(coverage.$('#result-coverage').textContent, '지도 가능 4곳 · 위치 확인 중 8곳');
  assert.equal(coverage.calls.maps, 0, 'list coverage does not initialize the optional map');
  coverage.click('#show-map'); await until(() => coverage.calls.geoLayers === 1, 'the coverage map loads');
  assert.equal(coverage.$('#result-coverage').textContent, '지도 표시 4곳 · 위치 확인 중 8곳'); assert.equal(coverage.calls.markers.size, 4);
  coverage.click('[data-category="한식"]');
  assert.equal(coverage.$('#result-count').dataset.total, '6'); assert.equal(coverage.$('#result-coverage').textContent, '지도 표시 2곳 · 위치 확인 중 4곳');
  coverage.change('#region', '서울');
  assert.equal(coverage.$('#result-count').dataset.total, '0'); assert.equal(coverage.$('#result-coverage').textContent, '지도 표시 0곳'); assert.equal(coverage.calls.markers.size, 0);
  coverage.click('[data-guide="michelin"]');
  assert.equal(coverage.$('#result-count').dataset.total, '1'); assert.equal(coverage.$('#result-coverage').textContent, '지도 표시 0곳 · 위치 확인 중 1곳');
  coverage.click('#show-list'); assert.equal(coverage.$('#result-coverage').textContent, '지도 가능 0곳 · 위치 확인 중 1곳');
  assert.deepEqual(coverage.errors, []); coverage.dom.window.close();
  const unavailableMap = fixture({ dataset: { restaurants: coverageRows }, noMap: true });
  await ready(unavailableMap, 12, false); unavailableMap.click('#show-map');
  assert.equal(unavailableMap.$('#result-coverage').textContent, '지도 표시 0 / 4곳 · 위치 확인 중 8곳', 'an unavailable map never claims that eligible locations are actually displayed');
  assert.equal(unavailableMap.calls.markers.size, 0); assert.equal(unavailableMap.$('#map-message').hidden, false);
  assert.deepEqual(unavailableMap.errors, []); unavailableMap.dom.window.close();

  const many = Array.from({ length: 800 }, (_, index) => ({ ...structuredClone(near), id: 'many-' + index, name: '성능확인' + String(index).padStart(4, '0'), lat: 37.5665 + index / 10000, lng: 126.978 }));
  const performanceOptions = { dataset: { restaurants: many }, permission: 'granted', position: { lat: 37.5665, lng: 126.978 } };
  const performance = fixture(performanceOptions);
  await ready(performance, many.length, false);
  await until(() => performance.$('#nearby').getAttribute('aria-pressed') === 'true', 'performance sample location resolves');
  assert.equal(performance.records().length, 50); assert.equal(performance.$('#result-count').dataset.total, '800');
  assert.equal(performance.$('.result-shown').textContent, '현재 50곳 표시');
  assert.equal(performance.$('#result-coverage').textContent, '지도 가능 800곳');
  assert.equal(performance.calls.maps, 0, 'location-based entry still leaves the optional map unloaded');
  const firstCard = performance.$('.restaurant-card'); performance.click('#load-more');
  assert.equal(performance.records().length, 100); assert.equal(performance.$('.restaurant-card'), firstCard, 'more results append without recreating earlier cards');
  assert.equal(new Set(performance.records()).size, 100);
  assert.equal(performance.$('.result-shown').textContent, '현재 100곳 표시', 'appending a batch updates the toolbar count');
  performance.search('성능확인000'); assert.equal(performance.records().length, 10); assert.equal(performance.$('#result-count').dataset.total, '10'); assert.equal(performance.$('#load-more').hidden, true);
  assert.equal(performance.$('.result-shown').textContent, '현재 10곳 표시');
  performance.click('#reset'); assert.equal(performance.records().length, 50, 'changed filters reset the displayed batch');
  assert.equal(performance.$('.result-shown').textContent, '현재 50곳 표시');
  while (performance.records().length < 700) performance.click('#load-more');
  assert.equal(performance.records().length, 700, 'successive batches expose cards beyond the current map page');
  performance.click('#show-map'); await until(() => performance.calls.geoLayers === 1, 'the performance sample map loads locally');
  const pinNames = sample => [...sample.document.querySelectorAll('.restaurant-pin')].map(pin => pin.title).sort();
  const expectedNames = rows => rows.map(item => item.name).sort();
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(0, 50)), 'location mode initially maps the nearest 50 restaurants');
  assert.equal(performance.$('#result-coverage').textContent, '지도 표시 50 / 800곳');
  assert.equal(performance.$('#map-pagination').hidden, false);
  assert.equal(performance.$('#map-prev').disabled, true);
  assert.equal(performance.$('#map-next').disabled, false);
  assert.ok(performance.$('#map-page-status').textContent, 'the map pager describes the current group');
  const firstPagePins = [...performance.document.querySelectorAll('.restaurant-pin')];
  performance.click('#map-next');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(50, 100)), 'next replaces the map with the next nearest 50');
  assert.ok(firstPagePins.every(pin => !pin.isConnected), 'previous-page pins are removed rather than accumulated');
  assert.equal(performance.calls.markers.size, 51, 'only 50 restaurant pins and the separate user-location pin remain registered');
  assert.equal(performance.records().length, 700, 'map pagination does not discard or append restaurant cards');
  assert.equal(performance.$('#map-prev').disabled, false);
  performance.click('#map-prev');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(0, 50)), 'previous returns to the original 50');
  assert.equal(performance.$('#map-prev').disabled, true);
  performance.click('#show-list'); performance.click('[data-restaurant-id="many-650"] .card-main');
  assert.equal(performance.$('#detail-title').textContent, many[650].name); performance.click('#close-detail'); performance.click('#show-map');
  assert.equal(performance.$('.restaurant-pin.is-selected').title, many[650].name, 'a loaded card remains selected when opening its map page');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(650, 700)), 'a selected list item opens its whole page, not a mixed group');
  // Dispatch on retained cards while the map is active to cover selections both within and outside its page.
  performance.click('[data-restaurant-id="many-699"] .card-main');
  assert.equal(performance.$('#workspace').dataset.view, 'map');
  assert.equal(performance.$('#detail-title').textContent, many[699].name);
  assert.equal(performance.$('.restaurant-pin.is-selected').title, many[699].name);
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(650, 700)), 'selecting another item on the same page retains its neighbors');
  performance.click('#close-detail'); performance.click('[data-restaurant-id="many-99"] .card-main');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(50, 100)), 'selecting a card on another page replaces the entire group');
  assert.equal(performance.document.querySelectorAll('.restaurant-pin.is-selected').length, 1);
  assert.equal(performance.document.querySelectorAll('.restaurant-pin').length, 50, 'selection never adds a 51st restaurant pin');
  assert.equal(performance.$('.restaurant-pin[title="' + many[650].name + '"]'), null, 'the previous page selection is removed');
  const selectedMarker = [...performance.calls.markers].find(marker => marker.node.classList.contains('is-selected'));
  assert.deepEqual(Array.from(selectedMarker.point), [many[99].lat, many[99].lng], 'the selected pin uses the selected restaurant coordinates');
  performance.click('#close-detail');
  performanceOptions.position = { lat: many[799].lat, lng: many[799].lng };
  performance.click('#nearby'); await until(() => !performance.$('#nearby').disabled, 'a new location resolves');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(750, 800)), 'a changed location resets to its nearest first page');
  assert.equal(performance.$('#map-prev').disabled, true, 'a previous selection cannot retain an old page after location changes');
  performance.click('#map-next'); performance.search('성능확인07');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(750, 800)), 'search resets pagination while preserving nearest-first ordering');
  assert.equal(performance.$('#map-prev').disabled, true);
  performance.click('#map-next');
  assert.deepEqual(pinNames(performance), expectedNames(many.slice(700, 750)), 'an exact full final page still contains 50');
  assert.equal(performance.$('#map-next').disabled, true, 'an exact multiple does not expose an empty extra page');
  assert.equal(performance.calls.maps, 1); assert.equal(performance.calls.geography, 1, 'page and location changes reuse the existing map and geography');
  assert.deepEqual(performance.errors, []); performance.dom.window.close();

  const mixedRows = [...many.slice(0, 305), ...Array.from({ length: 7 }, (_, index) => ({ ...structuredClone(unknown), id: 'unlocated-' + index, name: '지도미확인' + index }))];
  const mixedMap = fixture({ dataset: { restaurants: mixedRows } });
  await ready(mixedMap, mixedRows.length, false);
  assert.equal(mixedMap.$('#result-coverage').textContent, '지도 가능 305곳 · 위치 확인 중 7곳'); mixedMap.click('#show-map');
  await until(() => mixedMap.calls.geoLayers === 1, 'mixed-coordinate fixture map loads');
  assert.deepEqual(pinNames(mixedMap), expectedNames(many.slice(0, 50)), 'without location, map groups follow the existing name ordering');
  assert.equal(mixedMap.$('#result-coverage').textContent, '지도 표시 50 / 305곳 · 위치 확인 중 7곳');
  assert.equal(mixedMap.$('#result-coverage').closest('#map-panel'), null, 'location coverage remains outside the map panel');
  const visitedNames = [...pinNames(mixedMap)];
  for (let page = 1; page <= 6; page++) {
    mixedMap.click('#map-next');
    const names = pinNames(mixedMap);
    assert.deepEqual(names, expectedNames(many.slice(page * 50, Math.min((page + 1) * 50, 305))), 'every map group contains only its own located restaurants');
    assert.ok(names.every(name => !visitedNames.includes(name)), 'successive pages have no overlap');
    visitedNames.push(...names);
  }
  assert.equal(visitedNames.length, 305, 'all located restaurants remain reachable across pages');
  assert.equal(mixedMap.document.querySelectorAll('.restaurant-pin').length, 5, 'the final partial page contains only remaining restaurants');
  assert.equal(mixedMap.$('#map-next').disabled, true);
  mixedMap.click('#map-next'); assert.equal(mixedMap.document.querySelectorAll('.restaurant-pin').length, 5, 'a disabled final next button cannot produce an empty page');
  mixedMap.click('#map-prev'); assert.deepEqual(pinNames(mixedMap), expectedNames(many.slice(250, 300)), 'previous works from a partial last page');
  mixedMap.search('지도미확인');
  assert.equal(mixedMap.$('.map-caption'), null, 'filtering to unlocated restaurants does not restore a map caption');
  assert.equal(mixedMap.document.querySelectorAll('.restaurant-pin').length, 0);
  assert.equal(mixedMap.$('#map-pagination').hidden, true, 'no-location results hide the map pager');
  assert.equal(mixedMap.$('#result-coverage').textContent, '지도 표시 0곳 · 위치 확인 중 7곳', 'search refreshes registered and mapped counts together');
  mixedMap.click('#reset'); assert.deepEqual(pinNames(mixedMap), expectedNames(many.slice(0, 50)), 'clearing a filter returns to the first map group');
  assert.equal(mixedMap.$('#map-prev').disabled, true);
  mixedMap.search('성능확인000');
  assert.equal(mixedMap.document.querySelectorAll('.restaurant-pin').length, 10);
  assert.equal(mixedMap.$('#map-pagination').hidden, true, 'a filter with fewer than 50 locations hides unnecessary pagination');
  assert.deepEqual(mixedMap.errors, []); mixedMap.dom.window.close();

  for (const count of [50, 51]) {
    const boundary = fixture({ view: 'map', dataset: { restaurants: many.slice(0, count) } });
    await ready(boundary, count, false);
    await until(() => boundary.calls.geoLayers === 1, 'the page-size boundary map loads');
    assert.equal(boundary.document.querySelectorAll('.restaurant-pin').length, 50);
    assert.equal(boundary.$('#map-pagination').hidden, count === 50, 'pagination appears only when there is another map group');
    if (count === 51) {
      boundary.click('#map-next'); assert.deepEqual(pinNames(boundary), expectedNames(many.slice(50, 51)));
      assert.equal(boundary.$('#map-next').disabled, true);
    }
    assert.deepEqual(boundary.errors, []); boundary.dom.window.close();
  }

  console.log('PASS: directory DOM behavior over ' + dataset.restaurants.length + ' real records plus 800-record performance sample: first-visit map plus list, explicit view restoration, mobile no-location fallback, first-visit/granted/denied/reentry location, truthful nearest/unknown ordering, 50-row append pagination, non-cumulative 50-pin map pages, boundary/partial pages, filter/location resets and whole-page selection, folded filters, local map, saved state, exact sources, edition/selection/publication/source/listing years, safe text/URLs and recovery. Browser layout and screenshots require Chromium/CUA.');
})().catch(error => { console.error(error); process.exitCode = 1; });
