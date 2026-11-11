/* Broadcast records stay separate from guide awards while sharing filters, saves and map views. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const directory = path.resolve(__dirname, '../games/certified-restaurants');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const code = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
const catalog = JSON.parse(fs.readFileSync(path.join(directory, 'restaurants.json'), 'utf8'));
const sources = JSON.parse(fs.readFileSync(path.join(directory, 'sources.json'), 'utf8'));
const broadcastAudit = sources.latestBroadcastAudit;
const broadcastRecords = catalog.restaurants.filter(row => row.broadcasts?.length);
assert.ok(broadcastAudit && typeof broadcastAudit.id === 'string' && broadcastAudit.id.length > 0, 'the latest broadcast audit has a stable identity');
assert.ok(Number.isInteger(broadcastAudit.newRestaurantCount) && broadcastAudit.newRestaurantCount >= 0 && Number.isInteger(broadcastAudit.broadcastEnrichmentCount) && broadcastAudit.broadcastEnrichmentCount >= 0, 'broadcast audits record nonnegative addition and enrichment counts regardless of their trigger');
assert.deepEqual(broadcastAudit, sources.coverageAuditHistory.find(row => row.id === broadcastAudit.id), 'broadcast audit preserves its exact coverage snapshot');
assert.deepEqual(sources.latestCoverageAudit, sources.coverageAuditHistory.find(row => row.id === sources.latestCoverageAudit.id), 'the latest regional audit retains its original snapshot');
assert.ok(Number.isInteger(sources.latestCoverageAudit.cycle) && Number.isInteger(sources.latestCoverageAudit.slot), 'a separate broadcast update cannot replace the regional cycle and slot');
assert.equal(broadcastAudit.currentCoverage.uniqueRestaurants - broadcastAudit.previousCoverage.uniqueRestaurants, broadcastAudit.newRestaurantCount, 'only new restaurants increase the total; broadcast enrichments reuse existing IDs');
assert.equal(new Set(broadcastAudit.addedRestaurantIds).size, broadcastAudit.newRestaurantCount);
assert.equal(new Set(broadcastAudit.enrichedRestaurantIds).size, broadcastAudit.broadcastEnrichmentCount);
assert.ok([...broadcastAudit.addedRestaurantIds, ...broadcastAudit.enrichedRestaurantIds].every(id => broadcastRecords.some(row => row.id === id)), 'every audited broadcast addition and enrichment exists in the catalog');
assert.equal(sources.broadcast.recordCount, broadcastRecords.length);
assert.equal(sources.broadcast.broadcastOnlyCount, broadcastRecords.filter(row => !row.guides.length).length);
assert.equal(sources.coverage.broadcastRestaurants, sources.broadcast.recordCount);
assert.equal(sources.coverage.broadcastOnlyRestaurants, sources.broadcast.broadcastOnlyCount);
assert.deepEqual(sources.coverage, sources.coverageAuditHistory.at(-1).currentCoverage, 'live totals match the latest recorded data change');
const guide = { provider: 'blue-ribbon', label: '선정 이력', sourceUrl: 'https://example.com/guide', verifiedAt: '2026-11-11' };
const broadcast = { program: '알파식탁', broadcaster: 'SBS', episode: 52, airedAt: '2025-03-12', sourceUrl: 'https://example.com/broadcast/52', sourceName: '방송사 공식 출연 정보', verifiedAt: '2026-11-11' };
const basic = { category: '한식', region: '서울', district: '중구', address: '서울 중구 테스트길 1', lat: null, lng: null, menu: ['국밥'], guides: [] };
const rows = [
  { ...basic, id: 'broadcast-existing-id', name: '방송겸선정식당', lat: 37.56, lng: 126.98, guides: [guide], broadcasts: [broadcast, { ...broadcast, episode: 53, airedAt: null, sourceUrl: 'https://example.com/broadcast/53' }] },
  { ...basic, id: 'broadcast-only-id', name: '방송전용식당', region: '부산', category: '중식', broadcasts: [{ ...broadcast, program: '베타기행', broadcaster: 'KBS', episode: null, airedAt: null }] },
  { ...basic, id: 'guide-only-id', name: '가이드식당', guides: [guide] },
  { ...basic, id: 'unsafe-broadcast-id', name: '출처불명식당', broadcasts: [{ ...broadcast, sourceUrl: 'javascript:alert(1)' }] },
  { ...basic, id: 'literal-broadcast-id', name: '문자출연식당', broadcasts: [{ ...broadcast, program: '<img src=x onerror=alert(1)>', sourceName: '<script>alert(1)</script>', airedAt: '2026-02-30' }] }
];
const sleep = () => new Promise(resolve => setTimeout(resolve, 5));
async function until(check, message) { for (let i = 0; i < 400; i++) { if (check()) return; await sleep(); } assert.fail(message); }

function fixture(query = '') {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  const dom = new JSDOM(html, { url: 'https://fixture.test/games/certified-restaurants/index.html' + query, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole });
  const { window } = dom, { document } = window, markers = new Set();
  window.matchMedia = () => ({ matches: false, addEventListener() {} });
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.localStorage.setItem('ojjuda-certified-restaurants-view-v1', 'list');
  Object.defineProperty(window.navigator, 'permissions', { value: { query: async () => ({ state: 'denied' }) } });
  Object.defineProperty(window.navigator, 'geolocation', { value: { getCurrentPosition() { assert.fail('broadcast filtering must not request personal location'); } } });
  window.fetch = async requested => {
    const url = new URL(requested, window.location.href);
    assert.equal(url.origin, window.location.origin);
    const filename = path.basename(url.pathname);
    const data = filename === 'restaurants.json' ? { restaurants: structuredClone(rows), updatedAt: '2026-11-11' } : JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
    return { ok: true, json: async () => data };
  };
  window.L = {
    map() { return { layers: new Set(), zoom: 7, setView(point, zoom) { this.zoom = zoom; return this; }, getZoom() { return this.zoom; }, fitBounds() {}, invalidateSize() {}, hasLayer(layer) { return this.layers.has(layer); } }; },
    control: { zoom() { return { addTo() {} }; } },
    divIcon(value) { return value; },
    marker(point, options) {
      const marker = { point, options, tooltip: null, bindTooltip(node) { this.tooltip = node; return this; }, on() { return this; }, addTo() { markers.add(this); return this; }, remove() { markers.delete(this); }, setIcon() {}, setLatLng(value) { this.point = value; }, setZIndexOffset() {} };
      return marker;
    },
    tileLayer() {
      return { handlers: {}, on(value) { this.handlers = value; return this; }, addTo(map) { this.map = map; map.layers.add(this); queueMicrotask(() => this.handlers.load?.()); return this; }, remove() { this.map.layers.delete(this); this.handlers.remove?.(); }, redraw() { queueMicrotask(() => this.handlers.load?.()); } };
    }
  };
  window.eval(code);
  const $ = selector => document.querySelector(selector);
  return { dom, window, document, $, errors, markers,
    click(selector) { assert.ok($(selector), 'control exists: ' + selector); $(selector).click(); },
    ids() { return [...document.querySelectorAll('[data-restaurant-id]')].map(node => node.dataset.restaurantId).sort(); },
    search(value) { $('#search').value = value; $('#search-form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); },
    change(selector, value) { $(selector).value = value; $(selector).dispatchEvent(new window.Event('change', { bubbles: true })); }
  };
}

(async () => {
  const f = fixture();
  try {
    await until(() => Number(f.$('#result-count').dataset.total) > 0, 'restaurant data loads');
    assert.equal(f.$('[data-guide="both"]'), null, 'the former combined-guide button is removed');
    assert.equal(f.$('#guides').lastElementChild.dataset.guide, 'broadcast', 'broadcast occupies the former last filter position');
    assert.equal(f.$('#broadcast-only'), null, 'no additional broadcast shortcut changes the recommendation layout');
    f.click('#filter-toggle'); f.click('[data-guide="broadcast"]');
    assert.deepEqual(f.ids(), ['broadcast-existing-id', 'broadcast-only-id', 'literal-broadcast-id']);
    assert.equal(f.$('[data-guide="broadcast"]').getAttribute('aria-pressed'), 'true');
    assert.equal(f.$('#broadcast-note').hidden, false);
    assert.equal(f.$('[data-restaurant-id="broadcast-existing-id"] .is-ribbon').textContent, '블루리본 선정 이력');
    assert.equal(f.document.querySelectorAll('[data-restaurant-id="broadcast-existing-id"] .is-broadcast').length, 1, 'multiple episodes do not duplicate a program badge');
    assert.equal(f.$('[data-restaurant-id="broadcast-only-id"] .is-ribbon'), null, 'broadcast-only records have no fabricated guide badge');
    f.click('[data-restaurant-id="broadcast-existing-id"] .card-main');
    assert.equal(f.$('#detail-title').textContent, '방송겸선정식당');
    assert.equal(f.document.querySelectorAll('.broadcast-sources .source-item').length, 2, 'each sourced appearance remains in the detail');
    assert.match(f.$('.broadcast-sources').textContent, /SBS · 52회 · 2025.03.12 방영/);
    assert.match(f.$('.broadcast-sources').textContent, /SBS · 53회 · 방영일 미확인/);
    assert.match(f.$('.broadcast-sources').textContent, /출처 확인일 2026.11.11/);
    assert.equal(f.$('.broadcast-sources .source-link').href, broadcast.sourceUrl);
    assert.equal(f.$('.detail-body > .source-list .is-ribbon').textContent, '블루리본 선정 이력');
    f.click('#close-detail');
    f.search('KBS'); assert.deepEqual(f.ids(), ['broadcast-only-id'], 'broadcaster search works');
    f.search('알파식탁'); assert.deepEqual(f.ids(), ['broadcast-existing-id'], 'program search works');
    f.search(''); f.change('#region', '부산'); assert.deepEqual(f.ids(), ['broadcast-only-id'], 'broadcast and region filters intersect');
    f.change('#category', '한식'); assert.deepEqual(f.ids(), [], 'food categories still filter broadcast entries');
    f.click('#reset'); f.click('[data-guide="broadcast"]');
    f.click('#show-map'); await until(() => f.markers.size === 1, 'only verified broadcast coordinates are mapped');
    assert.match([...f.markers][0].tooltip.textContent, /방송 · 알파식탁/);
    f.click('#show-list');
    f.click('[data-restaurant-id="broadcast-existing-id"] .save-button'); f.click('#saved-only');
    assert.deepEqual(f.ids(), ['broadcast-existing-id'], 'broadcast filtering shares the original saved restaurant ID');
    assert.deepEqual(JSON.parse(f.window.localStorage.getItem('ojjuda-certified-restaurants-saved-v1')), ['broadcast-existing-id']);
    f.click('#saved-only'); f.click('[data-guide="blue-ribbon"]');
    assert.ok(f.ids().includes('broadcast-existing-id') && !f.ids().includes('broadcast-only-id'), 'guide filters keep their independent meaning');
    f.click('[data-guide="broadcast"]'); f.click('[data-restaurant-id="literal-broadcast-id"] .card-main');
    assert.equal(f.$('.broadcast-sources img,.broadcast-sources script'), null, 'source strings are rendered as text');
    assert.match(f.$('.broadcast-sources').textContent, /방영일 미확인/);
    assert.deepEqual(f.errors, []);
  } finally { f.dom.window.close(); }
  const direct = fixture('?guide=broadcast');
  try {
    await until(() => direct.$('#result-count').dataset.total === '3', 'direct broadcast entry filters on load');
    assert.equal(direct.$('[data-guide="broadcast"]').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(direct.errors, []);
  } finally { direct.dom.window.close(); }
  console.log('PASS: broadcast source validation, replacement filter, program/channel search, category/region filters, saved IDs, map coordinates/tooltips, separate guide and broadcast details, unknown dates, safe DOM/URLs and direct entry.');
})().catch(error => { console.error(error); process.exitCode = 1; });
