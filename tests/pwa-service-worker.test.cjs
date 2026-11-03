const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
const offlineHTML = fs.readFileSync(path.join(__dirname, '..', 'offline.html'), 'utf8');
const origin = 'https://ojjuda.kr';
const offlineURL = origin + '/offline.html';

function worker(options = {}) {
  const listeners = new Map();
  const stores = new Map(options.stores || []);
  const calls = { added: [], deleted: [], fetched: [], claimed: 0, skipped: 0 };
  let storageUnavailable = false;
  const caches = {
    async open(name) {
      if (storageUnavailable) throw new Error('Storage unavailable');
      if (!stores.has(name)) stores.set(name, new Map());
      const entries = stores.get(name);
      return {
        async add(request) {
          if (options.precacheFailure) throw new Error('Offline page unavailable');
          calls.added.push({ name, url: request.url, credentials: request.credentials });
          entries.set(request.url, new Response(offlineHTML, { headers: { 'Content-Type': 'text/html' } }));
        },
        async match(request) {
          const url = typeof request === 'string' ? request : request.url;
          return entries.get(url)?.clone();
        },
        async put(request, response) {
          const url = typeof request === 'string' ? request : request.url;
          calls.added.push({ name, url });
          entries.set(url, response.clone());
        }
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { calls.deleted.push(name); return stores.delete(name); }
  };
  const context = vm.createContext({
    URL, Request, Response, caches,
    fetch: async (request) => {
      calls.fetched.push(request);
      if (options.fetch) return options.fetch(request);
      return new Response('Live app');
    },
    self: {
      location: { origin },
      addEventListener(name, handler) { listeners.set(name, handler); },
      async skipWaiting() { calls.skipped += 1; },
      clients: { async claim() { calls.claimed += 1; } }
    }
  });
  vm.runInContext(source, context, { filename: 'sw.js' });
  return {
    calls, stores,
    failStorage() { storageUnavailable = true; },
    async event(name) {
      const pending = [];
      listeners.get(name)({ waitUntil(promise) { pending.push(promise); } });
      await Promise.all(pending);
    },
    navigate(url, requestOptions = {}) {
      let response;
      listeners.get('fetch')({
        request: { url: new URL(url, origin).href, method: 'GET', mode: 'navigate', ...requestOptions },
        respondWith(promise) { response = Promise.resolve(promise); }
      });
      return response;
    }
  };
}

test('installation caches only the public offline notice without credentials', async () => {
  const w = worker();
  await w.event('install');
  assert.equal(w.calls.added.length, 1);
  assert.equal(w.calls.added[0].url, offlineURL);
  assert.equal(w.calls.added[0].credentials, 'omit');
  assert.deepEqual([...w.stores.values()].flatMap((store) => [...store.keys()]), [offlineURL]);
  assert.equal(w.calls.skipped, 1);
});

test('an unsuccessful precache does not activate the replacement worker', async () => {
  const w = worker({ precacheFailure: true });
  await assert.rejects(w.event('install'), /Offline page unavailable/);
  assert.equal(w.calls.skipped, 0);
});

test('online entry pages return their live response without caching it', async () => {
  for (const url of ['/', '/index.html', '/world.html', '/world.html?tab=park']) {
    const live = new Response('Current signed-in page');
    const w = worker({ fetch: async () => live });
    assert.equal(await w.navigate(url), live);
    assert.equal(w.calls.fetched.length, 1);
    assert.equal(w.calls.added.length, 0);
    assert.equal(w.stores.size, 0);
  }
});

test('HTTP errors remain server responses rather than being masked as offline', async () => {
  const unavailable = new Response('Service unavailable', { status: 503 });
  const w = worker({ fetch: async () => unavailable });
  assert.equal(await w.navigate('/world.html'), unavailable);
  assert.equal(w.stores.size, 0);
});

test('offline entry navigation returns the notice without storing the requested URL', async () => {
  const w = worker({ fetch: async () => { throw new TypeError('Network unavailable'); } });
  await w.event('install');
  const response = await w.navigate('/world.html?tab=park');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /인터넷 연결을/);
  assert.equal(w.calls.added.length, 1);
  assert.deepEqual([...w.stores.values()].flatMap((store) => [...store.keys()]), [offlineURL]);
});

test('evicted offline content still produces a readable recovery page', async () => {
  const w = worker({ fetch: async () => { throw new TypeError('Offline'); } });
  const response = await w.navigate('/world.html');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const text = await response.text();
  assert.match(text, /오쭈다 아지트/);
  assert.match(text, /다시 시도/);
  assert.equal(w.calls.added.length, 0);
});

test('unavailable storage does not prevent the minimal offline recovery page', async () => {
  const w = worker({ fetch: async () => { throw new TypeError('Offline'); } });
  w.failStorage();
  const response = await w.navigate('/world.html');
  assert.match(await response.text(), /다시 시도/);
});

test('authentication callbacks are left entirely to the browser', () => {
  const w = worker();
  for (const base of ['/', '/index.html', '/world.html']) {
    for (const key of ['code', 'token', 'token_hash', 'access_token', 'refresh_token', 'error', 'error_description', 'type', 'state', 'CODE']) {
      assert.equal(w.navigate(base + '?' + key + '=callback-value'), undefined, base + '?' + key);
    }
  }
  assert.equal(w.calls.fetched.length, 0);
  assert.equal(w.calls.added.length, 0);
});

test('star, admin, APIs, games, cross-origin resources and writes are not intercepted', () => {
  const w = worker();
  const untouched = [
    ['/star/'], ['/star/index.html'], ['/star/sw.js'], ['/admin/'], ['/admin.html'],
    ['/api/member'], ['/auth/callback'], ['/games/mines/'], ['/world.html/'],
    ['https://api.example.com/world.html'],
    ['/world.html', { method: 'POST' }],
    ['/world.html', { mode: 'cors' }],
    ['/world.html', { mode: 'same-origin' }]
  ];
  for (const [url, options] of untouched) {
    assert.equal(w.navigate(url, options), undefined, url);
  }
  assert.equal(w.calls.fetched.length, 0);
  assert.equal(w.calls.added.length, 0);
});

test('activation removes only previous versions of this worker cache', async () => {
  const w = worker({ stores: [
    ['star-push-cache', new Map()],
    ['another-app-offline', new Map()],
    ['ojjuda-pwa-offline-previous', new Map()]
  ] });
  await w.event('install');
  const current = w.calls.added[0].name;
  await w.event('activate');
  assert.deepEqual(w.calls.deleted, ['ojjuda-pwa-offline-previous']);
  assert.ok(w.stores.has('star-push-cache'));
  assert.ok(w.stores.has('another-app-offline'));
  assert.ok(w.stores.has(current));
  assert.equal(w.calls.claimed, 1);
});
