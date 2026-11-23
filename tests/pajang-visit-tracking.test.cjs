const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const NOW = Date.parse('2026-11-21T08:00:00Z');
const TODAY = '2026-11-21';
const settle = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
const features = calls => calls.filter(call => call.args?.p_event === 'feature').map(call => call.args.p_feature);

function page(t, options = {}) {
  const entry = options.path || '/features/pajang/';
  const embedded = options.embed === true;
  const dom = new JSDOM(embedded
    ? `<dialog class="agit-pajang-dialog" ${options.open === false ? '' : 'open'}><iframe src="${entry}"></iframe></dialog>`
    : '<main></main>', { url: 'https://ojjuda.kr' + (embedded ? '/world.html' : entry), runScripts: 'outside-only', pretendToBeVisual: true });
  t.after(() => dom.window.close());
  const host = embedded ? dom.window : null;
  const w = embedded ? host.document.querySelector('iframe').contentWindow : dom.window;
  const calls = options.calls || [], storage = options.storage || new Map();
  const state = { hidden: options.hidden === true, preview: options.preview === true,
    ownClients: 0, hostClients: 0, resolveClient: null };
  w.Date.now = () => NOW;
  Object.defineProperty(w.crypto, 'randomUUID', { configurable: true, value: randomUUID });
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => state.hidden });
  Object.defineProperty(w.navigator, 'doNotTrack', { configurable: true, value: options.dnt ? '1' : null });
  Object.defineProperty(w.navigator, 'globalPrivacyControl', { configurable: true, value: options.gpc === true });
  Object.defineProperty(w, 'localStorage', { configurable: true, value: {
    getItem: key => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value))
  } });
  (host || w).OjjudaAdminPreview = { isEnabled: () => state.preview };
  const db = { rpc: async (name, args) => {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    return { data: { ok: true, day: TODAY, server_now: new Date(NOW).toISOString() } };
  } };
  const getClient = () => options.delayedClient ? new Promise(resolve => { state.resolveClient = () => resolve(db); }) : Promise.resolve(db);
  w.OjjudaGetClient = () => { state.ownClients++; return getClient(); };
  if (host) host.OjjudaGetClient = () => { state.hostClients++; return getClient(); };
  w.eval(read('shared/analytics/site-usage.js'));
  const memberClient = new w.Function(read('features/pajang/member.mjs').replace(/^export /gm, '') + '\nreturn client;')();
  const usage = read('features/pajang/usage.mjs').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const install = new w.Function('client', usage + '\nreturn installPajangUsage;')(memberClient);
  return { w, host, db, calls, storage, state, install,
    configure: () => w.OjjudaSiteUsage.configure({ client: db }),
    dialog: () => host?.document.querySelector('dialog') };
}

test('entry, member station and old feed paths identify Pajang without sending private URL contents', async t => {
  for (const suffix of ['', '/', '/index.html', '/station.html', '/feed.html']) {
    const f = page(t, { path: '/features/pajang' + suffix + '?person=PRIVATE-NAME#PRIVATE-ANSWER' });
    f.install(); await settle();
    assert.deepEqual(f.calls.map(call => call.args.p_event), ['visit', 'feature']);
    assert.deepEqual(features(f.calls), ['pajang']);
    assert.equal(f.state.ownClients, 1, 'uses the existing shared client getter');
    for (const call of f.calls) {
      assert.equal(call.name, 'record_site_usage');
      assert.deepEqual(Object.keys(call.args).sort(), ['p_event', 'p_feature', 'p_source', 'p_visit_id']);
    }
    assert.doesNotMatch(JSON.stringify(f.calls), /PRIVATE|person|answer/i);
  }
});

test('opening Pajang after Agit and moving between entry and station shares the daily dedup record', async t => {
  const calls = [], storage = new Map();
  const hub = page(t, { path: '/world.html?tab=hub', calls, storage });
  hub.configure(); await settle();
  for (const entry of ['/features/pajang/', '/features/pajang/station.html#nearby', '/features/pajang/index.html']) {
    const f = page(t, { path: entry, calls, storage });
    f.install(); await settle();
    f.w.dispatchEvent(new f.w.Event('pageshow')); await settle();
  }
  assert.equal(calls.filter(call => call.args.p_event === 'visit').length, 1);
  assert.deepEqual(features(calls), ['agit', 'pajang']);
  assert.equal(new Set(calls.map(call => call.args.p_visit_id)).size, 1);
});

test('an embedded Pajang entry waits for its dialog and reuses the host client', async t => {
  const f = page(t, { path: '/features/pajang/?embed=1', embed: true, open: false });
  f.install(); await settle();
  assert.equal(f.calls.length, 0);
  assert.equal(f.state.hostClients, 0, 'a closed preloaded dialog is not a visit');
  f.dialog().setAttribute('open', ''); await settle();
  assert.deepEqual(features(f.calls), ['pajang']);
  assert.equal(f.state.hostClients, 1);
  assert.equal(f.state.ownClients, 0, 'no second auth client is created for the embedded entry');
  f.dialog().removeAttribute('open'); await settle();
  f.dialog().setAttribute('open', ''); await settle();
  assert.equal(f.calls.length, 2, 'reopening does not duplicate the daily visit or feature');
});

test('closing an embedded dialog during client startup cannot record the closed page', async t => {
  const f = page(t, { path: '/features/pajang/?embed=1', embed: true, delayedClient: true });
  f.install(); await settle();
  assert.equal(f.state.hostClients, 1);
  f.dialog().removeAttribute('open');
  f.state.resolveClient(); await settle();
  assert.equal(f.calls.length, 0);
  f.dialog().setAttribute('open', ''); await settle();
  assert.deepEqual(features(f.calls), ['pajang']);
  assert.equal(f.state.hostClients, 1, 'the resolved client is reused when the page is visible again');
});

test('privacy choices and administrator preview prevent Pajang aggregate requests', async t => {
  for (const options of [{ dnt: true }, { gpc: true }, { preview: true }, { preview: true, embed: true }]) {
    const f = page(t, { path: '/features/pajang/?embed=1', ...options });
    f.install(); await settle();
    f.w.dispatchEvent(new f.w.Event('online')); await settle();
    assert.equal(f.calls.length, 0, JSON.stringify(options));
  }
});

test('a hidden standalone page starts collection only after it becomes visible', async t => {
  const f = page(t, { hidden: true });
  f.install(); await settle();
  assert.equal(f.calls.length, 0);
  f.state.hidden = false;
  f.w.document.dispatchEvent(new f.w.Event('visibilitychange')); await settle();
  assert.deepEqual(features(f.calls), ['pajang']);
});

function adminPage(t, report, legacyFeatures = []) {
  const dom = new JSDOM('<main id="host"></main>', { url: 'https://ojjuda.kr/world.html?admin=visitors', runScripts: 'outside-only' });
  const w = dom.window, host = w.document.querySelector('#host');
  const dayRows = Array.from({ length: 30 }, (_, i) => ({
    period: new Date(Date.parse(TODAY) - (29 - i) * 86400000).toISOString().slice(0, 10), visits: 0
  }));
  const stats = { started_at: '2026-11-11T00:00:00Z', today_date: TODAY, today: 0, month: 0, total: 0,
    daily: dayRows, hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, visits: 0 })),
    weekday: Array.from({ length: 7 }, (_, i) => ({ day: i + 1, visits: 0 })),
    features: legacyFeatures,
    sources: ['direct', 'naver', 'google', 'search', 'social', 'external', 'internal', 'campaign'].map(source => ({ source, visits: 0 })),
    guest_games: [], guest_boards: [], agit_details: [], arcade_details: [], pajang_visits: report };
  w.eval(read('admin/visitors.js'));
  const controller = w.OjjudaAdminVisitors.mount({ container: host, getAdminId: () => 'fixture-admin', client: {
    rpc: async name => name === 'admin_guest_visit_stats'
      ? { data: { today: 0, month: 0, total: 0, started_at: stats.started_at, daily: [], monthly: [] } }
      : name === 'admin_site_usage_stats' ? { data: stats } : { error: { message: 'unavailable' } }
  } });
  t.after(() => { controller.destroy(); dom.window.close(); });
  return host;
}

test('Pajang is shown beside all twelve popular features with the same graph scale', async t => {
  const keys = ['agit', 'arcade', 'park', 'settings', 'portal', 'group', 'fanpages', 'restaurants', 'festival', 'game_stacker', 'game_mole', 'game_runner'];
  const host = adminPage(t, { started_at: '2026-11-21T05:00:00Z', uses: 1 }, keys.map((feature, i) => ({ feature, uses: 100 - i })));
  await settle();
  const chart = host.querySelector('[data-chart="features"]');
  assert.equal(chart.querySelectorAll('.visitor-rank-row').length, 13);
  const row = chart.querySelector('[data-feature="pajang"]');
  assert.equal(row.querySelector('span').textContent, '파장');
  assert.equal(row.querySelector('strong').textContent, '1회');
  assert.equal(row.querySelector('.visitor-rank-fill').style.width, '1%');
  assert.equal(host.querySelectorAll('.visitor-chart-col').length, 61, 'existing time graphs remain available');
});

test('a valid zero Pajang count stays visible, but absent or invalid data never becomes a fabricated zero', async t => {
  const valid = adminPage(t, { started_at: '2026-11-21T05:00:00Z', uses: 0 });
  await settle();
  assert.equal(valid.querySelector('[data-feature="pajang"] strong').textContent, '0회');
  for (const report of [undefined, null, { started_at: 'invalid', uses: 0 },
    { started_at: '2026-11-22T00:00:00Z', uses: 0 }, ...[-1, '1', null, 0.5].map(uses => ({ started_at: '2026-11-21T05:00:00Z', uses }))]) {
    const host = adminPage(t, report, [{ feature: 'arcade', uses: 2 }]);
    await settle();
    assert.equal(host.querySelector('[data-feature="pajang"]'), null);
    assert.equal(host.querySelector('[data-feature="arcade"] strong').textContent, '2회');
    assert.equal(host.querySelectorAll('.visitor-chart-col').length, 61);
  }
});

test('both published Pajang pages load the updated optional measurement module and config', () => {
  for (const file of ['index.html', 'station.html']) {
    const html = read('features/pajang/' + file);
    assert.match(html, /shell\.mjs\?v=20261123-[a-z0-9-]+/);
    assert.match(html, /\/config\.js\?v=20261121-pajang-visits1/);
  }
  assert.match(read('features/pajang/shell.mjs'), /import\('\.\/usage\.mjs\?v=20261121-pajang-visits1'\)/);
});
