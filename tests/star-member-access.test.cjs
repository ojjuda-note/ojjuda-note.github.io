const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { JSDOM } = require('jsdom');

const rootDir = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(rootDir, file), 'utf8');
const html = read('star/index.html');
const accessSource = read('star/member-access.js');
const guideSource = read('star/browser-guide.js');
const member = { id: 'member-a', is_anonymous: false };
const sessionFor = (user = member, token = 'fixture-access-token') => ({ user, access_token: token });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// Real page elements and production scripts; Auth, time, navigation and bundle
// delivery are controlled so no member account or remote application is used.
function fixture(t, { session = sessionFor(), sessionResponse, userResponse, seen = false,
  url = 'https://ojjuda.kr/star/' } = {}) {
  const dom = new JSDOM(html, { url, runScripts: 'outside-only' });
  const { window } = dom, { document } = window;
  const timers = new Map();
  let clock = 0, timerId = 0, authListener, currentSession = session;
  const calls = { sessions: 0, users: 0, ready: 0, reloads: 0, destroys: 0 };
  const schedule = (callback, delay = 0) => {
    const id = ++timerId;
    timers.set(id, { callback, at: clock + delay });
    return id;
  };
  window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  window.HTMLDialogElement.prototype.close = function () {
    if (!this.open) return;
    this.open = false;
    schedule(() => this.dispatchEvent(new window.Event('close')));
  };
  if (seen) window.localStorage.setItem('ojjuda:star:browser-guide:v1', 'seen');
  const client = { auth: {
    async getSession() {
      calls.sessions++;
      return sessionResponse ? sessionResponse(currentSession, calls.sessions) : { data: { session: currentSession } };
    },
    async getUser() {
      calls.users++;
      return userResponse ? userResponse(currentSession, calls.users) : { data: { user: currentSession?.user || null } };
    },
    onAuthStateChange(callback) {
      authListener = callback;
      return { data: { subscription: { unsubscribe() {} } } };
    }
  } };
  window.OJJUDA_CONFIG = { supabaseUrl: 'https://auth.example.invalid', supabaseKey: 'fixture-publishable' };
  window.supabase = { createClient: () => client };
  document.addEventListener('ojjuda:star:member-ready', () => calls.ready++);
  const location = new URL(url);
  location.reload = () => calls.reloads++;
  const context = vm.createContext({ window, document, location, navigator: window.navigator,
    localStorage: window.localStorage, URL, URLSearchParams, Event: window.Event,
    setTimeout: schedule, clearTimeout: id => timers.delete(id) });
  vm.runInContext(guideSource, context, { filename: 'star/browser-guide.js' });
  vm.runInContext(accessSource, context, { filename: 'star/member-access.js' });
  const flush = async () => {
    for (let i = 0; i < 30; i++) {
      await Promise.resolve();
      for (const [id, timer] of timers) {
        if (timer.at > clock) continue;
        timers.delete(id); timer.callback();
      }
    }
  };
  t.after(() => { timers.clear(); window.close(); });
  return { window, document, calls, flush,
    panel: document.getElementById('star-member-access'), root: document.getElementById('root'),
    guide: document.getElementById('star-browser-guide'),
    scripts: () => [...document.querySelectorAll('script[src*="/star-client/star-app.js"]')],
    retry: () => document.getElementById('star-access-retry').click(),
    advance: ms => { clock += ms; },
    setSession: next => { currentSession = next; },
    emit(event, next) { currentSession = next; authListener(event, next); },
    mountApp() {
      document.getElementById('root').textContent = '예약 화면';
      window.OjjudaStarApp = { destroy: () => calls.destroys++ };
    }
  };
}

test('direct guest and anonymous entry never loads the app or first-visit popup', async t => {
  for (const session of [null, sessionFor({ id: 'anonymous', is_anonymous: true }), { user: member }]) {
    const f = fixture(t, { session }); await f.flush();
    assert.equal(f.root.hidden, true);
    assert.equal(f.panel.hidden, false);
    assert.equal(f.scripts().length, 0);
    assert.equal(f.calls.users, 0, 'a missing member session is rejected before app verification');
    assert.equal(f.guide.open, false);
    assert.equal(f.calls.ready, 0);
    assert.match(f.document.getElementById('star-access-title').textContent, /회원만/);
    assert.equal(f.document.querySelector('a[href^="https://hanusan-booking-helper"]'), null, 'there is no standalone bypass link');
  }
});

test('server identity must be verified before app script, root or browser guide is exposed', async t => {
  const verified = deferred();
  const f = fixture(t, { userResponse: () => verified.promise });
  await f.flush();
  assert.equal(f.calls.users, 1);
  assert.equal(f.scripts().length, 0);
  assert.equal(f.root.hidden, true);
  assert.equal(f.guide.open, false);
  verified.resolve({ data: { user: member } }); await f.flush();
  assert.equal(f.scripts().length, 1);
  assert.match(f.scripts()[0].src, /^https:\/\/hanusan-booking-helper\.mj830417686850\.chatgpt\.site\/star-client\/star-app\.js\?v=/);
  assert.equal(f.panel.hidden, true); assert.equal(f.root.hidden, false);
  assert.equal(f.guide.open, true); assert.equal(f.calls.ready, 1);
  assert.equal(f.window.OjjudaStarAuth.isMember(), true);
  f.document.querySelector('[data-star-guide-confirm]').click(); await f.flush();
  assert.equal(f.guide.open, false);
  assert.equal(f.window.localStorage.getItem('ojjuda:star:browser-guide:v1'), 'seen');
  const returning = fixture(t, { seen: true }); await returning.flush();
  assert.equal(returning.scripts().length, 1); assert.equal(returning.guide.open, false);
});

test('forged, expired, missing and anonymous server identities cannot authorize a cached member', async t => {
  for (const response of [
    { data: { user: null } },
    { data: { user: { id: 'another-member', is_anonymous: false } } },
    { data: { user: { ...member, is_anonymous: true } } },
    { data: { user: null }, error: { status: 401, message: 'session_not_found' } }
  ]) {
    const f = fixture(t, { userResponse: () => response }); await f.flush();
    assert.equal(f.scripts().length, 0); assert.equal(f.root.hidden, true);
    assert.equal(f.window.OjjudaStarAuth.isMember(), false);
    assert.equal(f.guide.open, false);
    assert.match(f.document.getElementById('star-access-title').textContent, /회원만/);
  }
});

test('offline and timed-out verification offers a working retry without loading the app early', async t => {
  let offline = true;
  const f = fixture(t, { userResponse: session => {
    if (offline) throw new Error('offline');
    return { data: { user: session.user } };
  } });
  await f.flush();
  assert.equal(f.scripts().length, 0);
  assert.equal(f.document.getElementById('star-access-retry').hidden, false);
  assert.match(f.document.getElementById('star-access-message').textContent, /인터넷 연결/);
  offline = false; f.retry(); await f.flush();
  assert.equal(f.scripts().length, 1); assert.equal(f.calls.reloads, 0);
  const delayed = deferred();
  const timeout = fixture(t, { userResponse: () => delayed.promise }); await timeout.flush();
  timeout.advance(12000); await timeout.flush();
  assert.equal(timeout.scripts().length, 0);
  assert.equal(timeout.document.getElementById('star-access-retry').hidden, false);
  delayed.resolve({ data: { user: member } }); await timeout.flush();
  assert.equal(timeout.scripts().length, 0, 'late identity after timeout cannot start the app');
  timeout.retry(); await timeout.flush(); assert.equal(timeout.scripts().length, 1);
});

test('sign-out invalidates a pending verification before its old response can append a script', async t => {
  const pending = deferred();
  const f = fixture(t, { userResponse: () => pending.promise }); await f.flush();
  f.emit('SIGNED_OUT', null);
  pending.resolve({ data: { user: member } }); await f.flush();
  assert.equal(f.scripts().length, 0); assert.equal(f.root.hidden, true);
  assert.equal(f.guide.open, false); assert.equal(f.window.OjjudaStarAuth.isMember(), false);
});

test('logout destroys a mounted app, clears its view and closes the guide', async t => {
  const f = fixture(t); await f.flush(); f.mountApp();
  f.emit('SIGNED_OUT', null); await f.flush();
  assert.ok(f.calls.destroys >= 1);
  assert.equal(f.root.hidden, true); assert.equal(f.root.childNodes.length, 0);
  assert.equal(f.guide.open, false); assert.equal(f.panel.hidden, false);
  await assert.rejects(f.window.OjjudaStarAuth.getAccessToken(), /member_login_required/);
});

test('a different member receives a clean reload while same-member token refresh keeps the app', async t => {
  const f = fixture(t); await f.flush(); f.mountApp();
  f.emit('INITIAL_SESSION', sessionFor()); await f.flush();
  f.emit('TOKEN_REFRESHED', sessionFor(member, 'refreshed-token')); await f.flush();
  assert.equal(f.calls.reloads, 0); assert.equal(f.calls.destroys, 0);
  assert.equal(f.scripts().length, 1);
  assert.equal(await f.window.OjjudaStarAuth.getAccessToken(), 'refreshed-token');
  f.emit('SIGNED_IN', sessionFor({ id: 'member-b', is_anonymous: false }, 'member-b-token'));
  await f.flush();
  assert.ok(f.calls.destroys >= 1);
  assert.equal(f.root.childNodes.length, 0);
  assert.equal(f.calls.reloads, 1, 'no previous account React state is reused');
  assert.equal(f.scripts().length, 1, 'account changes reload instead of appending a second bundle');
});

test('INITIAL_SESSION racing with getUser rechecks once; it does not start an outdated app', async t => {
  const oldIdentity = deferred();
  const f = fixture(t, { userResponse: (session, count) => count === 1 ? oldIdentity.promise : { data: { user: session.user } } });
  await f.flush(); assert.equal(f.calls.users, 1);
  f.emit('INITIAL_SESSION', sessionFor()); await f.flush();
  assert.equal(f.scripts().length, 0);
  oldIdentity.resolve({ data: { user: member } }); await f.flush();
  assert.equal(f.calls.users, 2); assert.equal(f.scripts().length, 1);
  assert.equal(f.calls.ready, 1); assert.equal(f.calls.reloads, 0);
});

test('INITIAL_SESSION while the verified bundle is still pending does not reload it', async t => {
  const f = fixture(t); await f.flush();
  assert.equal(f.scripts().length, 1); assert.equal(f.window.OjjudaStarApp, undefined);
  f.emit('INITIAL_SESSION', sessionFor()); await f.flush();
  assert.equal(f.scripts().length, 1); assert.equal(f.calls.ready, 1);
  assert.equal(f.calls.reloads, 0); assert.equal(f.root.hidden, false);
});

test('app resource failures close the authorized view and retry through a clean reload', async t => {
  const f = fixture(t); await f.flush();
  f.scripts()[0].dispatchEvent(new f.window.Event('error')); await f.flush();
  assert.equal(f.root.hidden, true); assert.equal(f.guide.open, false);
  assert.equal(f.window.OjjudaStarAuth.isMember(), false);
  assert.match(f.document.getElementById('star-access-message').textContent, /불러오지 못/);
  f.retry(); assert.equal(f.calls.reloads, 1);
});

test('login handoff preserves only the four booking fields and fixed local destinations', async t => {
  const f = fixture(t, { session: null, url: 'https://ojjuda.kr/star/?startDate=2026-11-14&endDate=2026-11-16&guests=2&room=123&redirect=https://evil.example' });
  await f.flush();
  for (const mode of ['login', 'signup']) {
    const target = new URL(f.document.querySelector('[data-star-auth="' + mode + '"]').href);
    assert.equal(target.origin, 'https://ojjuda.kr'); assert.equal(target.pathname, '/');
    assert.equal(target.searchParams.get('auth'), mode); assert.equal(target.searchParams.get('next'), 'star');
    assert.equal(target.searchParams.get('startDate'), '2026-11-14');
    assert.equal(target.searchParams.get('redirect'), null);
    assert.deepEqual([...target.searchParams.keys()], ['auth', 'next', 'startDate', 'endDate', 'guests', 'room']);
  }
});

test('arcade Star entry respects game exit and routes guests to login without consuming a trial', async () => {
  const world = read('world.html'), start = world.indexOf('function Al(');
  const end = world.indexOf('// User-requested exits ask first;', start);
  assert.ok(start >= 0 && end > start);
  function arcade(account, gate) {
    const navigations = []; let trialChecks = 0;
    const context = vm.createContext({ D: account, location: { assign: url => navigations.push(url) },
      window: { OjjudaGuestAccess: { canPlay: () => { trialChecks++; return false; } } },
      worldGameEntryGate: gate || (() => true) });
    vm.runInContext(world.slice(start, end), context);
    return { context, navigations, trialChecks: () => trialChecks };
  }
  for (const account of [{ online: false }, { online: true, user: { id: 'guest', is_anonymous: true } }, { online: true, user: member }]) {
    const f = arcade(account); f.context.Al('star');
    assert.deepEqual(f.navigations, [account.user === member ? '/star/' : '/?auth=login&next=star']);
    assert.equal(f.trialChecks(), 0);
    const cancelled = arcade(account, () => false);
    assert.equal(cancelled.context.Al('star'), false); assert.deepEqual(cancelled.navigations, []);
  }
  const exit = deferred(); let first = true;
  const f = arcade({ online: true, user: member }, reopen => {
    if (!first) return true;
    first = false; return exit.promise.then(ok => ok ? reopen() : false);
  });
  const opening = f.context.Al('star'); assert.deepEqual(f.navigations, []);
  exit.resolve(true); await opening; assert.deepEqual(f.navigations, ['/star/']);
});
