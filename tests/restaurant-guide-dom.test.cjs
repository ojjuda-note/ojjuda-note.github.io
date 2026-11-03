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
  window.eval(code);
  const $ = selector => document.querySelector(selector);
  return { dom, window, document, $, calls, errors, records: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId).sort(), order: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId), all() { let page = 0; while (!$('#load-more').hidden && page++ < 1000) $('#load-more').click(); }, click(selector) { const node = $(selector); assert.ok(node, selector + ' exists'); node.click(); }, filters() { if ($('#filter-options').hidden) $('#filter-toggle').click(); }, change(selector, value) { $(selector).value = value; $(selector).dispatchEvent(new window.Event('change', { bubbles: true })); }, search(value) { $('#search').value = value; $('#search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } };
}

(async () => {
  const actual = fixture();
  await ready(actual, dataset.restaurants.length, false);
  assert.equal(actual.records().length, Math.min(50, dataset.restaurants.length), 'the first batch keeps the DOM bounded');
  actual.all();
  assert.deepEqual(actual.records(), ids(dataset.restaurants));
  assert.equal(actual.$('#back-link').hidden, true);
  assert.equal(actual.calls.location, 0, 'a denied permission is not requested repeatedly');
  assert.equal(actual.$('#filter-options').contains(actual.$('#nearby')), false, 'the nearby control is available without opening filters');
  assert.equal(actual.$('#workspace').dataset.view, 'list', 'the first view is the complete restaurant list');
  assert.equal(actual.$('#filter-options').hidden, true, 'secondary filters start collapsed');
  assert.equal(actual.$('#filter-toggle').getAttribute('aria-expanded'), 'false');
  assert.equal(actual.calls.maps, 0, 'list browsing does not create a map');
  assert.equal(actual.calls.geography, 0, 'list browsing does not fetch map geometry');
  actual.click('#show-map');
  await until(() => actual.calls.geoLayers === 1, 'map entry loads the local regional overview');
  assert.equal(actual.calls.maps, 1, 'the first map entry creates the map');
  assert.equal(actual.calls.markers.size, Math.min(300, dataset.restaurants.filter(coordinates).length), 'only sourced coordinates receive pins, within the rendering limit');
  actual.click('#show-list'); actual.click('#show-map');
  assert.equal(actual.calls.maps, 1, 'map switching reuses the existing map');
  assert.equal(actual.calls.geography, 1, 'map switching reuses the local geometry');
  actual.click('#show-list');
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
  assert.ok([...actual.document.querySelectorAll('#detail a')].every(link => link.protocol === 'https:' && link.rel.includes('noopener') && link.rel.includes('noreferrer')));
  assert.ok(decodeURIComponent(actual.$('.detail-links a').href).includes(combined.address));
  if (coordinates(combined)) assert.ok(actual.$('.route-link').href.endsWith(',' + combined.lat + ',' + combined.lng));
  actual.click('#close-detail'); assert.equal(actual.$('#detail').open, false);
  actual.click('#nearby'); await until(() => !actual.$('#nearby').disabled, 'denied location resolves');
  actual.all(); assert.equal(actual.calls.location, 1); assert.match(actual.$('#location-status').textContent, /허용되지/); assert.equal(actual.records().length, dataset.restaurants.length);
  actual.click('#choose-region'); assert.equal(actual.$('#filter-options').hidden, false); assert.equal(actual.document.activeElement.id, 'region', 'denial provides a direct region-selection path');
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
  assert.equal(hostile.calls.markers.size, Math.min(300, dataset.restaurants.filter(coordinates).length), 'null coordinates do not become 0,0 markers');
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
  assert.match(mapFailure.$('#map-caption-text').textContent, /개요도/, 'the overview does not pretend to be a street map');
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
  assert.equal(granted.window.localStorage.length, 1, 'only the preference is persisted, not coordinates');
  granted.click('[data-restaurant-id="near"] .card-main');
  assert.equal(granted.$('.coordinate-source-link').href, near.coordinateSource.url); assert.match(granted.$('.coordinate-source-link').textContent, /위치 출처: 관광공사 공개 위치/);
  assert.equal(granted.$('.source-list').lastElementChild.className, 'coordinate-source', 'location evidence is one final detail line');
  granted.click('#close-detail'); granted.click('[data-restaurant-id="far"] .card-main');
  assert.equal(granted.$('.coordinate-source-link'), null, 'unsafe coordinate-source URLs are not rendered'); granted.click('#close-detail');
  granted.filters(); granted.change('#region', '제주');
  assert.deepEqual(granted.order(), ['unknown']); assert.match(granted.$('#location-status').textContent, /거리 정보가 없어 전국 목록/);
  granted.click('#reset'); assert.deepEqual(granted.order(), ['near', 'far', 'unknown'], 'clearing filters preserves the chosen location mode');
  assert.deepEqual(granted.errors, []); granted.dom.window.close();

  const firstVisit = fixture({ dataset: nearbyData, permission: 'prompt' });
  await ready(firstVisit, 3);
  await until(() => firstVisit.calls.location === 1 && !firstVisit.$('#nearby').disabled, 'a first visit makes one browser location request');
  const deniedChoice = firstVisit.window.localStorage.getItem(locationKey);
  assert.equal(deniedChoice, 'denied'); assert.match(firstVisit.$('#location-status').textContent, /전국 목록/);
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

  const many = Array.from({ length: 800 }, (_, index) => ({ ...structuredClone(near), id: 'many-' + index, name: '성능확인' + String(index).padStart(4, '0'), lat: 37.5665 + index / 10000, lng: 126.978 }));
  const performance = fixture({ dataset: { restaurants: many }, permission: 'granted', position: { lat: 37.5665, lng: 126.978 } });
  await ready(performance, many.length, false);
  await until(() => performance.$('#nearby').getAttribute('aria-pressed') === 'true', 'performance sample location resolves');
  assert.equal(performance.records().length, 50); assert.equal(performance.$('#result-count').dataset.total, '800');
  assert.equal(performance.calls.maps, 0, 'location-based entry still leaves the optional map unloaded');
  const firstCard = performance.$('.restaurant-card'); performance.click('#load-more');
  assert.equal(performance.records().length, 100); assert.equal(performance.$('.restaurant-card'), firstCard, 'more results append without recreating earlier cards');
  assert.equal(new Set(performance.records()).size, 100);
  performance.search('성능확인000'); assert.equal(performance.records().length, 10); assert.equal(performance.$('#result-count').dataset.total, '10'); assert.equal(performance.$('#load-more').hidden, true);
  performance.click('#reset'); assert.equal(performance.records().length, 50, 'changed filters reset the displayed batch');
  while (performance.records().length < 700) performance.click('#load-more');
  assert.equal(performance.records().length, 700, 'successive batches expose cards beyond the map limit');
  performance.click('#show-map'); await until(() => performance.calls.geoLayers === 1, 'the performance sample map loads locally');
  assert.equal(performance.document.querySelectorAll('.restaurant-pin').length, 300, 'large maps cap the visible markers');
  assert.match(performance.$('#map-caption-text').textContent, /800곳 중 300곳/);
  assert.deepEqual([...performance.document.querySelectorAll('.restaurant-pin')].map(pin => pin.title), many.slice(0, 300).map(item => item.name), 'location mode initially maps the nearest 300 restaurants');
  performance.click('#show-list'); performance.click('[data-restaurant-id="many-650"] .card-main');
  assert.equal(performance.$('#detail-title').textContent, many[650].name); performance.click('#close-detail'); performance.click('#show-map');
  assert.equal(performance.$('.restaurant-pin.is-selected').title, many[650].name, 'a loaded card beyond the cap remains selected when opening the map');
  assert.equal(performance.document.querySelectorAll('.restaurant-pin').length, 300);
  assert.equal(performance.$('.restaurant-pin[title="' + many[699].name + '"]'), null);
  // Dispatch on the retained card while the map is active to cover an unregistered selection.
  performance.click('[data-restaurant-id="many-699"] .card-main');
  assert.equal(performance.$('#workspace').dataset.view, 'map');
  assert.equal(performance.$('#detail-title').textContent, many[699].name);
  assert.equal(performance.$('.restaurant-pin.is-selected').title, many[699].name, 'selection immediately registers an out-of-cap pin on the active map');
  assert.equal(performance.document.querySelectorAll('.restaurant-pin.is-selected').length, 1);
  assert.equal(performance.document.querySelectorAll('.restaurant-pin').length, 300, 'adding the selected pin evicts a prior pin instead of exceeding the limit');
  assert.equal(performance.$('.restaurant-pin[title="' + many[650].name + '"]'), null, 'the previous out-of-cap selection is removed');
  const selectedMarker = [...performance.calls.markers].find(marker => marker.node.classList.contains('is-selected'));
  assert.deepEqual(Array.from(selectedMarker.point), [many[699].lat, many[699].lng], 'the selected pin uses the selected restaurant coordinates');
  assert.equal(performance.calls.maps, 1); assert.equal(performance.calls.geography, 1, 'out-of-cap selection reuses the existing map and geography');
  assert.deepEqual(performance.errors, []); performance.dom.window.close();

  console.log('PASS: directory DOM behavior over ' + dataset.restaurants.length + ' real records plus 800-record performance sample: first-visit/granted/denied/reentry location, truthful nearest/unknown ordering, 50-row append pagination, 300-pin cap with out-of-cap selection, folded filters, local map, saved state, exact sources, edition/selection/publication/source/listing years, safe text/URLs and recovery. Browser layout and screenshots require Chromium/CUA.');
})().catch(error => { console.error(error); process.exitCode = 1; });
