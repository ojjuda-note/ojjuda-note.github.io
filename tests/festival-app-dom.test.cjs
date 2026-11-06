/* DOM behavior only: real app/core/HTML, without a browser or external requests. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM, VirtualConsole } = require('jsdom');

const directory = path.resolve(__dirname, '../games/festival-schedule');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(directory, 'app.js'), 'utf8');
const core = fs.readFileSync(path.join(directory, 'core.js'), 'utf8');
const coreNames = [...core.matchAll(/^export (?:const|function) (\w+)/gm)].map(match => match[1]);
const savedKey = 'ojjuda.festival.saved.v1';
const common = {
  region: '서울', city: '', venue: '장소 발표 전', address: '', lat: null, lng: null,
  status: 'scheduled', sourceUrl: 'https://official.example.test/festival',
  sourceName: '주최 측 공식 안내', sourceCheckedAt: '2026-11-03', summary: '공식 개최 계획',
  scheduleNote: '세부 시간 추후 안내', accessNote: '입장 안내 추후 공개'
};
const records = [
  { ...common, id: 'confirmed', title: '날짜 확정 축제', category: 'local', start: '2026-11-04', end: '2026-11-06', lat: 37.57, lng: 126.98, venue: '확정 행사장' },
  { ...common, id: 'undated-film', title: '날짜 미정 영화제', category: 'film', start: null, end: null, dateStatus: 'undecided', dateNote: '2026년 12월 예정 · 날짜 미정' },
  { ...common, id: 'undated-campus', title: '날짜 미정 대학축제', category: 'campus', start: null, end: null, dateStatus: 'undecided', dateNote: '2027년 개최 준비 중' },
  { ...common, id: 'ended', title: '지난 축제', category: 'local', start: '2026-10-01', end: '2026-10-03' }
];

async function fixture(t, { query = '', saved = [], embedded = false } = {}) {
  const errors = [], virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', error => errors.push(error.message));
  virtualConsole.on('warn', (...messages) => errors.push(messages.join(' ')));
  const dom = new JSDOM(html, {
    url: `https://fixture.test/games/festival-schedule/index.html${query}`,
    runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole
  });
  if (embedded) dom.reconfigure({ windowTop: {} });
  const { window } = dom;
  t.after(() => { window.close(); assert.deepEqual(errors, [], 'no runtime errors or failed data loads'); });
  const NativeDate = window.Date;
  window.Date = class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : ['2026-11-03T03:00:00Z'])); }
    static now() { return NativeDate.parse('2026-11-03T03:00:00Z'); }
  };
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  window.localStorage.setItem(savedKey, JSON.stringify(saved));
  const requests = [];
  window.fetch = async requested => {
    const url = new URL(String(requested));
    requests.push(url.href);
    assert.equal(url.href, 'https://fixture.test/games/festival-schedule/events.json');
    return { ok: true, json: async () => ({ updatedAt: '2026-11-03', events: structuredClone(records) }) };
  };
  // Keep all core date operations in the same realm as the app's fixed Date.
  const context = dom.getInternalVMContext();
  window.__festivalCore = vm.runInContext(`(() => {\n${core.replace(/^export /gm, '')}\nreturn { ${coreNames.join(', ')} };\n})()`, context);
  const code = app
    .replace(/^import\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"];?/, 'const {$1} = window.__festivalCore;')
    .replace(/import\.meta\.url/g, "'https://fixture.test/games/festival-schedule/app.js'");
  await vm.runInContext(`(async () => {\n${code}\n})()`, context, { filename: 'festival-app-under-test.js' });
  assert.equal(requests.length, 1, 'Leaflet fallback leaves data browsing available without external fetches');
  const $ = selector => window.document.querySelector(selector);
  const click = selector => { const node = $(selector); assert.ok(node, `${selector} exists`); node.click(); };
  const change = (selector, value) => { $(selector).value = value; $(selector).dispatchEvent(new window.Event('change', { bubbles: true })); };
  const ids = () => [...window.document.querySelectorAll('#event-list [data-event-card]')].map(node => node.dataset.eventCard).sort();
  return { window, $, click, change, ids, query: () => new URLSearchParams(window.location.search) };
}

test('initial load retains officially planned records with null dates and no map coordinates', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.ids(), ['confirmed', 'undated-campus', 'undated-film']);
  assert.equal(f.$('#result-count').textContent, '3');
  assert.match(f.$('[data-event-card="undated-film"]').textContent, /2026년 12월 예정 · 날짜 미정/);
  assert.match(f.$('[data-event-card="undated-campus"]').textContent, /2027년 개최 준비 중/);
  assert.doesNotMatch(f.$('#event-list').textContent, /Invalid Date|undefined|NaN/);
  assert.equal(f.$('#planning-bar').hidden, false);
  assert.match(f.$('#undecided-toggle').textContent, /2개/);
  assert.equal(f.$('#location-note').hidden, false);
  assert.match(f.$('#location-note').textContent, /지도 위치 확인 전 2개/);
});

test('both the undecided shortcut and period selector show only undated records', async t => {
  const f = await fixture(t);
  f.click('#undecided-toggle');
  assert.deepEqual(f.ids(), ['undated-campus', 'undated-film']);
  assert.equal(f.$('#workspace').dataset.view, 'list');
  assert.equal(f.$('#period').value, 'undecided');
  assert.equal(f.query().get('period'), 'undecided');
  f.click('#view-map');
  assert.equal(f.query().get('view'), 'map', 'undecided maps retain an explicit view in share/reload routes');
  const reloaded = await fixture(t, { query: f.window.location.search });
  assert.equal(reloaded.$('#workspace').dataset.view, 'map');
  f.click('#undecided-toggle');
  assert.equal(f.$('#period').value, 'upcoming');
  assert.ok(f.ids().includes('confirmed'));
  f.change('#period', 'undecided');
  f.click('[data-category="performance"]');
  assert.deepEqual(f.ids(), ['undated-film']);
});

test('undated detail shows the official date note and disables calendar export and unknown-location links', async t => {
  const f = await fixture(t);
  f.click('[data-open-event="undated-film"]');
  assert.equal(f.$('#event-dialog').open, true);
  assert.match(f.$('#event-detail').textContent, /2026년 12월 예정 · 날짜 미정/);
  assert.equal(f.$('[data-download-event="undated-film"]').disabled, true);
  assert.equal(f.$('#event-detail .venue-link'), null);
  assert.equal(f.$('#event-detail a[href*="map.naver.com"]'), null);
  assert.ok(f.$('#event-detail a[href="https://official.example.test/festival"]'));
  assert.equal(f.query().get('event'), 'undated-film');
  f.click('[data-action="close-event"]');
  assert.equal(f.$('#event-dialog').open, false);
  assert.equal(f.query().has('event'), false);
});

test('bookmarks persist undated records and the saved view includes them', async t => {
  const f = await fixture(t);
  f.click('[data-save-event="undated-film"]');
  assert.deepEqual(JSON.parse(f.window.localStorage.getItem(savedKey)), ['undated-film']);
  f.change('#period', 'month');
  assert.deepEqual(f.ids(), ['confirmed']);
  f.click('#saved-toggle');
  assert.deepEqual(f.ids(), ['undated-film']);
  assert.equal(f.$('#saved-toggle').getAttribute('aria-pressed'), 'true');
  assert.equal(f.query().get('saved'), '1');
  assert.equal(f.$('#workspace').dataset.view, 'list');
  const reopened = await fixture(t, { query: '?saved=1&period=all&view=list', saved: JSON.parse(f.window.localStorage.getItem(savedKey)) });
  assert.deepEqual(reopened.ids(), ['undated-film']);
});

test('calendar cells exclude undated records but its shortcut opens their list and clears selected dates', async t => {
  const f = await fixture(t);
  f.click('#view-calendar');
  assert.equal(f.$('#calendar-panel').hidden, false);
  assert.deepEqual(f.ids(), ['confirmed']);
  assert.match(f.$('#calendar-grid').textContent, /날짜 확정 축제/);
  assert.doesNotMatch(f.$('#calendar-grid').textContent, /날짜 미정 영화제|날짜 미정 대학축제/);
  f.click('[data-calendar-date="2026-11-04"]');
  assert.equal(f.query().get('date'), '2026-11-04');
  f.click('#undecided-toggle');
  assert.deepEqual(f.ids(), ['undated-campus', 'undated-film']);
  assert.equal(f.$('#workspace').dataset.view, 'list');
  assert.equal(f.query().has('date'), false);
  f.click('#view-calendar');
  assert.equal(f.$('#period').value, 'upcoming');
  assert.deepEqual(f.ids(), ['confirmed']);
});

test('undecided deep links normalize calendar to list and history restores saved detail routes', async t => {
  const f = await fixture(t, { query: '?period=undecided&view=calendar&event=undated-film' });
  assert.equal(f.$('#workspace').dataset.view, 'list');
  assert.deepEqual(f.ids(), ['undated-campus', 'undated-film']);
  assert.equal(f.$('#event-dialog').open, true);
  assert.equal(f.$('#detail-title').textContent, '날짜 미정 영화제');
  f.click('#event-detail [data-save-event="undated-film"]');
  f.click('[data-action="close-event"]');
  f.change('#period', 'month');
  assert.deepEqual(f.ids(), ['confirmed']);
  f.window.history.pushState({}, '', '?period=undecided&view=calendar&saved=1&event=undated-film');
  f.window.dispatchEvent(new f.window.PopStateEvent('popstate'));
  assert.equal(f.$('#workspace').dataset.view, 'list');
  assert.deepEqual(f.ids(), ['undated-film']);
  assert.equal(f.$('#event-dialog').open, true);
  assert.equal(f.$('#saved-toggle').getAttribute('aria-pressed'), 'true');
});


test('visitor size filter and sorting are shareable and excluded from sports', async t => {
 const f=await fixture(t);
 f.click('[data-category="festival"]');
 assert.equal(f.$('#scale-filter').hidden,false);
 f.change('#scale','unknown');
 assert.deepEqual(f.ids(),['confirmed','undated-campus']);
 assert.equal(f.query().get('scale'),'unknown');
 f.change('#scale','over1m');
 assert.deepEqual(f.ids(),[]);
 assert.match(f.$('#event-list').textContent,/공식 방문객 자료/);
 f.change('#scale','all');
 f.change('#sort','scale_desc');
 assert.equal(f.query().get('sort'),'scale_desc');
 f.click('[data-category="sports"]');
 assert.equal(f.$('#scale-filter').hidden,true);
 assert.equal(f.query().get('scale'),null);
 assert.equal(f.query().get('sort'),null);
 const shared=await fixture(t,{query:'?category=festival&scale=unknown&sort=scale_asc&view=list'});
 assert.equal(shared.$('#scale').value,'unknown');
 assert.equal(shared.$('#sort').value,'scale_asc');
 assert.equal(shared.$('#scale-filter').hidden,false);
});
test('festival, sports and performance top-level chips filter events and retain a shareable route', async t => {
  const f = await fixture(t);
  f.click('[data-category="festival"]');
  assert.deepEqual(f.ids(), ['confirmed', 'undated-campus']);
  assert.equal(f.query().get('category'), 'festival');
  f.click('[data-category="performance"]');
  assert.deepEqual(f.ids(), ['undated-film']);
  f.click('[data-category="sports"]');
  assert.deepEqual(f.ids(), []);
  assert.equal(f.query().get('category'), 'sports');
  f.click('[data-category="all"]');
  assert.deepEqual(f.ids(), ['confirmed','undated-campus','undated-film']);
});


test('embedded event details keep the arcade as the previous history entry', async t => {
  for (const embedded of [true, false]) {
    const f = await fixture(t, { embedded });
    const before = f.window.history.length;
    f.click('[data-open-event="confirmed"]');
    assert.equal(f.query().get('event'), 'confirmed');
    assert.equal(f.window.history.length, before + (embedded ? 0 : 1));
  }
});
