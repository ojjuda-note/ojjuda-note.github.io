const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { setImmediate: settle } = require('node:timers/promises');

const root = path.resolve(__dirname, '..');
const pagePath = path.join(root, 'note/rokid-agent/pages/park/index.ink');
const backend = 'https://park-fixture.supabase.co';

function row(id, body, distance, extra = {}) {
  return {
    id, body, distance_band: distance, kind: 'memo', tags: [], reply_count: 0,
    created_at: '2026-01-15T07:00:00.000Z', ...extra
  };
}

const recent = row('10000000-0000-4000-8000-000000000001', '최신 공개 카드', null);
const first = row('20000000-0000-4000-8000-000000000001', '가장 가까운 카드', '근처', { reply_count: 1 });
const second = row('20000000-0000-4000-8000-000000000002', '두 번째 카드', '2km');
const reply = row('30000000-0000-4000-8000-000000000001', '첫 답카드', null, { kind: 'comment', reply_count: 1 });
const nested = row('40000000-0000-4000-8000-000000000001', '답카드에 달린 답', null, { kind: 'comment' });
const fix = () => ({
  coords: { latitude: 37.56654, longitude: 126.97817, accuracy: 8, speed: 3 },
  timestamp: Date.now()
});

test('the packaged app declares the page, internet and geolocation', () => {
  const app = JSON.parse(readFileSync(path.join(root, 'note/rokid-agent/app.json'), 'utf8'));
  assert.ok(app.pages.includes('pages/park/index'));
  assert.ok(app.permissions.includes('INTERNET'));
  assert.ok(app.permissions.includes('GEOLOCATION'));
});

async function openPage({ locate = resolve => resolve(fix()), nearby = [first, second], read } = {}) {
  const requests = [];
  const touches = [];
  const watchers = new Map();
  const timers = new Set();
  const allRows = [first, second, recent, reply, nested];
  const children = new Map([[first.id, [reply]], [reply.id, [nested]]]);
  let page;
  let nextId = 0;

  function schedule() {
    const id = ++nextId;
    timers.add(id);
    return id;
  }

  function json(value, status = 200) {
    return new Response(JSON.stringify(value), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  async function fetchFixture(target, options = {}) {
    const url = new URL(String(target));
    const body = options.body ? JSON.parse(options.body) : {};
    const request = { url, body, headers: new Headers(options.headers), method: options.method || 'GET' };
    requests.push(request);
    if (read) {
      const override = await read(request, json);
      if (override) return override;
    }
    if (url.pathname === '/park/even-public.json') {
      return json({ supabaseUrl: backend, supabaseKey: 'sb_publishable_fixture' });
    }
    if (url.pathname.endsWith('/rpc/list_cards')) {
      return json(body.p_sort === 'nearby' ? nearby : [recent]);
    }
    if (url.pathname.endsWith('/rpc/get_card')) {
      return json(allRows.find(item => item.id === body.p_id) || null);
    }
    if (url.pathname.endsWith('/public_cards')) {
      const parent = (url.searchParams.get('parent_id') || '').replace(/^eq\./, '');
      return json(children.get(parent) || []);
    }
    if (url.pathname.endsWith('/theme-weather')) {
      return json({ source: 'kma', temperature: 0, label: '눈', expiresAt: Date.now() + 60000 });
    }
    throw Error('Unrecognized fixture request ' + url.pathname);
  }

  function register(definition) {
    page = { ...definition, data: structuredClone(definition.data), setData(patch) { Object.assign(this.data, patch); } };
  }

  const navigator = {
    geolocation: {
      getCurrentPosition: (ok, fail, options) => locate(ok, fail, options),
      watchPosition(ok, fail, options) {
        const id = ++nextId;
        watchers.set(id, { ok, fail });
        locate(ok, fail, options);
        return id;
      },
      clearWatch(id) { watchers.delete(id); }
    },
    getBattery: async () => Object.assign(new EventTarget(), { level: 0.52, charging: true })
  };
  const ink = readFileSync(pagePath, 'utf8');
  const pageScript = ink.match(/<script\s+setup\s*>([\s\S]*?)<\/script>/);
  assert.ok(pageScript, 'The AIUI page must contain a setup script');
  const {createSpeedMeter} = await import('../note/rokid-agent/lib/speed.js');
  vm.runInNewContext(pageScript[1].replace(/^import .*?;$/m,'').replace(/\bexport default\b/, 'const definition =') + '\nPage(definition);', {
    createSpeedMeter, Page: register, navigator, fetch: fetchFixture, URL, URLSearchParams, AbortController,
    Date, Intl, setTimeout: schedule, setInterval: schedule, clearTimeout: id => timers.delete(id),
    clearInterval: id => timers.delete(id), console
  }, { filename: pagePath });
  assert.ok(page, 'The Rokid page must register with the runtime');
  page.onLoad?.({});
  page.onShow();
  await settle();

  async function key(code) {
    const e = { code, preventDefault() { touches.push(code); }, stopPropagation() {} };
    page.onKeyUp(e);
    await settle();
  }

  return { page, requests, touches, watchers, timers, key };
}

test('shows nearby public cards, the current KMA cell, speed and battery', async () => {
  const h = await openPage();
  const { data } = h.page;
  assert.equal(data.mode, 'feed');
  assert.equal(data.firstBody, first.body);
  assert.equal(data.secondBody, second.body);
  assert.match(data.firstDistance, /1\s*km/i);
  assert.match(data.secondDistance, /2\s*km/i);
  assert.match(data.weather, /0\s*°/);
  assert.match(data.speed, /10\.8/);
  assert.match(data.battery, /52\s*%/);
  const nearby = h.requests.find(({ body }) => body.p_sort === 'nearby');
  assert.equal(nearby.body.p_radius_m, 30000);
  assert.equal(nearby.body.p_lat, 37.567);
  assert.equal(nearby.body.p_lon, 126.978);
  const weather = h.requests.find(({ url }) => url.pathname.endsWith('/theme-weather'));
  assert.equal(weather.url.searchParams.get('cell'), '60,127');
  assert.deepEqual([...weather.url.searchParams.keys()], ['cell']);
  assert.equal(weather.headers.get('apikey'), 'sb_publishable_fixture');
  assert.ok(h.requests.filter(({ url }) => url.pathname.startsWith('/rest/v1/')).every(({ headers }) =>
    headers.get('accept-profile') === 'ojjuda_note' || headers.get('content-profile') === 'ojjuda_note'));
  h.page.onUnload();
});

test('Rokid keys navigate roots, replies and nested replies and restore the parent', async () => {
  const h = await openPage();
  await h.key('ArrowDown');
  assert.equal(h.page.data.firstBody, second.body);
  await h.key('ArrowUp');
  await h.key('Enter');
  assert.equal(h.page.data.mode, 'reader');
  assert.equal(h.page.data.readerBody, first.body);
  await h.key('Enter');
  assert.equal(h.page.data.readerBody, reply.body);
  await h.key('Enter');
  assert.equal(h.page.data.readerBody, nested.body);
  await h.key('Backspace');
  assert.equal(h.page.data.readerBody, reply.body);
  await h.key('Backspace');
  assert.equal(h.page.data.readerBody, first.body);
  await h.key('Backspace');
  assert.equal(h.page.data.mode, 'feed');
  h.touches.length = 0;
  await h.key('Backspace');
  assert.equal(h.touches.length, 0, 'allow the host to close the page from the root');
  h.page.onUnload();
});

test('denying location keeps recent cards without distances or a weather request', async () => {
  const h = await openPage({ locate: (_ok, error) => error({ code: 1, message: 'Denied' }) });
  assert.equal(h.page.data.firstBody, recent.body);
  assert.doesNotMatch(h.page.data.firstDistance, /km/i);
  assert.ok(!h.requests.some(({ body, url }) => body.p_sort === 'nearby' || url.pathname.endsWith('/theme-weather')));
  h.page.onUnload();
});

test('removes a card from the reader if the public parent check no longer returns it', async () => {
  const h = await openPage({read: (request, json) =>
    request.url.pathname.endsWith('/rpc/get_card') ? json(null) : null});
  await h.key('Enter');
  await h.key('Enter');
  assert.equal(h.page.data.mode, 'feed');
  assert.notEqual(h.page.data.firstBody, first.body);
  assert.match(h.page.data.status, /공개가 끝난/);
  h.page.onUnload();
});

test('when the current area is empty it shows recent public cards, without invented distances', async () => {
  const h = await openPage({ nearby: [] });
  assert.ok(h.requests.some(({ body }) => body.p_sort === 'nearby'));
  assert.equal(h.page.data.firstBody, recent.body);
  assert.doesNotMatch(h.page.data.firstDistance, /km/i);
  assert.match(h.page.data.status, /최신/);
  assert.match(h.page.data.weather, /0\s*°/);
  h.page.onUnload();
});

test('a position callback after the page is hidden cannot start a nearby or weather request', async () => {
  let share;
  const h = await openPage({ locate: ok => { share = ok; } });
  assert.equal(typeof share, 'function');
  h.page.onHide();
  share(fix());
  await settle();
  assert.ok(!h.requests.some(({ body, url }) => body.p_sort === 'nearby' || url.pathname.endsWith('/theme-weather')));
  h.page.onUnload();
  assert.equal(h.watchers.size, 0);
  assert.equal(h.timers.size, 0);
});
