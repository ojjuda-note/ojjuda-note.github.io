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
const seoulSupplement = JSON.parse(fs.readFileSync(path.join(directory, 'official-seoul-blue-ribbon.json'), 'utf8'));
const northeastSupplement = JSON.parse(fs.readFileSync(path.join(directory, 'official-seoul-visitseoul-northeast.json'), 'utf8'));
const southwestSupplement = JSON.parse(fs.readFileSync(path.join(directory, 'official-seoul-visitseoul-southwest.json'), 'utf8'));
const bucheonContinuation = JSON.parse(fs.readFileSync(path.join(directory, 'official-bucheon-gimpo-slot11.json'), 'utf8'));
assert.equal(bucheonContinuation.restaurants.length, 10, 'Bucheon continuation retains all ten official items');
for (const [name, category, label] of [
  ['이학갈비', '한식', '부천맛집'],
  ['송탄금이네부대찌개', '한식', '모범음식점'],
  ['차이나몽', '중식', '모범음식점']
]) {
  const row = bucheonContinuation.restaurants.find(r => r.name === name);
  assert.ok(row && row.category === category && row.guides.some(g => g.provider === 'local-guide' && g.label.includes(label) && g.year === null && g.yearType === 'selection'), 'official Bucheon designation labels are distinct for ' + name);
  assert.equal(row.lat, null, name + ' has no guessed latitude');
  assert.equal(row.lng, null, name + ' has no guessed longitude');
}

assert.deepEqual(seoulSupplement.restaurants.map(item => item.name), ['원대구탕', '제이드앤워터 옥수', '더마칸', '청돈옥'], 'all official Seoul blue-ribbon histories remain available');
assert.ok(seoulSupplement.restaurants.every(item => item.lat === null && item.lng === null && item.guides.every(guide => guide.provider === 'blue-ribbon' && guide.label.includes('이력') && guide.year === null && ['selection', 'listing'].includes(guide.yearType) && guide.sourceUrl.startsWith('https://korean.visitseoul.net/'))), 'verified histories preserve official source URLs, unknown grades/years and unverified coordinates');
const northeastTourism = northeastSupplement.restaurants.filter(item => item.guides.some(guide => guide.status === 'official_restaurant_listing'));
const northeastOraegage = northeastSupplement.restaurants.filter(item => item.guides.some(guide => guide.status === 'official_selection_list' && guide.year === 2026));
assert.equal(northeastSupplement.restaurants.length, 20, 'the northeast supplements retain 14 official tourism introductions and 6 added municipal selections');
assert.equal(new Set(northeastSupplement.restaurants.map(item => item.id)).size, 20, 'the northeast entries have stable unique IDs');
assert.equal(northeastTourism.length, 14, 'all 14 previously verified Visit Seoul introductions are preserved');
assert.equal(northeastOraegage.length, 7, 'the six municipal restaurants plus previously listed Yeonghwajang have 2026 selection badges');
assert.ok(northeastSupplement.restaurants.every(item => item.lat === null && item.lng === null && item.address.startsWith('서울 ')), 'no unverifiable coordinates were introduced');
assert.ok(northeastTourism.every(item => item.guides.some(guide => guide.provider === 'local-guide' && guide.year === null && guide.status === 'official_restaurant_listing' && guide.sourceUrl.startsWith('https://korean.visitseoul.net/'))), 'tourism introductions are not mistaken for formal awards');
assert.ok(northeastOraegage.every(item => item.guides.some(guide => guide.provider === 'local-guide' && guide.label.includes('오래가게') && guide.year === 2026 && guide.yearType === 'selection' && guide.sourceUrl === 'https://mediahub.seoul.go.kr/archives/2019458')), 'municipal selection year and official source are preserved');
assert.ok(northeastSupplement.restaurants.find(item => item.id === 'local-seoul-visitseoul-ddm-yeonghwajang').guides.length === 2, 'Yeonghwajang keeps both verified tourism listing and municipal selection without duplication');
assert.equal(southwestSupplement.restaurants.length, 8, 'eight official southwest Seoul tourist introductions');
assert.equal(new Set(southwestSupplement.restaurants.map(item => item.id)).size, 8, 'southwest official restaurant IDs remain unique');
assert.ok(southwestSupplement.restaurants.every(item => item.lat === null && item.lng === null && item.region === '서울' && item.guides.every(guide => guide.status === 'official_restaurant_listing' && guide.year === null && guide.sourceUrl.startsWith('https://korean.visitseoul.net/'))), 'tourism introductions are not misrepresented as new awards or located without proof');
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
  const recommendationRows = Array.isArray(options.memberRecommendations) ? options.memberRecommendations : [];
  const hasMemberRecommendations = Array.isArray(options.memberRecommendations);
  const dom = new JSDOM(html, { url: 'https://fixture.test/games/certified-restaurants/index.html?embedded=1' + (options.member ? '&member-ratings=1' : '') + (hasMemberRecommendations || options.recommendationFlagOnly ? '&member-recommendations=1' : ''), runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, document = window.document;
  const calls = { data: 0, location: 0, locationCallbacks: [], ratingRequests: [], recommendationRequests: [], recommendationNavigation: [], maps: 0, tiles: 0, tileLoads: 0, tileBatches: 0, tileRedraws: 0, tileRemoves: 0, tileLayers: [], fits: [], markers: new Set() };
  let parent;
  const replyRating = (request, result = {}) => {
    assert.ok(request && !request.replied, 'rating request is pending'); request.replied = true;
    const data = Object.hasOwn(result, 'data') ? result.data : request.ids.map(id => options.ratings?.[id] || { id, average: null, count: 0, my_rating: null });
    window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: parent, data: { type: 'ojjuda:restaurants:rating-result', requestId: request.requestId, data, ...result } }));
  };
  const replyRecommendation = (request, result = {}) => {
    assert.ok(request && !request.replied, 'recommendation request is pending'); request.replied = true;
    const rows = recommendationRows.slice(request.offset, request.offset + request.limit);
    const data = { rows, total: recommendationRows.length, offset: request.offset, limit: request.limit, hasMore: request.offset + rows.length < recommendationRows.length };
    window.dispatchEvent(new window.MessageEvent('message', { origin: window.location.origin, source: parent, data: { type: 'ojjuda:restaurants:recommendation-data-result', requestId: request.requestId, data, ...result } }));
  };
  if (options.member || hasMemberRecommendations) {
    parent = { postMessage(message, origin) {
      assert.equal(origin, window.location.origin, 'member messages stay same-origin');
      if (message.type === 'ojjuda:restaurants:recommendation-data') {
        assert.equal(message.action, 'page'); assert.equal(message.limit, 50);
        const request = { ...message, replied: false }; calls.recommendationRequests.push(request);
        if (!options.deferRecommendations) queueMicrotask(() => replyRecommendation(request));
        return;
      }
      if (message.type === 'ojjuda:restaurants:recommendations') { calls.recommendationNavigation.push({ ...message }); return; }
      if (message.type !== 'ojjuda:restaurants:ratings') return;
      assert.equal(message.action, 'summary');
      assert.ok(message.ids.length <= 100, 'each summary request observes the bridge batch limit');
      const request = { ...message, ids: [...message.ids], replied: false }; calls.ratingRequests.push(request);
      if (!options.deferRatings) queueMicrotask(() => replyRating(request));
    } };
    Object.defineProperty(window, 'parent', { value: parent });
  }
  if (options.member) {
    window.OjjudaRestaurantRatings = {
      renderSummary(node, summary) { node.textContent = summary === undefined ? '별점 확인 중' : summary === null ? '별점 확인 불가' : summary.count ? '별점 ' + summary.average + ' · ' + summary.count + '명' : '아직 평가 없음'; },
      mountEditor(section, editor) { calls.editor = editor; return { dispose() {} }; }
    };
  }
  let tileFailures = options.tileFailures || 'none', tilesStalled = !!options.stallTiles;
  const backgroundDeadlines = new Map();
  if (options.controlTimeouts) {
    const nativeSetTimeout = window.setTimeout.bind(window), nativeClearTimeout = window.clearTimeout.bind(window); let nextDeadline = -1;
    window.setTimeout = (handler, milliseconds, ...args) => {
      if (milliseconds !== 18000) return nativeSetTimeout(handler, milliseconds, ...args);
      const id = nextDeadline--; backgroundDeadlines.set(id, () => handler(...args)); return id;
    };
    window.clearTimeout = id => { if (!backgroundDeadlines.delete(id)) nativeClearTimeout(id); };
  }
  window.matchMedia = query => ({ matches: query.includes('max-width') ? !!options.mobile : false, media: query, addEventListener() {}, addListener() {}, removeEventListener() {} });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.fetch = async requested => {
    const url = new URL(requested, window.location.href);
    assert.equal(url.origin, window.location.origin, 'restaurant data requests stay local');
    if (/\/official-[^/]+\.json$/.test(url.pathname)) {
      // Isolate fixture datasets from production supplements; the real source files are verified separately.
      return { ok: true, status: 200, json: async () => ({ restaurants: [], enrichments: [], guideEnrichments: [], locationEnrichments: [] }) };
    }
    assert.ok(url.pathname.endsWith('/restaurants.json'), 'the app fetches only the catalog and approved supplements'); calls.data++;
    return { ok: !(options.failOnce && calls.data === 1), status: options.failOnce && calls.data === 1 ? 503 : 200, json: async () => structuredClone(options.dataset || dataset) };
  };
  if (!options.noPermissionApi) Object.defineProperty(window.navigator, 'permissions', { value: { query: async () => ({ state: options.permission || 'denied' }) } });
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition(success, failure) { calls.location++; calls.locationCallbacks.push({ success, failure }); if (!options.deferLocation) queueMicrotask(() => options.position ? success({ coords: { latitude: options.position.lat, longitude: options.position.lng } }) : failure({ code: options.locationError || 1 })); } } });
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
    map(id, settings) { calls.maps++; const map = { element: document.getElementById(id), options: settings, layers: new Set(), zoom: 7, attributionControl: { addAttribution() {}, setPrefix() {} }, setView(point, zoom) { this.zoom = zoom; this.point = point; return this; }, getZoom() { return this.zoom; }, fitBounds(bounds) { calls.fits.push(bounds); return this; }, invalidateSize() { return this; }, hasLayer(layer) { return this.layers.has(layer); }, removeLayer(layer) { layer.remove(); return this; } }; calls.map = map; return map; },
    control: { zoom() { return { addTo() {} }; } },
    divIcon(options) { return options; },
    tileLayer(url, settings) {
      calls.tiles++;
      const handlers = new Map(), node = document.createElement('div'); node.className = 'fixture-tile-layer';
      let attached = null, batch = 0;
      const layer = {
        url, options: settings, currentTiles: [],
        on(name, handler) { if (typeof name === 'object') Object.entries(name).forEach(([event, listener]) => handlers.set(event, listener)); else handlers.set(name, handler); return this; },
        fire(name, event = {}) { handlers.get(name)?.({ target: this, ...event }); return this; },
        addTo(map) { attached = map; map.layers.add(this); map.element.append(node); this.request(); return this; },
        request() {
          if (!attached) return this;
          const current = ++batch; calls.tileBatches++;
          this.currentTiles.forEach(tile => this.fire('tileunload', { tile }));
          this.currentTiles = Array.from({ length: 3 }, () => document.createElement('img'));
          if (!options.silentTileLoading) this.fire('loading');
          this.currentTiles.forEach(tile => this.fire('tileloadstart', { tile }));
          if (tilesStalled) return this;
          const failed = tileFailures;
          window.setTimeout(() => {
            if (!attached || current !== batch) return;
            this.currentTiles.forEach((tile, index) => this.fire(failed === 'all' || failed === 'mixed' && index === 0 ? 'tileerror' : 'tileload', { tile }));
            calls.tileLoads++; this.fire('load');
          }, 0);
          return this;
        },
        redraw() { calls.tileRedraws++; return this.request(); },
        remove() { if (!attached) return this; batch++; this.currentTiles.forEach(tile => this.fire('tileunload', { tile })); this.currentTiles = []; attached.layers.delete(this); attached = null; node.remove(); calls.tileRemoves++; this.fire('remove'); return this; }
      };
      calls.tileLayers.push(layer); return layer;
    },
    marker(point, settings) {
      const node = document.createElement('div'); node.className = settings.icon.className; node.innerHTML = settings.icon.html; node.title = settings.title; let click;
      const marker = { point, node, bindTooltip() { return this; }, on(name, handler) { if (name === 'click') click = handler; return this; }, addTo(map) { map.element.append(node); calls.markers.add(marker); node.addEventListener('click', () => click && click()); return this; }, remove() { node.remove(); calls.markers.delete(marker); return this; }, setIcon(icon) { node.className = icon.className; node.innerHTML = icon.html; return this; }, setLatLng(next) { marker.point = next; return this; }, setZIndexOffset() {} };
      return marker;
    }
  };
  if (options.noMap) delete window.L;
  window.eval(code);
  const $ = selector => document.querySelector(selector);
  return { dom, window, document, $, calls, errors, replyRating, replyRecommendation, parent, backgroundDeadlines, expireMapTimeout() { assert.equal(backgroundDeadlines.size, 1, 'exactly one map deadline is active'); const [id, handler] = backgroundDeadlines.entries().next().value; backgroundDeadlines.delete(id); handler(); }, recoverTiles() { tileFailures = 'none'; tilesStalled = false; }, records: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId).sort(), order: () => [...document.querySelectorAll('#cards [data-restaurant-id]')].map(node => node.dataset.restaurantId), all() { let page = 0; while (!$('#load-more').hidden && page++ < 1000) $('#load-more').click(); }, click(selector) { const node = $(selector); assert.ok(node, selector + ' exists'); node.click(); }, filters() { if ($('#filter-options').hidden) $('#filter-toggle').click(); }, change(selector, value) { $(selector).value = value; $(selector).dispatchEvent(new window.Event('change', { bubbles: true })); }, search(value) { $('#search').value = value; $('#search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); } };
}

(async () => {
  const initialMap = fixture({ view: null });
  await ready(initialMap, dataset.restaurants.length, false);
  await until(() => initialMap.calls.tileLoads === 1, 'a first visit loads the street map tiles');
  const initialTiles = initialMap.calls.tileLayers[0];
  assert.equal(initialTiles.url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 'OSM uses its keyless HTTPS tile endpoint without query credentials');
  assert.equal(initialTiles.options.maxZoom, 19); assert.equal(initialTiles.options.noWrap, true);
  assert.equal(initialTiles.options.keepBuffer, 1); assert.equal(initialTiles.options.updateWhenIdle, true); assert.equal(initialTiles.options.updateWhenZooming, false);
  assert.equal(initialTiles.options.referrerPolicy, 'strict-origin-when-cross-origin', 'tile requests keep the site referrer');
  assert.match(initialTiles.options.attribution, /openstreetmap\.org\/copyright/); assert.match(initialTiles.options.attribution, /OpenStreetMap/);
  assert.equal(initialMap.calls.map.options.maxZoom, 19, 'street details remain available at higher zoom');
  assert.equal(initialMap.$('#workspace').dataset.view, 'map', 'the first visit matches the festival map-and-list view');
  assert.equal(initialMap.$('#show-map').getAttribute('aria-pressed'), 'true');
  assert.equal(initialMap.$('#results').hidden, false, 'the list remains available beside the map');
  assert.equal(initialMap.records().length, 50, 'the first map view also provides a bounded batch of restaurant cards');
  assert.equal(initialMap.$('#categories'), null, 'the category chip rows are removed');
  assert.equal(initialMap.$('#category').getAttribute('aria-label'), '음식 종류');
  assert.deepEqual([...initialMap.$('#category').options].map(option => option.value), ['', '한식', '중식', '일식', '양식', '분식', '디저트', '기타']);
  assert.equal(initialMap.$('#category').closest('#search-form'), initialMap.$('#search-form'), 'the category select sits with the regional search controls');
  assert.equal(initialMap.document.querySelectorAll('#recommendations-link').length, 1, 'there is one recommendation entry');
  assert.equal(initialMap.$('#search-form').nextElementSibling, initialMap.$('#recommendations-link'), 'recommendations immediately follow the search form');
  assert.equal(initialMap.$('#recommendations-link').closest('header'), null, 'the recommendation entry is not duplicated in the header');
  assert.equal(initialMap.$('#nearby').closest('#map-panel'), initialMap.$('#map-panel'), 'my location belongs to the map');
  assert.equal(initialMap.$('#nearby-label').textContent, '내 위치');
  initialMap.click('#map-expand');
  assert.equal(initialMap.$('#map-panel').classList.contains('is-expanded'), true, 'the restaurant map expands over the search and results');
  assert.equal(initialMap.$('#map-expand').getAttribute('aria-label'), '지도 작게 보기');
  initialMap.document.dispatchEvent(new initialMap.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(initialMap.$('#map-panel').classList.contains('is-expanded'), false, 'Escape restores the original map size');
  assert.equal(initialMap.$('#result-coverage').classList.contains('sr-only'), true, 'coverage remains available to assistive technology without a visible summary row');
  assert.equal(initialMap.$('#list-label').classList.contains('sr-only'), true);
  assert.equal(initialMap.$('#load-more').hidden, false, 'map-and-list browsing retains progressive loading');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), null, 'the default view does not create an explicit preference');
  initialMap.click('#show-list');
  assert.equal(initialMap.calls.map.hasLayer(initialTiles), false, 'list view detaches the tile layer');
  assert.equal(initialMap.window.localStorage.getItem(viewKey), 'list', 'explicit list selection is persisted');
  const explicitList = initialMap.window.localStorage.getItem(viewKey);
  initialMap.click('#show-map');
  await until(() => initialMap.calls.map.hasLayer(initialTiles), 'returning to map reuses the same tile layer');
  assert.equal(initialMap.calls.tiles, 1);
  assert.equal(initialMap.window.localStorage.getItem(viewKey), 'map', 'explicit map selection is persisted');
  const explicitMap = initialMap.window.localStorage.getItem(viewKey);
  initialMap.change('#category', '한식'); initialMap.click('#reset');
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
    await until(() => restoredView.calls.tileLoads === 1, 'map preference or invalid-preference fallback loads its map');
    assert.equal(restoredView.$('#workspace').dataset.view, 'map', view === explicitMap ? 'a saved map choice is restored' : 'invalid saved values use the default map');
    assert.deepEqual(restoredView.errors, []); restoredView.dom.window.close();
  }
  const sourceRow = dataset.restaurants.find(coordinates);
  const mobileDefault = fixture({ view: null, mobile: true, dataset: { restaurants: [
    { ...structuredClone(sourceRow), id: 'mobile-located', name: '위치 확인 식당', region: '서울' },
    { ...structuredClone(sourceRow), id: 'mobile-pending', name: '위치 확인 중 식당', region: '제주', lat: null, lng: null }
  ] } });
  await ready(mobileDefault, 2);
  await until(() => mobileDefault.calls.tileLoads === 1, 'mobile first visit loads the map above its list');
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
  assert.equal(actual.calls.tiles, 0, 'list browsing does not request map tiles');
  actual.click('#show-map');
  await until(() => actual.calls.tileLoads === 1, 'map entry loads the street map');
  assert.equal(actual.calls.maps, 1, 'the first map entry creates the map');
  assert.equal(actual.calls.markers.size, Math.min(50, dataset.restaurants.filter(coordinates).length), 'only sourced coordinates receive pins, within one map page');
  assert.equal(actual.$('.result-shown').hidden, true, 'list pagination counts are hidden in map mode');
  const missingActual = dataset.restaurants.filter(item => !coordinates(item)).length;
  assert.equal(actual.$('.map-caption'), null, 'the map has no obstructing summary caption');
  if (missingActual) assert.ok(actual.$('#result-coverage').textContent.includes('위치 확인 중 ' + missingActual + '곳'), 'coordinate gaps remain in accessible coverage metadata even when the pin limit applies');
  actual.click('#show-list'); actual.click('#show-map');
  assert.equal(actual.calls.maps, 1, 'map switching reuses the existing map');
  assert.equal(actual.calls.tiles, 1, 'map switching reuses the tile layer');
  actual.click('#show-list');
  assert.equal(actual.$('.result-shown').hidden, false);
  actual.filters(); assert.equal(actual.$('#filter-options').hidden, false); assert.equal(actual.$('#filter-toggle').getAttribute('aria-expanded'), 'true');
  if (dataset.collections?.length) assert.deepEqual([...actual.document.querySelectorAll('.collection-title')].map(link => link.href), dataset.collections.map(collection => new URL(collection.url).href), 'footer data details preserve the exact official collection map');
  const combined = dataset.restaurants.find(item => item.guides.some(g => g.provider === 'michelin') && item.guides.some(g => g.provider === 'blue-ribbon'));
  assert.ok(combined, 'real data includes a joint guide selection');
  const compactCard = actual.$('[data-restaurant-id="' + combined.id + '"]');
  assert.equal(compactCard.querySelector('.card-address,.coord-note'), null, 'repeated detailed fields stay out of the compact list');
  assert.doesNotMatch(compactCard.querySelector('.guide-badges').textContent, /20\d{2}/, 'edition dates are reserved for the detail');
  actual.change('#category', combined.category); actual.change('#region', combined.region); actual.click('[data-guide="both"]');
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
  actual.change('#sort-order', 'distance'); await until(() => !actual.$('#nearby').disabled, 'denied location resolves');
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

  // Municipal designations are independent of private guides, including on a jointly selected restaurant.
  const localGuide = {
    provider: 'local-guide', label: '대전광역시 3대 30년 전통음식업소 및 지역대표음식 전문업소 지정',
    year: 2025, yearType: 'source', sourceAsOf: '2025-05', sourceDateType: 'official-page-last-modified', verifiedAt: '2026-11-03',
    sourceName: '대전광역시 식품안전과 · 지역대표음식 전문업소 및 전통음식업소 공식 안내 자료',
    sourceUrl: 'https://fixture.test/sources/daejeon-designations-2025.pdf',
    selectionCriteria: '<img src=x onerror="window.localGuideInjected=1"> 맛·지역성 검토 <script>window.localGuideInjected=2</script> & 지자체 지정'
  };
  const localRows = [
    { id: 'municipal-only', name: '가 지자체 지정 식당', category: '한식', region: '대전', district: '중구', address: '대전광역시 중구 테스트로 1', lat: null, lng: null, menu: ['국밥'], guides: [localGuide] },
    { id: 'municipal-and-ribbon', name: '나 중복 선정 식당', category: '한식', region: '충북', district: '청주시', address: '충청북도 청주시 테스트로 2', lat: null, lng: null, menu: ['국수'], guides: [
      { ...localGuide, label: '청주시 향토음식점 지정', year: null, yearType: 'selection', sourceAsOf: '2025', sourceDateType: undefined, sourceName: '청주시 향토음식점 공식 안내', sourceUrl: 'https://fixture.test/sources/cheongju-designations', selectionCriteria: '향토성과 음식 맛 등을 심사하여 지자체가 지정한 음식점' },
      { provider: 'blue-ribbon', label: '1리본', year: 2026, yearType: 'edition', sourceName: '블루리본 서베이 공식 가이드', sourceUrl: 'https://fixture.test/sources/blue-ribbon-2026', verifiedAt: '2026-11-03' }
    ] },
    { id: 'michelin-only', name: '다 미쉐린 선정 식당', category: '한식', region: '대전', district: '유성구', address: '대전광역시 유성구 테스트로 3', lat: null, lng: null, menu: ['정식'], guides: [
      { provider: 'michelin', label: '빕 구르망', year: 2026, yearType: 'edition', sourceName: '미쉐린 공식 가이드', sourceUrl: 'https://fixture.test/sources/michelin-2026', verifiedAt: '2026-11-03' }
    ] }
  ];
  const municipal = fixture({ dataset: { restaurants: localRows } });
  await ready(municipal, 3);
  assert.deepEqual(municipal.records(), ids(localRows), 'all guides includes each municipal/private selection once');
  const municipalCard = municipal.$('[data-restaurant-id="municipal-only"]');
  assert.equal(municipalCard.querySelector('.is-local-guide').textContent, '지자체 지정 ' + localGuide.label, 'the card identifies the municipal designation and its program');
  assert.equal(municipalCard.querySelector('.is-ribbon,.is-michelin,.is-post-office'), null, 'a municipal designation is not displayed as a private or postal guide');
  assert.equal(municipal.document.querySelectorAll('[data-restaurant-id="municipal-and-ribbon"] .guide-badge').length, 2, 'joint selections retain both badges on one card');
  municipal.filters(); municipal.click('[data-guide="local-guide"]');
  assert.deepEqual(municipal.records(), ['municipal-and-ribbon', 'municipal-only'], 'municipal-only and jointly selected restaurants both match the municipal filter');
  assert.equal(municipal.$('[data-guide="local-guide"]').getAttribute('aria-pressed'), 'true');
  assert.equal(municipal.$('[data-guide="blue-ribbon"]').getAttribute('aria-pressed'), 'false');
  assert.equal(municipal.$('#filter-summary').textContent, '지자체 지정');
  municipal.change('#region', '대전'); assert.deepEqual(municipal.records(), ['municipal-only'], 'region and municipal designation intersect');
  assert.equal(municipal.$('#filter-summary').textContent, '대전 · 지자체 지정');
  municipal.change('#region', '충북'); assert.deepEqual(municipal.records(), ['municipal-and-ribbon']);
  municipal.click('[data-guide="blue-ribbon"]'); assert.deepEqual(municipal.records(), ['municipal-and-ribbon'], 'switching to blue ribbon keeps a jointly selected restaurant');
  assert.equal(municipal.$('[data-guide="local-guide"]').getAttribute('aria-pressed'), 'false');
  municipal.change('#region', '대전'); assert.deepEqual(municipal.records(), [], 'municipal-only records do not leak into blue ribbon results');
  municipal.click('[data-guide=""]'); assert.deepEqual(municipal.records(), ['michelin-only', 'municipal-only'], 'all guides removes only the guide condition');
  municipal.change('#region', ''); assert.deepEqual(municipal.records(), ids(localRows));
  municipal.click('[data-guide="michelin"]'); assert.deepEqual(municipal.records(), ['michelin-only']);
  municipal.click('[data-guide="both"]'); assert.deepEqual(municipal.records(), [], 'municipal plus blue ribbon never satisfies the Michelin-and-blue-ribbon intersection');
  municipal.click('#reset'); assert.deepEqual(municipal.records(), ids(localRows));
  municipal.click('[data-restaurant-id="municipal-only"] .card-main');
  assert.equal(municipal.$('.source-heading .is-local-guide').textContent, '지자체 지정 ' + localGuide.label);
  assert.equal(municipal.$('.source-year').textContent, '2025년 자료', 'a municipal source year is not a designation year');
  assert.doesNotMatch(municipal.$('.source-list').textContent, /2025년 선정/);
  assert.equal(municipal.$('.source-verified').textContent, '페이지 수정 2025.05 · 출처 확인일 2026.11.03', 'a page edit date is distinct from the data reference date and verification date');
  assert.equal(municipal.$('.source-link').textContent, localGuide.sourceName + ' ↗', 'the responsible agency is shown with the official source');
  assert.equal(municipal.$('.source-link').href, localGuide.sourceUrl);
  assert.equal(municipal.$('.source-criteria').textContent, localGuide.selectionCriteria, 'designation criteria are preserved as readable text');
  assert.equal(municipal.$('.source-criteria').children.length, 0, 'HTML-looking criteria do not create elements or handlers');
  assert.equal(municipal.$('#detail img,#detail script'), null);
  assert.equal(municipal.window.localGuideInjected, undefined);
  municipal.click('#close-detail'); municipal.click('[data-restaurant-id="municipal-and-ribbon"] .card-main');
  assert.deepEqual([...municipal.document.querySelectorAll('.source-year')].map(node => node.textContent), ['선정 연도 미확인', '2026년판'], 'unknown municipal selection dates remain unknown beside a dated private guide');
  assert.equal(municipal.$('.source-verified').textContent, '자료 기준 2025 · 출처 확인일 2026.11.03', 'a year-only source date does not invent a month or designation year');
  assert.deepEqual([...municipal.document.querySelectorAll('.source-link')].map(node => node.href), localRows[1].guides.map(guide => guide.sourceUrl));
  assert.deepEqual(municipal.errors, []); municipal.dom.window.close();

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
  await until(() => hostile.calls.tileLoads === 1, 'hostile fixture tile loading finishes before teardown');
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
  await until(() => mobilePostal.calls.tileLoads === 1, 'mobile fixture tile loading finishes before teardown');
  mobilePostal.filters();
  mobilePostal.click('[data-guide="post-office"]');
  mobilePostal.all(); assert.deepEqual(mobilePostal.records(), ids(postalRows));
  if (!postalRows.some(coordinates)) assert.equal(mobilePostal.$('#workspace').dataset.view, 'list', 'a mobile filter with no coordinates opens the useful list automatically');
  assert.equal(mobilePostal.$('#collections').hidden, false);
  assert.ok(mobilePostal.$('#collections').closest('.data-note details'), 'official full maps live in the footer data details');
  assert.equal(mobilePostal.$('#collections').closest('details').open, false, 'data details start folded');
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

  const mapFailure = fixture({ tileFailures: 'mixed' });
  await ready(mapFailure, dataset.restaurants.length);
  mapFailure.click('#show-map');
  await until(() => mapFailure.$('#map-message').hidden === false && mapFailure.$('#retry-map').hidden === false, 'mixed failed and successful tiles expose a retry');
  assert.equal(mapFailure.$('#map-message').hidden, false);
  assert.equal(mapFailure.calls.markers.size, Math.min(50, dataset.restaurants.filter(coordinates).length), 'tile failures keep restaurant pins available');
  const failedBatches = mapFailure.calls.tileBatches;
  await pause(); await pause();
  assert.equal(mapFailure.calls.tileBatches, failedBatches, 'failed tiles do not start an automatic retry loop');
  mapFailure.calls.tileLayers[0].fire('tileabort', { tile: mapFailure.calls.tileLayers[0].currentTiles[0] }).fire('load');
  assert.equal(mapFailure.$('#map-message').hidden, true, 'an aborted failed tile no longer leaves a stale warning');
  mapFailure.click('#show-list');
  mapFailure.click('.card-main'); assert.equal(mapFailure.$('#detail').open, true, 'map error leaves details usable');
  mapFailure.click('#close-detail'); mapFailure.click('#show-map');
  await until(() => mapFailure.calls.tileLoads === 2, 'returning to map finishes the failed tile batch');
  const oldTile = mapFailure.calls.tileLayers[0].currentTiles[0];
  mapFailure.recoverTiles(); mapFailure.click('#retry-map');
  await until(() => mapFailure.calls.tileLoads === 3, 'retry reloads the street map tiles');
  assert.equal(mapFailure.calls.tiles, 1, 'retry reuses the configured OSM layer');
  assert.equal(mapFailure.calls.tileRedraws, 1, 'only the retry button redraws failed tiles');
  assert.equal(mapFailure.$('#map-message').hidden, true, 'the retry clears the tile error');
  mapFailure.calls.tileLayers[0].fire('tileerror', { tile: oldTile }).fire('load');
  assert.equal(mapFailure.$('#map-message').hidden, true, 'a late error from an unloaded tile cannot restore the warning');
  assert.equal(mapFailure.$('.map-caption'), null, 'retry does not restore an obstructing map caption');
  assert.deepEqual(mapFailure.errors, []); mapFailure.dom.window.close();

  const stalledMap = fixture({ stallTiles: true, silentTileLoading: true, controlTimeouts: true });
  await ready(stalledMap, dataset.restaurants.length, false); stalledMap.click('#show-map');
  await until(() => stalledMap.calls.tileBatches === 1, 'the stalled tile layer is attached');
  stalledMap.expireMapTimeout();
  assert.equal(stalledMap.$('#map-message').hidden, false, 'a map timeout offers retry even without a loading event');
  stalledMap.click('#retry-map');
  assert.equal(stalledMap.calls.tileBatches, 2, 'manual retry starts a fresh tile batch');
  stalledMap.expireMapTimeout();
  assert.equal(stalledMap.$('#map-message').hidden, false, 'a repeated stalled redraw receives its own timeout');
  stalledMap.click('#show-list');
  assert.equal(stalledMap.backgroundDeadlines.size, 0, 'leaving the map cancels its timeout');
  stalledMap.click('#show-map');
  await until(() => stalledMap.calls.tileBatches === 3, 'returning reattaches the stalled layer');
  stalledMap.expireMapTimeout();
  assert.equal(stalledMap.$('#map-message').hidden, false, 'reattaching a stalled layer also receives a timeout');
  stalledMap.recoverTiles(); stalledMap.click('#retry-map');
  await until(() => stalledMap.calls.tileLoads === 1, 'the stalled map recovers after manual retry');
  assert.equal(stalledMap.$('#map-message').hidden, true); assert.equal(stalledMap.backgroundDeadlines.size, 0, 'successful loading clears the timeout');
  assert.equal(stalledMap.calls.tiles, 1, 'timeouts do not create additional tile layers');
  assert.deepEqual(stalledMap.errors, []); stalledMap.dom.window.close();

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
  laterVisit.change('#sort-order', 'distance'); await until(() => laterVisit.calls.location === 1 && !laterVisit.$('#nearby').disabled, 'an explicit nearby retry remains available');
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
  coverage.click('#show-map'); await until(() => coverage.calls.tileLoads === 1, 'the coverage map loads');
  assert.equal(coverage.$('#result-coverage').textContent, '지도 표시 4곳 · 위치 확인 중 8곳'); assert.equal(coverage.calls.markers.size, 4);
  coverage.change('#category', '한식');
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
  performance.click('#show-map'); await until(() => performance.calls.tileLoads === 1, 'the performance sample map loads');
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
  assert.equal(performance.calls.maps, 1); assert.equal(performance.calls.tiles, 1, 'page and location changes reuse the existing map and tile layer');
  assert.deepEqual(performance.errors, []); performance.dom.window.close();

  const mixedRows = [...many.slice(0, 305), ...Array.from({ length: 7 }, (_, index) => ({ ...structuredClone(unknown), id: 'unlocated-' + index, name: '지도미확인' + index }))];
  const mixedMap = fixture({ dataset: { restaurants: mixedRows } });
  await ready(mixedMap, mixedRows.length, false);
  assert.equal(mixedMap.$('#result-coverage').textContent, '지도 가능 305곳 · 위치 확인 중 7곳'); mixedMap.click('#show-map');
  await until(() => mixedMap.calls.tileLoads === 1, 'mixed-coordinate fixture map loads');
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
    await until(() => boundary.calls.tileLoads === 1, 'the page-size boundary map loads');
    assert.equal(boundary.document.querySelectorAll('.restaurant-pin').length, 50);
    assert.equal(boundary.$('#map-pagination').hidden, count === 50, 'pagination appears only when there is another map group');
    if (count === 51) {
      boundary.click('#map-next'); assert.deepEqual(pinNames(boundary), expectedNames(many.slice(50, 51)));
      assert.equal(boundary.$('#map-next').disabled, true);
    }
    assert.deepEqual(boundary.errors, []); boundary.dom.window.close();
  }

  const byName = rows => [...rows].sort((a, b) => a.name.localeCompare(b.name, 'ko') || a.id.localeCompare(b.id)).map(row => row.id);
  const sourceGuide = { provider: 'blue-ribbon', sourceUrl: 'https://fixture.test/selection', label: '선정 이력', verifiedAt: '2026-11-03' };
  const dateRow = (id, name, guides) => ({ ...structuredClone(near), id, name, guides });
  const datedRows = [
    dateRow('date-old', '하 예전 등록', [{ ...sourceGuide, sourceRegisteredAt: '2022-10-24', sourceRegistrationUrl: 'https://fixture.test/registered/old', sourceAsOf: '2026-11-03' }]),
    dateRow('date-latest', '차 최근 등록', [{ ...sourceGuide, sourceRegisteredAt: '2025-07-08', sourceRegistrationUrl: 'https://fixture.test/registered/new' }]),
    dateRow('date-two-guides', '타 여러 출처', [{ ...sourceGuide, sourceRegisteredAt: '2021-01-01', sourceRegistrationUrl: 'https://fixture.test/registered/first' }, { ...sourceGuide, provider: 'michelin', sourceRegisteredAt: '2026-05-06', sourceRegistrationUrl: 'https://fixture.test/registered/latest' }]),
    dateRow('date-missing', '가 자료 기준일만', [{ ...sourceGuide, sourceAsOf: '2026-11-03' }]),
    dateRow('date-invalid', '나 잘못된 날짜', [{ ...sourceGuide, sourceRegisteredAt: '2026-02-30', sourceRegistrationUrl: 'https://fixture.test/registered/invalid' }]),
    dateRow('date-unsafe', '다 안전하지 않은 출처', [{ ...sourceGuide, sourceRegisteredAt: '2026-11-02', sourceRegistrationUrl: 'javascript:window.injected=1' }]),
    dateRow('date-month', '라 월 단위 자료', [{ ...sourceGuide, sourceRegisteredAt: '2026-10', sourceRegistrationUrl: 'https://fixture.test/registered/month' }])
  ];
  const recent = fixture({ dataset: { updatedAt: '2026-11-03', restaurants: datedRows } });
  await ready(recent, datedRows.length);
  assert.deepEqual([...recent.$('#sort-order').options].map(option => option.value), ['distance', 'name', 'popular', 'recent'], 'all four requested sorting choices are present');
  assert.equal(recent.$('#sort-order').value, 'name');
  assert.equal(recent.$('#sort-order option[value="popular"]').disabled, true, 'guests cannot select the member-rating sort');
  recent.change('#sort-order', 'recent');
  assert.deepEqual(recent.order(), ['date-two-guides', 'date-latest', 'date-old', ...byName(datedRows.slice(3))], 'recent uses only genuine complete source registration dates; verified/source-as-of dates never substitute');
  assert.equal(recent.$('#sort-description').textContent, '등록일 미확인은 뒤에 표시해요.');
  assert.equal(recent.$('#sort-description').closest('#map-panel'), null, 'registration-date guidance never covers the map');
  recent.change('#sort-order', 'name'); assert.deepEqual(recent.order(), byName(datedRows));
  recent.change('#sort-order', 'popular');
  assert.notEqual(recent.$('#sort-order').value, 'popular', 'a synthetic guest change cannot enable member sorting');
  assert.equal(recent.calls.ratingRequests.length, 0);
  assert.deepEqual(recent.errors, []); recent.dom.window.close();

  const explicitName = fixture({ dataset: nearbyData, permission: 'granted', deferLocation: true });
  await ready(explicitName, 3);
  await until(() => explicitName.calls.location === 1, 'automatic geolocation starts');
  explicitName.change('#sort-order', 'name');
  explicitName.calls.locationCallbacks[0].success({ coords: { latitude: 37.5665, longitude: 126.978 } });
  assert.equal(explicitName.$('#sort-order').value, 'name', 'late geolocation does not override an explicit sort choice');
  assert.deepEqual(explicitName.order(), byName(nearbyData.restaurants));
  assert.equal(explicitName.$('.list-section-title'), null, 'name sorting does not split records into distance groups');
  explicitName.change('#sort-order', 'distance'); assert.deepEqual(explicitName.order(), ['near', 'far', 'unknown']);
  assert.match(explicitName.$('.list-section-title').textContent, /거리/);
  explicitName.change('#sort-order', 'name'); explicitName.click('#reset');
  assert.equal(explicitName.$('#sort-order').value, 'name', 'resetting search filters preserves the explicit sort');
  assert.deepEqual(explicitName.order(), byName(nearbyData.restaurants));
  assert.deepEqual(explicitName.errors, []); explicitName.dom.window.close();

  const distanceDenied = fixture({ dataset: nearbyData, permission: 'denied' });
  await ready(distanceDenied, 3); distanceDenied.change('#sort-order', 'distance');
  await until(() => !distanceDenied.$('#nearby').disabled, 'explicit distance request handles denied location');
  assert.deepEqual(distanceDenied.order(), byName(nearbyData.restaurants), 'missing user location never fabricates distances');
  assert.equal(distanceDenied.$('.list-section-title'), null);
  assert.ok(/위치|이름순/.test(distanceDenied.$('#sort-description').textContent + distanceDenied.$('#location-status').textContent), 'distance fallback is explained');
  assert.deepEqual(distanceDenied.errors, []); distanceDenied.dom.window.close();

  const popularityRows = many.slice(0, 120);
  const rating = (index, average, count) => ({ id: 'many-' + index, average, count, my_rating: null });
  const popularityScores = { 'many-119': rating(119, 5, 1), 'many-118': rating(118, 4.5, 20), 'many-117': rating(117, 4.5, 1), 'many-1': rating(1, 4.5, 20) };
  async function settleRatings(f) {
    let quiet = 0;
    for (let step = 0; step < 30 && quiet < 3; step++) {
      const pending = f.calls.ratingRequests.filter(request => !request.replied);
      pending.forEach(request => f.replyRating(request));
      quiet = pending.length ? 0 : quiet + 1;
      await pause();
    }
    assert.equal(f.calls.ratingRequests.some(request => !request.replied), false, 'all requested summaries settle');
  }
  const popular = fixture({ dataset: { restaurants: popularityRows }, member: true, deferRatings: true, ratings: popularityScores });
  await ready(popular, popularityRows.length, false);
  assert.equal(popular.$('#sort-order option[value="popular"]').disabled, false);
  popular.change('#sort-order', 'popular');
  assert.match(popular.$('#sort-description').textContent, /불러|확인/);
  await settleRatings(popular);
  await until(() => popular.order()[0] === 'many-119', 'a restaurant outside the first 50 rows becomes most popular');
  assert.deepEqual(popular.order().slice(0, 4), ['many-119', 'many-1', 'many-118', 'many-117'], 'popularity sorts average, then rating count, then Korean name');
  assert.equal(popular.order().length, 50, 'popularity retains bounded list pagination');
  const requestedIds = popular.calls.ratingRequests.flatMap(request => request.ids);
  assert.equal(new Set(requestedIds).size, popularityRows.length, 'popularity includes the entire filtered population');
  assert.equal(requestedIds.length, popularityRows.length, 'concurrent card and popularity requests share each pending ID');
  popular.all(); assert.equal(popular.order().length, popularityRows.length);
  assert.deepEqual(popular.order().slice(4), byName(popularityRows.filter(item => !popularityScores[item.id])), 'unrated restaurants follow rated ones with deterministic name ordering');
  popular.change('#sort-order', 'name'); popular.change('#sort-order', 'popular');
  await pause(); assert.equal(popular.calls.ratingRequests.flatMap(request => request.ids).length, popularityRows.length, 'resolved summaries are reused within the current member view');
  assert.deepEqual(popular.errors, []); popular.dom.window.close();

  const changedSort = fixture({ dataset: { restaurants: popularityRows }, member: true, deferRatings: true, ratings: popularityScores });
  await ready(changedSort, popularityRows.length, false); changedSort.change('#sort-order', 'popular'); changedSort.change('#sort-order', 'name');
  await settleRatings(changedSort);
  assert.equal(changedSort.$('#sort-order').value, 'name');
  assert.deepEqual(changedSort.order(), byName(popularityRows).slice(0, 50), 'late popularity results cannot override a newer sort selection');
  assert.equal(changedSort.$('#retry-sort').hidden, true);
  assert.deepEqual(changedSort.errors, []); changedSort.dom.window.close();

  const updatedRating = fixture({ dataset: { restaurants: popularityRows }, member: true, deferRatings: true, ratings: popularityScores });
  await ready(updatedRating, popularityRows.length, false); updatedRating.change('#sort-order', 'popular');
  updatedRating.click('[data-restaurant-id="many-0"] .card-main');
  assert.ok(updatedRating.calls.editor, 'the member detail exposes its existing rating editor');
  updatedRating.calls.editor.onChange({ id: 'many-0', average: 5, count: 2, my_rating: 5 });
  await settleRatings(updatedRating);
  await until(() => updatedRating.order()[0] === 'many-0', 'a confirmed saved rating reorders popularity');
  assert.match(updatedRating.$('[data-rating-id="many-0"]').textContent, /5.*2/);
  assert.deepEqual(updatedRating.order().slice(0, 2), ['many-0', 'many-119'], 'an older pending summary cannot overwrite a just-saved rating');
  updatedRating.click('#close-detail'); assert.deepEqual(updatedRating.errors, []); updatedRating.dom.window.close();

  const retryPopular = fixture({ dataset: { restaurants: popularityRows }, member: true, deferRatings: true, ratings: popularityScores });
  await ready(retryPopular, popularityRows.length, false); retryPopular.change('#sort-order', 'popular');
  let popularityFailed = false;
  for (let step = 0; step < 30; step++) {
    const pending = retryPopular.calls.ratingRequests.filter(request => !request.replied);
    for (const request of pending) {
      if (!popularityFailed && request.ids.includes('many-119')) { retryPopular.replyRating(request, { error: '연결 실패' }); popularityFailed = true; }
      else retryPopular.replyRating(request);
    }
    await pause();
    if (popularityFailed && !retryPopular.$('#retry-sort').hidden) break;
  }
  assert.equal(popularityFailed, true); assert.equal(retryPopular.$('#retry-sort').hidden, false, 'failed summaries have an explicit retry instead of being treated as unrated');
  assert.match(retryPopular.$('#sort-description').textContent, /못|실패|다시/);
  retryPopular.click('#retry-sort'); await settleRatings(retryPopular);
  await until(() => retryPopular.order()[0] === 'many-119', 'retry restores full popularity sorting');
  assert.equal(retryPopular.$('#retry-sort').hidden, true);
  assert.deepEqual(retryPopular.errors, []); retryPopular.dom.window.close();

  // Member recommendations join the same filters and map without exposing their private records.
  const recommendation = index => ({
    id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
    name: '추천등록' + String(index).padStart(2, '0'), category: index === 50 ? '중식' : '한식', region: '서울',
    address: '서울특별시 중구 테스트로 ' + (index + 1), menu: '등록 메뉴',
    latitude: index === 50 ? null : 37.56 + index / 100000, longitude: index === 50 ? null : 126.97,
    created_at: index === 50 ? '2026-11-02T12:30:00Z' : '2026-10-01T12:30:00Z'
  });
  const recommendedRows = Array.from({ length: 51 }, (_, index) => recommendation(index));
  const certifiedSample = { ...structuredClone(near), id: 'certified-near', name: '가 인증식당', category: '중식', guides: [sourceGuide] };
  const integrated = fixture({ dataset: { restaurants: [certifiedSample] }, memberRecommendations: recommendedRows, view: 'map' });
  await ready(integrated, 52);
  await until(() => integrated.calls.tileLoads > 0, 'the combined map loads');
  assert.deepEqual(integrated.calls.recommendationRequests.map(request => request.offset), [0, 50], 'all 51 recommendations are read through bounded pages');
  assert.equal(integrated.records().filter(id => id.startsWith('recommended-')).length, 51);
  assert.ok(integrated.$('[data-restaurant-id="recommended-' + recommendedRows[0].id + '"] .is-recommendation'), 'member recommendations have their own badge');
  assert.ok(integrated.document.querySelectorAll('.restaurant-pin.is-recommendation').length > 0, 'recommendation pins are visually distinct');
  assert.equal([...integrated.calls.markers].some(marker => marker.node.title === recommendedRows[50].name), false, 'missing recommendation coordinates never produce a map pin');
  integrated.change('#category', '중식'); integrated.all();
  assert.deepEqual(integrated.records(), [certifiedSample.id, 'recommended-' + recommendedRows[50].id].sort(), 'category filters apply to certified and member records together');
  await until(() => integrated.document.querySelectorAll('.restaurant-pin').length === 1, 'only the coordinate-backed certified result remains mapped');
  integrated.click('#reset'); integrated.change('#sort-order', 'recent');
  assert.equal(integrated.order()[0], 'recommended-' + recommendedRows[50].id, 'recommendation recent order uses its actual registration timestamp');
  integrated.search(recommendedRows[0].name);
  await until(() => integrated.order().length === 1 && integrated.document.querySelectorAll('.restaurant-pin').length === 1, 'member names are searchable on the same map');
  integrated.click('.card-main');
  assert.equal(integrated.calls.recommendationNavigation.at(-1).id, recommendedRows[0].id, 'recommendation cards open the existing member record');
  assert.equal(integrated.$('#detail').open, false, 'recommendation cards do not fabricate certified source details');
  integrated.click('.restaurant-pin');
  assert.equal(integrated.calls.recommendationNavigation.at(-1).id, recommendedRows[0].id, 'recommendation pins open the same member record');
  assert.deepEqual(integrated.errors, []); integrated.dom.window.close();

  const guestFeed = fixture({ dataset: { restaurants: [certifiedSample] }, recommendationFlagOnly: true });
  await ready(guestFeed, 1);
  assert.deepEqual(guestFeed.records(), [certifiedSample.id]);
  assert.equal(guestFeed.calls.recommendationRequests.length, 0, 'a query flag without a member parent cannot enable member data');
  assert.deepEqual(guestFeed.errors, []); guestFeed.dom.window.close();

  const feedRace = fixture({ dataset: { restaurants: [certifiedSample] }, memberRecommendations: [recommendedRows[0]], deferRecommendations: true });
  await ready(feedRace, 1);
  await until(() => feedRace.calls.recommendationRequests.length === 1, 'member feed starts its first request');
  const oldFeedRequest = feedRace.calls.recommendationRequests[0];
  const oldFeedData = { rows: [recommendedRows[0]], total: 1, offset: 0, limit: 50, hasMore: false };
  const feedEvent = (type, data = {}, origin = feedRace.window.location.origin, source = feedRace.parent) => feedRace.window.dispatchEvent(new feedRace.window.MessageEvent('message', { origin, source, data: { type, ...data } }));
  feedEvent('ojjuda:restaurants:recommendation-data-result', { requestId: oldFeedRequest.requestId, data: oldFeedData }, 'https://untrusted.test');
  feedEvent('ojjuda:restaurants:recommendation-data-result', { requestId: oldFeedRequest.requestId, data: oldFeedData }, feedRace.window.location.origin, null);
  feedEvent('ojjuda:restaurants:recommendations-changed', {}, 'https://untrusted.test');
  await pause();
  assert.deepEqual(feedRace.records(), [certifiedSample.id], 'foreign-origin and nonparent feed replies are rejected');
  assert.equal(feedRace.calls.recommendationRequests.length, 1, 'foreign refresh messages do not reload member data');
  feedEvent('ojjuda:restaurants:recommendations-changed');
  await until(() => feedRace.calls.recommendationRequests.length === 2, 'a trusted member change refreshes the feed');
  feedRace.replyRecommendation(oldFeedRequest);
  feedRace.replyRecommendation(feedRace.calls.recommendationRequests[1], { data: { rows: [recommendedRows[1]], total: 1, offset: 0, limit: 50, hasMore: false } });
  await ready(feedRace, 2);
  assert.deepEqual(feedRace.records(), [certifiedSample.id, 'recommended-' + recommendedRows[1].id].sort(), 'a stale feed page cannot replace a newer member update');
  assert.deepEqual(feedRace.errors, []); feedRace.dom.window.close();

  const combinedRatings = fixture({ dataset: { restaurants: [certifiedSample] }, member: true, memberRecommendations: [recommendedRows[0]], ratings: { [recommendedRows[0].id]: { id: recommendedRows[0].id, average: 5, count: 2, my_rating: null } } });
  await ready(combinedRatings, 2); combinedRatings.change('#sort-order', 'popular');
  await until(() => combinedRatings.order()[0] === 'recommended-' + recommendedRows[0].id, 'member recommendation ratings participate in combined popularity');
  assert.ok(combinedRatings.calls.ratingRequests.some(request => request.kind === 'recommended' && request.ids.includes(recommendedRows[0].id)), 'recommendations use the recommended rating kind and original UUID');
  assert.ok(combinedRatings.calls.ratingRequests.some(request => (!request.kind || request.kind === 'certified') && request.ids.includes(certifiedSample.id)), 'certified ratings retain their separate namespace');
  assert.equal(combinedRatings.calls.ratingRequests.some(request => request.ids.some(id => id.startsWith('recommended-'))), false, 'display-only prefixed IDs are never sent as rating identities');
  combinedRatings.window.dispatchEvent(new combinedRatings.window.Event('pagehide'));
  await pause();
  assert.deepEqual(combinedRatings.errors, []); combinedRatings.dom.window.close();

  console.log('PASS: directory DOM behavior over ' + dataset.restaurants.length + ' real records plus 800-record performance sample: first-visit map plus list, explicit view restoration, mobile no-location fallback, first-visit/granted/denied/reentry location, truthful nearest/unknown ordering, 50-row append pagination, non-cumulative 50-pin map pages, boundary/partial pages, filter/location resets and whole-page selection, folded filters, keyless OSM tile settings and attribution, mixed tile failures, manual retry and stale-error recovery, saved state, exact sources, edition/selection/publication/source/listing years, four list sorts, evidence-backed registration dates, member-only full-population popularity, shared in-flight cache, stale sort protection, retry, paged member recommendations on the shared map, UUID navigation, typed ratings, stale/foreign feed isolation and safe text/URLs. Browser layout and screenshots require Chromium/CUA.');
})().catch(error => { console.error(error); process.exitCode = 1; });
