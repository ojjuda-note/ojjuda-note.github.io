'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {JSDOM} = require('jsdom');
const source = fs.readFileSync(path.join(__dirname, '../games/drinking/connection.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function fixture(t, callbacks = {}) {
  const dom = new JSDOM('<main></main>', {
    url: 'https://fixture.test/games/drinking/', runScripts: 'outside-only', pretendToBeVisual: true
  });
  const w = dom.window;
  // Let JSDOM's initial load/pageshow complete before installing the page client.
  await tick();
  let hidden = false, online = true, now = 0, serial = 0;
  const timers = new Map();
  Object.defineProperty(w.document, 'hidden', {get: () => hidden, configurable: true});
  Object.defineProperty(w.navigator, 'onLine', {get: () => online, configurable: true});
  w.Math.random = () => .5;
  w.setTimeout = (callback, delay) => {
    const id = ++serial;
    timers.set(id, {callback, at: now + Number(delay || 0)});
    return id;
  };
  w.clearTimeout = id => timers.delete(id);
  w.eval(source);
  const connection = w.OjjudaRoomConnection.create(callbacks);
  t.after(() => { connection.dispose(); w.close(); });
  async function advance(duration) {
    const until = now + duration;
    for (let count = 0; count < 1000; count++) {
      const due = [...timers].filter(([, task]) => task.at <= until).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) { now = until; await tick(); return; }
      now = due[1].at; timers.delete(due[0]); due[1].callback();
      await tick();
    }
    throw Error('Unexpected timer loop');
  }
  return {
    w, connection, timers, advance,
    async hidden(value) { hidden = value; w.document.dispatchEvent(new w.Event('visibilitychange')); await tick(); },
    async online(value) { online = value; w.dispatchEvent(new w.Event(value ? 'online' : 'offline')); await tick(); },
    async event(name) { w.dispatchEvent(new w.Event(name)); await tick(); },
    async access(allowed) {
      w.document.dispatchEvent(new w.CustomEvent('ojjuda:drinking-access', {detail: {allowed}}));
      await tick();
    }
  };
}

test('a successful read returns its result and leaves no request timeout behind', async t => {
  const f = await fixture(t);
  let signal;
  const value = await f.connection.request(value => { signal = value; return Promise.resolve({revision: 4}); }, {read: true});
  assert.equal(value.revision, 4);
  assert.equal(signal.aborted, false);
  assert.equal(f.timers.size, 0);
});

for (const interruption of ['hidden', 'offline', 'pagehide', 'access', 'account']) {
  test(interruption + ' cancels an ignored-abort request promptly and cannot apply its late answer', async t => {
    const f = await fixture(t);
    let resolveTransport, signal, applied = 0;
    const pending = f.connection.request(value => {
      signal = value;
      return new Promise(resolve => { resolveTransport = resolve; });
    }, {read: true}).then(() => { applied++; return null; }, error => error);
    await tick();
    if (interruption === 'hidden') await f.hidden(true);
    if (interruption === 'offline') await f.online(false);
    if (interruption === 'pagehide') await f.event('pagehide');
    if (interruption === 'access') await f.access(false);
    if (interruption === 'account') f.connection.pause();
    const outcome = await pending;
    assert.equal(f.connection.cancelled(outcome), true);
    assert.equal(signal.aborted, true);
    assert.equal(applied, 0);
    resolveTransport({revision: 999}); await tick();
    assert.equal(applied, 0, 'obsolete transport completion cannot reach the rendering continuation');
    assert.equal(f.timers.size, 0, 'pause removes request and wakeup timers');
  });
}

test('a user action cancels reads but preserves an already submitted action', async t => {
  const f = await fixture(t);
  let finishRead, finishAction, readSignal, actionSignal;
  const read = f.connection.request(signal => {
    readSignal = signal; return new Promise(resolve => { finishRead = resolve; });
  }, {read: true}).catch(error => error);
  const action = f.connection.request(signal => {
    actionSignal = signal; return new Promise(resolve => { finishAction = resolve; });
  });
  await tick();
  f.connection.cancelReads();
  assert.equal(f.connection.cancelled(await read), true);
  assert.equal(readSignal.aborted, true);
  assert.equal(actionSignal.aborted, false, 'read cancellation does not interrupt a possibly committed action');
  finishAction({revision: 8});
  assert.equal((await action).revision, 8);
  finishRead({revision: 7}); await tick();
  assert.equal(f.timers.size, 0);
});

test('returning online wakes once for the same focus/pageshow burst and makes no offline call', async t => {
  let resumed = 0;
  const f = await fixture(t, {onResume: () => resumed++});
  await f.online(false);
  let calls = 0;
  const error = await f.connection.request(() => { calls++; }).catch(error => error);
  assert.equal(f.connection.cancelled(error), true);
  assert.equal(calls, 0);
  await f.online(true);
  await f.event('focus'); await f.event('pageshow');
  assert.equal(resumed, 0);
  await f.advance(0);
  assert.equal(resumed, 1);
  assert.equal(f.connection.active(), true);
});

test('the age gate stays paused after a visible return until verification succeeds', async t => {
  let resumed = 0;
  const f = await fixture(t, {onResume: () => resumed++});
  await f.access(false);
  await f.hidden(true); await f.hidden(false); await f.event('focus');
  await f.advance(0);
  assert.equal(f.connection.active(), false);
  assert.equal(resumed, 0);
  await f.access(true); await f.advance(0);
  assert.equal(resumed, 1);
});

test('a stalled transport times out and aborts without automatically replaying a write', async t => {
  const f = await fixture(t);
  let signal, calls = 0;
  const pending = f.connection.request(value => {
    calls++; signal = value; return new Promise(() => {});
  }).catch(error => error);
  await tick(); await f.advance(11999);
  assert.equal(signal.aborted, false);
  await f.advance(1);
  assert.equal((await pending).code, 'connection_timeout');
  assert.equal(signal.aborted, true);
  await f.advance(30000);
  assert.equal(calls, 1, 'uncertain writes must be reconciled by reading, never blindly replayed');
});

test('failed reads back off with a bounded jittered delay and successful reads restore cadence', async t => {
  const f = await fixture(t);
  assert.equal(f.connection.delay(1000), 1000);
  const delays = [];
  for (let i = 0; i < 8; i++) { f.connection.failed(); delays.push(f.connection.delay(1000)); }
  assert.ok(delays[0] > 1000);
  assert.ok(delays.every((n, i) => n <= 12000 && (!i || n >= delays[i - 1])));
  f.connection.succeeded();
  assert.equal(f.connection.delay(1000), 1000);
  const spread = new Set();
  for (let i = 0; i < 12; i++) { f.w.Math.random = () => i / 12; spread.add(f.connection.delay(1000)); }
  assert.equal(spread.size, 12, 'twelve clients need not poll on one synchronized cadence');
});

test('disposing a page removes event listeners and never resumes it', async t => {
  let resumed = 0;
  const f = await fixture(t, {onResume: () => resumed++});
  f.connection.dispose();
  await f.event('pageshow'); await f.event('focus'); await f.online(true); await f.access(true);
  await f.advance(60000);
  assert.equal(resumed, 0);
  assert.equal(f.connection.active(), false);
  assert.equal(f.timers.size, 0);
});
