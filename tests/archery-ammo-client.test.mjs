import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../games/forest-archer/ammo-client.mjs', import.meta.url), 'utf8');
const OWNER = '11111111-1111-4111-8111-111111111111';
const SESSION = '22222222-2222-4222-8222-222222222222';
const OTHER = '33333333-3333-4333-8333-333333333333';
const ORIGIN = 'https://ojjuda.test';
const SERVER_EPOCH = Date.parse('2026-11-02T12:00:00.000Z');
const tick = () => new Promise(resolve => setImmediate(resolve));
let fixtureSequence = 0;
const snapshot = (extra = {}) => ({ ok: true, launch_epoch: 4, remaining: 20, free_remaining: 20, paid_remaining: 0, coins: 100, revision: 1, main_rounds: 5, milestones_granted: 1, daily_eligible: true, day: '2026-11-02', daily_checked: true, pack_ammo: 10, pack_price: 5,
  server_now: new Date(SERVER_EPOCH).toISOString(), coach_expires_at: null, coach_active: false, coach_price: 10, coach_duration_seconds: 86400, ...extra });

// Real client, isolated browser globals and fake parent messages. No RPC or wallet
// connector is present in this harness, including the purchase tests.
async function fixture({ store = new Map(), initialize = true, owner = OWNER, sessionId = SESSION, storageFails = false, recordsOnly = false } = {}) {
  let now = 0, sequence = 0, timerId = 0;
  const fixtureId = ++fixtureSequence;
  const listeners = new Set(), messages = [], timers = new Map(), changes = [];
  const parent = { postMessage(data, origin) { messages.push({ data: JSON.parse(JSON.stringify(data)), origin }); } };
  const window = { parent, location: { origin: ORIGIN }, addEventListener(type, fn) { if (type === 'message') listeners.add(fn); }, removeEventListener(type, fn) { listeners.delete(fn); } };
  const storage = { getItem: key => store.get(key) ?? null, setItem(key, value) { if (storageFails) throw Error('storage blocked');store.set(key, String(value)); }, removeItem: key => store.delete(key) };
  const context = vm.createContext({ window, localStorage: storage, performance: {now: () => now}, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(fixtureId * 10000 + ++sequence).padStart(12, '0')}` }, Uint8Array,
    setTimeout(fn, delay) { const id = ++timerId;timers.set(id, { fn, due: now + delay });return id; }, clearTimeout(id) { timers.delete(id); } });
  const module = new vm.SourceTextModule(source, { context });await module.link(() => {});await module.evaluate();
  const client = module.namespace.createAmmoClient({ recordsOnly, onChange(value) { changes.push({ connection: value.connection, pending: value.pending, snapshot: value.snapshot }); } });
  const f = {
    client, store, messages, changes, module, synchronousChanges: changes.length,
    requests: () => messages.filter(item => item.data.type === 'ammo-request').map(item => item.data),
    emit(data, options = {}) { for (const receive of [...listeners]) receive({ data, source: options.source ?? parent, origin: options.origin ?? ORIGIN }); },
    init(values = {}) { f.emit({ source: 'ojjuda-archery-world', type: 'init', launchEpoch: 4, owner, sessionId, available: true, ...values }); },
    reply(request, result, options = {}) { f.emit({ source: 'ojjuda-archery-world', type: 'ammo-response', action: request.action, owner: request.owner, sessionId: request.sessionId, requestId: request.requestId, result, ...options.envelope }, options); },
    flush: tick,
    advance(ms) { const end = now + ms;for (;;) { const next = [...timers].filter(([, timer]) => timer.due <= end).sort((a,b) => a[1].due - b[1].due)[0];if (!next) break;now = next[1].due;timers.delete(next[0]);next[1].fn(); }now = end; }
  };
  if (initialize) { f.init();await tick();const request = f.requests().find(item => item.action === 'status');assert.ok(request);f.reply(request, snapshot());await tick(); }
  return f;
}

test('handshake and callbacks are deferred and only the exact parent, origin, owner, session and request are trusted', async () => {
  const f = await fixture({ initialize: false });
  assert.equal(f.synchronousChanges, 0);assert.equal(f.client.connection, 'connecting');
  await f.flush();assert.equal(f.messages[0].data.type, 'ready');assert.equal(f.messages[0].origin, ORIGIN);
  f.emit({ source: 'ojjuda-archery-world', type: 'init', launchEpoch: 4, owner: OWNER, sessionId: SESSION, available: true }, { source: {} });
  f.emit({ source: 'ojjuda-archery-world', type: 'init', launchEpoch: 4, owner: OWNER, sessionId: SESSION, available: true }, { origin: 'https://wrong.test' });
  assert.equal(f.requests().length, 0);
  f.init();await f.flush();const request = f.requests()[0];
  for (const envelope of [{ owner: OTHER }, { sessionId: OTHER }, { requestId: OTHER }, { action: 'buy' }, { source: 'another-parent' }]) f.reply(request, snapshot({ remaining: 999 }), { envelope });
  f.reply(request, snapshot({ remaining: 999 }), { source: {} });
  f.reply(request, snapshot({ remaining: 999 }), { origin: 'https://wrong.test' });
  assert.equal(f.client.snapshot, null);
  f.reply(request, snapshot());await f.flush();
  assert.equal(f.client.connection, 'ready');assert.equal(f.client.snapshot.remaining, 20);
  assert.ok(f.messages.every(item => item.origin === ORIGIN));f.client.dispose();
});

test('stage 220 registration, refresh and completion serialize with the parent and use the supplied UUID', async () => {
  const f = await fixture({ initialize: false });
  const started = f.client.startRound(OTHER, 220);f.init();await f.flush();
  assert.equal(f.requests().length, 1, 'initial status and registration cannot race the single-request bridge');
  for (let i = 0; i < 2; i++) {
    const request = f.requests().at(-1);assert.ok(['status', 'round-start'].includes(request.action));
    if (request.action === 'round-start') { assert.equal(request.requestId, OTHER);assert.equal(request.stage, 220);assert.equal('runId' in request, false); }
    f.reply(request, snapshot({ run_id: SESSION, revision: i + 1 }));await f.flush();
  }
  assert.equal((await started).run_id, SESSION);
  const completion = f.client.completeRound(SESSION, 220, 48);await f.flush();const request = f.requests().at(-1);
  assert.equal(request.action, 'round-complete');assert.equal(request.runId, SESSION);assert.equal(request.stage, 220);assert.equal(request.score, 48);assert.equal(request.launchEpoch, 4);
  f.reply(request, snapshot({ main_rounds: 6, revision: 3 }));assert.equal((await completion).main_rounds, 6);f.client.dispose();
});

test('pending high-stage registration and completion survive reopening and recover their original receipts', async () => {
  for (const recordsOnly of [false, true]) for (const [action, stage] of [['round-start', 121], ['round-complete', 220]]) {
    const original = await fixture({recordsOnly});
    const operation = action === 'round-start' ? original.client.startRound(OTHER, stage) : original.client.completeRound(SESSION, stage, 44);
    await original.flush();const request = original.requests().at(-1);
    original.reply(request, {ok: false, reason: 'pending'});assert.equal((await operation).reason, 'pending');
    original.client.dispose();
    const reopened = await fixture({store: original.store, sessionId: OTHER, recordsOnly});await reopened.flush();
    const lookup = reopened.requests().find(item => item.action === 'receipt');
    assert.ok(lookup, `the persisted ${stage} mission remains valid after reopening`);
    assert.equal(lookup.receiptId, request.requestId);assert.equal(lookup.originalAction, action);
    assert.equal(reopened.client.pending.stage, stage);
    reopened.reply(lookup, snapshot({found: true, receipt: {ok: true, run_id: SESSION}, revision: 2}));await reopened.flush();
    assert.equal((await reopened.client.retryPending()).ok, true);assert.equal(reopened.client.pending, null);
    assert.deepEqual(reopened.requests().map(item => item.action), ['status', 'receipt'], 'receipt recovery never registers or completes a second round');
    reopened.client.dispose();
  }
});

test('duplicate purchase clicks share one UUID and insufficient balances cannot change local ammunition', async () => {
  const f = await fixture();const before = f.requests().length;
  const first = f.client.buy(), second = f.client.buy();await f.flush();
  assert.equal(f.requests().length, before + 1);const request = f.requests().at(-1);assert.equal(request.action, 'buy');
  assert.equal((await f.client.spend('event-run')).reason, 'busy');
  assert.equal('price' in request, false);assert.equal('quantity' in request, false);
  f.reply(request, { ok: false, reason: 'coins' });
  assert.equal((await first).reason, 'coins');assert.equal((await second).reason, 'coins');
  assert.equal(f.client.snapshot.remaining, 20);assert.equal(f.client.snapshot.coins, 100);assert.equal(f.client.pending, null);
  const empty = f.client.spend('event-run');await f.flush();f.reply(f.requests().at(-1), snapshot({ ok: false, reason: 'ammo_empty', remaining: 0, free_remaining: 0, revision: 2 }));
  assert.equal((await empty).ok, false);assert.equal(f.client.snapshot.remaining, 0);assert.equal(f.client.pending, null);f.client.dispose();
});

test('an unknown live spend is persisted and only explicit retry resubmits its original UUID', async () => {
  const f = await fixture();const spending = f.client.spend('event-round-A');await f.flush();const request = f.requests().at(-1);
  assert.equal('runId' in request, false, 'local event binding is not server payment authority');
  f.advance(12000);assert.equal((await spending).reason, 'pending');assert.equal(f.client.pending.status, 'unknown');
  assert.ok([...f.store.values()].some(value => value.includes(request.requestId)));
  const count = f.requests().length;assert.equal((await f.client.spend('event-round-A')).reason, 'pending');assert.equal(f.requests().length, count);
  const retried = f.client.retryPending();await f.flush();const retry = f.requests().at(-1);
  assert.equal(retry.requestId, request.requestId);assert.equal(retry.action, 'spend');
  f.reply(retry, snapshot({ remaining: 19, free_remaining: 19, revision: 2 }));
  assert.equal((await retried).ok, true);assert.equal(f.client.pending, null);assert.equal(f.client.snapshot.remaining, 19);f.client.dispose();
});

test('reopened spends only inspect receipts and neither confirmed nor missing receipts authorize a new shot', async () => {
  for (const found of [false, true]) {
    const original = await fixture();const spending = original.client.spend('abandoned-event');await original.flush();const request = original.requests().at(-1);
    original.reply(request, { ok: false, reason: 'pending' });await spending;original.client.dispose();
    const f = await fixture({ store: original.store, sessionId: OTHER });await f.flush();
    const lookup = f.requests().find(item => item.action === 'receipt');assert.ok(lookup);
    assert.equal(lookup.receiptId, request.requestId);assert.equal(lookup.originalAction, 'spend');
    f.reply(lookup, snapshot({ found, receipt: found ? { ok: true, remaining: 19 } : null, remaining: found ? 19 : 20, revision: 2 }));await f.flush();
    assert.equal(f.client.pending, null);assert.equal((await f.client.retryPending()).ok, false);
    assert.deepEqual(f.requests().map(item => item.action), ['status', 'receipt']);
    assert.ok([...f.store.entries()].some(([key, value]) => key.includes('recovery') && value.includes(request.requestId)));
    const fresh = f.client.spend('new-event');await f.flush();assert.notEqual(f.requests().at(-1).requestId, request.requestId);
    f.reply(f.requests().at(-1), snapshot({ remaining: 18, revision: 3 }));assert.equal((await fresh).ok, true);f.client.dispose();
  }
});

test('a recovered purchase never buys on initialization and an explicit retry retains its UUID', async () => {
  const original = await fixture();const buying = original.client.buy();await original.flush();const request = original.requests().at(-1);
  original.reply(request, { ok: false, reason: 'pending' });await buying;original.client.dispose();
  const f = await fixture({ store: original.store, sessionId: OTHER });await f.flush();const lookup = f.requests().at(-1);
  assert.equal(lookup.action, 'receipt');f.reply(lookup, snapshot({ found: false, receipt: null }));await f.flush();
  assert.equal(f.client.pending.recovered, true);assert.ok(f.requests().every(item => item.action !== 'buy'));
  const retry = f.client.retryPending();await f.flush();const replay = f.requests().at(-1);
  assert.equal(replay.action, 'buy');assert.equal(replay.requestId, request.requestId);assert.equal(replay.sessionId, OTHER);
  f.reply(replay, snapshot({ remaining: 30, paid_remaining: 10, coins: 95, revision: 2 }));
  assert.equal((await retry).ok, true);assert.equal(f.client.snapshot.coins, 95);assert.equal(f.client.pending, null);f.client.dispose();
});

test('a late live confirmation can be acknowledged without creating another purchase or spend', async () => {
  const f = await fixture();const buying = f.client.buy();await f.flush();const request = f.requests().at(-1);
  f.advance(12000);assert.equal((await buying).reason, 'pending');
  f.reply(request, snapshot({ remaining: 30, coins: 95, paid_remaining: 10, revision: 2 }));await f.flush();
  assert.equal(f.client.pending.status, 'confirmed');const count = f.requests().length;
  const receipt = await f.client.retryPending();assert.equal(receipt.ok, true);assert.equal(f.client.pending, null);
  assert.equal(f.requests().length, count);assert.equal(f.client.snapshot.remaining, 30);f.client.dispose();
});

test('older revisions cannot restore spent ammo and daily or milestone balances come only from the server', async () => {
  const f = await fixture();
  for (const data of [snapshot({ remaining: 80, revision: 4, milestones_granted: 4 }), snapshot({ remaining: 80, revision: 5, day: '2026-11-03' }), snapshot({ remaining: 19, revision: 6, day: '2026-11-03' }), snapshot({ remaining: 20, revision: 7, day: '2026-11-04' })]) {
    const result = f.client.refresh();await f.flush();const request = f.requests().at(-1);
    assert.deepEqual(Object.keys(request).sort(), ['action','launchEpoch','owner','requestId','sessionId','source','type'].sort());
    f.reply(request, data);await result;assert.equal(f.client.snapshot.remaining, data.remaining);
  }
  const stale = f.client.refresh();await f.flush();f.reply(f.requests().at(-1), snapshot({ remaining: 80, revision: 4 }));await stale;
  assert.equal(f.client.snapshot.remaining, 20);assert.equal(f.client.snapshot.revision, 7);f.client.dispose();
});

test('owner changes isolate persisted intents and late replies cannot affect the next account', async () => {
  const f = await fixture();const buying = f.client.buy();await f.flush();const old = f.requests().at(-1);
  f.init({ owner: OTHER, sessionId: OTHER });assert.equal((await buying).reason, 'identity_changed');await f.flush();
  f.reply(old, snapshot({ remaining: 900, coins: 0, revision: 100 }));assert.equal(f.client.snapshot, null);
  const status = f.requests().at(-1);assert.equal(status.owner, OTHER);f.reply(status, snapshot({ remaining: 3, revision: 1 }));await f.flush();
  assert.equal(f.client.snapshot.remaining, 3);assert.equal(f.client.pending, null);
  assert.ok([...f.store.entries()].some(([key, value]) => key.endsWith(OWNER) && value.includes(old.requestId)));f.client.dispose();
});

test('invalid inputs and unavailable durable storage never submit a financial request', async () => {
  const f = await fixture({ storageFails: true });const count = f.requests().length;
  assert.equal((await f.client.buy()).reason, 'storage_unavailable');
  assert.equal((await f.client.buyCoach()).reason, 'storage_unavailable');
  assert.equal((await f.client.startRound('bad', 1)).reason, 'invalid');
  for (const stage of [0, 221, 220.5, '220']) {
    assert.equal((await f.client.startRound(OTHER, stage)).reason, 'invalid');
    assert.equal((await f.client.completeRound(OTHER, stage)).reason, 'invalid');
  }
  assert.equal((await f.client.completeRound('bad', 1, 40)).reason, 'invalid');
  for (const score of [-1, 151, 30.5, '40', undefined]) assert.equal((await f.client.completeRound(OTHER, 1, score)).reason, 'invalid');
  assert.equal((await f.client.spend('')).reason, 'invalid');assert.equal(f.requests().length, count);
  assert.match(f.module.namespace.createRequestId(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  f.client.dispose();
});

test('coach rental requests share one UUID, accept only server terms and cannot race another purchase', async () => {
  const f = await fixture(), before = f.requests().length;
  const first = f.client.buyCoach(), second = f.client.buyCoach();await f.flush();
  assert.equal(f.requests().length, before + 1);
  const request = f.requests().at(-1);assert.equal(request.action, 'coach-buy');
  assert.deepEqual(Object.keys(request).sort(), ['action', 'launchEpoch', 'owner', 'requestId', 'sessionId', 'source', 'type'].sort());
  assert.equal((await f.client.buy()).reason, 'busy');assert.equal((await f.client.spend('event')).reason, 'busy');
  const expires = new Date(SERVER_EPOCH + 86400000).toISOString();
  f.reply(request, snapshot({coins: 90, revision: 2, coach_active: true, coach_expires_at: expires}));
  assert.equal((await first).ok, true);assert.equal((await second).ok, true);
  assert.equal(f.client.snapshot.remaining, 20);assert.equal(f.client.snapshot.coins, 90);
  assert.equal(f.client.snapshot.coach_expires_at, expires);assert.equal(f.client.snapshot.coach_active, true);
  assert.equal(f.client.snapshot.coach_price, 10);assert.equal(f.client.snapshot.coach_duration_seconds, 86400);
  assert.equal(f.client.pending, null);f.client.dispose();
});

test('a definitive coach-active decline reconciles the rental bought elsewhere without charging again', async () => {
  const f = await fixture(), buying = f.client.buyCoach();await f.flush();
  const request = f.requests().at(-1), expires = new Date(SERVER_EPOCH + 86400000).toISOString();
  f.reply(request, snapshot({ok: false, reason: 'coach_active', coins: 90, revision: 2,
    coach_active: true, coach_expires_at: expires}));
  assert.equal((await buying).reason, 'coach_active');assert.equal(f.client.pending, null);
  assert.equal(f.client.snapshot.coins, 90);assert.equal(f.client.snapshot.coach_active, true);
  assert.equal(f.client.snapshot.coach_expires_at, expires);assert.equal(f.client.snapshot.remaining, 20);
  assert.equal(f.requests().filter(item => item.action === 'coach-buy').length, 1);
  f.client.dispose();
});

test('retired coach purchases settle definitively and still reconcile the latest account snapshot', async () => {
  const f = await fixture(), buying = f.client.buyCoach();await f.flush();
  const request = f.requests().at(-1);
  f.reply(request, snapshot({ok: false, reason: 'coach_basic', coins: 95, revision: 2, remaining: 18, free_remaining: 18}));
  assert.equal((await buying).reason, 'coach_basic');
  assert.equal(f.client.pending, null);
  assert.equal(f.client.snapshot.coins, 95);assert.equal(f.client.snapshot.remaining, 18);
  assert.equal(f.requests().filter(item => item.action === 'coach-buy').length, 1);
  f.client.dispose();
});

test('a retired coach receipt clears a recovered request without resubmitting a purchase', async () => {
  const original = await fixture();const buying = original.client.buyCoach();await original.flush();
  const request = original.requests().at(-1);original.reply(request, {ok: false, reason: 'pending'});await buying;original.client.dispose();
  const f = await fixture({store: original.store, sessionId: OTHER});await f.flush();
  const lookup = f.requests().at(-1);
  assert.equal(lookup.action, 'receipt');assert.equal(lookup.receiptId, request.requestId);
  f.reply(lookup, snapshot({found: true, receipt: snapshot({ok: false, reason: 'coach_basic', action: 'coach-buy', request_id: request.requestId})}));
  await f.flush();
  const count = f.requests().length, result = await f.client.retryPending();
  assert.equal(result.ok, false);assert.equal(result.reason, 'coach_basic');
  assert.equal(f.client.pending, null);assert.equal(f.client.snapshot.coins, 100);
  assert.equal(f.requests().length, count);assert.equal(f.requests().some(item => item.action === 'coach-buy'), false);
  f.client.dispose();
});

test('an uncertain coach rental is recovered by receipt and explicit retry keeps the original purchase UUID', async () => {
  const original = await fixture();const buying = original.client.buyCoach();await original.flush();
  const request = original.requests().at(-1);original.reply(request, {ok: false, reason: 'pending'});await buying;original.client.dispose();
  const f = await fixture({store: original.store, sessionId: OTHER});await f.flush();
  const lookup = f.requests().at(-1);assert.equal(lookup.action, 'receipt');assert.equal(lookup.originalAction, 'coach-buy');
  assert.equal(lookup.receiptId, request.requestId);assert.equal(f.requests().some(item => item.action === 'coach-buy'), false);
  f.reply(lookup, snapshot({found: false, receipt: null}));await f.flush();
  const retry = f.client.retryPending();await f.flush();const replay = f.requests().at(-1);
  assert.equal(replay.action, 'coach-buy');assert.equal(replay.requestId, request.requestId);
  const expires = new Date(SERVER_EPOCH + 86400000).toISOString();
  f.reply(replay, snapshot({coins: 90, revision: 2, coach_active: true, coach_expires_at: expires}));
  assert.equal((await retry).ok, true);assert.equal(f.client.snapshot.coach_expires_at, expires);assert.equal(f.client.pending, null);
  f.client.dispose();
});

test('rental expiry follows a monotonic server clock and late same-revision replies cannot revive expired access', async () => {
  const f = await fixture(), start = f.client.serverNow;
  assert.equal(start, SERVER_EPOCH);f.advance(2500);assert.equal(f.client.serverNow, SERVER_EPOCH + 2500);
  const expires = new Date(SERVER_EPOCH + 10000).toISOString();
  let refreshing = f.client.refresh();await f.flush();
  f.reply(f.requests().at(-1), snapshot({revision: 2, server_now: new Date(SERVER_EPOCH + 2500).toISOString(), coach_active: true, coach_expires_at: expires}));await refreshing;
  f.advance(8000);assert.equal(f.client.serverNow, SERVER_EPOCH + 10500);
  refreshing = f.client.refresh();await f.flush();
  f.reply(f.requests().at(-1), snapshot({revision: 2, server_now: new Date(SERVER_EPOCH + 10500).toISOString(), coach_active: false, coach_expires_at: expires}));await refreshing;
  assert.equal(f.client.snapshot.coach_active, false);
  refreshing = f.client.refresh();await f.flush();
  f.reply(f.requests().at(-1), snapshot({revision: 2, server_now: new Date(SERVER_EPOCH + 2500).toISOString(), coach_active: true, coach_expires_at: expires}));await refreshing;
  assert.equal(f.client.snapshot.coach_active, false);assert.equal(f.client.serverNow, SERVER_EPOCH + 10500);
  f.init({owner: OTHER, sessionId: OTHER});await f.flush();
  assert.equal(f.client.snapshot, null, 'another account cannot inherit this rental or clock snapshot');
  f.client.dispose();
});

test('an expired recovered rental uses current outer snapshot fields instead of an old active payment receipt', async () => {
  const original = await fixture(), buying = original.client.buyCoach();await original.flush();
  const request = original.requests().at(-1);original.reply(request, {ok: false, reason: 'pending'});await buying;original.client.dispose();
  const f = await fixture({store: original.store, sessionId: OTHER});await f.flush();
  const lookup = f.requests().at(-1), expires = new Date(SERVER_EPOCH + 86400000).toISOString();
  const historical = snapshot({coins: 90, revision: 2, coach_active: true, coach_expires_at: expires});
  f.reply(lookup, snapshot({coins: 90, revision: 2, coach_active: false, coach_expires_at: expires,
    server_now: new Date(SERVER_EPOCH + 86400001).toISOString(), found: true, receipt: historical}));
  await f.flush();assert.equal(f.client.pending.status, 'confirmed');
  assert.equal(f.client.snapshot.coach_active, false);assert.ok(f.client.serverNow > Date.parse(expires));
  const count = f.requests().length, result = await f.client.retryPending();
  assert.equal(result.ok, true);assert.equal(result.coach_active, false);assert.equal(result.coach_expires_at, expires);
  assert.equal(f.requests().length, count);assert.equal(f.requests().some(item => item.action === 'coach-buy'), false);
  assert.equal(f.client.pending, null);f.client.dispose();
});


test('test-era snapshots and handshakes cannot restore pre-launch ammunition or rounds', async () => {
  const f = await fixture({initialize: false});
  f.init({launchEpoch: 3});await f.flush();assert.equal(f.requests().length, 0);
  f.init();await f.flush();const first = f.requests().at(-1);
  f.reply(first, snapshot({launch_epoch: 3, remaining: 999, main_rounds: 999}));await f.flush();
  assert.equal(f.client.snapshot, null);assert.equal(f.client.connection, 'unavailable');
  const refreshed = f.client.refresh();await f.flush();f.reply(f.requests().at(-1), snapshot({remaining: 0, main_rounds: 0}));
  assert.equal((await refreshed).ok, true);assert.equal(f.client.snapshot.remaining, 0);assert.equal(f.client.snapshot.main_rounds, 0);
  const stale = f.client.refresh();await f.flush();f.reply(f.requests().at(-1), snapshot({launch_epoch: undefined, remaining: 888, main_rounds: 888}));
  assert.equal((await stale).reason, 'update_required');assert.equal(f.client.snapshot.remaining, 0);assert.equal(f.client.snapshot.main_rounds, 0);
  f.client.dispose();
});

test('old pending purchases are removed and never become new-era purchases or receipt lookups', async () => {
  const oldKey = 'forest-archer-ammo-pending-v2:' + OWNER;
  const recoveryKey = 'forest-archer-ammo-recovery-v2:' + OWNER;
  const store = new Map([[oldKey, JSON.stringify({version: 1, owner: OWNER, action: 'buy', requestId: OTHER, payload: {}})], [recoveryKey, 'old receipts']]);
  const f = await fixture({store});await f.flush();
  assert.equal(f.client.pending, null);assert.equal(store.has(oldKey), false);assert.equal(store.has(recoveryKey), false);
  assert.deepEqual(f.requests().map(request => request.action), ['status']);
  const purchase = f.client.buy();await f.flush();const request = f.requests().at(-1);
  assert.notEqual(request.requestId, OTHER);assert.equal(request.launchEpoch, 4);
  f.reply(request, snapshot({remaining: 30, coins: 95}));assert.equal((await purchase).ok, true);
  f.client.dispose();
});


test('a definitively reset receipt cannot trap a recovered purchase or replay it into the new launch', async () => {
  const original = await fixture(), buying = original.client.buy();await original.flush();
  const request = original.requests().at(-1);original.reply(request, {ok: false, reason: 'pending'});await buying;original.client.dispose();
  const reopened = await fixture({store: original.store, sessionId: OTHER});await reopened.flush();
  const lookup = reopened.requests().find(item => item.action === 'receipt');assert.ok(lookup);
  reopened.reply(lookup, snapshot({ok: false, reason: 'progress_reset', remaining: 0, free_remaining: 0, main_rounds: 0, found: false, receipt: null}));
  await reopened.flush();assert.equal(reopened.client.pending, null);assert.equal(reopened.client.snapshot.remaining, 0);
  assert.equal((await reopened.client.retryPending()).reason, 'nothing_pending');
  assert.deepEqual(reopened.requests().map(item => item.action), ['status', 'receipt']);
  reopened.client.dispose();
});

test('a 150-point round survives pending receipt recovery without resubmitting a completion',async()=>{
  const original=await fixture();
  const completing=original.client.completeRound(SESSION,220,150);await original.flush();
  const request=original.requests().at(-1);
  assert.equal(request.action,'round-complete');assert.equal(request.score,150);
  const stored=JSON.parse(original.store.get('forest-archer-ammo-pending-v4:'+OWNER));
  assert.equal(stored.payload.score,150);
  original.reply(request,{ok:false,reason:'pending'});assert.equal((await completing).reason,'pending');original.client.dispose();
  const reopened=await fixture({store:original.store,sessionId:OTHER});await reopened.flush();
  const lookup=reopened.requests().find(item=>item.action==='receipt');assert.ok(lookup);
  assert.equal(lookup.receiptId,request.requestId);assert.equal(lookup.originalAction,'round-complete');
  reopened.reply(lookup,snapshot({found:true,receipt:{ok:true,run_id:SESSION,score:150},main_rounds:6,revision:2}));await reopened.flush();
  assert.equal((await reopened.client.retryPending()).ok,true);assert.equal(reopened.client.pending,null);
  assert.deepEqual(reopened.requests().map(item=>item.action),['status','receipt']);
  reopened.client.dispose();
});

test('records-only mode rejects financial operations before handshake and during normal record saving', async () => {
  const f = await fixture({initialize: false, recordsOnly: true});
  const retiredActions = () => Promise.all([f.client.spend('main-round'), f.client.buy(), f.client.buyCoach()]);
  for (const result of await retiredActions()) assert.equal(result.reason, 'ammo_retired');
  assert.equal(f.requests().length, 0);assert.equal(f.store.size, 0);
  f.init();await f.flush();
  f.reply(f.requests().at(-1), snapshot({remaining: 0, free_remaining: 0}));await f.flush();
  const started = f.client.startRound(OTHER, 220);await f.flush();
  const start = f.requests().at(-1);assert.equal(start.action, 'round-start');
  f.reply(start, snapshot({remaining: 0, free_remaining: 0, run_id: SESSION, revision: 2}));
  assert.equal((await started).run_id, SESSION);
  const completed = f.client.completeRound(SESSION, 220, 150);await f.flush();
  const completion = f.requests().at(-1);
  for (const result of await retiredActions()) assert.equal(result.reason, 'ammo_retired');
  assert.equal(f.client.pending.requestId, completion.requestId, 'retired operations cannot disturb a saved round');
  f.reply(completion, snapshot({remaining: 0, free_remaining: 0, main_rounds: 6, revision: 3, score: 150}));
  assert.equal((await completed).score, 150);assert.equal(f.client.pending, null);
  assert.deepEqual(f.requests().map(request => request.action), ['status', 'round-start', 'round-complete']);
  assert.equal(f.client.snapshot.remaining, 0, 'record mode never fabricates an ammunition balance');
  f.client.dispose();
});

test('records-only mode archives old financial intents and never replays them or overwrites a new round', async () => {
  for (const action of ['spend', 'buy', 'coach-buy']) for (const outcome of ['found', 'declined', 'missing', 'timeout']) {
    const old = await fixture();
    const operation = action === 'spend' ? old.client.spend('old-event') : action === 'buy' ? old.client.buy() : old.client.buyCoach();
    await old.flush();const original = old.requests().at(-1);
    old.reply(original, {ok: false, reason: 'pending'});assert.equal((await operation).reason, 'pending');old.client.dispose();
    const f = await fixture({store: old.store, sessionId: OTHER, recordsOnly: true});await f.flush();
    const lookup = f.requests().find(request => request.action === 'receipt');
    assert.ok(lookup);assert.equal(lookup.receiptId, original.requestId);assert.equal(lookup.originalAction, action);
    assert.equal(f.client.pending, null, 'a retired financial request cannot keep new records locked');
    assert.equal((await f.client.retryPending()).reason, 'nothing_pending');
    const recoveryKey = 'forest-archer-ammo-recovery-v4:' + OWNER;
    const pendingKey = 'forest-archer-ammo-pending-v4:' + OWNER;
    const entry = () => JSON.parse(f.store.get(recoveryKey)).find(item => item.requestId === original.requestId);
    assert.equal(entry().retired, true);assert.equal(entry().action, action);

    const started = f.client.startRound(OTHER, 17);await f.flush();
    assert.equal(f.client.pending.action, 'round-start');
    assert.equal(JSON.parse(f.store.get(pendingKey)).requestId, OTHER);
    if (outcome === 'timeout') { f.advance(12000);await f.flush(); }
    else {
      const found = outcome !== 'missing';
      f.reply(lookup, snapshot({found, receipt: found ? {ok: outcome === 'found', reason: outcome === 'declined' ? 'coins' : undefined} : null}));
      await f.flush();
      assert.equal(entry().receiptFound, found);
      if (found) assert.equal(entry().confirmed, outcome === 'found');
    }
    const start = f.requests().at(-1);
    assert.equal(start.action, 'round-start');assert.equal(start.requestId, OTHER);
    assert.equal(f.client.pending.requestId, OTHER);
    assert.equal(JSON.parse(f.store.get(pendingKey)).requestId, OTHER, 'a late retirement lookup cannot erase the new record intent');
    f.reply(start, snapshot({run_id: SESSION, revision: 2}));assert.equal((await started).run_id, SESSION);
    assert.equal(f.client.pending, null);assert.equal((await f.client.retryPending()).reason, 'nothing_pending');
    assert.deepEqual(f.requests().map(request => request.action), ['status', 'receipt', 'round-start']);
    assert.equal(f.client.snapshot.coins, 100, 'the read-only transition submits no new payment');
    f.client.dispose();
  }
});
