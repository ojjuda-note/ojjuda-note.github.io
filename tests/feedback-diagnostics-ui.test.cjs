const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const collector = read('diagnostics.js');
const origin = 'https://app.example.invalid';
const api = 'https://api.example.invalid';

async function verifyCollector() {
  const listeners = new Map(), calls = [], authHandlers = [];
  let clock = 1000000, nextFetch = () => Promise.resolve(new Response('original response', { status: 500 }));
  const context = {
    URL, Request, Response, Set, WeakSet, Reflect, Object, JSON, Number,
    Date: class extends Date { static now() { return clock; } },
    location: { href: origin + '/note/?private=user@example.test#password', origin },
    navigator: { onLine: true }, innerWidth: 360, innerHeight: 780,
    OJJUDA_CONFIG: { supabaseUrl: api },
    addEventListener(type, handler) { listeners.set(type, handler); },
    fetch(...args) { calls.push({ receiver: this, args }); return nextFetch(...args); }
  };
  context.window = context;
  vm.createContext(context); vm.runInContext(collector, context);
  const diagnostics = context.OjjudaDiagnostics;
  const snapshot = () => JSON.parse(JSON.stringify(diagnostics.snapshot('note')));
  const error = (message = 'secret@example.test private-input password', name = 'TypeError') => {
    const value = new Error(message); value.name = name;
    value.stack = `TypeError: ${message}\n at read (${origin}/note/preview.js?token=private-token#private:18:9)`;
    return value;
  };
  const emit = value => listeners.get('error')({ target: null, error: value, filename: origin + '/note/preview.js?token=private-token#private', lineno: 25, colno: 8 });
  assert.equal(calls.length, 0, 'installing and reading diagnostics never sends a request');
  emit(error("Cannot read properties of undefined (reading 'private-input')"));
  listeners.get('unhandledrejection')({ reason: error('privateMethod is not a function') });
  listeners.get('error')({ target: { tagName: 'SCRIPT', src: origin + '/note/map.js?token=private-token' } });
  listeners.get('error')({ target: { tagName: 'IMG', src: origin + '/uploads/private-user-photo.jpg' } });
  listeners.get('error')({ target: { tagName: 'SCRIPT', src: 'https://third-party.invalid/private-person.js' } });
  listeners.get('unhandledrejection')({ reason: 'user@example.test password private-input' });
  const thrownGetter = Object.defineProperty({}, 'name', { get() { throw new Error('private'); } });
  assert.doesNotThrow(() => emit(thrownGetter));
  assert.deepEqual(snapshot().events.map(event => event.code), ['UNDEFINED_PROPERTY', 'NOT_A_FUNCTION', 'RESOURCE_FAILURE', 'PROMISE_REJECTION']);
  assert.equal(snapshot().events[1].path, '/note/preview.js');
  assert.equal(snapshot().events[1].line, 18);

  const response = new Response('unchanged body', { status: 503, headers: { 'X-Test': 'preserved' } });
  nextFetch = () => Promise.resolve(response);
  const request = new Request(api + '/rest/v1/rpc/list_cards?private=private-token', { method: 'POST', headers: { Authorization: 'Bearer private-token' }, body: 'private-input' });
  const options = { signal: new AbortController().signal, credentials: 'include' };
  const received = await context.fetch(request, options);
  assert.equal(received, response, 'the exact original Response is returned');
  assert.equal(response.bodyUsed, false, 'diagnostics does not read or clone response bodies');
  assert.equal(await received.text(), 'unchanged body');
  assert.equal(received.headers.get('X-Test'), 'preserved');
  assert.equal(calls.at(-1).args[0], request);
  assert.equal(calls.at(-1).args[1], options);
  assert.equal(await request.text(), 'private-input', 'request bodies remain untouched');
  assert.equal(snapshot().events.at(-1).path, '/rest/v1/rpc/list_cards');
  assert.equal(snapshot().events.at(-1).status, 503);

  const networkError = new TypeError('Network failed for secret@example.test');
  nextFetch = () => Promise.reject(networkError);
  await assert.rejects(context.fetch(new URL(api + '/rest/v1/rpc/get_card')), value => value === networkError);
  assert.equal(snapshot().events.at(-1).code, 'NETWORK_FAILURE');
  const previous = snapshot().events.length;
  const abort = new DOMException('private cancelled', 'AbortError');
  nextFetch = () => Promise.reject(abort);
  await assert.rejects(context.fetch(api + '/rest/v1/rpc/list_cards'), value => value === abort);
  nextFetch = () => { throw abort; };
  assert.throws(() => context.fetch(api + '/rest/v1/rpc/list_cards'), value => value === abort);
  assert.equal(snapshot().events.length, previous, 'cancelled requests are not reported as failures');

  nextFetch = () => Promise.resolve(new Response('private', { status: 401 }));
  for (const url of [api + '/auth/v1/token', api + '/functions/v1/member-recovery', api + '/storage/v1/object/private/user.jpg', api + '/rest/v1/user_private', api + '/rest/v1/rpc/get_my_member_identity', api + '/rest/v1/rpc/private_custom_name', 'https://third-party.invalid/rest/v1/rpc/list_cards', origin + '/uploads/private.js', origin + '/note/private-email.js', 'not a valid URL']) await context.fetch(url);
  assert.equal(snapshot().events.length, previous, 'authentication and non-allowlisted paths are excluded');
  assert.doesNotMatch(JSON.stringify(snapshot()), /private|password|@|token|Authorization|Bearer|uploads|https?:|\?/i);
  assert.equal(calls.length, 14, 'collector makes no extra network calls');
  assert.equal(context.localStorage, undefined);
  assert.equal(context.sessionStorage, undefined);
  assert.equal(context.setInterval, undefined, 'collector requires no polling or timers');

  const client = { auth: { onAuthStateChange(callback) { authHandlers.push(callback); } } };
  diagnostics.bindAuth(client, () => 'private-account-a');
  diagnostics.bindAuth(client, () => 'private-account-a');
  assert.equal(authHandlers.length, 1, 'one account observer per existing client');
  assert.equal(snapshot().events.length, 0);
  emit(error());
  let complete;
  nextFetch = () => new Promise(resolve => { complete = resolve; });
  const pending = context.fetch(api + '/rest/v1/rpc/list_cards');
  authHandlers[0]('SIGNED_IN', { user: { id: 'private-account-b' } });
  complete(new Response('old account response', { status: 500 })); await pending;
  assert.equal(snapshot().events.length, 0, 'a completed request from the old account cannot contaminate a new report');
  emit(error());
  authHandlers[0]('TOKEN_REFRESHED', { user: { id: 'private-account-b' } });
  assert.equal(snapshot().events.length, 1, 'token refresh preserves current-account evidence');
  authHandlers[0]('SIGNED_OUT', null);
  assert.equal(snapshot().events.length, 0);

  emit(error()); clock += 300001;
  assert.equal(snapshot().events.length, 0, 'records older than five minutes are discarded');
  for (let i = 0; i < 55; i++) { emit(error('Cannot set properties of null')); clock += 1; }
  assert.equal(snapshot().events.length, 40);
  assert(snapshot().events.every(event => event.age_ms >= 0 && event.age_ms <= 300000));
  assert(Buffer.byteLength(JSON.stringify(snapshot())) <= 16384);
  const detached = diagnostics.snapshot('world'); detached.events[0].code = 'private-change';
  assert.equal(diagnostics.snapshot('world').context.source, 'world');
  assert.equal(snapshot().events[0].code, 'NULL_PROPERTY', 'a submitted snapshot cannot mutate the live buffer');
}

async function verifyForm() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 } });
    let requests = 0;
    await page.route('**/*', route => { requests++; return route.fulfill({ contentType: 'text/html', body: '<meta name="viewport" content="width=device-width,initial-scale=1"><main class="note-tools"></main>' }); });
    await page.goto(origin + '/note/');
    await page.addScriptTag({ content: collector });
    await page.addStyleTag({ content: read('note/support.css') + read('note/operations.css') });
    await page.addScriptTag({ content: read('note/support.js') });
    await page.evaluate(() => {
      window.inserts = []; window.currentUser = 'synthetic-account'; window.authHandlers = [];
      const client = {
        auth: { onAuthStateChange(callback) { authHandlers.push(callback); } },
        from(table) { if (table !== 'feedback') throw new Error('unexpected table'); return { async insert(row) { inserts.push(row); return { error: null }; } }; }
      };
      window.OjjudaNoteSupport.install({ client, getUserId: () => currentUser, source: 'note', getScreen: () => 'all', appVersion: 'test' });
      window.dispatchEvent(new ErrorEvent('error', { error: new TypeError("Cannot read properties of undefined (reading 'private-input')"), filename: location.origin + '/note/preview.js?token=private-token', lineno: 40, colno: 8 }));
      window.OjjudaNoteSupport.openFeedback();
    });
    const notice = page.locator('#support-diagnostics-notice');
    await notice.waitFor({ state: 'visible' });
    assert.match(await notice.innerText(), /최근 5분/);
    assert.equal(await page.evaluate(() => inserts.length), 0);
    await page.locator('input[value="idea"]').check();
    assert.equal(await notice.isVisible(), false);
    await page.locator('input[value="bug"]').check();
    assert.equal(await notice.isVisible(), true);
    await page.locator('#support-feedback-body').fill('합성 고장 신고');
    await page.getByRole('button', { name: '보내기', exact: true }).click();
    await page.getByText('고마워요! 의견을 잘 받았어요.', { exact: true }).waitFor();
    const bug = await page.evaluate(() => inserts[0]);
    assert.equal(bug.kind, 'bug');
    assert.equal(bug.diagnostics.context.source, 'note');
    assert.equal(bug.diagnostics.events[0].code, 'UNDEFINED_PROPERTY');
    assert.doesNotMatch(JSON.stringify(bug.diagnostics), /private|token|synthetic-account|@/);
    for (const [kind, collectorState] of [['idea', 'present'], ['bug', 'missing'], ['bug', 'throwing']]) {
      await page.evaluate(state => {
        if (state === 'missing') window.OjjudaDiagnostics = undefined;
        if (state === 'throwing') window.OjjudaDiagnostics = { snapshot() { throw new Error('collector unavailable'); } };
        OjjudaNoteSupport.close(); OjjudaNoteSupport.openFeedback();
      }, collectorState);
      await page.locator(`input[value="${kind}"]`).check();
      await page.locator('#support-feedback-body').fill('합성 의견');
      await page.getByRole('button', { name: '보내기', exact: true }).click();
      await page.getByText('고마워요! 의견을 잘 받았어요.', { exact: true }).waitFor();
      assert.equal(await page.evaluate(() => Object.hasOwn(inserts.at(-1), 'diagnostics')), false, 'ideas and unavailable collectors submit without diagnostics');
    }
    assert.equal(requests, 1, 'the reporting UI performs no extra network request for diagnostics');
    assert.equal(await page.evaluate(() => inserts.length), 4, 'only explicit submissions call the existing feedback insert');

    // The retained World sender uses the same bug-only contract, including safe collector failure.
    const legacy = read('world.html').match(/async function ay\(t\)\{[\s\S]*?(?=function iy\()/)?.[0];
    assert(legacy);
    const captures = [];
    const sandbox = { window: { OjjudaDiagnostics: { snapshot: source => ({ source }) } },
      z: () => ({ value: '합성 월드 고장 신고' }), document: { querySelector: () => ({ value: 'bug' }) },
      D: { user: { id: 'synthetic' } }, g: { tab: 'my' }, Go: 'test', navigator: { userAgent: 'test' },
      S: { from: () => ({ insert: async row => { captures.push(row); return {}; } }) }, dt() {}, M() {} };
    vm.createContext(sandbox); vm.runInContext(legacy, sandbox); await sandbox.ay({});
    assert.equal(captures[0].diagnostics.source, 'world');
    sandbox.document.querySelector = () => ({ value: 'idea' }); await sandbox.ay({});
    assert.equal(Object.hasOwn(captures[1], 'diagnostics'), false);
  } finally { await browser.close(); }
}

(async () => {
  for (const file of ['world.html', 'note/index.html']) {
    const html = read(file);
    assert(html.indexOf('/diagnostics.js?') < html.indexOf('signup-identity.js?'), 'collector loads before application scripts');
    assert.match(html, /support\.js\?v=20260929-logs1/);
    assert.match(html, /notifications\.js\?v=20260929-diag1/);
  }
  await verifyCollector(); await verifyForm();
  console.log('PASS: bug-only recent diagnostic reports, safe error categories/paths, fetch semantics, no polling/storage/background upload, account isolation, bounds, graceful submission fallback and World legacy sender');
})().catch(error => { console.error(error); process.exitCode = 1; });
