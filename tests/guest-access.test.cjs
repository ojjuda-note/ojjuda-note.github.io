const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../shared/auth/guest-access.js'), 'utf8');
const key = 'ojjuda.guest-round-completed.v1';

function fixture({ guest = true, used = false, storageFails = false } = {}) {
  const storage = new Map(used ? [[key, '1']] : []);
  const timers = new Map(), listeners = new Map(), clicks = [], navigations = [];
  let clock = 0, nextTimer = 0;
  const context = {
    window: {}, location: { assign: url => navigations.push(url) },
    sessionStorage: {
      getItem(name) { if (storageFails) throw Error('storage unavailable'); return storage.get(name) ?? null; },
      setItem(name, value) { if (storageFails) throw Error('storage unavailable'); storage.set(name, value); }
    },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, at: clock + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, listener) { listeners.set(type, listener); },
    document: { addEventListener(type, listener, capture) { clicks.push({ type, listener, capture }); } }
  };
  vm.runInNewContext(source, context);
  const api = context.window.OjjudaGuestAccess;
  api.configure(() => guest);
  function advance(ms) {
    clock += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at > clock) continue;
      timers.delete(id); timer.callback();
    }
  }
  return { api, storage, timers, listeners, clicks, navigations, advance, setGuest: value => { guest = value; } };
}

test('the first guest round is allowed; completing it automatically opens the login form without another click', () => {
  const f = fixture();
  assert.equal(f.api.canPlay(), true);
  assert.equal(f.storage.has(key), false);
  f.api.finished();
  assert.equal(f.storage.get(key), '1', 'the round is consumed before saving or navigation');
  f.advance(1599); assert.deepEqual(f.navigations, [], 'the result can appear briefly');
  f.advance(1); assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});

test('legacy result-retention callers cannot suppress automatic login', () => {
  const f = fixture();
  f.api.finished({ retainResult: true });
  f.advance(1600);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});

test('replayed completion events cannot delay login or navigate twice', () => {
  const f = fixture();
  f.api.finished(); f.advance(1000); f.api.finished();
  assert.equal(f.timers.size, 1);
  f.advance(600); f.api.finished(); f.advance(5000);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});

test('a replay or different game attempted during the result delay opens login immediately and is blocked', () => {
  const f = fixture(); f.api.finished();
  assert.equal(f.api.canPlay(), false);
  assert.equal(f.api.canPlay(), false);
  assert.equal(f.timers.size, 0);
  f.advance(1600);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});

test('reloading or returning from login does not grant another guest round in the same browsing session', () => {
  const f = fixture({ used: true });
  assert.equal(f.api.canPlay(), false);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
  f.listeners.get('pageshow')();
  assert.equal(f.api.canPlay(), false);
  assert.equal(f.navigations.length, 2, 'a restored page can open the login form again');
});

test('signed-in games are unrestricted even after this browser used its guest round', () => {
  const f = fixture({ guest: false, used: true });
  f.api.finished(); assert.equal(f.api.canPlay(), true); f.advance(5000);
  assert.equal(f.timers.size, 0); assert.deepEqual(f.navigations, []);
});

test('a guest who signs in during the result delay is not redirected out of the member session', () => {
  const f = fixture(); f.api.finished(); f.setGuest(false); f.advance(1600);
  assert.deepEqual(f.navigations, []); assert.equal(f.api.canPlay(), true);
});

test('blocked browser storage still consumes the guest round and opens login', () => {
  const f = fixture({ storageFails: true });
  assert.equal(f.api.canPlay(), true);
  f.api.finished(); f.advance(1600);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
  assert.equal(f.api.canPlay(), false);
});

test('starting and closing an unfinished game never consumes a round or schedules login', () => {
  const f = fixture();
  assert.equal(f.api.canPlay(), true); f.advance(5000);
  assert.equal(f.api.canPlay(), true);
  assert.equal(f.storage.has(key), false); assert.deepEqual(f.navigations, []);
});

test('the captured start-button guard blocks a consumed trial before game handlers run', () => {
  const f = fixture({ used: true });
  assert.equal(f.clicks.length, 1); assert.equal(f.clicks[0].type, 'click'); assert.equal(f.clicks[0].capture, true);
  let prevented = false, stopped = false;
  f.clicks[0].listener({ target: { closest: () => ({}) }, preventDefault() { prevented = true; }, stopImmediatePropagation() { stopped = true; } });
  assert.equal(prevented, true); assert.equal(stopped, true);
  assert.deepEqual(f.navigations, ['/?auth=login&next=world']);
});
