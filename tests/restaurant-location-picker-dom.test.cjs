/* Map choice semantics and lifecycle, without remote tiles or browser automation. */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '..', 'restaurant-location-picker.js'), 'utf8');

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
function fixture(t) {
  const errors = [], virtualConsole = new VirtualConsole(); virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM('<!doctype html><html><body><form id="editor"><button id="entry" type="button">지도에서 위치 선택</button></form></body></html>', { url: 'https://fixture.test/world.html', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, document = window.document, intervals = new Map(), controllers = [], maps = leaflet(document);
  let intervalSequence = 0, locationRequests = 0;
  window.setInterval = callback => { const id = ++intervalSequence; intervals.set(id, callback); return id; };
  window.clearInterval = id => intervals.delete(id);
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition() { locationRequests++; } } });
  window.L = maps.api; window.eval(source);
  const f = {
    window, document, maps, intervals,
    open(options) { const controller = window.OjjudaRestaurantLocationPicker.open(options); controllers.push(controller); return controller; },
    get(name) { return document.querySelector('[data-rlp="' + name + '"]'); },
    ready() { maps.layers.at(-1).fire('tileload').fire('load'); },
    clickMap(latitude, longitude) { maps.maps.at(-1).fire('click', { latlng: { lat: latitude, lng: longitude } }); },
    tickAuth() { for (const callback of [...intervals.values()]) callback(); },
    locationRequests: () => locationRequests
  };
  t.after(() => { controllers.forEach(controller => controller.close()); window.close(); assert.deepEqual(errors, [], 'no uncaught DOM errors'); });
  return f;
}
const plain = value => JSON.parse(JSON.stringify(value));

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
  f.get('confirm').click(); assert.deepEqual(plain(await reopened.result), { latitude: 37.5678, longitude: 126.9799 });
});

test('all regions move the view without choosing a point and keyboard users can choose the map center', async t => {
  const f = fixture(t), picker = f.open(); f.ready();
  assert.equal(f.get('region').options.length, 18, '17 regions plus the national view');
  f.clickMap(37.5, 127);
  const firstMarker = f.maps.markers[0]; f.get('region').value = '제주'; f.get('region').dispatchEvent(new f.window.Event('change'));
  assert.equal(firstMarker.removed, true); assert.equal(f.get('confirm').disabled, true);
  assert.deepEqual(f.maps.maps[0].center, { lat: 33.4996, lng: 126.5312 });
  f.ready();
  const center = { lat: 33.4901, lng: 126.5223 }; f.maps.maps[0].center = center;
  f.get('center').click(); assert.equal(f.get('confirm').disabled, false);
  f.get('confirm').click(); assert.deepEqual(plain(await picker.result), { latitude: center.lat, longitude: center.lng });
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
