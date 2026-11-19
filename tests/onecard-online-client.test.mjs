import test from 'node:test';
import assert from 'node:assert/strict';
import { createOnlineClient, pollDelay } from '../games/onecard/online.mjs';

const waiting = (version = 0) => ({ id: 'room-1', code: 'ABCDEF12', version, status: 'waiting', players: [], game: null });
const data = (room, userId = 'user-a') => ({ ok: true, userId, room, serverEngineVersion: '1.4.0' });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }

test('initial resume serializes create and duplicate clicks do not send two moves', async () => {
  const entry = deferred(), move = deferred(), calls = [], snapshots = [];
  const client = createOnlineClient({ onRoom: room => snapshots.push(room), invoke: body => {
    calls.push(body); return body.action === 'mine' ? entry.promise : move.promise;
  } });
  try {
    const entering = client.enter();
    assert.equal(client.busy, true);
    assert.equal(await client.create(), false);
    entry.resolve(data(waiting())); await entering;
    assert.equal(calls.length, 1);
    const first = client.move({ type: 'draw' });
    assert.equal(await client.move({ type: 'draw' }), false);
    move.resolve(data(waiting(1))); assert.equal(await first, true);
    assert.equal(calls.length, 2);
    assert.equal(snapshots.at(-1).version, 1);
  } finally { client.close(); }
});

test('lost response is bounded, refreshes and retries with the same idempotency key', async () => {
  const lost = deferred(), calls = [], errors = [];
  let moves = 0;
  const client = createOnlineClient({ timeoutMs: 25, onError: error => errors.push(error.code), invoke: async body => {
    calls.push(body);
    if (body.action === 'mine') return data(waiting());
    if (body.action === 'read') return data(waiting(1));
    if (++moves === 1) return lost.promise;
    return data(waiting(1));
  } });
  try {
    await client.enter();
    assert.equal(await client.move({ type: 'draw' }), false);
    assert.equal(client.busy, false, 'timeout always releases UI busy state');
    assert.equal(client.room.version, 1, 'read recovers a committed move');
    assert.equal(await client.move({ type: 'draw' }), true);
    const sent = calls.filter(c => c.action === 'move');
    assert.equal(sent.length, 2); assert.equal(sent[0].request_id, sent[1].request_id);
    assert.deepEqual(errors, ['unavailable']);
    lost.resolve(data(waiting())); await Promise.resolve();
    assert.equal(client.room.version, 1, 'late lost response cannot roll the table back');
  } finally { lost.resolve(data(waiting())); client.close(); }
});

test('closing invalidates a pending response without reviving the table', async () => {
  const pending = deferred(), seen = [];
  const client = createOnlineClient({ onRoom: r => seen.push(r), invoke: () => pending.promise });
  const entering = client.enter();
  client.close(); pending.resolve(data(waiting()));
  await assert.rejects(entering, error => error.code === 'closed');
  assert.deepEqual(seen, []);
});

test('new online rooms always request five seats, including legacy smaller options', async () => {
  const calls = [];
  const client = createOnlineClient({ invoke: async body => {
    calls.push(body); return data(body.action === 'mine' ? null : { ...waiting(), capacity: 5 });
  } });
  try {
    await client.enter();
    assert.equal(await client.create(2), true);
    assert.deepEqual(calls.find(body => body.action === 'create').options, { capacity: 5 });
    assert.equal(client.room.capacity, 5);
  } finally { client.close(); }
});

test('switching accounts during a request never displays the old account hand', async () => {
  const previous = globalThis.OjjudaGetClient, pending = deferred(), invoked = deferred(), seen = [];
  let notifyAuth, session = { user: { id: 'user-a' }, access_token: 'a' };
  globalThis.OjjudaGetClient = async () => ({
    auth: {
      onAuthStateChange: callback => { notifyAuth = callback; return { data: { subscription: { unsubscribe() {} } } }; },
      getSession: async () => ({ data: { session } }),
    },
    functions: { invoke: () => { invoked.resolve(); return pending.promise; } },
  });
  const client = createOnlineClient({ onRoom: r => seen.push(r) });
  try {
    const entering = client.enter(); await invoked.promise;
    session = { user: { id: 'user-b' }, access_token: 'b' };
    notifyAuth('SIGNED_IN', session);
    pending.resolve({ data: data({ ...waiting(), game: { hand: ['S-A'] } }, 'user-a') });
    await assert.rejects(entering, error => error.code === 'not_signed_in');
    assert.equal(client.room, null); assert.equal(client.userId, 'user-b');
    assert.deepEqual(seen, [null], 'only the cleared screen is delivered');
  } finally { client.close(); globalThis.OjjudaGetClient = previous; }
});

test('failed connection backs off and inactive tabs poll less often', () => {
  assert.equal(pollDelay(waiting()), 1500);
  assert.equal(pollDelay(waiting(), { hidden: true }), 5000);
  assert.equal(pollDelay(waiting(), { failures: 5 }), 9600);
  const now = Date.now();
  assert.equal(pollDelay({ status: 'active', deadline: new Date(now + 300).toISOString(), serverTime: now, receivedAt: now }, { now }), 340);
});

test('an older server cannot be asked to commit a new round with fewer reverse cards', async () => {
  const calls = [], errors = [];
  const client = createOnlineClient({ onError: error => errors.push(error.code), invoke: async body => {
    calls.push(body); return { ok: true, userId: 'user-a', room: waiting() };
  } });
  try {
    await client.enter();
    assert.equal(await client.start(), false);
    assert.deepEqual(calls.map(body => body.action), ['mine'], 'no start mutation reaches the older server');
    assert.deepEqual(errors, ['server_update_required']);
    assert.ok(calls.every(body => body.clientVersion === '1.4.0'));
  } finally { client.close(); }
});

test('legacy rounds can resume but a fresh round must contain all 58 cards', async () => {
  const calls = [], errors = [];
  let starts = 0;
  const previous = { ...waiting(1), status: 'finished', game: { deckSize: 54 } };
  const client = createOnlineClient({ onError: error => errors.push(error.code), invoke: async body => {
    calls.push(body);
    if (body.action === 'mine') return data(previous);
    return data({ ...waiting(2), status: 'active', game: { deckSize: ++starts === 1 ? 54 : 58 } });
  } });
  try {
    await client.enter();
    assert.equal(client.room.game.deckSize, 54, 'an existing 54-card round remains readable');
    assert.equal(await client.start(), false);
    assert.equal(client.room.status, 'finished', 'a wrong-size start is never presented as the new game');
    assert.deepEqual(errors, ['server_update_required']);
    assert.equal(await client.start(), true);
    assert.equal(client.room.game.deckSize, 58);
    assert.ok(calls.every(body => body.clientVersion === '1.4.0'));
  } finally { client.close(); }
});
