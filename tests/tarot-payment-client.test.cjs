const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const sourcePath = process.env.TAROT_PAYMENT_SOURCE || path.join(__dirname, '../games/moonlit-tarot/payment.js');
const source = fs.readFileSync(sourcePath, 'utf8').replace('export class TarotPayment', 'class TarotPayment');
const plain = value => JSON.parse(JSON.stringify(value));
const prefix = (a, b) => a.length <= b.length && a.every((value, index) => value === b[index]);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function harness() {
  const clock = { now: Date.parse('2026-11-12T10:00:00Z') };
  const server = {
    clock, owner: 'member-a', coins: new Map([['member-a', 40], ['member-b', 40]]), receipts: new Map(), daily: new Map(), requests: [],
    losePurchase: false, loseSave: false, beforeBuy: null,
    day() { return new Date(clock.now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10); },
    resetAt() { return new Date(Date.parse(`${this.day()}T00:00:00+09:00`) + 86400000).toISOString(); },
    value(record, extra = {}) { return { ...plain(record), coins: this.coins.get(record.owner), ...extra }; },
    async rpc(name, args = {}) {
      const owner = this.owner;
      this.requests.push({ name, args: plain(args), owner });
      if (!owner) return { error: { code: '42501', message: 'not_signed_in' } };
      if (name === 'tarot_reading_today_v1') return { data: {
        ok: true, reading_day: this.day(), reset_at: this.resetAt(), coins: this.coins.get(owner),
        readings: [...this.daily.values()].filter(item => item.owner === owner && item.reading_day === this.day()).map(item => this.value(item))
      } };
      if (name === 'tarot_reading_save_v1') {
        const item = this.receipts.get(args.p_request_id);
        if (!item || item.owner !== owner || this.daily.get(`${owner}:${item.reading_day}:${item.topic}`)?.request_id !== item.request_id) return { data: { ok: false, reason: 'not_found' } };
        const discarded = args.p_discarded, opened = args.p_open_order;
        if (prefix(discarded, item.discarded) && prefix(opened, item.open_order)) return { data: this.value(item) };
        if (!prefix(item.discarded, discarded) || !prefix(item.open_order, opened)) return { data: { ok: false, reason: 'progress_conflict', receipt: this.value(item) } };
        item.discarded = [...discarded]; item.open_order = [...opened];
        if (this.loseSave) { this.loseSave = false; return { error: { message: 'response lost after save' } }; }
        return { data: this.value(item) };
      }
      assert.equal(name, 'tarot_reading_buy_v1');
      if (this.beforeBuy) await this.beforeBuy(args);
      const exact = this.receipts.get(args.p_request_id);
      if (exact) {
        if (exact.owner !== owner || exact.topic !== args.p_topic) return { data: { ok: false, reason: 'request_conflict' } };
        return { data: this.value(exact, { replayed: true }) };
      }
      const dailyKey = `${owner}:${this.day()}:${args.p_topic}`;
      const previous = this.daily.get(dailyKey);
      if (previous) return { data: this.value(previous, { replayed: true, daily_replayed: true }) };
      if (args.p_verify_only) return { data: { ok: false, reason: 'not_found', coins: this.coins.get(owner) } };
      if (this.coins.get(owner) < 10) return { data: { ok: false, reason: 'coins', coins: this.coins.get(owner) } };
      this.coins.set(owner, this.coins.get(owner) - 10);
      const item = {
        ok: true, owner, request_id: args.p_request_id, topic: args.p_topic, price: 10,
        reading_day: this.day(), reset_at: this.resetAt(), discarded: [], open_order: [],
        drawn: ['fool', 'sun', 'world', 'cups_ace', 'swords_king'], replayed: false, daily_replayed: false
      };
      this.receipts.set(item.request_id, item); this.daily.set(dailyKey, item);
      if (this.losePurchase) { this.losePurchase = false; return { error: { message: 'response lost after purchase' } }; }
      return { data: this.value(item) };
    }
  };
  function page(storage = new Map(), extra = {}) {
    let authChange;
    class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [clock.now])); } static now() { return clock.now; } }
    const context = {
      window: { OJJUDA_CONFIG: { supabaseUrl: 'test', supabaseKey: 'publishable-test' }, ojjudaSupabase: {
        auth: { getSession: async () => ({ data: { session: server.owner ? { user: { id: server.owner } } : null } }), onAuthStateChange: fn => { authChange = fn; } },
        rpc: (...args) => server.rpc(...args)
      } },
      crypto: { randomUUID }, Date: ClockDate,
      localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, console
    };
    const Payment = vm.runInNewContext(source + '; TarotPayment', context);
    return { Payment, payment: new Payment({ enabled: true, ...extra }), storage, context, authChange: next => authChange('SIGNED_IN', next) };
  }
  return { server, page };
}

(async () => {
  const { server, page } = harness();
  const first = page();
  const preview = new first.Payment();
  assert.equal((await preview.init()).preview, true);
  assert.equal(await preview.start('overall'), null);
  assert.equal(await preview.save({ discarded: [], openOrder: [] }), null);
  assert.equal(server.requests.length, 0, 'preview must never contact billing');
  const payment = first.payment;
  assert.equal((await payment.init()).signedIn, true);
  assert.equal(server.coins.get('member-a'), 40);
  server.losePurchase = true;
  await assert.rejects(payment.start('love'), error => error.code === 'network');
  const originalId = payment.record.requestId;
  assert.equal(server.coins.get('member-a'), 30);
  const beforeRetry = server.requests.filter(call => call.name === 'tarot_reading_buy_v1').length;
  const both = await Promise.all([payment.start('love'), payment.start('love')]);
  assert.ok(both.every(result => result.request_id === originalId));
  assert.equal(server.requests.filter(call => call.name === 'tarot_reading_buy_v1').length, beforeRetry + 1, 'rapid retries share one request');
  assert.equal(server.coins.get('member-a'), 30);
  await payment.save({ discarded: new Set([0]), openOrder: [] });
  await payment.save({ discarded: new Set([0, 2]), openOrder: [] });
  await payment.save({ discarded: new Set([0, 2]), openOrder: [4, 1, 3] });
  const restored = page(first.storage).payment;
  const resume = (await restored.init()).resume;
  assert.deepEqual(plain(resume.discarded), [0, 2]);
  assert.deepEqual(plain(resume.openOrder), [4, 1, 3]);
  restored.newReading();
  assert.equal(restored.record, null);
  assert.ok(restored.receiptFor('love'), 'choosing another topic does not erase today’s receipt');
  const repeated = await restored.start('love');
  assert.equal(repeated.request_id, originalId);
  assert.deepEqual(plain(repeated.openOrder), [4, 1, 3]);
  assert.equal(server.coins.get('member-a'), 30);
  for (const topic of ['money', 'work', 'overall']) {
    restored.newReading();
    assert.equal((await restored.start(topic)).topic, topic);
  }
  assert.equal(server.receipts.size, 4, 'four topics have four independent daily readings');
  assert.equal(server.coins.get('member-a'), 0);
  restored.newReading();
  assert.equal((await restored.start('love')).request_id, originalId, 'zero balance can reopen a paid daily result');
  assert.equal(server.coins.get('member-a'), 0);
  const anotherDevice = page().payment;
  await anotherDevice.init();
  assert.equal(anotherDevice.receiptFor('love').request_id, originalId);
  assert.deepEqual(plain((await anotherDevice.start('love')).openOrder), [4, 1, 3], 'another device restores the same cards and reveal order');
  await assert.rejects(anotherDevice.save({ discarded: [0, 3], openOrder: [] }), error => error.code === 'progress_conflict' && error.receipt.request_id === originalId);
  assert.deepEqual(plain(anotherDevice.record.openOrder), [4, 1, 3], 'conflict restores authoritative progress');
  assert.equal(server.coins.get('member-a'), 0);
  // A pre-limit duplicate receipt must yield today's canonical result, not a save loop.
  const legacyId = randomUUID();
  server.receipts.set(legacyId, { ...plain(server.receipts.get(originalId)), request_id: legacyId, discarded: [], open_order: [] });
  const legacyPage = page();
  legacyPage.storage.set('ojjuda.tarot.session.v1.member-a', JSON.stringify({ owner: 'member-a', requestId: legacyId, topic: 'love', discarded: [1, 2], openOrder: [0] }));
  const legacyResume = (await legacyPage.payment.init()).resume;
  assert.equal(legacyResume.request_id, originalId);
  assert.deepEqual(plain(legacyResume.openOrder), [4, 1, 3]);

  // KST midnight changes availability, without reopening yesterday automatically.
  server.clock.now = Date.parse('2026-11-12T14:59:59Z');
  assert.ok(restored.receiptFor('love'));
  server.clock.now = Date.parse('2026-11-12T15:00:00Z');
  assert.equal(restored.receiptFor('love'), null);
  const tomorrow = page(first.storage).payment;
  const tomorrowInit = await tomorrow.init();
  assert.equal(tomorrowInit.resume, undefined);
  assert.equal(tomorrow.record, null);
  assert.equal(tomorrow.day, '2026-11-13');
  const pastLegacy = page();
  pastLegacy.storage.set('ojjuda.tarot.session.v1.member-a', JSON.stringify({ owner: 'member-a', requestId: legacyId, topic: 'love', discarded: [1, 2], openOrder: [0] }));
  const savesBefore = server.requests.filter(call => call.name === 'tarot_reading_save_v1').length;
  assert.equal((await pastLegacy.payment.init()).resume, undefined);
  assert.equal(pastLegacy.payment.record, null);
  assert.equal(server.requests.filter(call => call.name === 'tarot_reading_save_v1').length, savesBefore, 'yesterday’s legacy duplicate cannot lock the chooser by retrying a save');
  const failedLegacyInit = page();
  failedLegacyInit.storage.set('ojjuda.tarot.session.v1.member-a', JSON.stringify({ owner: 'member-a', requestId: legacyId, topic: 'love', discarded: [1, 2], openOrder: [0] }));
  const normalRpc = server.rpc;
  server.rpc = async () => ({ error: { message: 'temporary status outage' } });
  await assert.rejects(failedLegacyInit.payment.init(), error => error.code === 'network');
  server.rpc = normalRpc;
  await assert.rejects(failedLegacyInit.payment.start('love'), error => error.code === 'progress_missing');
  assert.equal(failedLegacyInit.payment.record, null, 'a missing legacy save releases the stale draft after a server status refresh');
  assert.equal(server.coins.get('member-a'), 0, 'legacy recovery never buys another reading automatically');
  await assert.rejects(tomorrow.start('love'), error => error.code === 'coins');
  assert.equal(tomorrow.record, null);
  server.coins.set('member-a', 10);
  const newDay = await tomorrow.start('love');
  assert.notEqual(newDay.request_id, originalId);
  assert.equal(newDay.reading_day, '2026-11-13');
  assert.equal(server.coins.get('member-a'), 0);

  // A lost save response must retain exactly the intended choice across reload.
  server.loseSave = true;
  await assert.rejects(tomorrow.save({ discarded: [1], openOrder: [] }), error => error.code === 'progress_network');
  assert.equal(tomorrow.record.unsynced, true);
  const afterSaveLoss = page(first.storage).payment;
  const recovered = (await afterSaveLoss.init()).resume;
  assert.deepEqual(plain(recovered.discarded), [1]);
  assert.equal(afterSaveLoss.record.unsynced, undefined);
  assert.equal(server.coins.get('member-a'), 0);

  // Unknown request IDs may be replaced by today's canonical receipt ID.
  const replacement = page();
  replacement.storage.set('ojjuda.tarot.session.v1.member-a', JSON.stringify({ owner: 'member-a', requestId: randomUUID(), topic: 'love', discarded: [], openOrder: [] }));
  const canonical = (await replacement.payment.init()).resume;
  assert.equal(canonical.request_id, newDay.request_id);
  assert.equal(replacement.payment.record.requestId, newDay.request_id);
  assert.equal(server.coins.get('member-a'), 0);

  server.owner = null;
  const guest = page().payment;
  assert.equal((await guest.init()).signedIn, false);
  await assert.rejects(guest.start('overall'), error => error.code === 'not_signed_in');
  server.owner = 'member-b';
  const blockedStorage = page();
  await blockedStorage.payment.init();
  blockedStorage.context.localStorage.setItem = () => { throw new Error('storage blocked'); };
  const beforePurchase = server.requests.filter(call => call.name === 'tarot_reading_buy_v1').length;
  await assert.rejects(blockedStorage.payment.start('overall'), error => error.code === 'storage_unavailable');
  assert.equal(server.requests.filter(call => call.name === 'tarot_reading_buy_v1').length, beforePurchase, 'new payment waits until retry ID is saved');
  assert.equal(server.coins.get('member-b'), 40);
  let accountChanges = 0;
  const changingAccount = page(new Map(), { onAccountChange: () => accountChanges++ });
  await changingAccount.payment.init();
  changingAccount.authChange({ user: { id: 'member-a' } });
  assert.equal(accountChanges, 1);
  assert.equal(changingAccount.payment.record, null);
  assert.equal(changingAccount.payment.day, null);
  assert.equal(changingAccount.payment.readings.size, 0);

  // An original POST can arrive after a reload’s read-only verification.
  const delayed = harness();
  const gate = deferred(), started = deferred();
  let delayFirst = true;
  delayed.server.beforeBuy = async args => {
    if (!args.p_verify_only && delayFirst) { delayFirst = false; started.resolve(); await gate.promise; }
  };
  const slowPage = delayed.page();
  await slowPage.payment.init();
  const slowPurchase = slowPage.payment.start('love');
  await started.promise;
  const pendingId = slowPage.payment.record.requestId;
  const reloaded = delayed.page(slowPage.storage).payment;
  assert.equal((await reloaded.init()).pending.requestId, pendingId);
  const retry = await reloaded.start('love');
  gate.resolve();
  const late = await slowPurchase;
  assert.equal(retry.request_id, pendingId);
  assert.equal(late.request_id, pendingId);
  assert.equal(delayed.server.receipts.size, 1);
  assert.equal(delayed.server.coins.get('member-a'), 30);

  // A previous-day uncertain request is resolved by its original ID, never repaid.
  const overnight = harness();
  const beforeMidnight = overnight.page();
  await beforeMidnight.payment.init();
  overnight.server.losePurchase = true;
  await assert.rejects(beforeMidnight.payment.start('money'), error => error.code === 'network');
  const previousId = beforeMidnight.payment.record.requestId;
  overnight.server.clock.now = Date.parse('2026-11-12T15:00:01Z');
  const afterMidnight = overnight.page(beforeMidnight.storage).payment;
  const afterMidnightInit = await afterMidnight.init();
  assert.equal(afterMidnightInit.resume, undefined);
  assert.equal(afterMidnight.record, null);
  assert.equal(overnight.server.receipts.size, 1);
  assert.equal(overnight.server.coins.get('member-a'), 30);
  assert.equal(overnight.server.requests.at(-1).args.p_request_id, previousId);

  console.log('PASS: four independent daily topics, free canonical replay, server progress across devices, conflict recovery, KST midnight and yesterday handling.');
  console.log('PASS: preview/guest safety, lost purchase/save responses, same-ID concurrent retry, delayed original POST, overnight pending receipt, storage-before-charge.');
})().catch(error => { console.error(error); process.exitCode = 1; });
