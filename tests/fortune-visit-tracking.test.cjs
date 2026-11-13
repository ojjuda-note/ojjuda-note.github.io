const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { test } = require('node:test');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const tracker = () => read('shared/analytics/site-usage.js');
const KEY = 'ojjuda.site-usage.v1';
const NOW = Date.parse('2026-11-13T03:00:00Z');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const services = [
  { feature: 'tarot', directory: 'moonlit-tarot' },
  { feature: 'saju', directory: 'starlit-saju' }
];
const settle = async () => { await new Promise(resolve => setImmediate(resolve)); await new Promise(resolve => setImmediate(resolve)); };
const success = now => ({ data: {
  ok: true,
  day: new Date(now + 9 * 3600000).toISOString().slice(0, 10),
  server_now: new Date(now).toISOString()
} });

function page(t, options = {}) {
  const storage = options.storage || new Map();
  const calls = options.calls || [];
  const now = options.now ?? NOW;
  const dom = new JSDOM(options.html || '<main></main>', {
    url: 'https://ojjuda.kr' + (options.path || '/games/moonlit-tarot/'),
    referrer: options.referrer || 'https://ojjuda.kr/world.html?tab=hub',
    runScripts: 'outside-only', pretendToBeVisual: true
  });
  t.after(() => dom.window.close());
  const w = dom.window;
  w.Date.now = () => now;
  Object.defineProperty(w.crypto, 'randomUUID', { configurable: true, value: randomUUID });
  Object.defineProperty(w, 'localStorage', { configurable: true, value: {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
    removeItem(key) { storage.delete(key); },
    clear() { storage.clear(); },
    key(index) { return [...storage.keys()][index] ?? null; },
    get length() { return storage.size; }
  } });
  const visibility = { hidden: options.hidden === true };
  Object.defineProperty(w.document, 'hidden', { configurable: true, get: () => visibility.hidden });
  Object.defineProperty(w.navigator, 'doNotTrack', { configurable: true, value: options.dnt || null });
  Object.defineProperty(w.navigator, 'globalPrivacyControl', { configurable: true, value: options.gpc === true });
  w.OjjudaAdminPreview = { isEnabled: () => options.preview === true };
  const client = { rpc: async (name, args) => {
    calls.push({ name, args: JSON.parse(JSON.stringify(args)) });
    return options.respond ? options.respond(name, args, calls.length) : success(now);
  } };
  w.eval(tracker());
  return { w, calls, storage, client, visibility, configure: () => w.OjjudaSiteUsage.configure({ client }) };
}

function features(calls) {
  return calls.filter(call => call.name === 'record_site_usage' && call.args.p_event === 'feature')
    .map(call => call.args.p_feature);
}

test('only the six exact tarot/saju entry paths identify their service after initialization', async t => {
  for (const { feature, directory } of services) {
    for (const suffix of ['', '/', '/index.html']) {
      const entry = '/games/' + directory + suffix;
      const fixture = page(t, { path: entry + '?utm_source=private-campaign#private-reading' });
      await settle();
      assert.equal(fixture.calls.length, 0, 'loading the analytics asset alone cannot record an uninitialized page');
      fixture.configure(); await settle();
      assert.deepEqual(fixture.calls.map(call => call.args.p_event), ['visit', 'feature'], entry);
      assert.deepEqual(features(fixture.calls), [feature], entry);
      assert.equal(fixture.calls[0].args.p_source, 'campaign');
      assert.equal(fixture.calls[0].args.p_visit_id, fixture.calls[1].args.p_visit_id);
    }
  }
});

test('direct visits, repeated configuration, refreshes and service round trips share one daily visit', async t => {
  const storage = new Map(), calls = [];
  for (const entry of ['/games/moonlit-tarot/', '/games/moonlit-tarot/index.html',
    '/games/starlit-saju/', '/games/moonlit-tarot/', '/games/starlit-saju/index.html']) {
    const fixture = page(t, { path: entry, storage, calls });
    fixture.configure(); fixture.configure(); await settle();
    fixture.w.dispatchEvent(new fixture.w.Event('pageshow'));
    fixture.w.document.dispatchEvent(new fixture.w.Event('visibilitychange'));
    await settle();
    fixture.w.close();
  }
  assert.equal(calls.filter(call => call.args.p_event === 'visit').length, 1);
  assert.deepEqual(features(calls), ['tarot', 'saju']);
  assert.equal(new Set(calls.map(call => call.args.p_visit_id)).size, 1);
  const saved = JSON.parse(storage.get(KEY));
  assert.deepEqual([...saved.sent].sort(), ['saju', 'tarot', 'visit']);
});

test('a new Korean calendar date creates a new visit token and allows each service once again', async t => {
  const storage = new Map(), calls = [];
  const beforeMidnight = page(t, { storage, calls, now: Date.parse('2026-11-13T14:59:59Z') });
  beforeMidnight.configure(); await settle(); beforeMidnight.w.close();
  const afterMidnight = page(t, { storage, calls, now: Date.parse('2026-11-13T15:00:00Z') });
  afterMidnight.configure(); await settle();
  assert.deepEqual(calls.map(call => call.args.p_event), ['visit', 'feature', 'visit', 'feature']);
  assert.deepEqual(features(calls), ['tarot', 'tarot']);
  assert.notEqual(calls[0].args.p_visit_id, calls[2].args.p_visit_id);
  assert.equal(JSON.parse(storage.get(KEY)).day, '2026-11-14');
});

test('similar paths and uncompleted entrance clicks do not count tarot or saju visits', async t => {
  for (const entry of ['/games/moonlit-tarot-copy/', '/games/starlit-saju/extra.html',
    '/archive/games/moonlit-tarot/index.html', '/games/starlit-saju/index.html/',
    '/world.html?game=tarot', '/world.html?game=saju']) {
    const fixture = page(t, { path: entry }); fixture.configure(); await settle();
    assert.equal(features(fixture.calls).some(feature => ['tarot', 'saju'].includes(feature)), false, entry);
  }
  const fixture = page(t, { path: '/world.html?tab=hub', html:
    '<a class="agit-tarot-banner" href="/games/moonlit-tarot/">타로</a>' +
    '<a class="agit-saju-banner" href="/games/starlit-saju/">사주</a>' });
  fixture.w.document.addEventListener('click', event => event.preventDefault());
  fixture.configure(); await settle();
  const before = fixture.calls.length;
  fixture.w.document.querySelector('.agit-tarot-banner').click();
  fixture.w.document.querySelector('.agit-saju-banner').click();
  await settle();
  assert.equal(fixture.calls.length, before, 'a blocked or cancelled navigation cannot become a completed service visit');
});

test('administrator preview, Do Not Track and Global Privacy Control send no analytics', async t => {
  for (const mode of [{ preview: true }, { dnt: '1' }, { gpc: true }]) {
    for (const { feature, directory } of services) {
      const fixture = page(t, { ...mode, path: '/games/' + directory + '/' });
      fixture.configure();
      fixture.w.OjjudaSiteUsage.track('feature', feature);
      fixture.w.dispatchEvent(new fixture.w.Event('online'));
      fixture.w.dispatchEvent(new fixture.w.Event('pageshow'));
      fixture.w.document.dispatchEvent(new fixture.w.Event('visibilitychange'));
      await settle();
      assert.equal(fixture.calls.length, 0, JSON.stringify(mode) + ': ' + feature);
      assert.equal(fixture.storage.has(KEY), false, 'excluded visits do not create daily analytics identifiers');
    }
  }
});

test('a hidden page is excluded until it becomes visible, then counts only once', async t => {
  const fixture = page(t, { path: '/games/starlit-saju/', hidden: true });
  fixture.configure(); fixture.w.dispatchEvent(new fixture.w.Event('pageshow')); await settle();
  assert.equal(fixture.calls.length, 0);
  assert.equal(fixture.storage.has(KEY), false);
  fixture.visibility.hidden = false;
  fixture.w.document.dispatchEvent(new fixture.w.Event('visibilitychange')); await settle();
  assert.deepEqual(fixture.calls.map(call => call.args.p_event), ['visit', 'feature']);
  assert.deepEqual(features(fixture.calls), ['saju']);
  fixture.visibility.hidden = true;
  fixture.configure(); await settle();
  fixture.visibility.hidden = false;
  fixture.w.document.dispatchEvent(new fixture.w.Event('visibilitychange')); await settle();
  assert.equal(fixture.calls.length, 2);
});

test('failed initial requests are retried without marking visits delivered or changing their token', async t => {
  for (const failure of ['rpc-error', 'network-error', 'unconfirmed']) {
    const fixture = page(t, { respond: (_name, _args, attempt) => {
      if (attempt > 1) return success(NOW);
      if (failure === 'network-error') throw new Error('synthetic offline');
      return failure === 'rpc-error' ? { error: { message: 'synthetic unavailable' } } : { data: { ok: false } };
    } });
    fixture.configure(); await settle();
    assert.equal(fixture.calls.length, 1, 'failure stops the queue until a retry trigger');
    assert.deepEqual(JSON.parse(fixture.storage.get(KEY)).sent, []);
    fixture.configure(); await settle();
    assert.equal(fixture.calls.length, 1, 'reconfiguration respects retry backoff');
    fixture.w.dispatchEvent(new fixture.w.Event('online')); await settle();
    assert.deepEqual(fixture.calls.map(call => call.args.p_event), ['visit', 'visit', 'feature']);
    assert.equal(new Set(fixture.calls.map(call => call.args.p_visit_id)).size, 1);
    assert.deepEqual(features(fixture.calls), ['tarot']);
    fixture.configure(); await settle();
    assert.equal(fixture.calls.length, 3, 'successful retries are remembered across further initialization');
  }
});

test('a failed service request retries only that feature after the site visit was accepted', async t => {
  const fixture = page(t, { path: '/games/starlit-saju/', respond: (_name, _args, attempt) =>
    attempt === 2 ? { error: { message: 'synthetic feature failure' } } : success(NOW) });
  fixture.configure(); await settle();
  assert.deepEqual(JSON.parse(fixture.storage.get(KEY)).sent, ['visit']);
  fixture.w.dispatchEvent(new fixture.w.Event('online')); await settle();
  assert.deepEqual(fixture.calls.map(call => call.args.p_event), ['visit', 'feature', 'feature']);
  assert.deepEqual(features(fixture.calls), ['saju', 'saju']);
  assert.equal(fixture.calls.filter(call => call.args.p_event === 'visit').length, 1);
  assert.deepEqual([...JSON.parse(fixture.storage.get(KEY)).sent].sort(), ['saju', 'visit']);
});

test('telemetry carries only the daily random token, event, service and source category', async t => {
  const secrets = ['PRIVATE-BIRTH-19800101', 'PRIVATE-CARDS-1-2-3', 'PRIVATE-READING',
    'PRIVATE-ACCOUNT-ID', 'PRIVATE-PURCHASE-ID', 'PRIVATE-CHART-KEY'];
  const storage = new Map([['synthetic-private-billing-record', JSON.stringify(secrets)]]);
  const fixture = page(t, { storage,
    path: '/games/starlit-saju/index.html?birth=' + secrets[0] + '&purchase=' + secrets[4] + '#' + secrets[5],
    referrer: 'https://search.naver.com/search.naver?query=' + secrets[1],
    html: '<input name="birth" value="' + secrets[0] + '"><div data-cards="' + secrets[1] + '">' + secrets[2] + '</div>'
  });
  fixture.w.syntheticMember = { id: secrets[3], receipt: secrets[4], coins: 1234567 };
  fixture.configure(); await settle();
  assert.equal(fixture.calls.length, 2);
  for (const call of fixture.calls) {
    assert.equal(call.name, 'record_site_usage');
    assert.deepEqual(Object.keys(call.args).sort(), ['p_event', 'p_feature', 'p_source', 'p_visit_id']);
    assert.match(call.args.p_visit_id, UUID);
    assert.ok(['visit', 'feature'].includes(call.args.p_event));
    assert.equal(call.args.p_feature, call.args.p_event === 'feature' ? 'saju' : null);
    assert.equal(call.args.p_source, call.args.p_event === 'visit' ? 'naver' : null);
  }
  const transmitted = JSON.stringify(fixture.calls);
  for (const secret of secrets) assert.equal(transmitted.includes(secret), false, secret);
  assert.doesNotMatch(transmitted, /1234567|https?:\/\/|birth|cards|receipt|chart_key|user_id|purchase/i);
  assert.equal(storage.get('synthetic-private-billing-record'), JSON.stringify(secrets));
});

test('standalone pages load analytics before the app and configure only after billing initialization', () => {
  for (const { directory } of services) {
    const html = new JSDOM(read('games/' + directory + '/index.html'));
    try {
      const scripts = [...html.window.document.querySelectorAll('script[src]')];
      const usage = scripts.filter(script => script.getAttribute('src').split('?')[0] === '/shared/analytics/site-usage.js');
      const app = scripts.find(script => /^\.\/app\.js(?:\?|$)/.test(script.getAttribute('src')));
      assert.equal(usage.length, 1, directory + ' loads one shared analytics asset');
      assert.ok(app, directory + ' keeps its existing application entry');
      assert.ok(scripts.indexOf(usage[0]) < scripts.indexOf(app), directory + ' analytics is available before app initialization');
      assert.equal(usage[0].hasAttribute('async'), false, 'analytics cannot race ahead of its initialization contract');
      assert.match(usage[0].getAttribute('src'), /\?v=[^&]+/, 'a cache version is required for the new path mappings');
      const source = read('games/' + directory + '/app.js');
      assert.match(source, /await\s+billing\.init\(\)\s*;\s*recordFortuneVisit\(\)\s*;/,
        'a failed or pending billing initialization cannot reach visit configuration');
      assert.match(source, /OjjudaSiteUsage\?\.configure\(\{\s*client:\s*billing\.client\s*\}\)/);
      assert.doesNotMatch(source, /OjjudaSiteUsage[^;\n]*\btrack\(/, 'service visits are initialized automatically, not attached to purchase actions');
    } finally { html.window.close(); }
  }
});

test('actual callers skip preview initialization and enable visits only after a ready normal-mode transition', () => {
  for (const { feature, directory } of services) {
    const source = read('games/' + directory + '/app.js');
    const helper = source.match(/function recordFortuneVisit\(\)\s*\{[\s\S]*?\n\}/)?.[0];
    assert.ok(helper, directory + ' has an isolated, guarded visit initializer');
    const calls = [], client = {};
    const sandbox = {
      billing: { client: null, adminPreview: false },
      window: { OjjudaSiteUsage: { configure(options) { calls.push(options); } } },
      clearTimeout() {}, readingExpiryTimer: null, billingReady: false,
      billingInitialized: false, billingMode: false,
      updatePaymentStatus() {}, updateBillingStatus() {}, reset() {},
      resetAfterAccountChange() {}, showToast() {}, refreshReadingAvailability() {}
    };
    vm.createContext(sandbox);
    vm.runInContext(helper, sandbox);
    sandbox.recordFortuneVisit();
    assert.equal(calls.length, 0, 'an unavailable client is never configured');
    sandbox.billing.client = client; sandbox.billing.adminPreview = true;
    sandbox.recordFortuneVisit();
    assert.equal(calls.length, 0, 'preview initialization cannot queue telemetry for later delivery');
    sandbox.billing.adminPreview = false;
    let modeChange;
    if (feature === 'tarot') {
      const modeSource = source.match(/function handleBillingModeChange\(\)\s*\{[\s\S]*?\n\}/)?.[0];
      assert.ok(modeSource);
      vm.runInContext(modeSource, sandbox);
      modeChange = () => sandbox.handleBillingModeChange();
    } else {
      const body = source.match(/onModeChange:\s*\(\{adminPreview\}\)\s*=>\s*\{([\s\S]*?)\n\s{6}\}/)?.[1];
      assert.ok(body);
      vm.runInContext('function handleModeChange({adminPreview}) {' + body + '\n}', sandbox);
      modeChange = () => sandbox.handleModeChange({ adminPreview: sandbox.billing.adminPreview });
    }
    modeChange();
    assert.equal(calls.length, 0, 'mode notification before initialization is not a completed visit');
    sandbox.billingReady = true; sandbox.billingInitialized = true;
    sandbox.billing.adminPreview = true; modeChange();
    assert.equal(calls.length, 0, 'ready preview mode remains excluded');
    sandbox.billing.adminPreview = false; modeChange();
    assert.equal(calls.length, 1, 'a ready switch to normal mode begins visit tracking');
    assert.equal(calls[0].client, client);
    assert.deepEqual(Object.keys(calls[0]), ['client']);
    sandbox.window.OjjudaSiteUsage.configure = () => { throw new Error('synthetic analytics failure'); };
    assert.doesNotThrow(() => sandbox.recordFortuneVisit(), 'analytics failure cannot break a reading');
    sandbox.window.OjjudaSiteUsage = undefined;
    assert.doesNotThrow(() => sandbox.recordFortuneVisit(), 'a missing optional analytics asset cannot break a reading');
  }
});
