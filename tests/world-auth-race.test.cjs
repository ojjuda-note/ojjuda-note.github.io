const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const html = fs.readFileSync(process.env.OJJUDA_WORLD_AUTH_SOURCE || path.join(__dirname, '../world.html'), 'utf8');
function section(start, end) {
  const first = html.indexOf(start), last = html.indexOf(end, first);
  assert.ok(first >= 0 && last > first, start + ' is available');
  return html.slice(first, last);
}
// Keep the actual session listener, profile/onboarding continuations and legacy
// wallet probe. Only transport, rendering and persistence effects are fixtures.
const source = section('function worldAccountEntry(', 'async function Vb(')
  + section('async function s0(', 'var l0=')
  + section('async function am(', 'function Wb(');
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const member = id => ({ id, user_metadata: {} });
const profile = (id, priv = { owned: [] }) => ({ profile: { id, nickname: id }, priv });

function fixture({ initial = 'A', delayedSession = false, query = '' } = {}) {
  const tasks = [], listeners = [], sessions = [], profiles = [], wallets = [], privateWrites = [], signups = [];
  const applied = [], saved = [], screens = [], errors = [], nicknameCallbacks = [];
  const context = {
    URL, URLSearchParams, Object,
    location: { href: 'https://fixture.test/world.html' + query, reload() { screens.push('reload'); }, assign(url) { screens.push('route:' + url); } },
    document: { getElementById: () => ({ disabled: false }) },
    worldParkNotes: null, ui: false, ga: false, Tr: false, bm: false, em: null, $c: null,
    D: { online: false, user: null }, $: { me: { nick: 'local' } }, hc() {}, ua: null, fi: null,
    setTimeout(fn) { const task = { fn }; tasks.push(task); return task; },
    clearTimeout(task) { if (task) task.cancelled = true; },
    console: { error(error) { errors.push(error.message); } },
    xd() {}, yc() { screens.push('loading'); }, $d(callback) { context.saveCallback = callback; },
    clearWorldAdminView() {}, worldResumePresence() { screens.push('resume-presence'); },
    refreshWorldMatgoAccess() {},
    // The full page defines this separately from the extracted auth functions.
    // Hub local-storage merging is outside this account-race fixture.
    restoreAgitProgress() {},
    enterWorldGuest(start) { context.D.online = false; context.D.user = null; context.D.parkGuest = true; screens.push('guest'); start(); },
    nr(mode) { screens.push('auth:' + mode); }, tm(error) { screens.push('error:' + error.message); },
    Ao() { return { me: { nick: 'default' } }; }, zi() { return null; },
    J1(user) { screens.push('onboard:' + user.id); },
    U1(record) { return { me: { nick: record.profile.nickname } }; },
    Fs(model) { context.$ = model; applied.push({ owner: context.D.user?.id, nickname: model.me.nick }); },
    X1(owner, model, options) { context.ua = owner; saved.push({ owner, nickname: model.me.nick }); nicknameCallbacks.push(options.onNickTaken); },
    M(message) { screens.push('notice:' + message); },
    ge(message) { screens.push('form-error:' + message); }, zr(error) { return error.message; },
    Yu(error) { return error.legacy === true; },
    W1(owner) { const request = { owner, ...deferred() }; profiles.push(request); return request.promise; },
    Z1(owner) { const request = { owner, ...deferred() }; privateWrites.push(request); return request.promise; },
    Y1(owner, model) { const request = { owner, model, ...deferred() }; signups.push(request); return request.promise; },
    S: {
      auth: {
        onAuthStateChange(fn) {
          const subscription = { fn, active: true, unsubscribe() { this.active = false; } };
          listeners.push(subscription); return { data: { subscription } };
        },
        getSession() {
          const request = deferred(); sessions.push(request);
          if (!delayedSession) request.resolve({ data: { session: initial ? { user: member(initial) } : null } });
          return request.promise;
        }
      },
      from(table) {
        assert.equal(table, 'user_private');
        const request = { ...deferred() };
        const builder = { select() { return builder; }, eq(_field, owner) { request.owner = owner; return builder; }, maybeSingle() { wallets.push(request); return request.promise; } };
        return builder;
      }
    }
  };
  vm.createContext(context); vm.runInContext(source, context);
  const flush = async () => {
    for (let i = 0; i < 12; i++) {
      await Promise.resolve();
      while (tasks.length) { const task = tasks.shift(); if (!task.cancelled) task.fn(); }
    }
  };
  return {
    context, profiles, wallets, privateWrites, signups, sessions, listeners, applied, saved, screens, errors, nicknameCallbacks, flush,
    start() { return context.om(() => { context.bm = true; screens.push('start:' + (context.D.user?.id || 'guest')); }, () => {}); },
    emit(event, id) { listeners.at(-1).fn(event, id ? { user: member(id) } : null); },
    async finishProfile(id, priv) {
      const request = profiles.find(request => request.owner === id && !request.settled);
      assert.ok(request, 'pending profile for ' + id);
      request.settled = true; request.resolve(profile(id, priv)); await flush();
    },
    onboard(name = 'new A') { return context.am({ querySelector: selector => selector === '#o-nick' ? { value: name } : { checked: false } }); }
  };
}

for (const outcome of ['sign-out', 'account B']) {
  test('an initial stored session cannot override a newer ' + outcome, async () => {
    const f = fixture({ delayedSession: true }), start = f.start();
    f.emit(outcome === 'sign-out' ? 'SIGNED_OUT' : 'SIGNED_IN', outcome === 'sign-out' ? null : 'B');
    // Resolve before the deferred event UI: invalidation must be synchronous.
    f.sessions[0].resolve({ data: { session: { user: member('A') } } });
    await f.flush(); await start;
    assert.deepEqual(f.profiles.map(request => request.owner), outcome === 'sign-out' ? [] : ['B']);
    if (outcome === 'account B') await f.finishProfile('B');
    assert.equal(f.context.D.user?.id || null, outcome === 'sign-out' ? null : 'B');
    assert.deepEqual(f.saved.map(record => record.owner), outcome === 'sign-out' ? [] : ['B']);
    assert.equal(f.screens.includes('start:A'), false);
  });
}

test('sign-out during a profile read cannot boot or attach the old account', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.emit('SIGNED_OUT'); f.profiles[0].resolve(profile('A')); await f.flush(); await start;
  assert.deepEqual(f.applied, []); assert.deepEqual(f.saved, []);
  assert.equal(f.context.D.user, null); assert.equal(f.context.D.online, false);
  assert.equal(f.context.ga, false); assert.equal(f.context.Tr, false);
  assert.ok(f.screens.includes('guest'));
});

for (const late of ['success', 'error']) {
  test('a late account A profile ' + late + ' cannot replace account B', async () => {
    const f = fixture(), start = f.start(); await f.flush();
    f.emit('SIGNED_IN', 'B'); await f.flush(); await f.finishProfile('B');
    if (late === 'success') f.profiles[0].resolve(profile('A'));
    else f.profiles[0].reject(new Error('old account failure'));
    await f.flush(); await start;
    assert.deepEqual(f.applied, [{ owner: 'B', nickname: 'B' }]);
    assert.deepEqual(f.saved, [{ owner: 'B', nickname: 'B' }]);
    assert.equal(f.context.D.user.id, 'B'); assert.equal(f.context.$.me.nick, 'B');
    assert.deepEqual(f.errors, []); assert.equal(f.screens.some(screen => screen.startsWith('error:')), false);
  });
}

test('finishing an obsolete load does not release the new account load guard', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.emit('SIGNED_IN', 'B'); await f.flush();
  f.profiles[0].resolve(profile('A')); await f.flush(); await start;
  assert.equal(f.context.ga, true);
  f.emit('SIGNED_IN', 'B'); await f.flush();
  assert.deepEqual(f.profiles.map(request => request.owner), ['A', 'B']);
  await f.finishProfile('B'); assert.deepEqual(f.saved.map(record => record.owner), ['B']);
});

test('an old private-record initialization cannot apply a profile after account change', async () => {
  const f = fixture(), start = f.start(); await f.flush(); await f.finishProfile('A', null);
  assert.equal(f.privateWrites[0].owner, 'A');
  f.emit('SIGNED_IN', 'B'); await f.flush(); await f.finishProfile('B');
  f.privateWrites[0].resolve(); await f.flush(); await start;
  assert.deepEqual(f.applied.map(record => record.owner), ['B']);
  assert.deepEqual(f.saved.map(record => record.owner), ['B']);
});

for (const late of ['legacy response', 'network error']) {
  test('a stale wallet ' + late + ' cannot change the current account or boot it twice', async () => {
    const f = fixture(), start = f.start(); await f.flush(); await f.finishProfile('A', {});
    assert.equal(f.wallets[0].owner, 'A');
    f.emit('SIGNED_IN', 'B'); await f.flush(); await f.finishProfile('B');
    if (late === 'legacy response') f.wallets[0].resolve({ error: { legacy: true } });
    else f.wallets[0].reject(new Error('old wallet failed'));
    await f.flush(); await start;
    assert.equal(f.context.D.walletReady, true); assert.equal(f.context.D.walletLegacy, false);
    assert.equal(f.context.$.me.nick, 'B'); assert.deepEqual(f.saved.map(record => record.owner), ['B']);
    assert.deepEqual(f.errors, []);
  });
}

test('same-account auth refreshes preserve a valid load and start only once', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.emit('SIGNED_IN', 'A'); f.emit('TOKEN_REFRESHED', 'A'); await f.flush();
  assert.equal(f.profiles.length, 1); await f.finishProfile('A'); await start;
  f.emit('TOKEN_REFRESHED', 'A'); await f.flush();
  assert.deepEqual(f.saved.map(record => record.owner), ['A']);
  assert.equal(f.screens.filter(screen => screen === 'start:A').length, 1);
  assert.ok(f.screens.includes('resume-presence')); assert.equal(f.screens.includes('reload'), false);
});

test('a current profile failure remains retryable', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.profiles[0].reject(new Error('temporary network failure')); await f.flush(); await start;
  assert.ok(f.screens.includes('error:temporary network failure')); assert.equal(f.context.ga, false);
  const retry = f.context.Un(f.context.D.user); await f.flush();
  f.profiles[1].resolve(profile('A')); await retry;
  assert.deepEqual(f.saved.map(record => record.owner), ['A']);
});

test('a signed-in application clears its old persistence before reloading a changed account', async () => {
  const f = fixture(), start = f.start(); await f.flush(); await f.finishProfile('A'); await start;
  f.emit('SIGNED_IN', 'B');
  assert.equal(f.context.ua, null); assert.equal(f.context.saveCallback, null); assert.equal(f.context.D.online, false);
  f.emit('TOKEN_REFRESHED', 'B'); await f.flush();
  assert.equal(f.screens.filter(screen => screen === 'reload').length, 1, 'the latest B refresh must not suppress the required reload');
  assert.deepEqual(f.saved.map(record => record.owner), ['A']);
  f.nicknameCallbacks[0]('stale replacement'); assert.equal(f.context.$.me.nick, 'A');
});

test('signing out a running application disconnects autosave before the deferred reload', async () => {
  const f = fixture(), start = f.start(); await f.flush(); await f.finishProfile('A'); await start;
  assert.equal(f.context.ua, 'A'); assert.equal(typeof f.context.saveCallback, 'function');
  f.emit('SIGNED_OUT');
  assert.equal(f.context.ua, null); assert.equal(f.context.saveCallback, null);
  assert.equal(f.context.D.user, null); assert.equal(f.context.D.online, false);
  assert.equal(f.context.D.walletReady, false);
  await f.flush();
  assert.equal(f.screens.filter(screen => screen === 'reload').length, 1);
  assert.deepEqual(f.saved.map(record => record.owner), ['A']);
});

test('signing in after the guest shell starts reloads the member initialization', async () => {
  const f = fixture({ initial: null }); await f.start(); await f.flush();
  assert.equal(f.context.D.parkGuest, true); assert.equal(f.context.bm, true); assert.equal(f.context.Tr, false);
  f.emit('SIGNED_IN', 'B'); f.emit('TOKEN_REFRESHED', 'B'); await f.flush();
  assert.equal(f.screens.filter(screen => screen === 'reload').length, 1);
  assert.equal(f.context.D.online, false); assert.equal(f.context.ua, null);
  assert.deepEqual(f.profiles, []); assert.deepEqual(f.saved, []);
  assert.equal(f.screens.includes('start:B'), false, 'the old guest shell is not reused without member subscriptions');
});

for (const event of ['INITIAL_SESSION', 'SIGNED_OUT']) {
  test('a late null ' + event + ' does not restart an existing guest application', async () => {
    const f = fixture({ initial: null }); await f.start(); await f.flush();
    f.emit(event); await f.flush();
    assert.equal(f.screens.filter(screen => screen === 'start:guest').length, 1);
    assert.equal(f.screens.filter(screen => screen === 'guest').length, 1);
    assert.equal(f.screens.includes('reload'), false); assert.equal(f.context.D.online, false);
    assert.equal(f.context.D.parkGuest, true); assert.deepEqual(f.saved, []);
  });
}

test('restarting initial authentication unsubscribes the old listener and ignores its session', async () => {
  const f = fixture({ delayedSession: true }), first = f.start(), old = f.listeners[0];
  const second = f.start(); assert.equal(old.active, false);
  old.fn('SIGNED_IN', { user: member('A') });
  f.sessions[0].resolve({ data: { session: { user: member('A') } } });
  f.sessions[1].resolve({ data: { session: { user: member('B') } } });
  await f.flush(); await f.finishProfile('B'); await first; await second;
  assert.deepEqual(f.profiles.map(request => request.owner), ['B']);
  assert.deepEqual(f.saved.map(record => record.owner), ['B']);
});

test('onboarding saved for an obsolete account never supplies the new account model', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.profiles[0].resolve({ profile: null, priv: null }); await f.flush(); await start;
  const save = f.onboard(); assert.equal(f.signups[0].owner, 'A');
  f.emit('SIGNED_IN', 'B'); await f.flush(); await f.finishProfile('B');
  f.signups[0].resolve(null); await f.flush(); await save;
  assert.deepEqual(f.applied, [{ owner: 'B', nickname: 'B' }]);
  assert.deepEqual(f.saved, [{ owner: 'B', nickname: 'B' }]);
  assert.equal(f.screens.some(screen => screen.startsWith('notice:new A')), false);
});

test('a current onboarding failure remains retryable and successful setup starts the correct member', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.profiles[0].resolve({ profile: null, priv: null }); await f.flush(); await start;
  const failed = f.onboard(); f.signups[0].reject(new Error('temporary setup failure')); await failed;
  assert.ok(f.screens.includes('form-error:temporary setup failure')); assert.equal(f.context.ga, false);
  const saved = f.onboard(); f.signups[1].resolve(null); await f.flush();
  assert.equal(f.wallets[0].owner, 'A'); f.wallets[0].resolve({ data: { owned: [] } }); await saved;
  assert.deepEqual(f.saved, [{ owner: 'A', nickname: 'new A' }]);
  assert.equal(f.context.ga, false); assert.equal(f.context.Tr, true);
  assert.equal(f.screens.filter(screen => screen === 'start:A').length, 1);
});

test('password recovery supersedes a pending member profile', async () => {
  const f = fixture(), start = f.start(); await f.flush();
  f.emit('PASSWORD_RECOVERY', 'A'); f.profiles[0].reject(new Error('stale profile')); await f.flush(); await start;
  assert.ok(f.screens.includes('auth:reset')); assert.deepEqual(f.saved, []); assert.deepEqual(f.errors, []);
});

for (const refresh of [false, true]) {
  test('password recovery in a running application opens the account reset page' + (refresh ? ' despite an immediate refresh' : ''), async () => {
    const f = fixture(), start = f.start(); await f.flush(); await f.finishProfile('A'); await start;
    f.emit('PASSWORD_RECOVERY', 'A'); if (refresh) f.emit('TOKEN_REFRESHED', 'A'); await f.flush();
    assert.equal(f.screens.filter(screen => screen === 'route:/?reset=1&next=world').length, 1);
    assert.equal(f.context.ua, null); assert.equal(f.context.saveCallback, null); assert.equal(f.context.D.online, false);
    assert.deepEqual(f.saved.map(record => record.owner), ['A']);
  });
}

for (const followup of ['TOKEN_REFRESHED', 'SIGNED_IN']) {
  test('a queued ' + followup + ' keeps the same account password recovery screen', async () => {
    const f = fixture(), start = f.start(); await f.flush();
    f.emit('PASSWORD_RECOVERY', 'A'); f.emit(followup, 'A');
    f.profiles[0].resolve(profile('A')); await f.flush(); await start;
    assert.equal(f.screens.at(-1), 'auth:reset'); assert.equal(f.context.ui, true);
    assert.deepEqual(f.saved, []); assert.equal(f.context.Tr, false);
  });
}

for (const signedOut of [false, true]) {
  test('a different account does not inherit password recovery' + (signedOut ? ' across sign-out' : ''), async () => {
    const f = fixture(), start = f.start(); await f.flush();
    f.emit('PASSWORD_RECOVERY', 'A'); if (signedOut) f.emit('SIGNED_OUT');
    f.emit('SIGNED_IN', 'B'); await f.flush();
    await f.finishProfile('B'); f.profiles[0].resolve(profile('A')); await f.flush(); await start;
    assert.equal(f.context.ui, false); assert.equal(f.context.D.user.id, 'B');
    assert.deepEqual(f.saved.map(record => record.owner), ['B']);
    assert.equal(f.screens.includes('auth:reset'), false);
  });
}
