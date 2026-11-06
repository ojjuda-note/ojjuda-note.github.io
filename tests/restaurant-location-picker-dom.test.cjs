/* Map choice semantics and lifecycle, without remote tiles or browser automation. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'games/certified-restaurants/restaurant-location-picker.js'), 'utf8');

function emitter(base = {}) {
  const listeners = new Map();
  return Object.assign(base, {
    listeners,
    on(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); return this; },
    off(type, callback) { if (callback) listeners.get(type)?.delete(callback); else listeners.delete(type); return this; },
    fire(type, event = {}) { for (const callback of [...(listeners.get(type) || [])]) callback(event); return this; }
  });
}
function leaflet(document) {
  const state = { maps: [], layers: [], markers: [], icons: [] };
  state.api = {
    map(el, options) {
      el.getBoundingClientRect = () => ({ left: 0, top: 0, right: 320, bottom: 260, width: 320, height: 260 });
      const map = emitter({ el, options, removed: false, views: [], invalidations: 0,
        attributionControl: { setPrefix() {} },
        setView(center, zoom) {
          this.center = { lat: center[0], lng: center[1] }; this.zoom = zoom; this.views.push({ center: this.center, zoom });
          for (const layer of state.layers.filter(layer => layer.map === this)) for (const tile of layer.container.children) tile.testBounds = { left: -1000, top: -1000, right: -744, bottom: -744, width: 256, height: 256 };
          this.fire('moveend'); return this;
        },
        getCenter() { return this.center; },
        getZoom() { return this.zoom; },
        invalidateSize() { this.invalidations++; return this; },
        remove() { this.removed = true; this.listeners.clear(); }
      });
      state.maps.push(map); return map;
    },
    control: { zoom: options => ({ addTo(map) { map.zoomOptions = options; return this; } }) },
    tileLayer(url, options) {
      const layer = emitter({ url, options, redraws: 0, loading: true, container: document.createElement('div'),
        addTo(map) { this.map = map; map.el.append(this.container); return this; },
        getContainer() { return this.container; },
        isLoading() { return this.loading; },
        redraw() { this.redraws++; this.container.replaceChildren(); this.fire('loading'); return this; }
      });
      const fire = layer.fire;
      layer.fire = function (type, event = {}) {
        if (type === 'loading') this.loading = true;
        if (type === 'load') this.loading = false;
        if (type === 'tileload' && !event.tile) {
          const tile = document.createElement('img'); tile.className = 'leaflet-tile-loaded';
          tile.testBounds = { left: 0, top: 0, right: 256, bottom: 256, width: 256, height: 256 };
          tile.getBoundingClientRect = () => tile.testBounds; this.container.append(tile);
          event = { ...event, tile, coords: { z: this.map.zoom } };
        }
        return fire.call(this, type, event);
      };
      state.layers.push(layer); return layer;
    },
    divIcon(options) { state.icons.push(options); return options; },
    marker(latlng, options) {
      const marker = emitter({ point: { lat: latlng[0], lng: latlng[1] }, options, removed: false,
        addTo(map) { this.map = map; return this; },
        getLatLng() { return this.point; },
        setLatLng(value) { this.point = { lat: value[0], lng: value[1] }; return this; },
        remove() { this.removed = true; return this; }
      });
      state.markers.push(marker); return marker;
    }
  };
  return state;
}
function fixture(t, options = {}) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><form id="editor"><button id="entry" type="button">지도에서 위치 선택</button></form></body></html>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, document = window.document, intervals = new Map(), timeouts = new Map(), controllers = [], maps = leaflet(document), locationRequests = [], reverseRequests = [];
  let intervalSequence = 0, timeoutSequence = 0, now = 1760000000000;
  const settle = () => new Promise(resolve => setImmediate(resolve));
  window.setInterval = callback => { const id = ++intervalSequence; intervals.set(id, callback); return id; };
  window.clearInterval = id => intervals.delete(id);
  window.setTimeout = (callback, delay = 0, ...args) => { const id = ++timeoutSequence; timeouts.set(id, { at: now + delay, callback: () => callback(...args) }); return id; };
  window.clearTimeout = id => timeouts.delete(id);
  window.Date.now = () => now;
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  Object.defineProperty(window.navigator, 'geolocation', { configurable: true, value: { getCurrentPosition(success, failure, settings) { locationRequests.push({ success, failure, settings }); } } });
  window.fetch = (url, settings = {}) => {
    const parsed = new URL(String(url));
    assert.equal(parsed.origin + parsed.pathname, 'https://photon.komoot.io/reverse', 'reverse lookup uses the chosen keyless provider');
    assert.equal(parsed.searchParams.get('lang'), 'default', 'Photon default labels retain Korean place names');
    assert.equal(parsed.searchParams.get('radius'), '0.1'); assert.equal(parsed.searchParams.get('limit'), '1');
    assert.equal([...parsed.searchParams.keys()].some(key => /key|token/i.test(key)), false, 'no API key is included');
    let resolve, reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    const request = { url: parsed, settings, at: now, resolve: (data, status = 200) => resolve({ ok: status >= 200 && status < 300, status, json: async () => data }), reject };
    reverseRequests.push(request);
    if (!options.ignoreAbort) settings.signal?.addEventListener('abort', () => reject(new window.DOMException('Fixture aborted', 'AbortError')), { once: true });
    // Empty results preserve coordinate-only behavior in the existing lifecycle cases.
    if (!options.manualReverse) request.resolve({ type: 'FeatureCollection', features: [] });
    return promise;
  };
  window.L = maps.api; window.eval(source);
  const f = {
    window, document, maps, intervals, timeouts, reverseRequests,
    open(options) { const controller = window.OjjudaRestaurantLocationPicker.open(options); controllers.push(controller); return controller; },
    get(name) { return document.querySelector('[data-rlp="' + name + '"]'); },
    ready() { maps.layers.at(-1).fire('tileload').fire('load'); },
    clickMap(latitude, longitude) { maps.maps.at(-1).fire('click', { latlng: { lat: latitude, lng: longitude } }); },
    tickAuth() { for (const callback of [...intervals.values()]) callback(); },
    locationRequests: () => locationRequests.length,
    locateSuccess(index, latitude, longitude) { locationRequests[index].success({ coords: { latitude, longitude } }); },
    locateFailure(index, code = 1) { locationRequests[index].failure({ code }); },
    async advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timeouts.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        const [id, timer] = next; now = timer.at; timeouts.delete(id); timer.callback(); await settle();
      }
      now = end; await settle();
    },
    settle
  };
  t.after(() => { controllers.forEach(controller => controller.close()); window.close(); assert.deepEqual(errors, [], 'no uncaught DOM errors'); });
  return f;
}
const plain = value => JSON.parse(JSON.stringify(value));
const photon = (properties, coordinates = [126.9778834, 37.5663541]) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Point', coordinates }, properties }] });
const seoulAddress = { countrycode: 'KR', city: '서울특별시', district: '명동', locality: '태평로1가', street: '세종대로', housenumber: '110', name: '서울도서관', type: 'house' };

test('new selection has no default coordinate and confirms the exact tapped point', async t => {
  const f = fixture(t); f.document.querySelector('#entry').focus();
  const picker = f.open({ name: '추천 식당', region: '부산', location: null });
  assert.equal(f.get('dialog').parentElement, f.document.body, 'picker is outside the editor form');
  assert.equal(f.get('dialog').querySelector('form'), null, 'no nested form is created');
  assert.equal(f.get('confirm').disabled, true); assert.equal(f.maps.markers.length, 0);
  assert.equal(f.maps.maps[0].zoom, 12); assert.equal(f.maps.maps[0].options.keyboard, true);
  assert.match(f.maps.layers[0].options.attribution, /OpenStreetMap/);
  assert.equal(f.maps.layers[0].url, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
  assert.equal(f.locationRequests(), 0, 'opening the picker does not request device location');
  f.ready(); assert.equal(f.get('confirm').disabled, true, 'loaded city center is still not a selected location');
  const point = { latitude: 35.161234567, longitude: 129.061234567 };
  f.clickMap(point.latitude, point.longitude);
  assert.equal(f.get('confirm').disabled, true, 'confirmation waits for the address lookup');
  await f.advance(1200);
  assert.equal(f.get('confirm').disabled, false); assert.equal(f.maps.markers[0].options.draggable, true);
  assert.equal(f.maps.icons[0].className, 'rlp-marker'); assert.equal(f.maps.icons[0].iconUrl, undefined);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), point);
  assert.equal(f.get('dialog'), null); assert.equal(f.maps.maps[0].removed, true); assert.equal(f.intervals.size, 0);
  assert.equal(f.document.activeElement.id, 'entry', 'focus returns to the editor');
});

test('existing point restores at street zoom, dragging changes only the draft, and cancel preserves the caller value', async t => {
  const f = fixture(t), saved = Object.freeze({ latitude: 37.5665, longitude: 126.978 });
  const picker = f.open({ location: saved });
  assert.equal(f.maps.maps[0].zoom, 17); assert.deepEqual(f.maps.maps[0].center, { lat: saved.latitude, lng: saved.longitude });
  assert.equal(f.get('confirm').disabled, true, 'confirmation waits for a usable map'); f.ready();
  assert.equal(f.get('confirm').disabled, false);
  const marker = f.maps.markers[0]; marker.point = { lat: 37.5678, lng: 126.9799 }; marker.fire('dragend');
  f.get('cancel').click(); assert.equal(await picker.result, null); assert.deepEqual(saved, { latitude: 37.5665, longitude: 126.978 });
  const reopened = f.open({ location: saved }); f.ready();
  assert.deepEqual(f.maps.markers.at(-1).point, { lat: saved.latitude, lng: saved.longitude });
  f.maps.markers.at(-1).point = { lat: 37.5678, lng: 126.9799 }; f.maps.markers.at(-1).fire('dragend');
  await f.advance(1200);
  f.get('confirm').click(); assert.deepEqual(plain(await reopened.result), { latitude: 37.5678, longitude: 126.9799 });
});

test('region navigation and panning never choose a point; 내 위치 explicitly uses device geolocation', async t => {
  const f = fixture(t), picker = f.open(); f.ready();
  assert.equal(f.get('region').options.length, 18, '17 regions plus the national view');
  assert.equal(f.get('center').textContent, '내 위치');
  f.clickMap(37.5, 127);
  const firstMarker = f.maps.markers[0]; f.get('region').value = '제주'; f.get('region').dispatchEvent(new f.window.Event('change'));
  assert.equal(firstMarker.removed, true); assert.equal(f.get('confirm').disabled, true);
  assert.deepEqual(f.maps.maps[0].center, { lat: 33.4996, lng: 126.5312 });
  f.ready();
  const center = { lat: 33.4901, lng: 126.5223 }; f.maps.maps[0].center = center;
  f.maps.maps[0].fire('moveend'); await f.advance(1200);
  assert.equal(f.reverseRequests.length, 0, 'neither panning nor canceled selection sends an address lookup');
  assert.equal(f.get('confirm').disabled, true);
  f.get('center').click(); assert.equal(f.locationRequests(), 1); assert.equal(f.get('center').disabled, true);
  assert.match(f.get('dialog').textContent, /위치.*확인|확인.*위치/);
  const actual = { latitude: 35.1612345, longitude: 129.0612345 };
  f.locateSuccess(0, actual.latitude, actual.longitude);
  assert.deepEqual(f.maps.markers.at(-1).point, { lat: actual.latitude, lng: actual.longitude });
  assert.notDeepEqual(f.maps.markers.at(-1).point, center, 'the current map center is never substituted for device position');
  await f.advance(1200);
  assert.equal(f.get('confirm').disabled, true, 'address completion does not bypass new viewport tile readiness');
  f.ready(); assert.equal(f.get('confirm').disabled, false);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), actual);
});

test('close, Escape, and a replacement picker all cancel without leaking old map listeners', async t => {
  const f = fixture(t), first = f.open(); f.ready(); f.clickMap(36.2, 127.8);
  const firstLayer = f.maps.layers[0], firstMap = f.maps.maps[0];
  f.get('dialog').dispatchEvent(new f.window.Event('cancel', { cancelable: true }));
  assert.equal(await first.result, null); assert.equal(firstMap.removed, true);
  assert.equal([...firstLayer.listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0), 0);
  const second = f.open(), third = f.open({ name: '다른 식당' });
  assert.equal(await second.result, null); assert.equal(f.document.querySelectorAll('[data-rlp=dialog]').length, 1);
  firstLayer.fire('tileload'); firstMap.fire('click', { latlng: { lat: 37, lng: 127 } });
  assert.equal(f.get('confirm').disabled, true, 'disposed map events do not touch the replacement picker');
  third.close(); assert.equal(await third.result, null);
});

test('failed initial tiles block confirmation and retry recovers the selected draft', async t => {
  const f = fixture(t), picker = f.open({ location: { latitude: 37.5, longitude: 127 } });
  const tiles = f.maps.layers[0]; tiles.fire('tileerror').fire('tileerror').fire('tileerror');
  assert.match(f.get('status').textContent, /불러오지 못/); assert.equal(f.get('retry').hidden, false);
  assert.equal(f.get('confirm').disabled, true); assert.equal(f.get('center').disabled, true);
  f.get('retry').click(); assert.equal(tiles.redraws, 1); assert.equal(f.get('confirm').disabled, true);
  f.ready(); assert.equal(f.get('confirm').disabled, false); assert.equal(f.get('retry').hidden, true);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), { latitude: 37.5, longitude: 127 });
});

test('a missing map library shows an actionable error and can recover without another dialog', async t => {
  const f = fixture(t); delete f.window.L;
  const picker = f.open(); assert.match(f.get('status').textContent, /불러오지 못/); assert.equal(f.get('retry').hidden, false);
  f.window.L = f.maps.api; f.get('retry').click(); f.ready(); f.clickMap(35.1, 129);
  await f.advance(1200);
  assert.equal(f.document.querySelectorAll('[data-rlp=dialog]').length, 1);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), { latitude: 35.1, longitude: 129 });
});

test('new viewport and zoom failures block stale readiness while partial current-view tiles allow confirmation', async t => {
  const f = fixture(t), original = { latitude: 37.5, longitude: 127 }, picker = f.open({ location: original });
  f.ready(); assert.equal(f.get('confirm').disabled, false);
  const map = f.maps.maps[0], layer = f.maps.layers[0];
  map.setView([35.17, 129.07], 17); layer.fire('loading').fire('tileerror').fire('tileerror').fire('tileerror').fire('load');
  assert.equal(f.get('confirm').disabled, true, 'old off-screen success does not authorize an empty viewport');
  assert.equal(f.get('center').disabled, true); assert.match(f.get('status').textContent, /불러오지 못/);
  f.get('retry').click(); f.ready(); assert.equal(f.get('confirm').disabled, false, 'retry keeps the prior draft point');
  const olderZoomTile = layer.container.firstChild;
  map.setView([35.17, 129.07], 18);
  olderZoomTile.testBounds = { left: 0, top: 0, right: 256, bottom: 256, width: 256, height: 256 };
  layer.fire('loading').fire('tileerror').fire('tileerror').fire('tileerror').fire('load');
  assert.equal(f.get('confirm').disabled, true, 'visible old zoom tiles are not current street-level readiness');
  layer.fire('tileload').fire('tileerror').fire('load');
  assert.equal(f.get('confirm').disabled, false, 'one usable current-view tile keeps a partial failure recoverable');
  assert.match(f.get('status').textContent, /일부 지도/);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), original, 'failures and retry never rewrite the selected point');
});

test('auth/view changes and pagehide cancel the picker and late callbacks cannot choose a location', async t => {
  const f = fixture(t); let current = true;
  const picker = f.open({ isCurrent: () => current }); f.ready(); f.clickMap(37, 127);
  const oldTileCallback = [...f.maps.layers[0].listeners.get('tileload')][0];
  current = false; f.tickAuth(); assert.equal(await picker.result, null); assert.equal(f.get('dialog'), null);
  oldTileCallback(); assert.equal(f.get('dialog'), null);
  assert.equal(await f.open({ isCurrent: () => false }).result, null); assert.equal(f.get('dialog'), null);
  const next = f.open(); f.window.dispatchEvent(new f.window.Event('pagehide')); assert.equal(await next.result, null);
});

test('invalid coordinates and untrusted labels do not become a saved point or markup', async t => {
  const f = fixture(t), name = '<img src=x onerror="alert(1)">';
  const picker = f.open({ name, location: { latitude: 100, longitude: 127 } }); f.ready();
  assert.ok(f.get('dialog').textContent.includes(name)); assert.equal(f.get('dialog').querySelector('.rlp-heading img,script,[onerror]'), null);
  for (const pair of [[NaN, 127], [37, Infinity], [91, 127], [37, 181], ['37', 127]]) f.clickMap(...pair);
  assert.equal(f.get('confirm').disabled, true); assert.equal(f.maps.markers.length, 0);
  picker.close(); assert.equal(await picker.result, null);
});

test('a selected point fills a Korean road address and region without replacing the selected coordinates', async t => {
  const f = fixture(t, { manualReverse: true }), picker = f.open(); f.ready();
  const point = { latitude: 37.5665, longitude: 126.978 };
  f.clickMap(point.latitude, point.longitude);
  assert.equal(f.get('confirm').disabled, true);
  await f.advance(449); assert.equal(f.reverseRequests.length, 0, 'a quick adjustment does not send an early lookup');
  await f.advance(1); assert.equal(f.reverseRequests.length, 1);
  const request = f.reverseRequests[0];
  assert.equal(Number(request.url.searchParams.get('lat')), point.latitude);
  assert.equal(Number(request.url.searchParams.get('lon')), point.longitude);
  request.resolve(photon(seoulAddress)); await f.settle();
  assert.equal(f.get('region').value, '서울', 'the map selection updates the picker region');
  assert.match(f.get('selection').textContent, /서울특별시 세종대로 110/);
  assert.doesNotMatch(f.get('selection').textContent, /중구|명동|태평로1가/, 'a road address does not invent a district or repeat neighborhood fragments');
  assert.equal(f.get('confirm').disabled, false);
  f.get('confirm').click();
  assert.deepEqual(plain(await picker.result), { ...point, region: '서울', address: '서울특별시 세종대로 110' });
});

test('rapid pin changes debounce requests and only the newest selected point receives its address', async t => {
  const f = fixture(t, { manualReverse: true, ignoreAbort: true }), picker = f.open(); f.ready();
  f.clickMap(37.5664, 126.9779); await f.advance(200);
  const marker = f.maps.markers[0]; marker.point = { lat: 37.5665, lng: 126.978 }; marker.fire('dragend');
  await f.advance(449); assert.equal(f.reverseRequests.length, 0);
  await f.advance(1); assert.equal(f.reverseRequests.length, 1);
  const old = f.reverseRequests[0], final = { latitude: 36.3504, longitude: 127.3845 };
  f.clickMap(final.latitude, final.longitude);
  assert.equal(old.settings.signal.aborted, true, 'moving the selected point cancels the previous lookup');
  await f.advance(1200); assert.equal(f.reverseRequests.length, 2);
  const latest = f.reverseRequests[1];
  assert.ok(latest.at - old.at >= 1100, 'address requests obey the minimum interval');
  latest.resolve(photon({ countrycode: 'KR', state: '대전광역시', city: '대전광역시', district: '서구', street: '둔산로', housenumber: '100', type: 'house' }, [final.longitude, final.latitude]));
  await f.settle();
  old.resolve(photon(seoulAddress)); await f.settle();
  assert.equal(f.get('region').value, '대전');
  assert.match(f.get('selection').textContent, /대전광역시 서구 둔산로 100/);
  assert.doesNotMatch(f.get('selection').textContent, /서울|세종대로/);
  f.get('confirm').click();
  assert.deepEqual(plain(await picker.result), { ...final, region: '대전', address: '대전광역시 서구 둔산로 100' });
});

test('map panning does not geocode and the memory cache retains exact newly selected coordinates', async t => {
  const f = fixture(t, { manualReverse: true }), picker = f.open(); f.ready();
  f.clickMap(37.5665, 126.978); await f.advance(450);
  f.reverseRequests[0].resolve(photon(seoulAddress)); await f.settle();
  f.maps.maps[0].setView([37.567, 126.979], 17); f.ready();
  await f.advance(1500); assert.equal(f.reverseRequests.length, 1, 'a viewport move does not send a selected-point lookup');
  const precise = { latitude: 37.5665002, longitude: 126.9780002 };
  f.clickMap(precise.latitude, precise.longitude); await f.advance(1200);
  assert.equal(f.reverseRequests.length, 1, 'the same six-decimal cell reuses its known address');
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), { ...precise, region: '서울', address: '서울특별시 세종대로 110' });
});

test('denied or unavailable geolocation preserves an existing safe point and provides a readable fallback', async t => {
  const f = fixture(t), saved = Object.freeze({ latitude: 37.5, longitude: 127 });
  const picker = f.open({ location: saved }); f.ready();
  f.get('center').click(); assert.equal(f.locationRequests(), 1);
  f.locateFailure(0, 1);
  assert.match(f.get('location-status').textContent, /허용|권한/);
  assert.deepEqual(f.maps.markers[0].point, { lat: saved.latitude, lng: saved.longitude });
  assert.equal(f.get('confirm').disabled, false);
  assert.equal(f.reverseRequests.length, 0, 'permission failure never creates a replacement coordinate');
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), saved);
  Object.defineProperty(f.window.navigator, 'geolocation', { value: undefined });
  const unsupported = f.open({ location: saved }); f.ready(); f.get('center').click();
  assert.match(f.get('location-status').textContent, /사용|지원|위치/);
  assert.equal(f.get('confirm').disabled, false);
  f.get('confirm').click(); assert.deepEqual(plain(await unsupported.result), saved);
});

test('late device location cannot overwrite a later map choice or reopen a closed picker', async t => {
  const f = fixture(t), picker = f.open(); f.ready(); f.get('center').click();
  const selected = { latitude: 36.35, longitude: 127.38 };
  f.clickMap(selected.latitude, selected.longitude);
  f.locateSuccess(0, 37.5665, 126.978);
  await f.advance(1200);
  assert.deepEqual(f.maps.markers.at(-1).point, { lat: selected.latitude, lng: selected.longitude });
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), selected);
  const closed = f.open(); f.ready(); f.get('center').click(); closed.close();
  assert.equal(await closed.result, null);
  f.locateSuccess(1, 37.5665, 126.978); f.locateFailure(1, 1);
  assert.equal(f.get('dialog'), null, 'late geolocation callbacks cannot recreate UI after cancellation');
});

test('reverse lookup failures and timeouts keep exact coordinates available for manual address entry', async t => {
  const f = fixture(t, { manualReverse: true }), point = { latitude: 37.5665, longitude: 126.978 };
  const failed = f.open(); f.ready(); f.clickMap(point.latitude, point.longitude); await f.advance(450);
  f.reverseRequests[0].reject(new Error('fixture network failure')); await f.settle();
  assert.equal(f.get('confirm').disabled, false);
  assert.match(f.get('dialog').textContent, /주소.*직접|직접.*주소|주소.*입력/);
  f.get('confirm').click(); assert.deepEqual(plain(await failed.result), point);
  const timedOut = f.open(); f.ready(); f.clickMap(point.latitude + 0.001, point.longitude); await f.advance(1200);
  const pending = f.reverseRequests.at(-1);
  assert.equal(f.get('confirm').disabled, true);
  await f.advance(8000);
  assert.equal(pending.settings.signal.aborted, true, 'lookup timeout cancels the transport');
  assert.equal(f.get('confirm').disabled, false);
  f.get('confirm').click(); assert.deepEqual(plain(await timedOut.result), { latitude: point.latitude + 0.001, longitude: point.longitude });
});

test('unrelated reverse results cannot supply a false Korean address', async t => {
  const f = fixture(t, { manualReverse: true }), picker = f.open(); f.ready();
  const point = { latitude: 37.5665, longitude: 126.978 };
  f.clickMap(point.latitude, point.longitude); await f.advance(450);
  f.reverseRequests[0].resolve(photon({ countrycode: 'JP', city: '東京都', street: '잘못된 주소', housenumber: '1' }, [point.longitude, point.latitude]));
  await f.settle();
  assert.equal(f.get('region').value, '');
  assert.doesNotMatch(f.get('selection').textContent, /東京都|잘못된 주소/);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), point);
});

test('close and membership changes abort reverse lookup and discard late address responses', async t => {
  const f = fixture(t, { manualReverse: true, ignoreAbort: true }); let current = true;
  const first = f.open({ isCurrent: () => current }); f.ready(); f.clickMap(37.5665, 126.978); await f.advance(450);
  const old = f.reverseRequests[0]; current = false; f.tickAuth();
  assert.equal(await first.result, null); assert.equal(old.settings.signal.aborted, true);
  old.resolve(photon(seoulAddress)); await f.settle(); assert.equal(f.get('dialog'), null);
  current = true;
  const next = f.open({ isCurrent: () => current }); f.ready(); f.clickMap(37.5665, 126.978); await f.advance(1200);
  const newer = f.reverseRequests.at(-1);
  f.window.dispatchEvent(new f.window.Event('pagehide'));
  assert.equal(await next.result, null); assert.equal(newer.settings.signal.aborted, true);
  newer.resolve(photon(seoulAddress)); await f.settle(); assert.equal(f.get('dialog'), null);
});
